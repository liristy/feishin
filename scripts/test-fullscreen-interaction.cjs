/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run: node scripts/test-fullscreen-interaction.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const ts = require('typescript');

let effects = [];
let progressListener;
let timers = new Map();
let timerId = 0;
let lastTimerDelay;
let lastTick;
let seekTime;
const noop = () => {};
const fakeReact = {
    ...React,
    forwardRef: (fn) => fn,
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
    useLayoutEffect: (fn) => effects.push(fn),
    useMemo: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (value) => [typeof value === 'function' ? value() : value, noop],
};
const enginePath = '/@/renderer/features/lyrics/hooks/lyrics-animation-engine';
const mocks = {
    '/@/renderer/components/item-list/helpers/use-item-list-column-reorder': {
        useItemListColumnReorder: () => ({ handleColumnReordered: noop }),
    },
    '/@/renderer/components/item-list/helpers/use-item-list-column-resize': {
        useItemListColumnResize: () => ({ handleColumnResized: noop }),
    },
    '/@/renderer/features/lyrics/api/lyrics-utils': { normalizeLyrics: (lines) => lines },
    '/@/renderer/features/player/context/player-context': {
        useIsPlayerFetching: () => true,
        usePlayer: () => ({}),
    },
    '/@/renderer/hooks/use-hotkeys': { useHotkeys: noop },
    '/@/renderer/store': {
        subscribePlayerStatus: () => noop,
        useFollowCurrentSong: () => true,
        useListSettings: () => ({ table: savedTable }),
        useLyricsDisplaySettings: () => ({}),
        useLyricsSettings: () => ({ follow: true }),
        usePlaybackType: () => 'web',
        usePlayerActions: () => ({
            getQueue: () => ({ items: queue }),
            mediaSeekToTimestamp: (time) => {
                seekTime = time;
            },
        }),
        usePlayerSong: () => queue[0],
        usePlayerStoreBase: { getState: () => ({ player: { status: 'playing' } }) },
    },
    '/@/renderer/store/timestamp.store': {
        subscribePlayerProgress: (fn) => {
            progressListener = fn;
            return noop;
        },
        useTimestampStoreBase: { getState: () => ({ timestamp: 1 }) },
    },
    '/@/shared/hooks/use-debounced-value': { useDebouncedValue: (value) => [value] },
    '/@/shared/hooks/use-focus-within': { useFocusWithin: () => ({ focused: false, ref: noop }) },
    '/@/shared/hooks/use-merged-ref': { useMergedRef: () => ({ current: null }) },
    [enginePath]: {
        buildLyricsDataFromDom: () => ({ lines: [] }),
        createAnimEngineState: () => ({ scroll: { scrollPos: -1 } }),
        handleLyricsUserScroll: (state) => {
            state.scroll.wasUserScrolling = true;
        },
        recalculateLinePositions: noop,
        resetAnimEngine: (state) => {
            state.scroll = { scrollPos: -1 };
        },
        resetLyricsAnimationDom: noop,
        resumeLyricsAutoscroll: (state) => {
            state.scroll.wasUserScrolling = false;
        },
        shouldSkipLyricsScrollEvent: () => false,
        tickLyricsAnimation: (_, options) => {
            lastTick = options;
            return 0;
        },
    },
    'is-electron': () => false,
    react: fakeReact,
};
function load(relative) {
    const filename = path.resolve(relative);
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: {
                esModuleInterop: true,
                jsx: ts.JsxEmit.ReactJSX,
                module: ts.ModuleKind.CommonJS,
            },
            fileName: filename,
        }).outputText,
        {
            cancelAnimationFrame: noop,
            clearTimeout: (id) => timers.delete(id),
            document: { getElementById: () => container },
            exports,
            MutationObserver: class {
                disconnect = noop;
                observe = noop;
            },
            requestAnimationFrame: () => ++timerId,
            require: (id) => {
                if (mocks[id]) return mocks[id];
                if (
                    id === '/@/shared/types/types' ||
                    id === '/@/shared/types/domain-types' ||
                    id.includes('/hooks/use-synchronized-lyrics-base') ||
                    id.includes('/hooks/use-lyrics-animation-engine')
                ) {
                    return load(id.replace('/@/', 'src/') + '.ts');
                }
                if (id.endsWith('.css')) return { __esModule: true, default: {} };
                if (id.startsWith('/@/'))
                    return new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : key) });
                return require(id);
            },
            ResizeObserver: class {
                disconnect = noop;
                observe = noop;
            },
            setTimeout: (fn, delay) => {
                lastTimerDelay = delay;
                timers.set(++timerId, fn);
                return timerId;
            },
        },
    );
    return exports;
}
let container;
function flushTimers() {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((fn) => fn());
}
for (const name of ['synchronized-lyrics', 'synchronized-karaoke-lyrics']) {
    effects = [];
    timers = new Map();
    const handlers = {};
    let hovered = true;
    container = {
        addEventListener: (event, fn) => {
            handlers[event] = fn;
        },
        classList: { add: noop, remove: noop },
        matches: () => hovered,
        removeEventListener: noop,
        scrollTop: 400,
    };
    const exports = load(`src/renderer/features/lyrics/${name}.tsx`);
    const Component = exports.SynchronizedLyrics || exports.SynchronizedKaraokeLyrics;
    const tree = Component({ lyrics: [] });
    tree.props.ref.current = container;
    const cleanups = effects.map((fn) => fn());
    progressListener({ timestamp: 10 });
    assert.equal(lastTick.follow, true);
    handlers.wheel({ deltaX: 0, deltaY: 120 });
    progressListener({ timestamp: 20 });
    assert.equal(
        lastTick.follow,
        false,
        `${name}: progress jumps must not override manual scrolling`,
    );
    flushTimers();
    progressListener({ timestamp: 30 });
    assert.equal(lastTick.follow, false, `${name}: keep browsing while mouse remains over lyrics`);
    hovered = false;
    tree.props.onMouseLeave();
    assert.equal(lastTimerDelay, 1000, `${name}: resume one second after the mouse leaves`);
    flushTimers();
    progressListener({ timestamp: 40 });
    assert.equal(lastTick.follow, true, `${name}: resume after leaving and waiting`);
    handlers.pointerdown();
    progressListener({ timestamp: 50 });
    assert.equal(lastTick.follow, false, 'Scrollbar dragging pauses follow');
    tree.props.onClick({
        target: {
            closest: (selector) =>
                selector === '[data-lyric-time]' ? { dataset: { lyricTime: '42000' } } : null,
        },
    });
    assert.equal(seekTime, 42);
    progressListener({ timestamp: 42 });
    assert.equal(lastTick.follow, true, 'Clicking a lyric seeks and resumes follow');
    handlers.keydown({ key: 'PageUp' });
    progressListener({ timestamp: 60 });
    assert.equal(lastTick.follow, false, 'Keyboard browsing pauses follow');
    cleanups.forEach((fn) => typeof fn === 'function' && fn());
}
const queue = [
    { _uniqueId: 'one', name: 'Song one' },
    { _uniqueId: 'two', name: 'Song two' },
];
const { ItemListKey, TableColumn } = load('src/shared/types/types.ts');
const savedTable = {
    columns: [{ id: TableColumn.ALBUM }],
    enableHeader: true,
    enableHorizontalBorders: true,
    size: 'large',
};
const { PlayQueue } = load('src/renderer/features/now-playing/components/play-queue.tsx');
const fullscreen = PlayQueue({ listKey: ItemListKey.FULL_SCREEN });
const [overlay, table] = fullscreen.props.children;
assert.equal(
    overlay.props.visible,
    false,
    'Existing queue stays visible during background fetching',
);
assert.equal(table.props.data, queue, 'Queue data is present on first render');
assert.equal(
    table.props.columns.map((column) => column.id).join(','),
    [TableColumn.ROW_INDEX, TableColumn.TITLE_COMBINED, TableColumn.DURATION].join(','),
);
assert.equal(table.props.size, 'compact');
assert.equal(table.props.enableHeader, false);
assert.equal(table.props.enableHorizontalBorders, false);
assert.equal(table.props.enableVerticalBorders, false);
const normal = PlayQueue({ listKey: 'normal-queue' }).props.children[1];
assert.equal(
    normal.props.columns,
    savedTable.columns,
    'Ordinary queue keeps its configured columns',
);
assert.equal(normal.props.size, 'large');
console.log(
    'Lyrics manual browsing, progress resync, lyric seeking and compact instant queue passed.',
);
