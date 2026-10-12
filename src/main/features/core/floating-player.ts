import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { join } from 'path';

import { store } from '/@/main/features/core/settings';
import log from '/@/main/logger';
import {
    FLOATING_PLAYER_LYRICS_HEIGHT,
    FLOATING_PLAYER_PANEL_HEIGHT,
    FLOATING_PLAYER_TRANSITION_MS,
    FloatingPlayerPanel,
    FloatingPlayerState,
    FloatingPlayerStateSchema,
    FLOATING_PLAYER_HEIGHT as HEIGHT,
    FLOATING_PLAYER_WIDTH as WIDTH,
} from '/@/shared/types/floating-player';

export function initializeFloatingPlayer(mainWindow: BrowserWindow, showMainWindow: () => void) {
    let floatingWindow: BrowserWindow | null = null;
    let state: FloatingPlayerState | null = null;
    let enabled = false;
    let hideWhenIdle = true;
    let ready = false;
    let quitting = false;
    let panel: FloatingPlayerPanel = null;
    let panelInset = 0;
    const fixedViewport = process.platform === 'win32';
    let panelResizeTimer: ReturnType<typeof setTimeout> | undefined;
    const panelHeight = () => (fixedViewport ? FLOATING_PLAYER_PANEL_HEIGHT : panelInset);
    const resizePanel = (height: number) => {
        if (!floatingWindow) return;
        if (fixedViewport) {
            // Resizing transparent Windows surfaces briefly exposes the previous frame at its new position.
            // Keep the compositor surface stable and let the unused area pass mouse input through.
            floatingWindow.setShape([
                {
                    height: HEIGHT + height,
                    width: WIDTH,
                    x: 0,
                    y: FLOATING_PLAYER_PANEL_HEIGHT - height,
                },
            ]);
        } else {
            const bounds = floatingWindow.getBounds();
            floatingWindow.setBounds({
                height: HEIGHT + height,
                width: WIDTH,
                x: bounds.x,
                y: bounds.y + panelInset - height,
            });
        }
        panelInset = height;
    };
    const savePosition = () => {
        if (!floatingWindow) return;
        const { x, y } = floatingWindow.getBounds();
        store.set('floating_player_position', { x, y: y + panelHeight() });
    };
    let dragOrigin: null | { pointerX: number; pointerY: number; x: number; y: number } = null;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;

    const placeWindow = (saved = store.get('floating_player_position')) => {
        if (!floatingWindow) return;
        const valid = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y);
        const area = (
            valid
                ? screen.getDisplayMatching({ ...saved, height: HEIGHT, width: WIDTH })
                : screen.getPrimaryDisplay()
        ).workArea;
        floatingWindow.setBounds({
            height: HEIGHT + panelHeight(),
            width: WIDTH,
            x: valid
                ? Math.max(area.x, Math.min(saved.x, area.x + area.width - WIDTH))
                : area.x + Math.round((area.width - WIDTH) / 2),
            y: valid
                ? Math.max(
                      area.y - (fixedViewport ? FLOATING_PLAYER_PANEL_HEIGHT : 0),
                      Math.min(
                          saved.y - panelHeight(),
                          area.y + area.height - HEIGHT - panelHeight(),
                      ),
                  )
                : area.y + area.height - HEIGHT - panelHeight() - 8,
        });
    };
    const closeWindow = () => {
        clearTimeout(moveTimer);
        clearTimeout(panelResizeTimer);
        const previous = floatingWindow;
        floatingWindow = null;
        dragOrigin = null;
        ready = false;
        panel = null;
        panelInset = 0;
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('floating-player-panel', null);
        previous?.destroy();
    };
    const disable = () => {
        enabled = false;
        closeWindow();
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('floating-player-disable');
    };
    const publish = () => {
        if (!floatingWindow || !ready || !state) return;
        floatingWindow.webContents.send('floating-player-state', { ...state, panel });
        if (enabled && !mainWindow.isFullScreen() && (!hideWhenIdle || state.hasMedia)) {
            if (!floatingWindow.isVisible()) {
                floatingWindow.showInactive();
                floatingWindow.setAlwaysOnTop(true, 'pop-up-menu');
            }
        } else if (floatingWindow.isVisible()) floatingWindow.hide();
    };
    const openWindow = () => {
        if (quitting || !enabled || !state || floatingWindow) return;
        const window = new BrowserWindow({
            alwaysOnTop: true,
            autoHideMenuBar: true,
            backgroundColor: '#00000000',
            frame: false,
            fullscreenable: false,
            hasShadow: false,
            height: HEIGHT + panelHeight(),
            maximizable: false,
            minimizable: false,
            resizable: false,
            show: false,
            skipTaskbar: true,
            title: 'qMusic Floating Player',
            transparent: true,
            webPreferences: {
                backgroundThrottling: false,
                contextIsolation: true,
                nodeIntegration: false,
                preload: join(__dirname, '../preload/floating-player-window.js'),
                sandbox: true,
            },
            width: WIDTH,
        });
        floatingWindow = window;
        placeWindow();
        if (fixedViewport) resizePanel(0);
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event) => event.preventDefault());
        window.webContents.on('did-finish-load', () => {
            if (floatingWindow !== window) return;
            ready = true;
            publish();
        });
        window.webContents.on('render-process-gone', (_event, details) => {
            if (floatingWindow !== window) return;
            log.error('Floating player renderer exited', { reason: details.reason });
            disable();
        });
        window.on('moved', () => {
            clearTimeout(moveTimer);
            moveTimer = setTimeout(() => {
                if (floatingWindow !== window) return;
                savePosition();
            }, 150);
        });
        window.on('closed', () => {
            if (floatingWindow !== window) return;
            floatingWindow = null;
            ready = false;
            disable();
        });
        const loaded = process.env.ELECTRON_RENDERER_URL
            ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/floating-player.html`)
            : window.loadFile(join(__dirname, '../renderer/floating-player.html'));
        loaded.catch((error) => {
            log.error('Failed to load floating player', error);
            if (floatingWindow === window) disable();
        });
    };
    const dispatch = (command: unknown) => {
        if (!enabled) return;
        if (command === 'disable') disable();
        else if (command === 'open') showMainWindow();
        else if (command === 'reset') {
            store.delete('floating_player_position');
            placeWindow(null);
        } else if (
            (command === 'play-pause' && state?.hasMedia) ||
            ((command === 'previous' || command === 'next') && state?.canSkip) ||
            command === 'volume-up' ||
            command === 'volume-down' ||
            command === 'volume-mute'
        )
            mainWindow.webContents.send(`renderer-player-${command}`);
    };
    const command = (event: Electron.IpcMainEvent, value: unknown, id: unknown) => {
        if (!floatingWindow || event.sender !== floatingWindow.webContents) return;
        if (value === 'lyrics' || value === 'queue') {
            clearTimeout(panelResizeTimer);
            panel = panel === value ? null : value;
            dragOrigin = null;
            const height =
                panel === 'lyrics'
                    ? FLOATING_PLAYER_LYRICS_HEIGHT
                    : panel === 'queue'
                      ? FLOATING_PLAYER_PANEL_HEIGHT
                      : 0;
            if (height >= panelInset) resizePanel(height);
            else {
                // Keep room for the renderer's animation before shrinking the native window.
                panelResizeTimer = setTimeout(
                    () => resizePanel(height),
                    FLOATING_PLAYER_TRANSITION_MS + 32,
                );
            }
            mainWindow.webContents.send('floating-player-panel', panel);
            publish();
            return;
        }
        if (value === 'play-queue-item') {
            if (
                enabled &&
                panel === 'queue' &&
                typeof id === 'string' &&
                state?.queue.some((song) => song.id === id)
            )
                mainWindow.webContents.send('floating-player-play-queue-item', id);
            return;
        }
        if (value !== 'menu' || !state) {
            dispatch(value);
            return;
        }
        const { labels } = state;
        Menu.buildFromTemplate([
            { click: showMainWindow, label: labels.open },
            { click: () => dispatch('volume-mute'), label: labels.mute },
            { click: () => dispatch('reset'), label: labels.reset },
            { type: 'separator' },
            { click: disable, label: labels.disable },
        ]).popup({ window: floatingWindow });
    };
    const configure = (event: Electron.IpcMainEvent, config: unknown) => {
        if (event.sender !== mainWindow.webContents || !config || typeof config !== 'object')
            return;
        const settings = config as { enabled?: unknown; hideWhenIdle?: unknown };
        if (typeof settings.enabled !== 'boolean' || typeof settings.hideWhenIdle !== 'boolean')
            return;
        enabled = settings.enabled;
        hideWhenIdle = settings.hideWhenIdle;
        if (enabled) openWindow();
        else closeWindow();
        publish();
    };
    const update = (event: Electron.IpcMainEvent, value: unknown) => {
        if (event.sender !== mainWindow.webContents) return;
        const parsed = FloatingPlayerStateSchema.safeParse(value);
        if (!parsed.success) {
            log.warn('Invalid floating player state');
            return;
        }
        state = parsed.data;
        openWindow();
        publish();
    };
    const clearState = () => {
        state = null;
        closeWindow();
    };
    const beforeQuit = () => {
        quitting = true;
        closeWindow();
    };
    const displayChanged = () => {
        if (floatingWindow) {
            const bounds = floatingWindow.getBounds();
            placeWindow({ x: bounds.x, y: bounds.y + panelHeight() });
        }
    };
    const rendererReady = (event: Electron.IpcMainEvent) => {
        if (!floatingWindow || event.sender !== floatingWindow.webContents) return;
        ready = true;
        publish();
    };
    const drag = (event: Electron.IpcMainEvent, phase: unknown, x: unknown, y: unknown) => {
        if (!enabled || !floatingWindow || event.sender !== floatingWindow.webContents) return;
        if (phase === 'end') {
            if (dragOrigin) {
                savePosition();
            }
            dragOrigin = null;
            return;
        }
        if (
            typeof x !== 'number' ||
            typeof y !== 'number' ||
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            Math.abs(x) > 100000 ||
            Math.abs(y) > 100000
        )
            return;
        if (phase === 'begin') {
            const position = floatingWindow.getBounds();
            dragOrigin = { pointerX: x, pointerY: y, x: position.x, y: position.y };
        } else if (phase === 'move' && dragOrigin) {
            floatingWindow.setBounds({
                height: HEIGHT + panelHeight(),
                width: WIDTH,
                x: Math.round(dragOrigin.x + x - dragOrigin.pointerX),
                y: Math.round(dragOrigin.y + y - dragOrigin.pointerY),
            });
        }
    };
    ipcMain.on('floating-player-configure', configure);
    ipcMain.on('floating-player-update', update);
    ipcMain.on('floating-player-command', command);
    ipcMain.on('floating-player-ready', rendererReady);
    ipcMain.on('floating-player-drag', drag);
    mainWindow.on('enter-full-screen', publish);
    mainWindow.on('leave-full-screen', publish);
    mainWindow.webContents.on('did-start-loading', clearState);
    mainWindow.webContents.on('render-process-gone', clearState);
    screen.on('display-removed', displayChanged);
    screen.on('display-metrics-changed', displayChanged);
    app.on('before-quit', beforeQuit);
    mainWindow.on('closed', () => {
        closeWindow();
        ipcMain.removeListener('floating-player-configure', configure);
        ipcMain.removeListener('floating-player-update', update);
        ipcMain.removeListener('floating-player-command', command);
        ipcMain.removeListener('floating-player-ready', rendererReady);
        ipcMain.removeListener('floating-player-drag', drag);
        screen.removeListener('display-removed', displayChanged);
        screen.removeListener('display-metrics-changed', displayChanged);
        app.removeListener('before-quit', beforeQuit);
    });
}
