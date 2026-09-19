import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { offline, saveOfflineSong } from '/@/renderer/features/offline/offline';
import { fetchSongsByItemType } from '/@/renderer/features/player/context/player-context';
import { queryClient } from '/@/renderer/lib/react-query';
import { useCurrentServer } from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface DownloadActionProps {
    ids: string[];
    itemType?: LibraryItem;
    songs?: Song[];
}

const utils = isElectron() ? window.api.utils : null;

export const DownloadAction = ({ ids, itemType, songs }: DownloadActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();

    const onSelect = useCallback(async () => {
        try {
            if (offline && (songs || itemType)) {
                const tracks =
                    songs ||
                    (await fetchSongsByItemType(queryClient, server.id, {
                        id: ids,
                        itemType: itemType!,
                    }));
                for (const song of tracks) await saveOfflineSong(song);
                toast.info({ message: t('offline.enqueued', { count: tracks.length }) });
                return;
            }
            for (const id of ids) {
                const downloadUrl = api.controller.getDownloadUrl({
                    apiClientProps: { serverId: server.id },
                    query: { id },
                });

                if (isElectron()) {
                    utils?.download(downloadUrl);
                } else {
                    window.open(downloadUrl, '_blank');
                }
            }
        } catch (error) {
            logger.warn('Could not enqueue downloads');
            toast.error({
                message: error instanceof Error ? error.message : t('offline.operationFailed'),
            });
        }
    }, [ids, itemType, server, songs, t]);

    return (
        <ContextMenu.Item
            disabled={!offline && ids.length > 1}
            leftIcon="download"
            onSelect={onSelect}
        >
            {t('page.contextMenu.download')}
        </ContextMenu.Item>
    );
};
