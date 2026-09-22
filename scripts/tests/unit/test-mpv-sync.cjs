/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
// Run with: node scripts/tests/unit/test-mpv-sync.cjs
// Exercise the production IPC handlers and renderer URL resolution with controlled async races.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compile = (source, fileName) =>
    ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName,
    }).outputText;
const root = path.resolve(__dirname, '../../..');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
    let reject, resolve;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    return { promise, reject, resolve };
};
const logger = { debug() {}, error() {}, info() {}, warn() {} };

class FakeMpv extends EventEmitter {
    static instance;
    constructor(options, params) {
        super();
        this.socket = new EventEmitter();
        this.options = options;
        this.params = params;
        this.list = [];
        this.pos = -1;
        this.calls = [];
        this.tracks = [];
        this.delays = new Map();
        FakeMpv.instance = this;
    }
    async clearPlaylist() {
        this.list = [];
    }
    async command(name, args) {
        this.calls.push([name, ...args]);
        if (name === 'video-add') this.tracks.push({ id: 3, title: args[2] });
        if (name === 'video-remove') this.tracks = [];
    }
    async getPlaylistSize() {
        await tick();
        return this.list.length;
    }
    async getProperty(name) {
        if (name === 'track-list') return this.tracks;
        return process.env.MPV_STRING_POSITION ? String(this.pos) : this.pos;
    }
    isRunning() {
        return true;
    }
    async load(url, mode) {
        this.calls.push(['load', url, mode]);
        if (url === 'broken') throw Error('load failed');
        if (mode === 'replace') {
            this.list = [url];
            this.pos = 0;
            this.emit('status', { property: 'playlist-pos', value: 0 });
        } else this.list.push(url);
        await this.delays.get(url)?.promise;
    }
    async pause() {
        this.calls.push(['pause']);
    }
    async play() {
        this.calls.push(['play']);
    }
    async playlistRemove(index) {
        this.calls.push(['remove', index]);
        this.list.splice(index, 1);
        if (index < this.pos) this.pos--;
        this.emit('status', { property: 'playlist-pos', value: this.pos });
    }
    async quit() {}
    async setMultipleProperties() {}
    async start() {}
    async stop() {
        this.calls.push(['stop']);
        this.pos = -1;
        this.emit('status', { property: 'playlist-pos', value: -1 });
        this.emit('stopped');
    }
}

function loadSource(file, mocks, extra = '') {
    const source = fs.readFileSync(path.join(root, file), 'utf8') + extra;
    const code = compile(source, file);
    const module = { exports: {} };
    const fakeProcess = { ...process, on() {}, resourcesPath: root, ...mocks.process };
    vm.runInNewContext(
        code,
        {
            clearTimeout,
            console,
            exports: module.exports,
            module,
            process: fakeProcess,
            require(id) {
                if (id === 'process') return fakeProcess;
                return id in mocks ? mocks[id] : require(id);
            },
            setTimeout,
        },
        { filename: file },
    );
    return module.exports;
}

async function mainTests() {
    const events = [],
        handlers = new Map(),
        processHandlers = new Map();
    const artworkFiles = new Map();
    const player = loadSource('src/main/features/core/player/index.ts', {
        '../../../index': {
            getMainWindow: () => ({
                webContents: { send: (...args) => events.push(structuredClone(args)) },
            }),
            sendToastToRenderer() {},
        },
        '../../../logger': logger,
        '../settings': { store: { get: () => '/obsolete/external/mpv.exe' } },
        '/@/main/env': { isMacOS: () => false, isWindows: () => true },
        electron: {
            app: {
                getAppPath: () => root,
                getPath: () => root,
                isPackaged: false,
                on() {},
                quit() {},
            },
            ipcMain: { handle: (k, v) => handlers.set(k, v), on: (k, v) => handlers.set(k, v) },
            nativeImage: {
                createFromBuffer: (bytes) => ({
                    getSize: () => ({ height: 600, width: 1000 }),
                    isEmpty: () => false,
                    resize: ({ height, width }) => {
                        assert.equal(width, 512);
                        assert.equal(height, 307);
                        return { toPNG: () => bytes };
                    },
                }),
            },
            powerMonitor: { on() {} },
        },
        'fs/promises': {
            access: async () => {},
            rm: async (file) => artworkFiles.delete(file),
            writeFile: async (file, bytes) => artworkFiles.set(file, bytes),
        },
        'node-mpv': FakeMpv,
        process: { on: (name, handler) => processHandlers.set(name, handler) },
    });
    const call = (name, ...args) => handlers.get(name)({}, ...args);
    await call('player-initialize', {});
    const mpv = FakeMpv.instance;
    mpv.emit('status', { property: 'pause', value: false });
    assert.ok(
        !events.some((e) => e[0] === 'renderer-player-play'),
        'Idle initial pause property must not start playback',
    );
    assert.equal(mpv.options.binary, path.join(root, 'assets/mpv', process.arch, 'mpv.exe'));
    assert.ok(
        mpv.params.includes(`--script=${path.join(root, 'assets/mpv/windows-app-id.lua')}`),
        'Bundled MPV must use the Feishin application identity script',
    );
    const slow = deferred();
    mpv.delays.set('A', slow);
    const first = call('player-set-queue', 'A', 'A-next', false, {
        currentId: 'A',
        nextId: 'A-next',
    });
    await tick();
    await call('player-set-queue', 'B', 'B-next', false, { currentId: 'B', nextId: 'B-next' });
    await first;
    slow.resolve();
    assert.deepEqual(mpv.list, ['B', 'B-next']);
    const cover = Buffer.from('cover');
    await call('player-set-artwork', 'A', cover);
    assert.equal(artworkFiles.size, 0, 'A late cover cannot be attached to a different song');
    await call('player-set-artwork', 'B', cover);
    const artCommand = mpv.calls.find((c) => c[0] === 'video-add');
    assert.ok(artworkFiles.has(artCommand[1]));
    assert.deepEqual(artCommand.slice(2), ['auto', 'Feishin album art', '', 'yes']);
    assert.deepEqual(
        mpv.list,
        ['B', 'B-next'],
        'Attaching art must not replace audio or the next song',
    );
    await call('player-set-artwork', 'B', Buffer.from('updated-cover'));
    assert.equal(artworkFiles.size, 1, 'Release the previous artwork file');
    assert.equal(mpv.tracks.length, 1, 'Replace artwork rather than accumulating image tracks');
    await assert.rejects(call('player-set-artwork', 'B', new Uint8Array()), /Invalid MPV artwork/);
    const beforePause = events.length;
    mpv.emit('status', { property: 'pause', value: true });
    mpv.emit('status', { property: 'pause', value: false });
    assert.deepEqual(
        events.slice(beforePause).map((e) => e[0]),
        ['renderer-player-pause', 'renderer-player-play'],
        'External pause/resume must update the renderer without legacy events',
    );
    assert.ok(!mpv.calls.some((c) => c[1] === 'A-next'));
    await Promise.all([
        call('player-set-queue-next', 'C', 'C'),
        call('player-set-queue-next', 'D', 'D'),
    ]);
    assert.deepEqual(mpv.list, ['B', 'D']);
    mpv.pos = 1;
    mpv.emit('status', { property: 'playlist-pos', value: 1 });
    mpv.emit('status', { property: 'playlist-pos', value: 1 });
    const advance = events.filter((e) => e[0] === 'renderer-player-auto-next');
    assert.equal(advance.length, 1);
    assert.deepEqual(advance[0][1], { currentId: 'B', nextId: 'D' });
    await call('player-set-queue-next', 'wrong');
    assert.deepEqual(
        mpv.list,
        ['B', 'D'],
        'editing the next slot must not delete the playing track',
    );
    await call('player-auto-next', 'E', 'E');
    assert.deepEqual(mpv.list, ['D', 'E']);
    assert.equal(mpv.pos, 0);
    mpv.pos = 1;
    await Promise.all([
        call('player-auto-next', 'old-next'),
        call('player-set-queue', 'F', 'G', false),
    ]);
    assert.deepEqual(mpv.list, ['F', 'G']);
    const before = mpv.calls.length;
    await call('player-set-queue', 'broken', 'G', false);
    assert.ok(mpv.calls.slice(before).some((c) => c[0] === 'stop'));
    assert.ok(
        !mpv.calls.slice(before).some((c) => c[0] === 'play'),
        'failed loads must not resume old audio',
    );
    assert.ok(events.some((e) => e[0] === 'renderer-player-error'));
    const ending = events.filter((e) => e[0] === 'renderer-player-track-ended').length;
    await call('player-set-queue');
    assert.equal(
        events.filter((e) => e[0] === 'renderer-player-track-ended').length,
        ending,
        'manual clear is not EOF',
    );
    await call('player-set-queue', 'recovered', undefined, true);
    assert.deepEqual(mpv.list, ['recovered']);
    await processHandlers.get('unhandledRejection')(new Error('net::ERR_NETWORK_CHANGED'));
    assert.equal(player.getMpvInstance(), mpv, 'update failures must not tear down MPV');
    await call('player-set-queue', 'after-update-failure', undefined, false);
    assert.deepEqual(mpv.list, ['after-update-failure']);
    mpv.socket.emit('message', { event: 'end-file', reason: 'eof' });
    await tick();
    assert.equal(events.filter((e) => e[0] === 'renderer-player-track-ended').length, ending);
    mpv.pos = -1;
    mpv.emit('status', { property: 'playlist-pos', value: -1 });
    mpv.emit('status', { property: 'playlist-pos', value: -1 });
    assert.equal(
        events.filter((e) => e[0] === 'renderer-player-track-ended').length,
        ending + 1,
        'EOF before the idle notification must advance exactly once',
    );
    await call('player-set-queue', 'manual-stop', undefined, true);
    mpv.socket.emit('message', { event: 'end-file', reason: 'stop' });
    await call('player-stop');
    const stoppedEvents = events.length;
    mpv.emit('status', { property: 'pause', value: false });
    assert.equal(
        events.length,
        stoppedEvents,
        'Idle property changes must not resume a stopped player',
    );
    assert.equal(events.filter((e) => e[0] === 'renderer-player-track-ended').length, ending + 1);
    console.log(
        'MPV IPC: latest replacement, serialized next edits, advance deduplication, failure and recovery passed.',
    );
}

async function rendererTests() {
    let calls = [],
        data = { status: 'PLAYING' },
        radio = {};
    const pending = new Map();
    const artworkPending = new Map();
    let windows = false;
    const song = (id) => ({ _serverId: 'test', _uniqueId: id, id: 'same-server-song' });
    const set = (current, next, status = 'PLAYING') => {
        data = { currentSong: song(current), nextSong: next ? song(next) : undefined, status };
    };
    const state = {
        getPlayerData: () => data,
        mediaPause() {
            data.status = 'PAUSED';
        },
    };
    const store = { usePlayerStore: { getState: () => state } };
    const mpv = {
        autoNext: (...a) => calls.push(['advance', ...a]),
        setArtwork: (...args) => calls.push(['artwork', ...args]),
        setQueue: (...a) => calls.push(['replace', ...a]),
        setQueueNext: (...a) => calls.push(['next', ...a]),
        stop: () => calls.push(['stop']),
    };
    const mocks = {
        './player-handoff': {},
        '/@/renderer/components/item-image/item-image': {
            getItemImageRequest: (args) => ({ url: args.id }),
        },
        '/@/renderer/events/event-emitter': {},
        '/@/renderer/features/offline/offline': {
            OfflineSongUnavailableError: class extends Error {},
        },
        '/@/renderer/features/player/audio-player/hooks/use-player-events': {},
        '/@/renderer/features/player/audio-player/hooks/use-stream-url': {
            getSongUrl: (s) =>
                pending.has(s._uniqueId)
                    ? pending.get(s._uniqueId).promise
                    : Promise.resolve('url:' + s._uniqueId),
        },
        '/@/renderer/features/radio/hooks/use-radio-player': {
            useRadioStore: { getState: () => radio },
        },
        '/@/renderer/features/settings/components/playback/mpv-properties': {},
        '/@/renderer/store': store,
        '/@/renderer/utils/logger': { logger },
        '/@/shared/components/toast/toast': { toast: { error() {} } },
        '/@/shared/types/domain-types': { LibraryItem: { SONG: 'song' } },
        '/@/shared/types/types': {
            PlayerStatus: { PAUSED: 'PAUSED', PLAYING: 'PLAYING', STOPPED: 'STOPPED' },
        },
        '/@/shared/utils/offline-cache': {
            cachedImage: ({ url }) => artworkPending.get(url).promise,
        },
        'is-electron': () => true,
        react: {},
        'react/jsx-runtime': {},
    };
    const source = fs.readFileSync(
        path.join(root, 'src/renderer/features/player/audio-player/engine/mpv-player-engine.tsx'),
        'utf8',
    );
    const code = compile(
        source + '\nexport {replaceMpvQueue,handleMpvAutoNext,updateMpvNextSong};',
        'mpv-player-engine.tsx',
    );
    const module = { exports: {} };
    vm.runInNewContext(code, {
        exports: module.exports,
        module,
        require: (id) => {
            if (!(id in mocks)) throw Error(id);
            return mocks[id];
        },
        window: { api: { mpvPlayer: mpv, utils: { isWindows: () => windows } } },
    });
    const {
        handleMpvAutoNext: advance,
        replaceMpvQueue: replace,
        updateMpvNextSong: next,
    } = module.exports;
    const config = { enabled: false };
    set('A', 'A2');
    const slow = deferred();
    pending.set('A', slow);
    const old = replace(config);
    set('B', 'B2');
    await replace(config);
    slow.resolve('url:A');
    await old;
    assert.equal(calls.filter((c) => c[0] === 'replace').length, 1);
    assert.equal(calls[0][1], 'url:B');
    calls = [];
    set('B', 'slow-next');
    const delayed = deferred();
    pending.set('slow-next', delayed);
    const olderNext = next(config);
    set('C', 'C2');
    await replace(config);
    delayed.resolve('url:slow-next');
    await olderNext;
    assert.ok(!calls.some((c) => c[0] === 'next'));
    calls = [];
    set('D', 'late-next');
    const delayedAuto = deferred();
    pending.set('late-next', delayedAuto);
    const oldAuto = advance(config);
    set('E', 'E2');
    await replace(config);
    delayedAuto.resolve('url:late-next');
    await oldAuto;
    assert.ok(!calls.some((c) => c[0] === 'advance'));
    calls = [];
    set('paused');
    const paused = deferred();
    pending.set('paused', paused);
    const pauseLoad = replace(config);
    data.status = 'PAUSED';
    paused.resolve('url:paused');
    await pauseLoad;
    assert.equal(calls[0][3], true);
    calls = [];
    set('radio-late');
    const radioLate = deferred();
    pending.set('radio-late', radioLate);
    const music = replace(config);
    radio = { currentStreamUrl: 'radio' };
    radioLate.resolve('url:radio-late');
    await music;
    assert.equal(calls.length, 0);
    windows = true;
    radio = {};
    set('cover-old');
    data.currentSong.imageId = 'old';
    artworkPending.set('old', deferred());
    await replace(config);
    assert.equal(calls[0][0], 'replace', 'Audio starts before cover fetching finishes');
    set('cover-new');
    data.currentSong.imageId = 'new';
    artworkPending.set('new', deferred());
    await replace(config);
    artworkPending.get('old').resolve(new Blob(['old cover']));
    artworkPending.get('new').resolve(new Blob(['new cover']));
    await tick();
    const artworkCalls = calls.filter((call) => call[0] === 'artwork');
    assert.equal(artworkCalls.length, 1);
    assert.equal(artworkCalls[0][1], 'cover-new');
    console.log(
        'MPV renderer: out-of-order URLs, stale next/auto-next, pause during load and radio handoff passed.',
    );
}

module.exports = { loadSource };
if (require.main === module)
    (async () => {
        await mainTests();
        await rendererTests();
    })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
