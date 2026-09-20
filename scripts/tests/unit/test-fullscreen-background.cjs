/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, react/prop-types */
// Run with: node scripts/tests/unit/test-fullscreen-background.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

let song = { _uniqueId: 'one', imageUrl: 'https://example.test/red.jpg' };
let hashUrl = null;
const settings = {
    dynamicBackground: true,
    dynamicImageBlur: 6,
    dynamicIsImage: false,
    opacity: 25,
};
const empty = () => null;
const styles = new Proxy(
    {},
    { get: (_, key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`) },
);
const mocks = {
    './full-screen-player.module.css': { __esModule: true, default: styles },
    '/@/renderer/components/item-image/item-image': { useItemImageUrl: ({ imageUrl }) => imageUrl },
    '/@/renderer/features/player/components/cover-flow-canvas': {
        CoverFlowCanvas: ({ className, source }) =>
            React.createElement('canvas', { className, 'data-source': source }),
    },
    '/@/renderer/features/player/components/full-screen-player-image': {
        FullScreenPlayerImage: empty,
    },
    '/@/renderer/features/player/components/full-screen-player-queue': {
        FullScreenPlayerControls: empty,
        FullScreenPlayerQueue: empty,
    },
    '/@/renderer/features/player/components/shared-full-screen-player-settings': {
        SharedFullscreenPlayerSettings: empty,
    },
    '/@/renderer/features/player/hooks/use-cover-flow-image': {
        useCoverFlowImage: (source) => source,
    },
    '/@/renderer/features/radio/hooks/use-radio-player': {
        useIsRadioActive: () => false,
        useRadioPlayer: () => ({}),
    },
    '/@/renderer/features/window-controls/components/window-controls': {
        WindowControls: () => React.createElement('button', { 'aria-label': 'minimize' }),
    },
    '/@/renderer/hooks': { useFastAverageColor: () => ({ background: 'rgb(90, 80, 110)' }) },
    '/@/renderer/store': {
        useFullScreenPlayerStore: () => settings,
        useFullScreenPlayerStoreActions: () => ({ setStore: empty }),
        useImagePlaceholderPriority: () => 'thumbHash',
        usePlayerSong: () => song,
    },
    '/@/shared/components/group/group': { Group: empty },
    '/@/shared/hooks/use-image-hash-url': { useImageHashUrl: () => hashUrl },
    '/@/shared/types/domain-types': {
        ExplicitStatus: { EXPLICIT: 'explicit' },
        LibraryItem: { SONG: 'song' },
    },
    'motion/react': {
        AnimatePresence: ({ children }) => children,
        motion: {
            div: ({ children, className, custom, style }) =>
                React.createElement(
                    'div',
                    {
                        className,
                        style: custom ? { backgroundColor: custom.background } : style,
                    },
                    children,
                ),
        },
    },
    'react-router': { useLocation: () => ({}) },
};
const file = path.resolve(
    __dirname,
    '../../../src/renderer/features/player/components/full-screen-player.tsx',
);
const moduleUnderTest = { exports: {} };
vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.CommonJS,
        },
        fileName: file,
    }).outputText,
    {
        exports: moduleUnderTest.exports,
        require: (id) => mocks[id] || require(id),
    },
);
const render = () =>
    renderToStaticMarkup(React.createElement(moduleUnderTest.exports.FullScreenPlayer));
assert.match(render(), /background-flow/);
assert.match(render(), /window-controls/);
assert.match(render(), /red\.jpg/);
song = { _uniqueId: 'one' };
assert.doesNotMatch(render(), /background-artwork/);
song.imageUrl = 'https://example.test/late-blue.jpg';
assert.match(render(), /late-blue\.jpg/, 'Late artwork must update without changing the song ID');
hashUrl = 'data:image/png;base64,hash-preview';
assert.match(render(), /late-blue\.jpg/, 'Flow must preserve colors from the actual cover');
delete song.imageUrl;
assert.match(render(), /hash-preview/);
song.imageUrl = 'https://example.test/late-blue.jpg';
song.explicitStatus = 'explicit';
assert.match(render(), /late-blue\.jpg/);
settings.dynamicIsImage = true;
assert.match(render(), /background-artwork/);
assert.doesNotMatch(render(), /background-flow/);
settings.dynamicBackground = false;
assert.doesNotMatch(render(), /background-artwork/);
console.log('Cover flow, late artwork, hash fallback, image mode and disabled background passed.');

const toggleBody = fs
    .readFileSync('src/main/index.ts', 'utf8')
    .match(/ipcMain.on\('window-toggle-maximize', \(\) => \{([\s\S]*?)\n {4}\}\)/)[1];
let maximized = true;
const toggleWindow = new Function('mainWindow', toggleBody);
const nativeWindow = {
    isMaximized: () => maximized,
    maximize: () => {
        maximized = true;
    },
    unmaximize: () => {
        maximized = false;
    },
};
toggleWindow(nativeWindow);
assert.equal(maximized, false, 'A window already maximized must restore on the first click');
toggleWindow(nativeWindow);
assert.equal(maximized, true);
toggleWindow(undefined);

module.exports = {
    render,
    setSong: (value) => {
        song = value;
        hashUrl = null;
    },
    settings,
};
