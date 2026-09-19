/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
// Run: node node_modules/electron/cli.js scripts/test-offline-electron.cjs
// Uses an isolated temporary profile and Music directory, never the user's library.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

process.on('uncaughtException', (error) => {
    console.error(error);
    app.exit(1);
});

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feishin-offline-electron-'));
for (const name of ['userData', 'music']) {
    fs.mkdirSync(path.join(root, name));
    app.setPath(name, path.join(root, name));
}
app.disableHardwareAcceleration();

function load(file, mocks = {}) {
    const output = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: {
                esModuleInterop: true,
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText,
        {
            AbortController,
            exports: output,
            fetch,
            Headers,
            require: (id) => mocks[id] || require(id),
            Response,
            URL,
        },
    );
    return output;
}
load('src/main/features/core/offline.ts', {
    '/@/main/logger': { error() {}, warn() {} },
    '/@/main/utils/offline-files': load('src/main/utils/offline-files.ts'),
    'music-metadata': {
        parseFile: async (...args) => (await import('music-metadata')).parseFile(...args),
    },
});

const audio = Buffer.alloc(32044);
audio.write('RIFF');
audio.writeUInt32LE(audio.length - 8, 4);
audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24);
audio.writeUInt32LE(16000, 28);
audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34);
audio.write('data', 36);
audio.writeUInt32LE(32000, 40);
const server = http.createServer((_req, res) => {
    res.writeHead(200, {
        'Content-Disposition': Buffer.from('attachment; filename="日期 - 戴佩妮.wav"').toString(
            'latin1',
        ),
        'Content-Length': audio.length,
        'Content-Type': 'audio/wav',
    });
    res.end(audio);
});
let win;
const timeout = setTimeout(() => {
    console.error('Electron offline smoke timed out');
    app.exit(1);
}, 30000);
async function run() {
    await app.whenReady();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    fs.writeFileSync(
        path.join(root, 'preload.cjs'),
        `const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('offlineTest', {call:(name,...args)=>ipcRenderer.invoke('offline-'+name,...args)});`,
    );
    fs.writeFileSync(
        path.join(root, 'index.html'),
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; media-src feishin-offline:; connect-src feishin-offline:"><title>Offline smoke</title>`,
    );
    win = new BrowserWindow({
        show: false,
        webPreferences: { preload: path.join(root, 'preload.cjs') },
    });
    await win.loadFile(path.join(root, 'index.html'));
    const invoke = (name, ...args) =>
        win.webContents.executeJavaScript(
            `window.offlineTest.call(${[name, ...args].map((arg) => JSON.stringify(arg)).join(',')})`,
        );
    await invoke('save', {
        song: { _serverId: 'test', container: 'wav', id: 'track', name: '离线测试' },
        url: `http://127.0.0.1:${server.address().port}/audio`,
    });
    let local;
    for (let i = 0; i < 100; i++) {
        local = await invoke('resolve', 'test', 'track');
        if (local) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(local, 'Download must finish through the real Electron IPC bridge');
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    const result = await win.webContents.executeJavaScript(`(async () => {
        const url = ${JSON.stringify(local?.url)};
        const response = await fetch(url, {headers:{Range:'bytes=44-99'}});
        const length = (await response.arrayBuffer()).byteLength;
        const audio = new Audio(url); audio.crossOrigin = 'anonymous'; audio.muted = true;
        await new Promise((resolve,reject) => {audio.onloadedmetadata=resolve; audio.onerror=()=>reject(new Error('Audio failed '+audio.error?.code));});
        audio.currentTime = 0.5;
        await audio.play();
        await new Promise(resolve=>setTimeout(resolve,250));
        const result = {status:response.status,length,duration:audio.duration,position:audio.currentTime,playing:!audio.paused};
        audio.pause(); return result;
    })()`);
    assert.equal(result.status, 206);
    assert.equal(result.length, 56);
    assert.equal(result.duration, 2);
    assert.equal(result.playing, true);
    assert.ok(result.position > 0.5);
    console.log('Electron offline playback passed:', JSON.stringify(result));
}
run()
    .then(() => {
        clearTimeout(timeout);
        win?.destroy();
        app.exit(0);
    })
    .catch((error) => {
        console.error(error);
        clearTimeout(timeout);
        win?.destroy();
        app.exit(1);
    });
