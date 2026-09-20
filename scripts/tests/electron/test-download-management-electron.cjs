/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Build first, then: node node_modules/electron/cli.js scripts/tests/electron/test-download-management-electron.cjs
// Real UI and IPC; deletion is restricted to this temporary profile's fixture files.
const { app, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feishin-download-manager-'));
let downloadRequests = 0;
const fixtureServer = http.createServer((_request, response) => {
    downloadRequests++;
    response.writeHead(503).end();
});
const serverReady = new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
app.on('before-quit', () => fixtureServer.close());
app.setPath('userData', root);
app.setPath('music', root);
app.requestSingleInstanceLock = () => true;
process.env.DISABLE_AUTO_UPDATES = 'true';
fs.writeFileSync(
    path.join(root, 'config.json'),
    JSON.stringify({ window_enable_tray: false, window_window_bar_style: 'web' }),
);
const entries = {};
for (let index = 0; index < 54; index++) {
    const key = String(index).padStart(64, '0');
    const audioPath = path.join(root, `${index}.wav`);
    fs.writeFileSync(audioPath, Buffer.alloc(100));
    const song = {
        _itemType: 'song',
        _serverId: index === 53 ? 'other' : 'test',
        _serverType: 'subsonic',
        album: 'Test album',
        albumArtists: [],
        artistName: 'Test artist',
        artists: [],
        container: 'wav',
        duration: 120000,
        genres: [],
        id: String(index),
        imageUrl: null,
        name: index < 52 ? `Remove ${index}` : 'Keep',
    };
    entries[key] = { key, layoutVersion: 1, path: audioPath, savedAt: Date.now(), size: 100, song };
}
fs.writeFileSync(path.join(root, 'offline-library.json'), JSON.stringify({ entries }));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => {
    console.error('Download manager test timed out');
    app.exit(1);
}, 45000);
app.once('browser-window-created', (_event, win) => {
    const reveal = win.showInactive.bind(win);
    win.show = () => {};
    win.showInactive = () => {};
    win.setSize(1400, 950);
    win.webContents.setBackgroundThrottling(false);
    const evaluate = async (code) => {
        try {
            return await win.webContents.executeJavaScript(code);
        } catch (error) {
            console.error('Failed UI step:', code);
            console.error(
                await win.webContents.executeJavaScript('document.body.innerText.slice(0,1800)'),
            );
            throw error;
        }
    };
    const clickText = (label) =>
        evaluate(
            `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw new Error('Missing button: '+${JSON.stringify(label)});button.click()})()`,
        );
    win.webContents.once('did-finish-load', async () => {
        try {
            await serverReady;
            const server = {
                credential: 'fixture',
                features: {},
                id: 'test',
                name: 'Test',
                type: 'subsonic',
                url: `http://127.0.0.1:${fixtureServer.address().port}`,
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
                        general: { language: 'en' },
                        lists: {
                            song: {
                                table: {
                                    columns: [
                                        {
                                            align: 'center',
                                            autoSize: false,
                                            id: 'downloadStatus',
                                            isEnabled: true,
                                            pinned: null,
                                            width: 160,
                                        },

                                        {
                                            align: 'start',
                                            autoSize: false,
                                            id: 'titleCombined',
                                            isEnabled: true,
                                            pinned: null,
                                            width: 380,
                                        },
                                        {
                                            align: 'center',
                                            autoSize: false,
                                            id: 'duration',
                                            isEnabled: true,
                                            pinned: null,
                                            width: 90,
                                        },
                                        {
                                            align: 'center',
                                            autoSize: false,
                                            id: 'playCount',
                                            isEnabled: true,
                                            pinned: null,
                                            width: 100,
                                        },
                                        {
                                            align: 'center',
                                            autoSize: false,
                                            id: 'userFavorite',
                                            isEnabled: true,
                                            pinned: null,
                                            width: 60,
                                        },
                                    ],
                                },
                            },
                        },
                        playback: { type: 'web' },
                        window: { windowBarStyle: 'web' },
                    },
                    version: 35,
                },
                version: require('../package.json').version,
            };
            await evaluate(
                `Object.entries(${JSON.stringify(storage)}).forEach(([key,value])=>localStorage.setItem(key,JSON.stringify(value)))`,
            );
            session.defaultSession.webRequest.onBeforeRequest(
                { urls: ['http://*/*', 'https://*/*'] },
                (_details, callback) => callback({ cancel: true }),
            );
            await new Promise((resolve) => {
                win.webContents.once('did-finish-load', resolve);
                win.webContents.reload();
            });
            reveal();
            await delay(1200);
            await evaluate(`location.hash='/library/songs'`);
            await delay(1400);
            assert.ok(
                await evaluate(
                    `document.querySelectorAll('main [data-download-status="downloaded"]').length > 0`,
                ),
                'Song rows display their local download state',
            );
            const columnCheck = await evaluate(`(()=>{
                const settings=JSON.parse(localStorage.getItem('store_settings'));
                const columns=settings.state.lists.song.table.columns;
                const status=document.querySelector('main [data-download-status="downloaded"]');
                const cell=status?.closest('[data-row-index]');
                const header=[...document.querySelectorAll('main [class*=header-content]')].find(el=>el.textContent.trim().toLowerCase()==='status');
                return {version:settings.version, columns, cellText:cell?.textContent.trim(), hasIcon:!!status?.querySelector('svg'), label:status?.getAttribute('aria-label'), aligned:!!header && Math.abs((header.parentElement.getBoundingClientRect().x+header.parentElement.getBoundingClientRect().width/2)-(cell.getBoundingClientRect().x+cell.getBoundingClientRect().width/2))<2};
            })()`);
            assert.equal(columnCheck.version, 36);
            assert.deepEqual(
                columnCheck.columns.map((column) => column.id),
                ['titleCombined', 'duration', 'playCount', 'downloadStatus', 'userFavorite'],
            );
            assert.equal(
                columnCheck.columns[0].width,
                380,
                'Migration preserves existing title width',
            );
            assert.equal(
                columnCheck.columns[1].width,
                90,
                'Migration preserves existing duration width',
            );
            assert.equal(columnCheck.cellText, '', 'Status column contains no visible text');
            assert.ok(columnCheck.hasIcon, 'Status uses an icon');
            assert.equal(columnCheck.label, 'Downloaded', 'Icon has an accessible description');
            assert.ok(columnCheck.aligned, 'Status cells align with their own column header');
            await evaluate(`location.hash='/downloads'`);
            await delay(800);
            await evaluate(
                `document.querySelector('input[aria-label="Select all matching songs"]').click()`,
            );
            assert.ok(
                await evaluate(`document.querySelector('main').innerText.includes('Selected: 53')`),
                'Select all includes songs beyond the first 50 rows and excludes other servers',
            );
            if (process.env.FEISHIN_UI_SCREENSHOT) {
                await delay(400);
                fs.writeFileSync(
                    process.env.FEISHIN_UI_SCREENSHOT,
                    (await win.webContents.capturePage()).toPNG(),
                );
            }
            await clickText('Delete selected');
            await delay(800);
            assert.ok(
                await evaluate(`document.querySelector('[role=dialog]').innerText.includes('53')`),
            );
            await clickText('Cancel');
            await delay(250);
            assert.equal(
                Object.keys((await evaluate(`window.api.offline.list()`)).entries).length,
                54,
                'Cancelling confirmation preserves every file',
            );
            await evaluate(
                `(()=>{const input=document.querySelector('main input[aria-label="Search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Remove');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
            );
            await delay(300);
            assert.ok(
                !(await evaluate(`document.querySelector('main').innerText.includes('Selected:')`)),
                'Changing search clears selection',
            );
            await evaluate(
                `document.querySelector('input[aria-label="Select all matching songs"]').click()`,
            );
            await clickText('Delete selected');
            await delay(800);
            const confirmText = await evaluate(`document.querySelector('[role=dialog]').innerText`);
            assert.ok(confirmText.includes('52'), 'Delete only the filtered selection');
            await clickText('Confirm');
            await delay(1400);
            const remaining = await evaluate(`window.api.offline.list()`);
            assert.equal(
                remaining.entries.length,
                2,
                'Keep unselected songs and songs from other servers',
            );
            assert.ok(remaining.entries.every((entry) => entry.song.name === 'Keep'));
            assert.ok(
                fs.existsSync(path.join(root, '52.wav')) &&
                    fs.existsSync(path.join(root, '53.wav')),
            );
            assert.ok(!fs.existsSync(path.join(root, '0.wav')));
            for (const id of ['retry-a', 'retry-b']) {
                const song = { ...entries['0'.repeat(64)].song, id, name: id };
                await evaluate(
                    `window.api.offline.save(${JSON.stringify(song)},${JSON.stringify(server.url + '/rest/download.view')})`,
                );
            }
            await delay(1400);
            assert.equal(downloadRequests, 2);
            await evaluate(
                `(()=>{const input=document.querySelector('main input[aria-label="Search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
            );
            await delay(250);
            await clickText('Transfers · 2');
            await delay(250);
            await evaluate(
                `document.querySelector('input[aria-label="Select all matching songs"]').click()`,
            );
            await clickText('Retry selected');
            await delay(1400);
            assert.equal(downloadRequests, 4, 'Retry every selected failed transfer');
            await evaluate(
                `document.querySelector('input[aria-label="Select all matching songs"]').click()`,
            );
            await clickText('Cancel selected');
            await delay(600);
            assert.equal(
                (await evaluate(`window.api.offline.list()`)).jobs.length,
                0,
                'Cancel every selected transfer',
            );
            console.log(
                'Download manager checks passed: live song status, select all across pagination, filtered batch delete, cancellation and server isolation.',
            );
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
