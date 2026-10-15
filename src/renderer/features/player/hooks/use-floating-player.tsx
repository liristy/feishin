import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useItemImageRequest } from '/@/renderer/components/item-image/item-image';
import { lyricsQueries } from '/@/renderer/features/lyrics/api/lyrics-api';
import {
    getCurrentLyricIndex,
    normalizeLyrics,
} from '/@/renderer/features/lyrics/api/lyrics-utils';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { createFloatingPlayerArtwork } from '/@/renderer/features/player/utils/floating-player-artwork';
import { useRadioPlayer } from '/@/renderer/features/radio/hooks/use-radio-player';
import {
    useFullScreenPlayerStore,
    usePlayerQueue,
    usePlayerSong,
    usePlayerStatus,
    usePlayerStore,
    usePlayerTimestamp,
    usePlayerVolume,
    useSettingsStore,
} from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { useNativeImage } from '/@/shared/components/image/use-native-image';
import { LibraryItem } from '/@/shared/types/domain-types';
import { FloatingPlayerPanel } from '/@/shared/types/floating-player';
import { PlayerStatus } from '/@/shared/types/types';

const floatingPlayer = isElectron() ? window.api?.floatingPlayer : null;

export function FloatingPlayerHook() {
    return floatingPlayer ? <FloatingPlayerBridge /> : null;
}

function FloatingPlayerBridge() {
    const { t } = useTranslation();
    const enabled = useSettingsStore((settings) => settings.window.taskbarPlayer);
    const hideWhenIdle = useSettingsStore((settings) => settings.window.taskbarPlayerHideWhenIdle);
    const song = usePlayerSong();
    const queue = usePlayerQueue();
    const timestamp = usePlayerTimestamp();
    const { mediaPlay } = usePlayer();
    const [panel, setPanel] = useState<FloatingPlayerPanel>(null);
    const status = usePlayerStatus();
    const volume = usePlayerVolume();
    const radio = useRadioPlayer();
    const isRadio = Boolean(radio.currentStreamUrl);
    const lyricsEnabled = enabled && panel === 'lyrics' && !isRadio && Boolean(song?.id);
    const { data: lyricsData, isFetching: lyricsLoading } = useQuery(
        lyricsQueries.songLyrics(
            {
                options: { enabled: lyricsEnabled },
                query: { songId: song?.id || '' },
                serverId: song?._serverId || '',
            },
            song,
        ),
    );
    const lyricLines = useMemo(() => {
        const lyrics = lyricsEnabled ? lyricsData?.selected?.lyrics : null;
        if (Array.isArray(lyrics)) return normalizeLyrics(lyrics);
        return typeof lyrics === 'string'
            ? lyrics.split(/\r?\n/).map((text) => ({ startMs: -1, text }))
            : [];
    }, [lyricsEnabled, lyricsData]);
    const currentLyric =
        lyricLines[0]?.startMs >= 0
            ? getCurrentLyricIndex(
                  lyricLines,
                  timestamp * 1000 - (lyricsData?.selectedOffsetMs || 0),
              )
            : -1;
    const lyricDurationMs =
        currentLyric >= 0 && lyricLines[currentLyric + 1]
            ? Math.max(0, lyricLines[currentLyric + 1].startMs - lyricLines[currentLyric].startMs)
            : 0;
    const lyrics = useMemo(
        () => lyricLines.slice(0, 5000).map((line) => line.text.slice(0, 2048)),
        [lyricLines],
    );
    const queueItems = useMemo(() => {
        // ponytail: cap IPC at 10,000 queue rows; page the bridge if larger queues need displaying.
        return panel === 'queue' && !isRadio
            ? queue.slice(0, 10000).map((item) => ({
                  artist: item.artistName.slice(0, 512),
                  id: item._uniqueId,
                  title: item.name.slice(0, 512),
              }))
            : [];
    }, [queue, panel, isRadio]);
    const artwork = isRadio ? radio.currentStationArt : song;
    const request = useItemImageRequest({
        id: artwork?.imageId,
        imageUrl: artwork?.imageId ? undefined : artwork?.imageUrl,
        itemType: isRadio ? LibraryItem.RADIO_STATION : LibraryItem.SONG,
        serverId: isRadio ? radio.currentStationArt?.serverId : song?._serverId,
        size: 96,
    });
    const [cover, setCover] = useState({ key: '', src: '' });
    const requestKey = request ? JSON.stringify(request) : '';
    const { displaySrc } = useNativeImage({ enabled, request });
    const { dynamicBackground, dynamicImageBlur, dynamicIsImage, opacity } =
        useFullScreenPlayerStore();
    const theme = useMemo(
        () => ({
            background: 'rgb(20 23 24)',
            blur: dynamicImageBlur,
            border: 'transparent',
            dynamicBackground: Boolean(dynamicBackground),
            dynamicIsImage: Boolean(dynamicIsImage),
            foreground: 'rgb(255 255 255)',
            opacity,
        }),
        [dynamicBackground, dynamicImageBlur, dynamicIsImage, opacity],
    );
    useEffect(() => {
        floatingPlayer!.configure(enabled, hideWhenIdle);
    }, [enabled, hideWhenIdle]);

    useEffect(() => {
        return floatingPlayer!.onDisable(() => {
            useSettingsStore.getState().actions.setSettings({ window: { taskbarPlayer: false } });
        });
    }, []);

    useEffect(() => floatingPlayer!.onPanel(setPanel), []);
    useEffect(
        () =>
            floatingPlayer!.onPlayQueueItem((id) => {
                if (
                    usePlayerStore
                        .getState()
                        .getQueue()
                        .items.some((item) => item._uniqueId === id)
                )
                    mediaPlay(id);
            }),
        [mediaPlay],
    );

    useEffect(() => {
        if (!enabled || !displaySrc) return;
        const abort = new AbortController();
        void createFloatingPlayerArtwork(displaySrc, abort.signal)
            .then((src) => {
                if (!abort.signal.aborted) setCover({ key: requestKey, src });
            })
            .catch(() => {
                if (!abort.signal.aborted) logger.warn('Failed to load floating player artwork');
            });
        return () => {
            abort.abort();
        };
    }, [enabled, displaySrc, requestKey]);

    useEffect(() => {
        if (!enabled) return;
        floatingPlayer!.update({
            artist: (isRadio
                ? radio.metadata?.artist || radio.stationName || ''
                : song?.artistName || ''
            ).slice(0, 512),
            artwork: cover.key === requestKey ? cover.src : '',
            canSkip: !isRadio && Boolean(song),
            currentLyric: Math.min(currentLyric, lyrics.length - 1),
            currentSongId: isRadio ? '' : song?._uniqueId || '',
            hasMedia: isRadio || Boolean(song),
            labels: {
                collapse: t('common.close'),
                disable: t('floatingPlayer.disable'),
                drag: t('floatingPlayer.drag'),
                empty: t('floatingPlayer.empty'),
                loading: t('floatingPlayer.loading'),
                lyrics: t('page.fullscreenPlayer.lyrics'),
                mute: t('player.mute'),
                next: t('player.next'),
                noLyrics: t('page.fullscreenPlayer.noLyrics'),
                open: t('floatingPlayer.open'),
                pause: t('floatingPlayer.pause'),
                play: t('player.play'),
                previous: t('player.previous'),
                queue: t('player.viewQueue'),
                reset: t('floatingPlayer.reset'),
                volume: t('player.volume'),
            },
            lyricDurationMs: Math.min(600000, lyricDurationMs),
            lyrics,
            lyricsLoading: lyricsEnabled && lyricsLoading,
            panel,
            playing: isRadio ? radio.isPlaying : status === PlayerStatus.PLAYING,
            queue: queueItems,
            theme,
            title: (isRadio
                ? radio.metadata?.title || radio.stationName || ''
                : song?.name || ''
            ).slice(0, 512),
            volume,
        });
    }, [
        enabled,
        currentLyric,
        lyrics,
        lyricsLoading,
        lyricsEnabled,
        lyricDurationMs,
        panel,
        queueItems,
        song,
        status,
        volume,
        isRadio,
        radio.isPlaying,
        radio.metadata,
        radio.stationName,
        cover,
        requestKey,
        theme,
        t,
    ]);

    return null;
}
