import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { offline } from '/@/renderer/features/offline/offline';
import { useSongDownloadStatus } from '/@/renderer/features/offline/offline-store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { QueueSong, Song } from '/@/shared/types/domain-types';

interface ShowInFileExplorerActionProps {
    items: QueueSong[] | Song[];
}

const utils = isElectron() ? window.api.utils : null;

export const ShowInFileExplorerAction = ({ items }: ShowInFileExplorerActionProps) => {
    const { t } = useTranslation();
    const downloadStatus = useSongDownloadStatus(items[0]);

    const onSelect = useCallback(async () => {
        if (!utils) {
            return;
        }

        const firstItem = items[0];
        try {
            if (!firstItem) return;
            const local = await offline?.resolve(firstItem._serverId, firstItem.id);
            const resolvedPath = local?.path;
            if (!resolvedPath) throw new Error(t('offline.audioNotCached'));
            await utils.openItem(resolvedPath);
        } catch (error) {
            toast.error({
                message: (error as Error).message,
                title: t('error.openError'),
            });
        }
    }, [items, t]);

    if (!utils || items.length !== 1 || downloadStatus !== 'downloaded') {
        return null;
    }

    return (
        <ContextMenu.Item leftIcon="folder" onSelect={onSelect}>
            {t('page.itemDetail.openFile')}
        </ContextMenu.Item>
    );
};
