import type { FloatingPlayerState } from '/@/shared/types/floating-player';

import { contextBridge, ipcRenderer } from 'electron';

const floatingPlayerWindow = {
    command: (command: string, value?: string) =>
        ipcRenderer.send('floating-player-command', command, value),
    drag: (phase: 'begin' | 'end' | 'move', x?: number, y?: number) =>
        ipcRenderer.send('floating-player-drag', phase, x, y),
    onState: (callback: (state: FloatingPlayerState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: FloatingPlayerState) =>
            callback(state);
        ipcRenderer.on('floating-player-state', listener);
        ipcRenderer.send('floating-player-ready');
        return () => ipcRenderer.removeListener('floating-player-state', listener);
    },
};

contextBridge.exposeInMainWorld('floatingPlayerWindow', floatingPlayerWindow);

declare global {
    interface Window {
        floatingPlayerWindow: typeof floatingPlayerWindow;
    }
}
