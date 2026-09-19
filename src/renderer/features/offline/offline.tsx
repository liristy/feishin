import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect } from 'react';

import i18n from '/@/i18n/i18n';
import { api } from '/@/renderer/api';
import { useOfflineStore } from '/@/renderer/features/offline/offline-store';
import { usePlayerSong, usePlayerStatus, useSettingsStore } from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { LibraryItem, ServerType, Song } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';
import { cachedImage, isOffline } from '/@/shared/utils/offline-cache';

export const offline = isElectron() ? window.api.offline : null;

export class OfflineSongUnavailableError extends Error {
    constructor() {
        super(i18n.t('offline.audioNotCached'));
        this.name = 'OfflineSongUnavailableError';
    }
}

export function ListeningDownloads() {
    const { data } = useQuery({
        enabled: !!offline,
        networkMode: 'always',
        queryFn: () => offline!.list(),
        queryKey: ['offline-library'],
        refetchInterval: 1000,
        structuralSharing: true,
    });
    useEffect(() => {
        if (data) useOfflineStore.getState().setDownloads(data);
    }, [data]);
    const song = usePlayerSong();
    const status = usePlayerStatus();
    const enabled = useOfflineStore((state) => state.cacheWhileListening);
    useEffect(() => {
        if (!offline || !song || !enabled || isOffline() || status !== PlayerStatus.PLAYING) return;
        void saveOfflineSong(song).catch(() =>
            logger.warn('Could not enqueue listening download', { songId: song.id }),
        );
    }, [enabled, song, status]);
    return null;
}

export async function localSongUrl(song: Song, renderer: boolean) {
    const local = await offline?.resolve(song._serverId, song.id);
    if (local) return renderer ? local.url : local.path;
    if (isOffline()) throw new OfflineSongUnavailableError();
    return undefined;
}

export async function saveOfflineSong(song: Song) {
    if (!offline) return;
    if (isOffline() && !(await offline.resolve(song._serverId, song.id))) {
        throw new Error(i18n.t('offline.onlineRequired'));
    }
    // Older queue snapshots predate relativePath. Refresh metadata once before downloading.
    if (
        song._serverType === ServerType.NAVIDROME &&
        song.relativePath === undefined &&
        !isOffline()
    ) {
        song = await api.controller.getSongDetail({
            apiClientProps: { serverId: song._serverId },
            query: { id: song.id },
        });
    }
    // Use the playback route so server-side 302 redirects also apply to downloads.
    const url = await api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: { id: song.id, skipAutoTranscode: true, transcode: false },
    });
    await offline.save(song, url);
    // Cache the actual configured sizes so downloaded covers work in lists and the player.
    const sizes = new Set(Object.values(useSettingsStore.getState().general.imageRes));
    for (const size of sizes) {
        const request = api.controller.getImageRequest({
            apiClientProps: { serverId: song._serverId },
            query: { id: song.imageId || song.id, itemType: LibraryItem.SONG, size },
        });
        if (request)
            await cachedImage(request).catch(() =>
                logger.debug('Offline cover unavailable', { songId: song.id }),
            );
    }
}
