/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node scripts/test-windows-media-controls.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/main/index.ts', 'utf8');
const toolbar = source.match(/const createWinThumbarButtons = \(\) => \{[\s\S]*?\n\};/)[0];
const update = source.match(
    /ipcMain.on\('update-playback', \(_event, status: PlayerStatus\) => \{([\s\S]*?)\n\}\);/,
)[1];
let buttons;
let destroyed = false;
let ready = true;
let visible = true;
let minimized = false;
const commands = [];
const diagnostics = [];
const window = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    setThumbarButtons: (value) => {
        buttons = value;
        return ready;
    },
    webContents: { send: (channel) => commands.push(channel) },
};
const context = vm.createContext({
    currentPlaybackStatus: 'paused',
    getAssetPath: (name) => name,
    getMainWindow: () => window,
    isMacOS: () => false,
    isWindows: () => true,
    log: { debug: (message) => diagnostics.push(message) },
    nativeImage: { createFromPath: (name) => name },
    PlayerStatus: { PLAYING: 'playing' },
});
vm.runInContext(toolbar + '\ncreateWinThumbarButtons();', context);
assert.equal(buttons.length, 3);
assert.equal(buttons[1].icon, 'play-circle.png');
context.status = 'playing';
vm.runInContext('(function(){' + update + '})()', context);
assert.equal(buttons[1].icon, 'pause-circle.png');
assert.equal(buttons[1].tooltip, 'Pause');
buttons.forEach((button) => button.click());
assert.deepEqual(commands, [
    'renderer-player-previous',
    'renderer-player-play-pause',
    'renderer-player-next',
]);
context.status = 'paused';
vm.runInContext('(function(){' + update + '})()', context);
assert.equal(buttons[1].icon, 'play-circle.png');
ready = false;
vm.runInContext('createWinThumbarButtons()', context);
assert.equal(diagnostics.length, 1);
visible = false;
buttons = undefined;
vm.runInContext('createWinThumbarButtons()', context);
assert.equal(buttons, undefined);
minimized = true;
vm.runInContext('createWinThumbarButtons()', context);
assert.equal(buttons.length, 3);
destroyed = true;
buttons = undefined;
vm.runInContext('createWinThumbarButtons()', context);
assert.equal(buttons, undefined);
console.log('Taskbar controls retain all three actions and follow play/pause status.');
