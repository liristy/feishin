import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './lyrics.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { eventEmitter } from '/@/renderer/events/event-emitter';
import { PlayerLyricsFetchedEventPayload } from '/@/renderer/events/events';
import { translateLyrics } from '/@/renderer/features/lyrics/api/lyric-translate';
import {
    computeSelectedFromResult,
    getDisplayOffset,
    lyricsQueries,
    type LyricsQueryResult,
} from '/@/renderer/features/lyrics/api/lyrics-api';
import {
    alignTranslationLyrics,
    formatStructuredLyricLabel,
    getLyricLineText,
    getLyricsLayers,
    getOverlayLayerKey,
    getSelectedStructuredIndex,
    lyricsHasWordCues,
    splitInlineLyricsTranslation,
} from '/@/renderer/features/lyrics/api/lyrics-utils';
import {
    useFuriganaLyrics,
    useRomajiLyrics,
    useSyncedRomajiLyrics,
} from '/@/renderer/features/lyrics/hooks/use-furigana-lyrics';
import { LyricsActions } from '/@/renderer/features/lyrics/lyrics-actions';
import { SynchronizedKaraokeLyrics } from '/@/renderer/features/lyrics/synchronized-karaoke-lyrics';
import {
    SynchronizedLyrics,
    SynchronizedLyricsProps,
} from '/@/renderer/features/lyrics/synchronized-lyrics';
import {
    UnsynchronizedLyrics,
    UnsynchronizedLyricsProps,
} from '/@/renderer/features/lyrics/unsynchronized-lyrics';
import { openLyricsSettingsModal } from '/@/renderer/features/lyrics/utils/open-lyrics-settings-modal';
import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { useIsRadioActive } from '/@/renderer/features/radio/hooks/use-radio-player';
import { ComponentErrorBoundary } from '/@/renderer/features/shared/components/component-error-boundary';
import { queryClient } from '/@/renderer/lib/react-query';
import { useLyricsSettings, usePlayerSong } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';
import { useLocalStorage } from '/@/shared/hooks/use-local-storage';
import { LyricsResponse } from '/@/shared/types/domain-types';

type LyricsProps = {
    fadeOutNoLyricsMessage?: boolean;
    settingsKey?: string;
    showSettingsButton?: boolean;
};

export const Lyrics = ({
    fadeOutNoLyricsMessage = true,
    settingsKey = 'default',
    showSettingsButton = true,
}: LyricsProps) => {
    const currentSong = usePlayerSong();
    const isRadioActive = useIsRadioActive();

    const isLyricsDisabled = isRadioActive;

    const {
        enableAutoTranslation,
        enableFurigana,
        enableRomaji,
        preferLocalLyrics,
        translationApiKey,
        translationApiProvider,
        translationTargetLanguage,
    } = useLyricsSettings();
    const { t } = useTranslation();
    const [generatedTranslation, setGeneratedTranslation] = useState<null | {
        lyrics: LyricsResponse;
        text: string;
    }>(null);
    const [showTranslation, setShowTranslation] = useState(true);
    const translationRequestRef = useRef(0);
    const [visibleOverlayLayerKeys, setVisibleOverlayLayerKeys] = useLocalStorage<string[]>({
        defaultValue: [],
        key: `lyrics:visible-overlay-layers:${settingsKey}`,
    });
    const [pendingSongId, setPendingSongId] = useState<string | undefined>(currentSong?.id);
    const lyricsFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const previousSongIdRef = useRef<string | undefined>(currentSong?.id);

    useEffect(() => {
        const currentSongId = currentSong?.id;
        const previousSongId = previousSongIdRef.current;

        if (currentSongId === previousSongId) {
            return;
        }

        previousSongIdRef.current = currentSongId;
        setPendingSongId(undefined);

        if (!currentSongId) {
            return;
        }

        clearTimeout(lyricsFetchTimeoutRef.current);
        lyricsFetchTimeoutRef.current = setTimeout(() => {
            setPendingSongId(currentSongId);
        }, 500);

        return () => {
            clearTimeout(lyricsFetchTimeoutRef.current);
        };
    }, [currentSong?.id]);

    const lyricsKey = useMemo(() => {
        if (!currentSong?._serverId || !currentSong?.id) return null;
        return queryKeys.songs.lyrics(currentSong._serverId, { songId: currentSong.id });
    }, [currentSong]);

    const shouldFetchLyrics = !isLyricsDisabled && !!currentSong?._serverId && !!currentSong?.id;
    const isWaitingToFetchLyrics = shouldFetchLyrics && pendingSongId !== currentSong?.id;

    const { data, isLoading } = useQuery(
        lyricsQueries.songLyrics(
            {
                options: {
                    enabled: shouldFetchLyrics && !isWaitingToFetchLyrics,
                },
                query: { songId: currentSong?.id || '' },
                serverId: currentSong?._serverId || '',
            },
            currentSong,
        ),
    );

    useEffect(() => {
        const handlePlayerLyricsFetched = (payload: PlayerLyricsFetchedEventPayload) => {
            eventEmitter.emit('PLAYER_LYRICS_FETCHED', payload);
        };

        if (data && data.selected) {
            handlePlayerLyricsFetched({
                lyrics: data.selected,
                offsetMs: data.selectedOffsetMs,
                synced: data.selectedSynced,
            });
        }

        return () => {
            eventEmitter.off('PLAYER_LYRICS_FETCHED', handlePlayerLyricsFetched);
        };
    }, [data]);

    const indexToUse = Array.isArray(data?.local)
        ? getSelectedStructuredIndex(data.local, data.selectedStructuredIndex)
        : (data?.selectedStructuredIndex ?? 0);

    const { selected: lyrics, selectedSynced: synced } = useMemo(() => {
        if (!data) return { selected: null, selectedSynced: false };
        return computeSelectedFromResult(data, preferLocalLyrics, indexToUse);
    }, [data, indexToUse, preferLocalLyrics]);

    const inlineTranslation = useMemo(
        () => (lyrics ? splitInlineLyricsTranslation(lyrics.lyrics) : null),
        [lyrics],
    );
    const originalLyrics = inlineTranslation?.lyrics ?? lyrics?.lyrics;
    const { data: furiganaConvertedLyrics } = useFuriganaLyrics(originalLyrics, !!enableFurigana);
    const { data: romajiConvertedLyrics, isFetching: isFetchingRomaji } = useRomajiLyrics(
        originalLyrics,
        !!enableRomaji,
    );

    const rawSyncedLyrics = synced && Array.isArray(originalLyrics) ? originalLyrics : null;

    const displayLyrics = useMemo(() => {
        if (isLyricsDisabled || !lyrics || originalLyrics === undefined) return null;
        return {
            ...lyrics,
            lyrics: (enableFurigana && furiganaConvertedLyrics) || originalLyrics,
        };
    }, [enableFurigana, furiganaConvertedLyrics, isLyricsDisabled, lyrics, originalLyrics]);

    const currentOffsetMs = useMemo(() => {
        if (!data) return 0;
        return (
            data.manualOffsetMs ??
            getDisplayOffset(lyrics, data.selectedOffsetMs, indexToUse, data.local)
        );
    }, [data, indexToUse, lyrics]);

    const layers = useMemo(() => {
        if (!Array.isArray(data?.local)) {
            return null;
        }

        return getLyricsLayers(data.local);
    }, [data]);

    const visibleOverlayKeys = useMemo(
        () => new Set(visibleOverlayLayerKeys),
        [visibleOverlayLayerKeys],
    );

    const visibleOverlayLayers = useMemo(() => {
        if (!layers?.overlayLayers.length || !visibleOverlayKeys.size) {
            return [];
        }

        return layers.overlayLayers.filter((layer) =>
            visibleOverlayKeys.has(getOverlayLayerKey(layer)),
        );
    }, [layers, visibleOverlayKeys]);

    const pronunciationLyricsOverlay = useMemo(() => {
        const layer = visibleOverlayLayers.find(
            (entry) => entry.synced && entry.kind === 'pronunciation',
        );

        return layer?.synced ? layer.lyrics : null;
    }, [visibleOverlayLayers]);

    const translationLayers = useMemo(() => {
        if (!lyrics || !('synced' in lyrics) || !layers?.main.includes(lyrics)) {
            return [];
        }

        return layers.others.filter(
            (layer) =>
                layer.kind === 'translation' &&
                layer.synced === synced &&
                (layer.synced
                    ? layer.lyrics.some((line) => getLyricLineText(line).trim())
                    : !!layer.lyrics.trim()),
        );
    }, [layers, lyrics, synced]);

    const overlayLayerToggles = useMemo(
        () =>
            layers?.overlayLayers.flatMap((layer) => {
                const kind = layer.kind ?? 'main';
                if (kind === 'translation') return [];

                return [
                    {
                        key: getOverlayLayerKey(layer),
                        kind,
                        label: formatStructuredLyricLabel(layer),
                    },
                ];
            }) ?? [],
        [layers],
    );

    const activeTranslationLayer = translationLayers.find((layer) =>
        visibleOverlayKeys.has(getOverlayLayerKey(layer)),
    );
    const translationLayer = activeTranslationLayer ?? translationLayers[0];
    const timedTranslation = useMemo(
        () =>
            rawSyncedLyrics && translationLayer?.synced
                ? alignTranslationLyrics(rawSyncedLyrics, translationLayer.lyrics)
                : null,
        [rawSyncedLyrics, translationLayer],
    );
    const plainTranslation = translationLayer?.synced === false ? translationLayer.lyrics : null;
    const hasServerTranslation = !!(timedTranslation || plainTranslation);
    const providedTranslation = hasServerTranslation || !!inlineTranslation;
    const generatedText =
        generatedTranslation && generatedTranslation.lyrics === originalLyrics
            ? generatedTranslation.text
            : null;
    const hasTranslation = providedTranslation || !!generatedText;
    const isTranslationVisible = hasServerTranslation
        ? !!activeTranslationLayer
        : hasTranslation && showTranslation;
    const translationText = hasServerTranslation
        ? plainTranslation
        : (inlineTranslation?.translation ?? generatedText);
    const visibleTranslatedText = isTranslationVisible ? translationText : null;
    const translationLyricsOverlay = isTranslationVisible ? timedTranslation : null;

    const extraOverlayLyrics = useMemo(() => {
        return visibleOverlayLayers
            .filter(
                (entry) =>
                    entry.synced && entry.kind !== 'pronunciation' && entry.kind !== 'translation',
            )
            .map((entry) => (entry.synced ? entry.lyrics : null))
            .filter((entry): entry is NonNullable<typeof entry> => entry != null);
    }, [visibleOverlayLayers]);

    const selectedAgents = useMemo(() => {
        if (!lyrics || !('synced' in lyrics) || !lyrics.synced) {
            return undefined;
        }

        return lyrics.agents;
    }, [lyrics]);

    const displayOffsetMs = isLyricsDisabled ? 0 : currentOffsetMs;
    const useServerPronunciation = !!pronunciationLyricsOverlay;

    const shouldGenerateSyncedRomaji =
        !!enableRomaji &&
        !!rawSyncedLyrics &&
        lyricsHasWordCues(rawSyncedLyrics) &&
        !useServerPronunciation;

    const { data: syncedRomajiLyrics, isFetching: isFetchingSyncedRomaji } = useSyncedRomajiLyrics(
        rawSyncedLyrics,
        shouldGenerateSyncedRomaji,
    );

    const isKaraoke = useMemo(() => {
        if (!synced || !displayLyrics || !('lyrics' in displayLyrics)) {
            return false;
        }

        return Array.isArray(displayLyrics.lyrics) && lyricsHasWordCues(displayLyrics.lyrics);
    }, [displayLyrics, synced]);

    const syncedLyricsProps = useMemo(() => {
        if (!displayLyrics) {
            return null;
        }

        return {
            ...(displayLyrics as SynchronizedLyricsProps),
            extraOverlayLyrics: isKaraoke ? extraOverlayLyrics : undefined,
            offsetMs: displayOffsetMs,
            pronunciationLyrics: pronunciationLyricsOverlay,
            romajiLyrics:
                enableRomaji && !useServerPronunciation && !shouldGenerateSyncedRomaji
                    ? (romajiConvertedLyrics as SynchronizedLyricsProps['romajiLyrics'])
                    : null,
            settingsKey,
            syncedRomajiLyrics: shouldGenerateSyncedRomaji ? (syncedRomajiLyrics ?? null) : null,
            translatedLyrics: visibleTranslatedText,
            translationLyrics: translationLyricsOverlay,
        };
    }, [
        displayLyrics,
        displayOffsetMs,
        enableRomaji,
        extraOverlayLyrics,
        isKaraoke,
        pronunciationLyricsOverlay,
        romajiConvertedLyrics,
        shouldGenerateSyncedRomaji,
        syncedRomajiLyrics,
        settingsKey,
        translationLyricsOverlay,
        useServerPronunciation,
        visibleTranslatedText,
    ]);

    const handleUpdateOffset = useCallback(
        (offsetMs: number) => {
            if (!currentSong || !lyricsKey) return;

            queryClient.setQueryData<LyricsQueryResult>(lyricsKey, (prev) => {
                if (!prev) return prev;
                const updated = { ...prev, manualOffsetMs: offsetMs, selectedOffsetMs: offsetMs };
                if (Array.isArray(prev.local) && prev.local.length > 0) {
                    const idx = Math.min(indexToUse, prev.local.length - 1);
                    updated.local = [...prev.local];
                    updated.local[idx] = {
                        ...updated.local[idx],
                        offsetMs,
                    };
                }
                return updated;
            });
        },
        [currentSong, indexToUse, lyricsKey],
    );

    const handleOnRemoveLyric = useCallback(async () => {
        if (!currentSong || !lyricsKey) return;

        queryClient.setQueryData<LyricsQueryResult>(lyricsKey, (prev) =>
            prev
                ? {
                      ...prev,
                      overrideData: null,
                      overrideSelection: null,
                      remoteAuto: null,
                      suppressRemoteAuto: true,
                  }
                : prev,
        );
        await queryClient.invalidateQueries({ queryKey: lyricsKey });
    }, [currentSong, lyricsKey]);

    const fetchTranslation = useCallback(async () => {
        if (!originalLyrics || isLyricsDisabled || !translationApiProvider || !translationApiKey)
            return;
        const request = ++translationRequestRef.current;
        const originalText = Array.isArray(originalLyrics)
            ? originalLyrics.map(getLyricLineText).join('\n')
            : originalLyrics;
        const translatedText = await translateLyrics(
            originalText,
            translationApiKey,
            translationApiProvider,
            translationTargetLanguage,
        );
        if (request === translationRequestRef.current && translatedText?.trim()) {
            setGeneratedTranslation({ lyrics: originalLyrics, text: translatedText });
            setShowTranslation(true);
        }
    }, [
        isLyricsDisabled,
        originalLyrics,
        translationApiKey,
        translationApiProvider,
        translationTargetLanguage,
    ]);

    const handleToggleTranslation = () => {
        if (!hasServerTranslation || !translationLayer) {
            setShowTranslation(!isTranslationVisible);
            return;
        }

        setVisibleOverlayLayerKeys((current) => {
            if (!activeTranslationLayer) {
                return [...current, getOverlayLayerKey(translationLayer)];
            }
            const translationKeys = new Set(translationLayers.map(getOverlayLayerKey));
            return current.filter((key) => !translationKeys.has(key));
        });
    };

    const handleToggleOverlayLayer = useCallback(
        (key: string) => {
            setVisibleOverlayLayerKeys((current) => {
                const next = new Set(current);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                }
                return Array.from(next);
            });
        },
        [setVisibleOverlayLayerKeys],
    );

    usePlayerEvents(
        {
            onCurrentSongChange: () => {
                translationRequestRef.current++;
                setShowTranslation(true);
                setGeneratedTranslation(null);
            },
        },
        [],
    );

    useEffect(() => {
        if (displayLyrics && !hasTranslation && enableAutoTranslation) {
            void fetchTranslation();
        }
    }, [displayLyrics, enableAutoTranslation, fetchTranslation, hasTranslation]);

    const isWaitingForRomaji =
        !!enableRomaji &&
        !!lyrics &&
        (isFetchingRomaji || (shouldGenerateSyncedRomaji && isFetchingSyncedRomaji));

    const isLoadingLyrics =
        shouldFetchLyrics && (isWaitingToFetchLyrics || isLoading || isWaitingForRomaji);
    const hasNoLyrics = !displayLyrics;
    const [shouldFadeOut, setShouldFadeOut] = useState(false);

    useEffect(() => {
        if (!fadeOutNoLyricsMessage) {
            setShouldFadeOut(false);
            return undefined;
        }

        if (!isLoadingLyrics && hasNoLyrics) {
            const timer = setTimeout(() => {
                setShouldFadeOut(true);
            }, 3000);
            return () => clearTimeout(timer);
        }

        if (!hasNoLyrics) {
            setShouldFadeOut(false);
        }

        return undefined;
    }, [isLoadingLyrics, hasNoLyrics, fadeOutNoLyricsMessage]);

    const handleOpenSettings = () => {
        openLyricsSettingsModal(settingsKey);
    };

    return (
        <ComponentErrorBoundary>
            <div className={styles.lyricsContainer}>
                {showSettingsButton && (
                    <ActionIcon
                        aria-label={
                            t('page.fullscreenPlayer.lyrics') +
                            ' · ' +
                            t('common.setting', { count: 2 })
                        }
                        className={styles.settingsIcon}
                        icon="settings2"
                        iconProps={{ size: 'lg' }}
                        onClick={handleOpenSettings}
                        variant="subtle"
                    />
                )}
                {isLoadingLyrics ? (
                    <Spinner container />
                ) : (
                    <AnimatePresence mode="sync">
                        {hasNoLyrics ? (
                            <Center flex={1} w="100%">
                                <motion.div
                                    animate={{ opacity: shouldFadeOut ? 0 : 1 }}
                                    initial={{ opacity: 1 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <Group>
                                        <Text fw={500} isMuted isNoSelect>
                                            {t('page.fullscreenPlayer.noLyrics')}
                                        </Text>
                                    </Group>
                                </motion.div>
                            </Center>
                        ) : (
                            <motion.div
                                animate={{ opacity: 1 }}
                                className={styles.scrollContainer}
                                initial={{ opacity: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                {synced && syncedLyricsProps ? (
                                    isKaraoke ? (
                                        <SynchronizedKaraokeLyrics
                                            {...syncedLyricsProps}
                                            agents={selectedAgents}
                                        />
                                    ) : (
                                        <SynchronizedLyrics {...syncedLyricsProps} />
                                    )
                                ) : (
                                    <UnsynchronizedLyrics
                                        {...(displayLyrics as UnsynchronizedLyricsProps)}
                                        romajiLyrics={
                                            enableRomaji
                                                ? (romajiConvertedLyrics as UnsynchronizedLyricsProps['romajiLyrics'])
                                                : null
                                        }
                                        settingsKey={settingsKey}
                                        translatedLyrics={visibleTranslatedText}
                                    />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
                <div className={styles.actionsContainer}>
                    <LyricsActions
                        hasLyrics={!!displayLyrics}
                        offsetMs={displayOffsetMs}
                        onRemoveLyric={handleOnRemoveLyric}
                        onToggleOverlayLayer={handleToggleOverlayLayer}
                        onToggleTranslation={
                            displayLyrics && hasTranslation ? handleToggleTranslation : undefined
                        }
                        onTranslateLyric={
                            !hasTranslation && translationApiProvider && translationApiKey
                                ? fetchTranslation
                                : undefined
                        }
                        onUpdateOffset={handleUpdateOffset}
                        overlayLayers={overlayLayerToggles}
                        translationVisible={isTranslationVisible}
                        visibleOverlayKeys={visibleOverlayKeys}
                    />
                </div>
            </div>
        </ComponentErrorBoundary>
    );
};
