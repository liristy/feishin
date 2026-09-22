/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run: node scripts/tests/unit/test-player-artwork-and-cursor.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const noop = () => {};
function load(file, mocks, globals = {}) {
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS },
        }).outputText,
        {
            AbortController,
            exports,
            require: (id) => mocks[id] || require(id),
            ...globals,
        },
    );
    return exports;
}

async function main() {
    let effects = [];
    const react = {
        useCallback: (fn) => fn,
        useEffect: (fn) => effects.push(fn),
        useMemo: (fn) => fn(),
        useRef: (current) => ({ current }),
    };
    const session = { metadata: null, setActionHandler: noop };
    const requests = [];
    const revoked = [];
    const blobs = [];
    let trackChanged;
    const song = { _serverId: 'song-server', id: 'one', imageId: 'cover-one', name: 'One' };
    const media = load(
        'src/renderer/features/player/hooks/use-media-session.ts',
        {
            '/@/renderer/components/item-image/item-image': {
                getItemImageRequest: (args) => {
                    assert.equal(args.serverId, 'song-server');
                    return { cacheKey: args.id, headers: { Authorization: 'test' }, url: args.id };
                },
            },
            '/@/renderer/features/player/audio-player/hooks/use-player-events': {
                usePlayerEvents: noop,
            },
            '/@/renderer/features/player/context/player-context': { usePlayer: () => ({}) },
            '/@/renderer/features/radio/hooks/use-radio-player': {
                useIsRadioActive: () => false,
                useRadioPlayer: () => ({}),
            },
            '/@/renderer/store': {
                subscribeCurrentTrack: (fn) => {
                    trackChanged = fn;
                    return noop;
                },
                subscribePlayerStatus: () => noop,
                usePlaybackSettings: () => ({ mediaSession: true }),
                usePlayerStore: { getState: () => ({ getCurrentSong: () => song }) },
                useSettingsStore: (selector) => selector({ playback: { type: 'web' } }),
                useSkipButtons: () => ({}),
            },
            '/@/renderer/utils/logger': { logger: { warn: noop } },
            '/@/shared/types/domain-types': { LibraryItem: { SONG: 'song' } },
            '/@/shared/types/types': { PlayerStatus: {}, PlayerType: { WEB: 'web' } },
            '/@/shared/utils/offline-cache': {
                cachedImage: (request, init, refresh) =>
                    new Promise((resolve) => {
                        assert.equal(request.headers.Authorization, 'test');
                        requests.push({ init, refresh, resolve });
                    }),
            },
            'is-electron': () => true,
            react,
        },
        {
            MediaMetadata: class {
                constructor(data) {
                    Object.assign(this, data);
                }
            },
            navigator: { mediaSession: session },
            URL: {
                createObjectURL: (blob) => {
                    blobs.push(blob);
                    return `blob:${blobs.length}`;
                },
                revokeObjectURL: (url) => revoked.push(url),
            },
        },
    );
    media.useMediaSession();
    const cleanups = effects.map((fn) => fn());
    await new Promise((resolve) => setTimeout(resolve, 130));
    assert.equal(session.metadata.title, 'One', 'Initialize metadata for an already playing song');
    const jpeg = new Blob(['cover'], { type: 'image/jpeg' });
    requests[0].resolve(jpeg);
    await Promise.resolve();
    assert.equal(session.metadata.artwork[0].src, 'blob:1');
    assert.equal(session.metadata.artwork[0].type, undefined, 'Do not label JPEG artwork as PNG');
    requests[0].refresh(new Blob(['sharp cover']));
    assert.equal(session.metadata.artwork[0].src, 'blob:2');
    assert.ok(revoked.includes('blob:1'));
    trackChanged({ song: { ...song, imageId: 'cover-two', name: 'Two' } });
    await new Promise((resolve) => setTimeout(resolve, 130));
    assert.equal(requests[0].init.signal.aborted, true);
    requests[0].refresh(jpeg);
    assert.equal(
        session.metadata.artwork.length,
        0,
        'Late artwork cannot overwrite the next track',
    );
    requests[1].resolve(jpeg);
    await Promise.resolve();
    assert.equal(session.metadata.artwork[0].src, 'blob:3');
    trackChanged({ song: { ...song, name: 'Three' } });
    cleanups.forEach((fn) => typeof fn === 'function' && fn());
    await new Promise((resolve) => setTimeout(resolve, 130));
    assert.equal(requests.length, 2, 'Cancel pending metadata updates on unmount');
    assert.equal(requests[1].init.signal.aborted, true);
    assert.ok(revoked.includes('blob:3'));

    // A cached thumbnail must still upgrade when the original takes over four seconds.
    const thumbnail = new Blob(['thumbnail']);
    let finishRefresh;
    let refreshDeadline;
    const refreshed = new Promise((resolve, reject) => {
        finishRefresh = resolve;
        refreshDeadline = setTimeout(() => reject(new Error('Original cover never arrived')), 6500);
    });
    const cache = load(
        'src/shared/utils/offline-cache.ts',
        {
            'idb-keyval': {
                createStore: noop,
                get: async (key) =>
                    key.endsWith(':80') ? { blob: thumbnail, savedAt: Date.now() } : undefined,
                keys: async () => ['image:subsonic:server::cover:80'],
                set: async () => {},
            },
        },
        {
            AbortSignal,
            fetch: (_url, { signal }) =>
                new Promise((resolve, reject) => {
                    const timer = setTimeout(() => resolve(new Response(jpeg)), 4500);
                    signal.addEventListener(
                        'abort',
                        () => {
                            clearTimeout(timer);
                            reject(signal.reason);
                        },
                        { once: true },
                    );
                }),
            navigator: { onLine: true },
        },
    );
    try {
        const initial = await cache.cachedImage(
            { cacheKey: 'subsonic:server::cover:', url: 'https://test/cover' },
            undefined,
            finishRefresh,
        );
        assert.equal(initial, thumbnail, 'Display the cached thumbnail immediately');
        assert.equal(
            await (await refreshed).text(),
            'cover',
            'Slow original replaces the thumbnail',
        );
    } finally {
        clearTimeout(refreshDeadline);
    }

    effects = [];
    const handlers = new Map();
    const classes = new Set();
    const timers = new Map();
    let timerId = 0;
    let expanded = true;
    const events = {
        addEventListener: (name, fn) => {
            if (!handlers.has(name)) handlers.set(name, new Set());
            handlers.get(name).add(fn);
        },
        removeEventListener: (name, fn) => handlers.get(name)?.delete(fn),
    };
    const doc = {
        ...events,
        documentElement: {
            classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
        },
        fullscreenElement: null,
    };
    const fire = (name) => handlers.get(name)?.forEach((fn) => fn({}));
    const tick = () => {
        const pending = [...timers.values()];
        timers.clear();
        pending.forEach((fn) => fn());
    };
    const fullscreen = load(
        'src/renderer/hooks/use-fullscreen-toggle.ts',
        {
            './use-fullscreen-toggle.module.css': { idleCursor: 'idle' },
            '/@/renderer/store/full-screen-player.store': {
                useFullScreenPlayerStore: (selector) => selector({ expanded }),
            },
            react,
        },
        {
            clearTimeout: (id) => timers.delete(id),
            document: doc,
            setTimeout: (fn, delay) => {
                assert.equal(delay, 3000);
                timers.set(++timerId, fn);
                return timerId;
            },
            window: events,
        },
    );
    fullscreen.useFullscreenToggle();
    const cursorCleanups = effects.map((fn) => fn());
    assert.equal(timers.size, 0, 'Windowed player keeps the cursor visible');
    doc.fullscreenElement = doc.documentElement;
    fire('fullscreenchange');
    tick();
    assert.ok(classes.has('idle'), 'Hide the cursor after three seconds in F11');
    for (const event of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
        fire(event);
        assert.equal(classes.has('idle'), false, `${event} restores the cursor`);
        tick();
        assert.ok(classes.has('idle'));
    }
    doc.fullscreenElement = null;
    fire('fullscreenchange');
    assert.equal(classes.size, 0, 'Leaving F11 restores the cursor');
    assert.equal(timers.size, 0);
    doc.fullscreenElement = doc.documentElement;
    fire('fullscreenchange');
    tick();
    cursorCleanups.forEach((fn) => typeof fn === 'function' && fn());
    assert.equal(classes.size, 0, 'Closing the player restores the cursor');
    assert.equal(timers.size, 0);
    assert.ok([...handlers.values()].every((listeners) => listeners.size === 0));
    expanded = false;
    effects = [];
    fullscreen.useFullscreenToggle();
    effects[0]();
    assert.equal(timers.size, 0, 'F11 without the expanded player never hides the cursor');
    console.log(
        'Cached media artwork, stale track protection, cleanup and F11 cursor checks passed.',
    );
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
