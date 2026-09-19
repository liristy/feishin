import { useEffect } from 'react';

import i18n from '/@/i18n/i18n';
import { offline } from '/@/renderer/features/offline/offline';
import { useOfflineStatus } from '/@/renderer/features/offline/offline-store';
import { usePlaybackType, usePlayerSong, usePlayerStatus, usePlayerStore } from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { toast } from '/@/shared/components/toast/toast';
import { PlayerRepeat, PlayerShuffle, PlayerStatus, PlayerType } from '/@/shared/types/types';
import { isOffline } from '/@/shared/utils/offline-cache';

export const OfflinePlaybackHook = () => {
    const disconnected = useOfflineStatus();
    const song = usePlayerSong();
    const status = usePlayerStatus();
    const type = usePlaybackType();

    useEffect(() => {
        if (
            !offline ||
            !disconnected ||
            !song ||
            status !== PlayerStatus.PLAYING ||
            (type !== PlayerType.LOCAL && type !== PlayerType.WEB)
        )
            return;
        let cancelled = false;
        const advance = async () => {
            const snapshot = await offline.list();
            const state = usePlayerStore.getState();
            if (
                cancelled ||
                !isOffline() ||
                state.player.status !== PlayerStatus.PLAYING ||
                state.getCurrentSong()?._uniqueId !== song._uniqueId
            )
                return;
            const available = new Set(
                snapshot.entries.map(({ song }) => JSON.stringify([song._serverId, song.id])),
            );
            const isAvailable = (item: typeof song) =>
                available.has(JSON.stringify([item._serverId, item.id]));
            if (isAvailable(song)) return;
            const queue = state.getQueue().items;
            const order =
                state.player.shuffle === PlayerShuffle.NONE
                    ? queue.map((_, index) => index)
                    : state.queue.shuffled;
            const current = order.findIndex((index) => queue[index]?._uniqueId === song._uniqueId);
            const candidates =
                state.player.repeat === PlayerRepeat.ALL
                    ? [...order.slice(current + 1), ...order.slice(0, current)]
                    : order.slice(current + 1);
            const next = candidates.find((index) => queue[index] && isAvailable(queue[index]));
            if (next !== undefined) {
                logger.debug('Skipping unavailable offline tracks', {
                    from: song.id,
                    to: queue[next].id,
                });
                state.mediaPlayByIndex(next);
            } else {
                state.mediaPause();
                toast.info({ message: i18n.t('offline.noPlayableSongs') });
            }
        };
        void advance().catch((error) =>
            logger.warn('Failed to check offline playback availability', { error }),
        );
        return () => {
            cancelled = true;
        };
    }, [disconnected, song, status, type]);
    return null;
};
