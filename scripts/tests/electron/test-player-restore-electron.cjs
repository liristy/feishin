/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Build first, then node scripts/tests/electron/test-player-restore-electron.cjs.
// Three separate app processes share only this test's temporary profile and silent WAV.
const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
if (!process.versions.electron) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feishin-player-restore-'));
    for (const stage of ['seed', 'restart', 'verify']) {
        const result = require('node:child_process').spawnSync(
            process.execPath,
            [require.resolve('electron/cli.js'), __filename, root, stage],
            { encoding: 'utf8', timeout: 60000 },
        );
        if (result.status !== 0) {
            console.error(result.stdout, result.stderr);
            process.exit(1);
        }
        console.log(
            result.stdout
                .split('\n')
                .filter((line) => line.startsWith('PASS'))
                .join('\n'),
        );
    }
} else {
    const root = process.argv[2],
        stage = process.argv[3],
        { app, session } = require('electron');
    app.setPath('userData', root);
    app.setPath('music', root);
    app.requestSingleInstanceLock = () => true;
    process.env.DISABLE_AUTO_UPDATES = 'true';
    fs.writeFileSync(
        path.join(root, 'config.json'),
        JSON.stringify({ window_enable_tray: false, window_window_bar_style: 'web' }),
    );
    const songs = Array.from({ length: 3 }, (_, i) => ({
        _itemType: 'song',
        _serverId: 'test',
        _serverType: 'subsonic',
        _uniqueId: String(i),
        album: 'Fixture',
        albumArtists: [],
        artistName: 'Fixture',
        artists: [],
        container: 'wav',
        duration: 60000,
        genres: [],
        id: String(i),
        imageUrl: null,
        name: i === 2 ? 'Saved song' : 'Missing ' + i,
    }));
    if (stage === 'seed') {
        const audio = Buffer.alloc(960044);
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
        audio.writeUInt32LE(audio.length - 44, 40);
        const audioPath = path.join(root, 'saved.wav');
        fs.writeFileSync(audioPath, audio);
        const key = require('node:crypto')
            .createHash('sha256')
            .update(JSON.stringify(['test', '2']))
            .digest('hex');
        fs.writeFileSync(
            path.join(root, 'offline-library.json'),
            JSON.stringify({
                entries: {
                    [key]: {
                        key,
                        layoutVersion: 1,
                        path: audioPath,
                        savedAt: Date.now(),
                        size: audio.length,
                        song: songs[2],
                    },
                },
            }),
        );
    }
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const timeout = setTimeout(() => app.exit(1), 45000);
    app.once('browser-window-created', (_event, win) => {
        win.show = () => {};
        win.showInactive = () => {};
        win.webContents.setBackgroundThrottling(false);
        const evaluate = (code) => win.webContents.executeJavaScript(code);
        const read = () =>
            evaluate(
                `new Promise(resolve=>{const req=indexedDB.open('keyval-store');req.onsuccess=()=>{const tx=req.result.transaction('keyval'),p=tx.objectStore('keyval').get('player-store'),q=tx.objectStore('keyval').get('player-store-queue');tx.oncomplete=()=>resolve({player:JSON.parse(p.result).state.player,queue:JSON.parse(q.result),title:document.querySelector('.media-player .song-title')?.textContent,paused:!!document.querySelector('.media-player .player-state-paused')})}})`,
            );
        win.webContents.once('did-finish-load', async () => {
            try {
                if (stage === 'seed') {
                    await delay(300);
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
                                general: { language: 'en', resume: true, volumeWheelStep: 5 },
                                playback: { audioFadeOnStatusChange: false, type: 'web' },
                                window: { windowBarStyle: 'web' },
                            },
                            version: 36,
                        },
                        version: require('../package.json').version,
                    };
                    await evaluate(
                        `Object.entries(${JSON.stringify(storage)}).forEach(([key,value])=>localStorage.setItem(key,JSON.stringify(value)))`,
                    );
                    await evaluate(
                        `new Promise(resolve=>{const req=indexedDB.open('keyval-store');req.onsuccess=()=>{const tx=req.result.transaction('keyval','readwrite');tx.objectStore('keyval').put(JSON.stringify({state:{player:{volume:37,index:0,repeat:'none',shuffle:'none',muted:false}},version:4}),'player-store');tx.objectStore('keyval').put(JSON.stringify({default:['0','1','2'],shuffled:[],songs:Object.fromEntries(${JSON.stringify(songs)}.map(song=>[song._uniqueId,song]))}),'player-store-queue');tx.oncomplete=()=>resolve()}})`,
                    );
                    await new Promise((resolve) => {
                        win.webContents.once('did-finish-load', resolve);
                        win.webContents.reload();
                    });
                }
                session.defaultSession.webRequest.onBeforeRequest(
                    { urls: ['http://*/*', 'https://*/*'] },
                    (_details, callback) => callback({ cancel: true }),
                );
                await delay(1800);
                const restored = await read();
                assert.equal(restored.queue.default.length, 3, 'Retain complete queue');
                assert.equal(
                    restored.player.volume,
                    stage === 'seed' ? 37 : 42,
                    'Retain chosen volume',
                );
                assert.equal(
                    restored.player.index,
                    stage === 'verify' ? 2 : 0,
                    'Retain current queue position',
                );
                assert.ok(restored.paused, 'Startup stays paused');
                if (stage === 'seed') {
                    await evaluate(
                        `(()=>{const slider=[...document.querySelectorAll('.media-player [role=slider]')].find(el=>el.getAttribute('aria-valuenow')==='37');if(!slider)throw new Error('Missing volume slider');slider.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}))})()`,
                    );
                    await delay(500);
                    assert.equal((await read()).player.volume, 42, 'Persist user volume changes');
                }
                if (stage === 'restart') {
                    win.webContents.debugger.attach('1.3');
                    await win.webContents.debugger.sendCommand('Network.enable');
                    await win.webContents.debugger.sendCommand('Network.emulateNetworkConditions', {
                        downloadThroughput: 0,
                        latency: 0,
                        offline: true,
                        uploadThroughput: 0,
                    });
                    await delay(100);
                    assert.equal(await evaluate('navigator.onLine'), false);
                    await evaluate(
                        `document.querySelector('.media-player .player-state-paused').click()`,
                    );
                    await delay(3500);
                    const skipped = await read();
                    assert.equal(skipped.player.index, 2, 'Skip both missing songs');
                    assert.equal(
                        skipped.queue.default.length,
                        3,
                        'Skipping must not delete queue entries',
                    );
                    assert.ok(
                        await evaluate(
                            `[...document.querySelectorAll('audio')].some(audio=>!audio.paused&&audio.currentTime>0&&audio.currentSrc.startsWith('feishin-offline:'))`,
                        ),
                        'Saved song actually plays offline',
                    );
                }
                console.log('PASS ' + stage + ': queue, volume and offline playback');
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
}
