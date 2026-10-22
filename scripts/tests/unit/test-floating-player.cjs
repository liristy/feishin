/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
        }).outputText,
        {
            __dirname: '/app/out/main',
            clearInterval,
            clearTimeout,
            exports,
            process: { env: {} },
            require: (id) => mocks[id] || require(id),
            setInterval,
            setTimeout,
            ...globals,
        },
    );
    return exports;
}

test('floating player isolates IPC, controls playback and preserves its desktop position', async () => {
    const schema = load('src/shared/types/floating-player.ts');
    const app = new EventEmitter();
    const ipcMain = new EventEmitter();
    const screen = new EventEmitter();
    screen.getPrimaryDisplay = screen.getDisplayMatching = () => ({
        workArea: { height: 900, width: 1600, x: -1600, y: 0 },
    });
    const settings = new Map([['floating_player_position', { x: -3000, y: 9999 }]]);
    const windows = [];
    class Window extends EventEmitter {
        constructor(options) {
            super();
            this.options = options;
            this.visible = false;
            this.shows = 0;
            this.destroyed = false;
            this.messages = [];
            this.webContents = new EventEmitter();
            this.webContents.send = (...args) => this.messages.push(args);
            this.webContents.setWindowOpenHandler = (callback) => {
                this.openHandler = callback;
            };
            windows.push(this);
        }
        destroy() {
            assert.equal(this.destroyed, false);
            this.destroyed = true;
            this.emit('closed');
        }
        getBounds() {
            return { ...this.position, height: this.height || 104, width: 420 };
        }
        hide() {
            this.visible = false;
        }
        isVisible() {
            return this.visible;
        }
        loadFile(file) {
            assert.match(file, /floating-player.html$/);
            return Promise.resolve();
        }
        moveTop() {}
        setAlwaysOnTop(value, level) {
            if (value) assert.equal(level, 'pop-up-menu');
            this.topmost = value;
        }
        setBounds({ height, width, x, y }) {
            assert.equal(width, 420);
            assert.ok(height === 104 || height === 168 || height === 392);
            this.height = height;
            this.setPosition(x, y);
        }
        setPosition(x, y) {
            this.position = { x, y };
        }
        showInactive() {
            this.shows++;
            this.visible = true;
        }
    }
    const main = new EventEmitter();
    main.webContents = new EventEmitter();
    const sent = [];
    main.webContents.send = (...args) => sent.push(args);
    let full = false;
    main.isFullScreen = () => full;
    main.isDestroyed = () => false;
    let opened = 0;
    let menu;
    load('src/main/features/core/floating-player.ts', {
        '/@/main/features/core/settings': {
            store: {
                delete: (key) => settings.delete(key),
                get: (key) => settings.get(key),
                set: (key, value) => settings.set(key, value),
            },
        },
        '/@/main/logger': { default: { error() {}, warn() {} } },
        '/@/shared/types/floating-player': schema,
        electron: {
            app,
            BrowserWindow: Window,
            ipcMain,
            Menu: {
                buildFromTemplate: (items) => ({
                    popup: () => {
                        menu = items;
                    },
                }),
            },
            screen,
        },
    }).initializeFloatingPlayer(main, () => opened++);
    const owner = { sender: main.webContents };
    const track = {
        artist: '歌手',
        artwork: '',
        canSkip: true,
        hasMedia: true,
        labels: Object.fromEntries(
            [
                'disable',
                'drag',
                'empty',
                'mute',
                'next',
                'open',
                'pause',
                'play',
                'previous',
                'reset',
                'volume',
            ].map((key) => [key, key]),
        ),
        playing: false,
        theme: {
            background: 'rgb(28, 28, 30)',
            border: 'rgba(255, 255, 255, 0.1)',
            foreground: '#ffffff',
        },
        title: '歌曲',
        volume: 30,
    };
    const configure = (config, event = owner) =>
        ipcMain.emit('floating-player-configure', event, config);
    const update = (value, event = owner) => ipcMain.emit('floating-player-update', event, value);
    configure({ enabled: true, hideWhenIdle: true }, { sender: {} });
    update(track);
    assert.equal(windows.length, 0);
    configure({ enabled: true, hideWhenIdle: true });
    const window = windows[0];
    const client = { sender: window.webContents };
    assert.equal(window.options.parent, undefined);
    assert.equal(window.options.transparent, true);
    assert.equal(window.options.frame, false);
    assert.equal(window.options.alwaysOnTop, true);
    assert.equal(window.options.webPreferences.sandbox, true);
    assert.equal(window.openHandler().action, 'deny');
    assert.deepEqual(window.position, { x: -1600, y: 796 });
    ipcMain.emit('floating-player-ready', client);
    assert.equal(window.visible, true);
    assert.equal(window.topmost, true);
    assert.equal(window.messages.at(-1)[1].title, '歌曲');
    const initialShows = window.shows;
    for (let i = 0; i < 500; i++) update({ ...track, playing: i % 2 === 0 });
    assert.equal(
        window.shows,
        initialShows,
        'state changes must not show or raise an existing window',
    );
    ipcMain.emit('floating-player-drag', owner, 'begin', 10, 10);
    ipcMain.emit('floating-player-drag', client, 'move', 40, 40);
    assert.equal(window.position.x, -1600);
    ipcMain.emit('floating-player-drag', client, 'begin', 10, 50);
    ipcMain.emit('floating-player-drag', client, 'move', 110, 10);
    ipcMain.emit('floating-player-drag', client, 'move', NaN, 10);
    assert.deepEqual(window.position, { x: -1500, y: 756 });
    ipcMain.emit('floating-player-drag', client, 'end');
    assert.equal(settings.get('floating_player_position').y, 756);
    ipcMain.emit('floating-player-drag', client, 'begin', 10, 50);
    ipcMain.emit('floating-player-drag', client, 'move', -990, 1050);
    assert.deepEqual(window.position, { x: -2500, y: 1756 });
    ipcMain.emit('floating-player-drag', client, 'end');
    assert.equal(settings.get('floating_player_position').y, 1756);
    update({ ...track, volume: NaN });
    assert.equal(window.messages.at(-1)[1].volume, 30);
    update({ ...track, title: 'untrusted' }, client);
    assert.equal(window.messages.at(-1)[1].title, '歌曲');
    const command = (value, event = client) =>
        ipcMain.emit('floating-player-command', event, value);
    command('next', owner);
    command('unexpected');
    assert.equal(sent.filter(([channel]) => channel !== 'floating-player-panel').length, 0);
    const barY = window.position.y;
    command('lyrics');
    assert.equal(window.height, 168);
    assert.equal(window.position.y, barY - 64);
    const panelMessages = sent.length;
    ipcMain.emit('floating-player-panel-ready', client);
    assert.equal(sent.length, panelMessages, 'Only the main renderer can request panel state');
    ipcMain.emit('floating-player-panel-ready', owner);
    assert.deepEqual(sent.at(-1), ['floating-player-panel', 'lyrics']);
    command('queue');
    command('lyrics');
    assert.equal(window.height, 392, 'Switching to lyrics keeps room for the animation');
    await new Promise((resolve) => setTimeout(resolve, schema.FLOATING_PLAYER_TRANSITION_MS + 40));
    assert.equal(window.height, 168);
    assert.equal(window.position.y, barY - 64);
    command('lyrics');
    await new Promise((resolve) => setTimeout(resolve, schema.FLOATING_PLAYER_TRANSITION_MS + 40));
    for (let i = 0; i < 100; i++) {
        command('lyrics');
        assert.ok(window.height === 168 || window.height === 392);
        assert.equal(window.position.y + window.height - 104, barY);
        command('queue');
        assert.equal(window.position.y, barY - 288);
        command('queue');
        assert.equal(window.height, 392, 'Closing keeps room for the animation');
        assert.equal(window.position.y, barY - 288);
    }
    await new Promise((resolve) => setTimeout(resolve, schema.FLOATING_PLAYER_TRANSITION_MS + 40));
    assert.equal(window.height, 104);
    assert.equal(window.position.y, barY);
    update({ ...track, queue: [{ artist: '歌手', id: 'track-id', title: '歌曲' }] });
    command('queue');
    ipcMain.emit('floating-player-command', client, 'play-queue-item', 'spoofed-id');
    assert.equal(sent.at(-1)[0], 'floating-player-panel');
    ipcMain.emit('floating-player-command', client, 'play-queue-item', 'track-id');
    assert.equal(sent.at(-1)[0], 'floating-player-play-queue-item');
    command('queue');
    await new Promise((resolve) => setTimeout(resolve, schema.FLOATING_PLAYER_TRANSITION_MS + 40));
    sent.length = 0;
    command('play-pause');
    command('previous');
    command('next');
    command('volume-up');
    command('open');
    assert.deepEqual(
        sent.map(([channel]) => channel),
        [
            'renderer-player-play-pause',
            'renderer-player-previous',
            'renderer-player-next',
            'renderer-player-volume-up',
        ],
    );
    assert.equal(opened, 1);
    update({ ...track, canSkip: false });
    command('previous');
    assert.equal(sent.length, 4);
    full = true;
    main.emit('enter-full-screen');
    update(track);
    assert.equal(window.visible, true, 'Main-window fullscreen must not hide the floating player');
    full = false;
    main.emit('leave-full-screen');
    assert.equal(window.visible, true);
    main.emit('minimize');
    assert.equal(window.visible, true);
    for (const details of [
        { isMainFrame: false, isSameDocument: false },
        { isMainFrame: true, isSameDocument: true },
        { isMainFrame: true, isSameDocument: false },
    ]) {
        main.webContents.emit('did-start-navigation', details);
        assert.equal(window.destroyed, false, 'Navigation must not destroy the floating window');
        assert.equal(window.visible, true);
        update(track);
    }
    update({ ...track, hasMedia: false });
    assert.equal(window.visible, false);
    configure({ enabled: true, hideWhenIdle: false });
    assert.equal(window.visible, true);
    window.setPosition(-900, 500);
    window.emit('moved');
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(settings.get('floating_player_position').x, -900);
    command('menu');
    menu.find((item) => item.label === 'reset').click();
    assert.equal(settings.has('floating_player_position'), false);
    assert.equal(window.position.x, -1010);
    command('disable');
    assert.equal(window.destroyed, true);
    assert.equal(sent.at(-1)[0], 'floating-player-disable');
    configure({ enabled: true, hideWhenIdle: true });
    const second = windows[1];
    second.destroy();
    assert.equal(sent.at(-1)[0], 'floating-player-disable');
    configure({ enabled: true, hideWhenIdle: true });
    const replacement = windows[2];
    second.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    assert.equal(replacement.destroyed, false, 'an old renderer must not disable its replacement');
    for (let i = 0; i < 100; i++) {
        configure({ enabled: false, hideWhenIdle: true });
        configure({ enabled: true, hideWhenIdle: true });
    }
    assert.equal(windows.filter((window) => !window.destroyed).length, 1);
    app.emit('before-quit');
    assert.equal(windows.at(-1).destroyed, true);
    const beforeQuitCount = windows.length;
    update(track);
    configure({ enabled: true, hideWhenIdle: true });
    assert.equal(windows.length, beforeQuitCount, 'late IPC must not reopen a window during quit');
    main.emit('closed');
    assert.equal(ipcMain.listenerCount('floating-player-command'), 0);
    assert.equal(screen.listenerCount('display-removed'), 0);
});

test('floating lyrics follow live progress and apply the same offset direction as the main player', () => {
    const effects = [];
    const updates = [];
    const noop = () => {};
    let timestamp = 0.95;
    const lyricsData = {
        selected: {
            lyrics: [
                { startMs: 0, text: 'first' },
                { startMs: 1000, text: 'second' },
                { startMs: 1500, text: 'third' },
            ],
        },
        selectedOffsetMs: 0,
    };
    const { FloatingPlayerHook } = load(
        'src/renderer/features/player/hooks/use-floating-player.tsx',
        {
            '/@/renderer/components/item-image/item-image': { useItemImageRequest: () => null },
            '/@/renderer/features/lyrics/api/lyrics-api': {
                lyricsQueries: { songLyrics: noop },
            },
            '/@/renderer/features/lyrics/api/lyrics-utils': load(
                'src/renderer/features/lyrics/api/lyrics-utils.ts',
            ),
            '/@/renderer/features/player/context/player-context': {
                usePlayer: () => ({ mediaPlay: noop }),
            },
            '/@/renderer/features/player/utils/floating-player-artwork': {},
            '/@/renderer/features/radio/hooks/use-radio-player': { useRadioPlayer: () => ({}) },
            '/@/renderer/store': {
                useFullScreenPlayerStore: () => ({}),
                usePlayerProgress: () => timestamp,
                usePlayerQueue: () => [],
                usePlayerSong: () => ({ _uniqueId: 'song', id: 'song' }),
                usePlayerStatus: () => 'PLAYING',
                usePlayerTimestamp: () => 0.5,
                usePlayerVolume: () => 30,
                useSettingsStore: (select) => select({ window: { taskbarPlayer: true } }),
            },
            '/@/renderer/utils/logger': {},
            '/@/shared/components/image/use-native-image': { useNativeImage: () => ({}) },
            '/@/shared/types/domain-types': { LibraryItem: {} },
            '/@/shared/types/types': { PlayerStatus: { PLAYING: 'PLAYING' } },
            '@tanstack/react-query': { useQuery: () => ({ data: lyricsData }) },
            'is-electron': { default: () => true },
            react: {
                useEffect: (effect) => effects.push(effect),
                useMemo: (factory) => factory(),
                useState: (initial) => [initial === null ? 'lyrics' : initial, noop],
            },
            'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
            'react/jsx-runtime': { jsx: (type) => ({ type }) },
        },
        {
            window: {
                api: {
                    floatingPlayer: {
                        configure: noop,
                        onDisable: noop,
                        onPanel: noop,
                        onPlayQueueItem: noop,
                        update: (state) => updates.push(state),
                    },
                },
            },
        },
    );
    const render = () => {
        FloatingPlayerHook().type();
        effects.splice(0).forEach((effect) => effect());
        return updates.at(-1);
    };
    assert.equal(render().currentLyric, 0);
    timestamp = 1.05;
    assert.equal(render().currentLyric, 1, 'switch immediately when live progress crosses a cue');
    assert.equal(updates.at(-1).lyricDurationMs, 500);
    timestamp = 1.25;
    lyricsData.selectedOffsetMs = 300;
    assert.equal(render().currentLyric, 2, 'positive offsets advance lyrics');
    lyricsData.selectedOffsetMs = -300;
    assert.equal(render().currentLyric, 0, 'negative offsets delay lyrics');
    timestamp = 0.1;
    lyricsData.selectedOffsetMs = 0;
    assert.equal(render().currentLyric, 0, 'seeking back updates the line immediately');
});

test('floating player drags its background, preserves buttons and ignores horizontal scrolling', () => {
    let rendered;
    const commands = [];
    const drags = [];
    load(
        'src/renderer/features/player/components/floating-player.tsx',
        {
            './floating-player.module.css': { default: {} },
            '/@/renderer/features/player/components/cover-flow-canvas': {},
            '/@/renderer/features/player/hooks/use-cover-flow-image': {},
            '/@/shared/components/icon/icon': { Icon() {} },
            '/@/shared/styles/bundled-appearance.css': {},
            '/@/shared/types/floating-player': load('src/shared/types/floating-player.ts'),
            'motion/react': {},
            react: {
                useEffect() {},
                useRef: () => ({ current: null }),
                useState: () => [
                    {
                        artist: '',
                        labels: {},
                        lyrics: [],
                        panel: null,
                        playing: false,
                        queue: [],
                        theme: {},
                        title: '',
                    },
                    () => {},
                ],
            },
            'react-dom/client': {
                createRoot: () => ({
                    render: (element) => {
                        rendered = element.type();
                    },
                }),
            },
            'react/jsx-runtime': {
                jsx: (type, props) => ({ props, type }),
                jsxs: (type, props) => ({ props, type }),
            },
        },
        {
            document: { getElementById: () => ({}) },
            window: {
                floatingPlayerWindow: {
                    command: (command) => commands.push(command),
                    drag: (...args) => drags.push(args),
                },
            },
        },
    );
    const player = rendered.props.children.props.children.at(-1).props;
    const wheel = player.onWheel;
    wheel({ deltaY: 0 });
    assert.equal(commands.length, 0);
    wheel({ deltaY: -1 });
    wheel({ deltaY: 1 });
    assert.deepEqual(commands, ['volume-up', 'volume-down']);
    assert.equal(
        player.children[2].props.title,
        undefined,
        'metadata must not display the old hover tooltip',
    );
    let captured = false;
    const pointer = {
        button: 0,
        currentTarget: {
            hasPointerCapture: () => captured,
            releasePointerCapture: () => {
                captured = false;
            },
            setPointerCapture: () => {
                captured = true;
            },
        },
        pointerId: 1,
        screenX: 10,
        screenY: 20,
        target: { closest: () => ({}) },
    };
    player.onPointerDown(pointer);
    player.onPointerMove(pointer);
    assert.equal(drags.length, 0, 'button descendants must retain normal clicks');
    pointer.target.closest = () => null;
    player.onPointerDown(pointer);
    player.onPointerMove({ ...pointer, screenX: 30, screenY: 40 });
    player.onPointerUp(pointer);
    player.onLostPointerCapture();
    assert.equal(captured, false);
    assert.deepEqual(drags, [['begin', 10, 20], ['move', 30, 40], ['end']]);
});
