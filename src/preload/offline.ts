import { ipcRenderer } from 'electron';

import { Song } from '/@/shared/types/domain-types';
import { OfflineSnapshot } from '/@/shared/types/offline';

export const offline = {
    cancel: (key: string): Promise<void> => ipcRenderer.invoke('offline-cancel', key),
    list: (): Promise<OfflineSnapshot> => ipcRenderer.invoke('offline-list'),
    openFolder: (): Promise<string> => ipcRenderer.invoke('offline-open-folder'),
    remove: (key: string): Promise<void> => ipcRenderer.invoke('offline-remove', key),
    resolve: (serverId: string, songId: string): Promise<null | { path: string; url: string }> =>
        ipcRenderer.invoke('offline-resolve', serverId, songId),
    save: (song: Song, url: string): Promise<string> =>
        ipcRenderer.invoke('offline-save', { song, url }),
};
