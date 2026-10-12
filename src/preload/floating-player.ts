import type { FloatingPlayerPanel, FloatingPlayerState } from '/@/shared/types/floating-player';

import { ipcRenderer } from 'electron';

export const floatingPlayer = {
    configure: (enabled: boolean, hideWhenIdle: boolean) =>
        ipcRenderer.send('floating-player-configure', { enabled, hideWhenIdle }),
    onDisable: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('floating-player-disable', listener);
        return () => ipcRenderer.removeListener('floating-player-disable', listener);
    },
    onPanel: (callback: (panel: FloatingPlayerPanel) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, panel: FloatingPlayerPanel) =>
            callback(panel);
        ipcRenderer.on('floating-player-panel', listener);
        return () => ipcRenderer.removeListener('floating-player-panel', listener);
    },
    onPlayQueueItem: (callback: (id: string) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
        ipcRenderer.on('floating-player-play-queue-item', listener);
        return () => ipcRenderer.removeListener('floating-player-play-queue-item', listener);
    },
    update: (state: FloatingPlayerState) => ipcRenderer.send('floating-player-update', state),
};
