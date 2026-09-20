/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Build first: pnpm build:electron
// Run: node node_modules/electron/cli.js scripts/tests/electron/test-playerbar-layout-electron.cjs
// Real app in an isolated profile; all external requests are blocked.
const { app, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feishin-playerbar-test-'));
app.setPath('userData', root);
app.setPath('music', root);
app.requestSingleInstanceLock = () => true;
process.env.DISABLE_AUTO_UPDATES = 'true';
fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ window_enable_tray: false }));
const song = {
    _itemType: 'song',
    _serverId: 'test',
    _serverType: 'subsonic',
    album: 'Test',
    albumArtists: [],
    artistName: 'Test',
    artists: [],
    container: 'wav',
    duration: 120000,
    genres: [],
    id: '1',
    imageId: 'cover',
    name: 'Layout test',
};
// Missing audio is intentional: exercise the loading/error seek-bar fallback.
const audioPath = path.join(root, 'unavailable.wav');
fs.writeFileSync(audioPath, Buffer.alloc(100));
const key = '0'.repeat(64);
fs.writeFileSync(
    path.join(root, 'offline-library.json'),
    JSON.stringify({
        entries: {
            [key]: { key, layoutVersion: 1, path: audioPath, savedAt: Date.now(), size: 100, song },
        },
    }),
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => {
    console.error('Playerbar test timed out');
    app.exit(1);
}, 30000);
app.once('browser-window-created', (_event, win) => {
    win.show = () => {};
    win.showInactive = () => {};
    win.setSize(1200, 800);
    win.webContents.once('did-finish-load', async () => {
        try {
            const server = {
                credential: 'fixture',
                features: {},
                id: 'test',
                name: 'Test',
                type: 'subsonic',
                url: 'http://127.0.0.1:1',
                userId: 'test',
                username: 'test',
                version: '1.16.1',
            };
            const storage = {
                'offline-settings': { state: { cacheWhileListening: false }, version: 1 },
                store_authentication: {
                    state: {
                        currentServer: server,
                        deviceId: 'test',
                        serverList: { test: server },
                    },
                    version: 2,
                },
                store_settings: {
                    state: {
                        general: { language: 'en', playerbarSlider: { type: 'waveform' } },
                        playback: { type: 'web' },
                    },
                    version: 34,
                },
                version: require('../package.json').version,
            };
            await win.webContents.executeJavaScript(
                `Object.entries(${JSON.stringify(storage)}).forEach(([key,value])=>localStorage.setItem(key,JSON.stringify(value)))`,
            );
            await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
                const request=indexedDB.open('feishin-offline-v1',1);
                request.onupgradeneeded=()=>request.result.createObjectStore('data');
                request.onerror=()=>reject(request.error);
                request.onsuccess=()=>{
                    const db=request.result,tx=db.transaction('data','readwrite');
                    tx.objectStore('data').put({savedAt:Date.now(),blob:new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="orange"/></svg>'],{type:'image/svg+xml'})},'image:subsonic:test::cover:80');
                    tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);
                };
            })`);
            session.defaultSession.webRequest.onBeforeRequest(
                { urls: ['http://*/*', 'https://*/*'] },
                (_details, callback) => callback({ cancel: true }),
            );
            await new Promise((resolve) => {
                win.webContents.once('did-finish-load', resolve);
                win.webContents.reload();
            });
            await delay(1200);
            await win.webContents.executeJavaScript(`location.hash='/downloads'`);
            await delay(1000);
            const tabs = await win.webContents.executeJavaScript(
                `Array.from(document.querySelectorAll('main [role="tab"]')).map((tab) => tab.textContent)`,
            );
            assert.deepEqual(tabs, ['Downloaded · 1', 'Transfers · 0']);
            await win.webContents.executeJavaScript(
                `document.querySelector('main button[aria-label="Play"]').click()`,
            );
            for (const wait of [400, 2500]) {
                await delay(wait);
                const geometry = await win.webContents.executeJavaScript(`(()=>{
                    const wave = document.querySelector('[class*=wavesurfer-container]');
                    const track = wave?.querySelector('.mantine-Slider-track');
                    const center = (el) => {const r = el.getBoundingClientRect();return r.y+r.height/2;};
                    return {height:wave?.getBoundingClientRect().height,track:track&&center(track),elapsed:center(document.querySelector('.elapsed-time')),total:center(document.querySelector('.total-duration'))};
                })()`);
                assert.equal(geometry.height, 18);
                assert.ok(geometry.track, 'The seek bar must remain available');
                assert.ok(
                    Math.abs(geometry.track - geometry.elapsed) < 1,
                    'Align track and elapsed time',
                );
                assert.ok(
                    Math.abs(geometry.track - geometry.total) < 1,
                    'Align track and duration',
                );
            }
            console.log('Playerbar loading/error fallback remains aligned with both time labels.');
            await win.webContents.executeJavaScript(
                `document.querySelector('.media-player .player-cover-art').closest('[role="button"]').click()`,
            );
            await delay(900);
            const artwork = await win.webContents.executeJavaScript(`(()=>{
                const image=document.querySelector('img.full-screen-player-image');
                return {loaded:!!image?.complete&&image.naturalWidth>0,local:image?.src.startsWith('blob:')};
            })()`);
            assert.ok(
                artwork.loaded && artwork.local,
                'Fullscreen must display asynchronously loaded cached artwork',
            );
            console.log('Fullscreen artwork loads from the offline cache without a song change.');
            clearTimeout(timeout);
            app.quit();
        } catch (error) {
            console.error(error);
            clearTimeout(timeout);
            app.exit(1);
        }
    });
});
require(path.resolve('out/main/index.js'));
