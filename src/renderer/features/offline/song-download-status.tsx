import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';

import styles from './song-download-status.module.css';

import { useSongDownloadStatus } from '/@/renderer/features/offline/offline-store';
import { Icon } from '/@/shared/components/icon/icon';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

export const SongDownloadStatus = ({
    song,
}: {
    song?: Pick<Song, '_serverId' | 'id'> & { _itemType: LibraryItem };
}) => {
    const { t } = useTranslation();
    const status = useSongDownloadStatus(song);
    if (!isElectron() || !song || song._itemType !== LibraryItem.SONG) return null;
    const label = t(`offline.${status || 'notDownloaded'}`);
    return (
        <span
            aria-label={label}
            className={styles.status}
            data-download-status={status || 'notDownloaded'}
            role="img"
            title={label}
        >
            <Icon
                color={status === 'downloaded' ? 'primary' : 'muted'}
                icon={
                    status === 'downloaded'
                        ? 'success'
                        : status === 'downloading'
                          ? 'refresh'
                          : status === 'queued'
                            ? 'duration'
                            : status === 'failed'
                              ? 'error'
                              : 'download'
                }
                size="md"
            />
        </span>
    );
};
