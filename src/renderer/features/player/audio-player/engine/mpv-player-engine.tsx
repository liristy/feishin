import type { RefObject } from 'react';

import isElectron from 'is-electron';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';

import { playerHandoff } from './player-handoff';

import { getItemImageRequest } from '/@/renderer/components/item-image/item-image';
import { eventEmitter } from '/@/renderer/events/event-emitter';
import { OfflineSongUnavailableError } from '/@/renderer/features/offline/offline';
import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { getSongUrl } from '/@/renderer/features/player/audio-player/hooks/use-stream-url';
import { AudioPlayer, PlayerOnProgressProps } from '/@/renderer/features/player/audio-player/types';
import { useRadioStore } from '/@/renderer/features/radio/hooks/use-radio-player';
import { getMpvProperties } from '/@/renderer/features/settings/components/playback/mpv-properties';
import {
    setMpvInitialized,
    useMpvInitialized,
    usePlaybackSettings,
    usePlayerActions,
    usePlayerSong,
    usePlayerStore,
    useSettingsStore,
} from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, QueueSong } from '/@/shared/types/domain-types';
import { MpvQueueIdentity } from '/@/shared/types/mpv';
import { PlayerStatus } from '/@/shared/types/types';
import { cachedImage } from '/@/shared/utils/offline-cache';

export interface MpvPlayerEngineHandle extends AudioPlayer {}

interface MpvPlayerEngineProps {
    isMuted: boolean;
    isTransitioning: boolean;
    onEnded: () => void;
    onProgress: (e: PlayerOnProgressProps) => void;
    playerRef: RefObject<MpvPlayerEngineHandle | null>;
    playerStatus: PlayerStatus;
    preservePitch?: boolean;
    speed?: number;
    volume: number;
}

const mpvPlayer = isElectron() ? window.api.mpvPlayer : null;
const mpvPlayerListener = isElectron() ? window.api.mpvPlayerListener : null;
const ipc = isElectron() ? window.api.ipc : null;

const PROGRESS_UPDATE_INTERVAL = 250;
let queueRequest = 0;
let nextRequest = 0;

const isCurrentQueueRequest = (request: number, currentId: string | undefined) =>
    request === queueRequest &&
    usePlayerStore.getState().getPlayerData().currentSong?._uniqueId === currentId &&
    !useRadioStore.getState().currentStreamUrl;

export const MpvPlayerEngine = (props: MpvPlayerEngineProps) => {
    const {
        isMuted,
        isTransitioning,
        onEnded,
        onProgress,
        playerRef,
        playerStatus,
        preservePitch,
        speed,
        volume,
    } = props;

    const [internalVolume, setInternalVolume] = useState(volume / 100 || 0);
    const isInitialized = useMpvInitialized();
    const currentSong = usePlayerSong();

    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const hasPopulatedQueueRef = useRef<boolean>(false);
    const isMountedRef = useRef<boolean>(true);
    const [initializationTick, setInitializationTick] = useState(0);

    const { mpvAudioDeviceId, transcode } = usePlaybackSettings();
    const mpvExtraParameters = useSettingsStore((store) => store.playback.mpvExtraParameters);
    const mpvProperties = useSettingsStore((store) => store.playback.mpvProperties);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    useEffect(() => {
        const handleMpvReload = () => {
            setMpvInitialized(false);
            setReloadTrigger((prev) => prev + 1);
        };

        const handleMpvReconnect = () => {
            handleMpvReload();
        };

        eventEmitter.on('MPV_RELOAD', handleMpvReload);
        // The main process notifies us after the OS resumes from sleep, since the
        // stream mpv had open is likely on a now-dead connection.
        mpvPlayerListener?.rendererMpvReconnect(handleMpvReconnect);

        return () => {
            eventEmitter.off('MPV_RELOAD', handleMpvReload);
            ipc?.removeAllListeners('renderer-mpv-reconnect');
        };
    }, []);

    // Start the mpv instance on startup
    useEffect(() => {
        isMountedRef.current = true;
        setMpvInitialized(false);
        let isCancelled = false;

        const initializeMpv = async () => {
            // Always quit mpv first to ensure clean state, especially during HMR remounts
            const isRunning: boolean | undefined = await mpvPlayer?.isRunning();
            if (isRunning) {
                mpvPlayer?.quit();

                let attempts = 0;
                const maxAttempts = 20;
                while (attempts < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    const stillRunning = await mpvPlayer?.isRunning();
                    if (!stillRunning) {
                        break;
                    }
                    attempts++;
                }
            }

            // Reset initialization state
            hasPopulatedQueueRef.current = false;

            // Initialize mpv with fresh state
            const properties: Record<string, any> = {
                ...getMpvProperties(mpvProperties),
                'audio-pitch-correction': preservePitch === false ? 'no' : 'yes',
                speed: speed,
                volume: volume,
            };

            const extraParameters: string[] = [...mpvExtraParameters];

            const audioDevice = mpvAudioDeviceId?.trim() || 'auto';
            extraParameters.push(`--audio-device=${audioDevice}`);

            await mpvPlayer?.initialize({
                extraParameters,
                properties,
            });
            if (isCancelled) return;

            // Apply EQ and compressor filters after MPV has initialized
            const { compressor, equalizer } = useSettingsStore.getState().playback;
            const { buildMpvAudioFilters } =
                await import('/@/renderer/features/settings/components/playback/mpv-audio-filters');
            const filterStr = buildMpvAudioFilters(equalizer, compressor);
            if (filterStr) {
                mpvPlayer?.setProperties({ af: filterStr });
            }

            // After initialization, populate the queue if currentSrc is available
            // Don't override queue if radio is active
            const radioState = useRadioStore.getState();

            if (!radioState.currentStreamUrl) {
                if (!isCancelled && !hasPopulatedQueueRef.current && mpvPlayer) {
                    await replaceMpvQueue(transcode);
                    if (isCancelled) return;
                    hasPopulatedQueueRef.current = true;
                    let seekToAfterInit = -1;
                    if (playerHandoff.pendingLocalSeek > 0 && isMountedRef.current) {
                        seekToAfterInit = playerHandoff.pendingLocalSeek;
                        playerHandoff.pendingLocalSeek = -1;
                    }
                    await new Promise((r) => setTimeout(r, 400));
                    if (isMountedRef.current) {
                        setInitializationTick((t) => t + 1);
                        if (seekToAfterInit > 0) {
                            setTimeout(() => {
                                if (isMountedRef.current) mpvPlayer?.seekTo(seekToAfterInit);
                            }, 800);
                        }
                    }
                }
            }

            if (!isCancelled) {
                setMpvInitialized(true);
            }
        };

        initializeMpv().catch((error) =>
            logger.error('Failed to initialize MPV playback', { error }),
        );

        return () => {
            isCancelled = true;
            queueRequest += 1;
            nextRequest += 1;
            isMountedRef.current = false;
            // Quit mpv on unmount
            mpvPlayer?.quit();
            setMpvInitialized(false);
            hasPopulatedQueueRef.current = false;
        };
        // Note: volume, speed, preservePitch, and transcode are intentionally not in dependencies.
        // Volume speed, and preservePitch changes are handled by separate useEffects below to avoid
        // reinitializing the entire player. Transcode changes are handled by queue
        // update callbacks in usePlayerEvents.
        // reloadTrigger is included to allow manual reload via MPV_RELOAD event.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mpvExtraParameters, mpvProperties, mpvAudioDeviceId, reloadTrigger]);

    // Update volume
    useEffect(() => {
        if (!mpvPlayer || !isInitialized) {
            return;
        }

        const vol = volume / 100 || 0;
        queueMicrotask(() => {
            setInternalVolume(vol);
        });
        mpvPlayer.volume(volume);
    }, [isInitialized, volume]);

    // Update mute status
    useEffect(() => {
        if (!mpvPlayer || !isInitialized) {
            return;
        }

        mpvPlayer.mute(isMuted);
    }, [isInitialized, isMuted]);

    // Update speed/playback rate
    useEffect(() => {
        if (!mpvPlayer || !isInitialized) {
            return;
        }

        if (!speed) {
            return;
        }

        mpvPlayer.setProperties({ speed });
    }, [isInitialized, speed]);

    // Update pitch correction status
    useEffect(() => {
        if (!mpvPlayer || !isInitialized) {
            return;
        }

        if (preservePitch === false) {
            mpvPlayer.setProperties({ 'audio-pitch-correction': 'no' });
        } else {
            mpvPlayer.setProperties({ 'audio-pitch-correction': 'yes' });
        }
    }, [isInitialized, preservePitch]);

    // Handle play/pause status
    useEffect(() => {
        if (!mpvPlayer || !isInitialized) {
            return;
        }

        if (playerStatus === PlayerStatus.PLAYING) {
            mpvPlayer.play();
        } else {
            mpvPlayer.pause();
        }
    }, [initializationTick, isInitialized, playerStatus]);

    const hasCurrentSong = !!currentSong?.id;

    // Set up progress tracking
    useEffect(() => {
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
        }
        if (!hasCurrentSong) {
            return;
        }
        let cancelled = false;

        if (playerStatus !== PlayerStatus.PLAYING) {
            return;
        }

        const updateProgress = async () => {
            if (!mpvPlayer || cancelled) {
                return;
            }

            try {
                const time = await mpvPlayer.getCurrentTime();
                if (time !== undefined && !cancelled) {
                    onProgress({
                        played: time / (time + 10),
                        playedSeconds: time,
                    });
                }
            } catch {
                // Catch
            }
        };
        progressIntervalRef.current = setInterval(updateProgress, PROGRESS_UPDATE_INTERVAL);
        updateProgress();
        return () => {
            cancelled = true;
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
        };
    }, [hasCurrentSong, isTransitioning, onProgress, playerStatus]);

    const { mediaAutoNext } = usePlayerActions();

    useEffect(() => {
        if (!mpvPlayerListener) {
            return;
        }

        const handleOnAutoNext = (identity: MpvQueueIdentity) => {
            const before = usePlayerStore.getState().getPlayerData();
            if (
                useRadioStore.getState().currentStreamUrl ||
                !identity?.currentId ||
                identity.currentId !== before.currentSong?._uniqueId
            )
                return;
            mediaAutoNext();
            if (
                identity.nextId === usePlayerStore.getState().getPlayerData().currentSong?._uniqueId
            ) {
                handleMpvAutoNext(transcode);
            } else {
                replaceMpvQueue(transcode);
            }
        };

        const handleTrackEnded = (identity: MpvQueueIdentity) => {
            if (
                useRadioStore.getState().currentStreamUrl ||
                !identity?.currentId ||
                identity.currentId !==
                    usePlayerStore.getState().getPlayerData().currentSong?._uniqueId
            )
                return;
            const { player } = usePlayerStore.getState();
            // mpv often emits `stopped` before this event, which already set STOPPED
            // via mediaStop. Still run mediaAutoNext so end-of-queue seek/reset runs.
            if (player.status !== PlayerStatus.PLAYING && player.status !== PlayerStatus.STOPPED) {
                return;
            }

            mediaAutoNext();
            replaceMpvQueue(transcode);
        };

        mpvPlayerListener.rendererAutoNext(handleOnAutoNext);
        mpvPlayerListener.rendererTrackEnded(handleTrackEnded);

        return () => {
            ipc?.removeAllListeners('renderer-player-auto-next');
            ipc?.removeAllListeners('renderer-player-track-ended');
        };
    }, [mediaAutoNext, onEnded, transcode]);

    usePlayerEvents(
        {
            onMediaNext: () => {
                replaceMpvQueue(transcode);
            },
            onMediaPrev: () => {
                replaceMpvQueue(transcode);
            },
            onNextSongInsertion: () => updateMpvNextSong(transcode),
            onPlayerPlay: () => {
                replaceMpvQueue(transcode);
            },
            onPlayerStop: () => {
                queueRequest += 1;
                nextRequest += 1;
            },
            onQueueCleared: () => {
                queueRequest += 1;
                nextRequest += 1;
                mpvPlayer?.setQueue();
            },
            onQueueRestored: () => {
                replaceMpvQueue(transcode);
            },
        },
        [transcode],
    );

    useImperativeHandle<MpvPlayerEngineHandle, MpvPlayerEngineHandle>(playerRef, () => ({
        decreaseVolume(by: number) {
            const newVol = Math.max(0, internalVolume - by / 100);
            setInternalVolume(newVol);
            if (mpvPlayer) {
                mpvPlayer.volume(newVol * 100);
            }
        },
        increaseVolume(by: number) {
            const newVol = Math.min(1, internalVolume + by / 100);
            setInternalVolume(newVol);
            if (mpvPlayer) {
                mpvPlayer.volume(newVol * 100);
            }
        },
        pause() {
            if (mpvPlayer) {
                mpvPlayer.pause();
            }
        },
        play() {
            if (mpvPlayer) {
                mpvPlayer.play();
            }
        },
        seekTo(seekTo: number) {
            if (mpvPlayer) {
                mpvPlayer.seekTo(seekTo);
            }
        },
        setVolume(vol: number) {
            const volDecimal = vol / 100 || 0;
            setInternalVolume(volDecimal);
            if (mpvPlayer) {
                mpvPlayer.volume(vol);
            }
        },
    }));

    return <div id="mpv-player-engine" style={{ display: 'none' }} />;
};

MpvPlayerEngine.displayName = 'MpvPlayerEngine';

async function handleMpvAutoNext(transcode: {
    bitrate?: number | undefined;
    enabled: boolean;
    format?: string | undefined;
}) {
    const request = ++queueRequest;
    nextRequest += 1;
    const playerData = usePlayerStore.getState().getPlayerData();
    try {
        const nextSongUrl = playerData.nextSong
            ? await getSongUrl(playerData.nextSong, transcode, true).catch(() => {
                  logger.warn('MPV next-track prefetch failed');
                  return undefined;
              })
            : undefined;
        if (!isCurrentQueueRequest(request, playerData.currentSong?._uniqueId)) return;
        const latest = usePlayerStore.getState().getPlayerData();
        mpvPlayer?.autoNext(
            latest.nextSong?._uniqueId === playerData.nextSong?._uniqueId ? nextSongUrl : undefined,
            latest.nextSong?._uniqueId === playerData.nextSong?._uniqueId
                ? latest.nextSong?._uniqueId
                : undefined,
        );
        void updateMpvArtwork(latest.currentSong, request);
        if (latest.nextSong?._uniqueId !== playerData.nextSong?._uniqueId) {
            await updateMpvNextSong(transcode);
        }
    } catch (error) {
        logger.error('Failed to prepare the next MPV track', { error });
    }
}

async function replaceMpvQueue(transcode: {
    bitrate?: number | undefined;
    enabled: boolean;
    format?: string | undefined;
}) {
    // Don't override queue if radio is active
    const radioState = useRadioStore.getState();

    if (radioState.currentStreamUrl) {
        return;
    }

    const request = ++queueRequest;
    nextRequest += 1;
    const playerData = usePlayerStore.getState().getPlayerData();
    try {
        const [currentSongUrl, nextSongUrl] = await Promise.all([
            playerData.currentSong
                ? getSongUrl(playerData.currentSong, transcode, true)
                : undefined,
            playerData.nextSong &&
            playerData.nextSong._uniqueId !== playerData.currentSong?._uniqueId
                ? getSongUrl(playerData.nextSong, transcode, true).catch(() => {
                      logger.warn('MPV next-track prefetch failed');
                      return undefined;
                  })
                : undefined,
        ]);
        if (!isCurrentQueueRequest(request, playerData.currentSong?._uniqueId)) return;
        const latest = usePlayerStore.getState().getPlayerData();
        const sameNext = latest.nextSong?._uniqueId === playerData.nextSong?._uniqueId;
        mpvPlayer?.setQueue(
            currentSongUrl,
            sameNext ? nextSongUrl : undefined,
            latest.status !== PlayerStatus.PLAYING,
            {
                currentId: latest.currentSong?._uniqueId,
                nextId: sameNext && nextSongUrl ? latest.nextSong?._uniqueId : undefined,
            },
        );
        void updateMpvArtwork(latest.currentSong, request);
        if (!sameNext) await updateMpvNextSong(transcode);
    } catch (error) {
        if (!isCurrentQueueRequest(request, playerData.currentSong?._uniqueId)) return;
        mpvPlayer?.stop();
        if (error instanceof OfflineSongUnavailableError) return;
        usePlayerStore.getState().mediaPause();
        logger.error('Failed to resolve the selected MPV track', { error });
        if (error instanceof Error) toast.error({ message: error.message });
    }
}

async function updateMpvArtwork(song: QueueSong | undefined, request: number) {
    if (!song || !window.api?.utils.isWindows()) return;
    try {
        const imageRequest = getItemImageRequest({
            id: song.imageId,
            imageUrl: song.imageUrl,
            itemType: LibraryItem.SONG,
            serverId: song._serverId,
            type: 'itemCard',
        });
        if (!imageRequest) return;
        const blob = await cachedImage(imageRequest);
        const data = new Uint8Array(await blob.arrayBuffer());
        if (isCurrentQueueRequest(request, song._uniqueId)) {
            await mpvPlayer?.setArtwork(song._uniqueId, data);
        }
    } catch {
        logger.warn('Failed to synchronize MPV media artwork', { songId: song.id });
    }
}

async function updateMpvNextSong(transcode: Parameters<typeof getSongUrl>[1]) {
    const request = queueRequest;
    const nextVersion = ++nextRequest;
    const snapshot = usePlayerStore.getState().getPlayerData();
    if (useRadioStore.getState().currentStreamUrl) return;
    try {
        const url =
            snapshot.nextSong && snapshot.nextSong._uniqueId !== snapshot.currentSong?._uniqueId
                ? await getSongUrl(snapshot.nextSong, transcode, true)
                : undefined;
        if (
            !isCurrentQueueRequest(request, snapshot.currentSong?._uniqueId) ||
            nextVersion !== nextRequest
        )
            return;
        if (
            usePlayerStore.getState().getPlayerData().nextSong?._uniqueId !==
            snapshot.nextSong?._uniqueId
        )
            return;
        mpvPlayer?.setQueueNext(url, url ? snapshot.nextSong?._uniqueId : undefined);
    } catch (error) {
        logger.error('Failed to update the upcoming MPV track', { error });
    }
}
