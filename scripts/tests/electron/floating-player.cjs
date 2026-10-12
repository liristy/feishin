/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
// Run after build:electron: node scripts/tests/electron/floating-player.cjs
// Uses its own userData and simulated media. Never opens the user's music library.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const report = path.join(root, '.scratch/floating-player-native-results.json');
if (!process.versions.electron) {
    const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
        cwd: root,
        windowsHide: true,
    });
    if (fs.existsSync(report)) process.stdout.write(fs.readFileSync(report, 'utf8') + '\n');
    if (result.error) process.stderr.write(result.error.message + '\n');
    process.exit(result.status ?? 1);
}

const electron = require('electron');
const { app, ipcMain } = electron;
app.setPath('userData', path.join(root, '.scratch/floating-player-test-user-data'));
const settings = new Map();
const windows = [];
const results = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TestWindow extends electron.BrowserWindow {
    constructor(options) {
        super(options);
        this.shows = 0;
        this.raises = 0;
        this.testContents = this.webContents;
        windows.push(this);
    }
    moveTop() {
        this.raises++;
        super.moveTop();
    }
    setBounds(bounds, animate) {
        this.boundsChanges = (this.boundsChanges || 0) + 1;
        super.setBounds(bounds, animate);
    }
    setShape(rects) {
        this.shape = JSON.parse(JSON.stringify(rects));
        super.setShape(rects);
    }
    showInactive() {
        this.shows++;
        super.showInactive();
    }
}

function load(file, mocks = {}) {
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText,
        {
            __dirname: path.join(root, 'out/main'),
            clearTimeout,
            exports,
            process,
            require: (id) => mocks[id] || require(id),
            setTimeout,
        },
    );
    return exports;
}

const state = {
    artist: '测试歌手',
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
    theme: { background: '#202020', border: '#404040', foreground: '#ffffff' },
    title: '测试歌曲',
    volume: 30,
};

async function check(name, operation) {
    try {
        await operation();
        results.push({ name, passed: true });
    } catch (error) {
        results.push({ error: error.message, name, passed: false });
    }
}

async function ready(window) {
    for (let i = 0; i < 100; i++) {
        const loaded = await window.webContents
            .executeJavaScript(`Boolean(document.querySelector('[class*="module-title"]'))`)
            .catch(() => false);
        if (loaded) return;
        await wait(50);
    }
    throw new Error('Floating renderer did not become ready');
}

app.whenReady()
    .then(async () => {
        const main = new electron.BrowserWindow({ show: false });
        await main.loadURL('data:text/html,<title>Isolated floating player test</title>');
        load('src/main/features/core/floating-player.ts', {
            '/@/main/features/core/settings': {
                store: {
                    delete: (key) => settings.delete(key),
                    get: (key) => settings.get(key),
                    set: (key, value) => settings.set(key, value),
                },
            },
            '/@/main/logger': { default: { error() {}, warn() {} } },
            '/@/shared/types/floating-player': load('src/shared/types/floating-player.ts'),
            electron: { ...electron, BrowserWindow: TestWindow },
        }).initializeFloatingPlayer(main, () => {});
        const owner = { sender: main.webContents };
        const configure = (enabled, hideWhenIdle = true) =>
            ipcMain.emit('floating-player-configure', owner, { enabled, hideWhenIdle });
        const update = (value) => ipcMain.emit('floating-player-update', owner, value);
        update(state);
        configure(true);
        let floating = windows.at(-1);
        await ready(floating);
        await check('real renderer loads and remains on top', async () => {
            assert.equal(floating.isAlwaysOnTop(), true);
            assert.equal(
                await floating.webContents.executeJavaScript(
                    `document.querySelector('[class*="module-title"]').textContent`,
                ),
                state.title,
            );
        });
        await check('floating player shares the fullscreen palette and cover flow', async () => {
            state.artwork = await floating.webContents.executeJavaScript(`(() => {
                const cover = document.createElement('canvas'); cover.width = cover.height = 64;
                const context = cover.getContext('2d'); context.fillStyle = '#9d607c';
                context.fillRect(0, 0, 64, 64); return cover.toDataURL();
            })()`);
            update(state);
            await wait(300);
            const appearance = await floating.webContents.executeJavaScript(`(() => {
                const canvas = document.querySelector('canvas');
                return {
                    color: getComputedStyle(document.querySelector('[class*="module-player"]')).color,
                    painted: Boolean(canvas?.getContext('2d').getImageData(0, 0, 1, 1).data[3]),
                };
            })()`);
            assert.equal(appearance.color, 'rgb(255, 255, 255)');
            assert.equal(
                appearance.painted,
                true,
                'The shared gradient must render in the isolated window',
            );
        });
        await check(
            'large artwork with missing MIME type becomes a small PNG thumbnail',
            async () => {
                const artworkCode = ts.transpileModule(
                    fs.readFileSync(
                        path.join(
                            root,
                            'src/renderer/features/player/utils/floating-player-artwork.ts',
                        ),
                        'utf8',
                    ),
                    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
                ).outputText;
                // Thumbnails are prepared in the main renderer; the isolated window only accepts PNG data URLs.
                const result = await main.webContents.executeJavaScript(`(async () => {
                const exports = {};
                ${artworkCode}
                const source = document.createElement('canvas');
                    source.width = source.height = 2048;
                const context = source.getContext('2d');
                    const pixels = context.createImageData(2048, 2048);
                let seed = 1;
                for (let i = 0; i < pixels.data.length; i += 4) {
                    seed = Math.imul(seed, 1664525) + 1013904223;
                    pixels.data[i] = seed >>> 24;
                    pixels.data[i + 1] = seed >>> 16;
                    pixels.data[i + 2] = seed >>> 8;
                    pixels.data[i + 3] = 255;
                }
                context.putImageData(pixels, 0, 0);
                const encoded = await new Promise(resolve => source.toBlob(resolve));
                const blob = new Blob([encoded], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                try {
                    const controller = new AbortController();
                    const thumbnail = await exports.createFloatingPlayerArtwork(url, controller.signal);
                    const image = new Image(); image.src = thumbnail; await image.decode();
                    const cancelled = new AbortController(); cancelled.abort();
                    let aborted = false;
                    try { await exports.createFloatingPlayerArtwork(url, cancelled.signal); }
                    catch { aborted = true; }
                    return { inputSize: blob.size, width: image.naturalWidth, height: image.naturalHeight,
                        png: thumbnail.startsWith('data:image/png;base64,'), size: thumbnail.length, aborted };
                } finally { URL.revokeObjectURL(url); }
            })()`);
                assert.ok(result.inputSize > 2 * 1024 * 1024);
                assert.equal(result.width, 96);
                assert.equal(result.height, 96);
                assert.equal(result.png, true);
                assert.ok(result.size < 60000);
                assert.equal(result.aborted, true);
            },
        );
        await check(
            'portrait and landscape covers retain their aspect ratio without cropping',
            async () => {
                const artworkCode = ts.transpileModule(
                    fs.readFileSync(
                        path.join(
                            root,
                            'src/renderer/features/player/utils/floating-player-artwork.ts',
                        ),
                        'utf8',
                    ),
                    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
                ).outputText;
                for (const [width, height] of [
                    [320, 80],
                    [80, 320],
                    [120, 120],
                ]) {
                    const artwork = await main.webContents.executeJavaScript(`(async () => {
                    const exports = {};
                    ${artworkCode}
                    const source = document.createElement('canvas');
                    source.width = ${width}; source.height = ${height};
                    const context = source.getContext('2d');
                    context.fillStyle = '#aa2211'; context.fillRect(0, 0, ${width}, ${height});
                    return exports.createFloatingPlayerArtwork(source.toDataURL(), new AbortController().signal);
                })()`);
                    update({ ...state, artwork });
                    await wait(200);
                    const result = await floating.webContents.executeJavaScript(`(() => {
                    const image = document.querySelector('button img');
                    const bounds = image.getBoundingClientRect();
                    const button = image.parentElement.getBoundingClientRect();
                    return { ratio: bounds.width / bounds.height, naturalRatio: image.naturalWidth / image.naturalHeight,
                        width: bounds.width, height: bounds.height, fit: getComputedStyle(image).objectFit,
                        visible: bounds.left >= button.left && bounds.right <= button.right &&
                            bounds.top >= button.top && bounds.bottom <= button.bottom };
                })()`);
                    assert.ok(Math.abs(result.naturalRatio - width / height) < 0.01);
                    assert.ok(Math.abs(result.ratio - width / height) < 0.01);
                    assert.equal(result.fit, 'contain');
                    assert.equal(result.visible, true);
                    assert.equal(Math.max(result.width, result.height), 36);
                }
                update(state);
            },
        );
        await check('500 updates do not show or raise the window again', async () => {
            const shows = floating.shows;
            for (let i = 0; i < 500; i++) update({ ...state, title: `歌曲 ${i}` });
            await wait(200);
            assert.equal(floating.shows, shows);
            assert.equal(
                await floating.webContents.executeJavaScript(
                    `document.querySelector('[class*="module-title"]').textContent`,
                ),
                '歌曲 499',
            );
            const raises = floating.raises;
            await wait(1700);
            assert.equal(floating.raises, raises);
        });
        await check('100 on/off cycles leave exactly one window', async () => {
            for (let i = 0; i < 100; i++) {
                configure(false);
                configure(true);
            }
            floating = windows.at(-1);
            await ready(floating);
            assert.equal(windows.filter((window) => !window.isDestroyed()).length, 1);
        });
        await check('old renderer failures cannot close the replacement', async () => {
            windows.at(-2).testContents.emit('render-process-gone', {}, { reason: 'crashed' });
            assert.equal(floating.isDestroyed(), false);
        });
        await check('empty media hides and radio cannot skip', async () => {
            update({ ...state, hasMedia: false });
            assert.equal(floating.isVisible(), false);
            configure(true, false);
            assert.equal(floating.isVisible(), true);
            update({ ...state, canSkip: false, playing: true });
            await wait(100);
            const buttons = await floating.webContents.executeJavaScript(
                `Array.from(document.querySelectorAll('button')).map(b=>({label:b.getAttribute('aria-label'),disabled:b.disabled}))`,
            );
            assert.equal(buttons[0].disabled, true);
            assert.equal(buttons[2].disabled, true);
            assert.equal(buttons[1].label, 'pause');
        });
        await check('2000 moves preserve renderer size and save position', async () => {
            const sender = { sender: floating.webContents };
            const origin = floating.getBounds();
            ipcMain.emit('floating-player-drag', sender, 'begin', 500, 500);
            for (let i = 0; i < 2000; i++)
                ipcMain.emit(
                    'floating-player-drag',
                    sender,
                    'move',
                    500 + Math.sin(i) * 200,
                    500 + Math.cos(i) * 200,
                );
            ipcMain.emit('floating-player-drag', sender, 'move', -9500, -9500);
            assert.equal(floating.getBounds().x, origin.x - 10000);
            assert.equal(floating.getBounds().y, origin.y - 10000);
            ipcMain.emit('floating-player-drag', sender, 'move', 500, 500);
            ipcMain.emit('floating-player-drag', sender, 'end');
            await wait(100);
            const bounds = floating.getBounds();
            assert.equal(bounds.width, 420);
            assert.ok(Math.abs(bounds.height - 392) <= 1);
            assert.deepEqual(floating.shape, [{ height: 104, width: 420, x: 0, y: 288 }]);
            const size = await floating.webContents.executeJavaScript(
                '({width:innerWidth,height:innerHeight})',
            );
            assert.equal(size.width, 420);
            assert.equal(size.height, 392);
            assert.ok(Number.isFinite(settings.get('floating_player_position').x));
        });
        await check(
            'lyrics and queue expand above the bar without shifting it or restoring the tooltip',
            async () => {
                const sender = { sender: floating.webContents };
                const origin = floating.getBounds();
                update({
                    ...state,
                    currentLyric: 1,
                    lyrics: ['第一行', '第二行'],
                    queue: [{ artist: '歌手', id: 'one', title: '队列歌曲' }],
                });
                await wait(100);
                assert.equal(
                    await floating.webContents.executeJavaScript(
                        `document.querySelector('[class*="module-metadata"]').getAttribute('title')`,
                    ),
                    null,
                );
                await floating.webContents.executeJavaScript(
                    `document.querySelector('button[aria-label="Play queue"]').click()`,
                );
                await wait(100);
                assert.equal(floating.getBounds().width, 420);
                assert.ok(Math.abs(floating.getBounds().height - 392) <= 1);
                assert.equal(floating.getBounds().y, origin.y);
                assert.deepEqual(floating.shape, [{ height: 392, width: 420, x: 0, y: 0 }]);
                assert.equal(
                    await floating.webContents.executeJavaScript(
                        `document.querySelector('section').textContent.includes('队列歌曲')`,
                    ),
                    true,
                );
                const opening = await floating.webContents.executeJavaScript(
                    `getComputedStyle(document.querySelector('[data-expanded]')).height`,
                );
                assert.ok(
                    parseFloat(opening) > 56 && parseFloat(opening) < 344,
                    'Opening must animate',
                );
                await wait(200);
                const layout = await floating.webContents.executeJavaScript(`(() => {
                    const surface = document.querySelector('[data-expanded]');
                    const panel = document.querySelector('section');
                    const bar = document.querySelector('[class*="module-player"]');
                    return {
                        height: getComputedStyle(surface).height,
                        shared: panel.parentElement === surface && bar.parentElement === surface,
                        header: Boolean(panel.querySelector('header')),
                        bottom: panel.getBoundingClientRect().bottom,
                        barTop: bar.getBoundingClientRect().top,
                        rowHeight: panel.querySelector('button').getBoundingClientRect().height,
                    };
                })()`);
                assert.equal(layout.height, '344px');
                assert.equal(layout.shared, true);
                assert.equal(layout.header, false);
                assert.ok(
                    Math.abs(layout.bottom - layout.barTop) < 1,
                    'Content and controls must touch',
                );
                assert.ok(layout.rowHeight <= 46, 'Queue rows must be compact');
                await floating.webContents.executeJavaScript(
                    `document.querySelector('button[aria-label="Lyrics"]').click()`,
                );
                await wait(100);
                assert.equal(
                    await floating.webContents.executeJavaScript(
                        `document.querySelector('p[aria-current="true"]').textContent`,
                    ),
                    '第二行',
                );
                const lyricStyle = await floating.webContents.executeJavaScript(`(() => {
                    const line = document.querySelector('p[aria-current="true"]');
                    const style = getComputedStyle(line);
                    const surface = document.querySelector('[data-expanded]');
                    const bar = document.querySelector('[class*="module-player"]');
                    return {
                        size: style.fontSize, gap: style.marginBottom,
                        count: document.querySelectorAll('section p').length,
                        wrap: style.whiteSpace,
                        weight: style.fontWeight, family: style.fontFamily,
                        scroll: surface.scrollTop,
                        bottom: surface.getBoundingClientRect().bottom,
                        barBottom: bar.getBoundingClientRect().bottom,
                    };
                })()`);
                assert.equal(lyricStyle.size, '26px');
                assert.equal(lyricStyle.weight, '700');
                assert.match(lyricStyle.family, /Feishin PingFang/);
                assert.equal(lyricStyle.gap, '0px');
                assert.equal(lyricStyle.count, 1);
                assert.equal(lyricStyle.wrap, 'nowrap');
                assert.equal(lyricStyle.scroll, 0, 'Auto-scroll must stay inside the lyrics');
                assert.ok(Math.abs(lyricStyle.bottom - lyricStyle.barBottom) < 1);
                update({
                    ...state,
                    currentLyric: 0,
                    lyricDurationMs: 1600,
                    lyrics: ['下一句'.repeat(40), '上一句'],
                });
                await wait(80);
                const transition = await floating.webContents.executeJavaScript(`(() => {
                    const active = document.querySelector('p[aria-current="true"]');
                    const outgoing = document.querySelector('p[aria-hidden="true"]');
                    return { text: active.textContent, opacity: Number(getComputedStyle(active).opacity),
                        previous: outgoing?.textContent, hidden: outgoing?.getAttribute('aria-hidden') };
                })()`);
                assert.equal(transition.text, '下一句'.repeat(40));
                assert.equal(transition.previous, '第二行');
                assert.equal(transition.hidden, 'true');
                assert.ok(
                    transition.opacity > 0 && transition.opacity < 1,
                    'Lyric changes must crossfade',
                );
                await wait(240);
                assert.equal(
                    await floating.webContents.executeJavaScript(`(() => {
                        const lines = document.querySelectorAll('section p');
                        const line = lines[0];
                        return lines.length === 1 && line.textContent === '下一句'.repeat(40) &&
                            line.getBoundingClientRect().height < 40 &&
                            line.scrollWidth > line.clientWidth &&
                            getComputedStyle(line).fontSize === '20px';
                    })()`),
                    true,
                    'The current lyric must replace the previous lyric and stay on one line',
                );
                await wait(1000);
                assert.equal(
                    await floating.webContents.executeJavaScript(`(() => {
                    const line = document.querySelector('p[aria-current="true"]');
                    const span = line.querySelector('span');
                    const x = new DOMMatrixReadOnly(getComputedStyle(span).transform).m41;
                    return x < -100 && line.getBoundingClientRect().height < 40;
                })()`),
                    true,
                    'Long lyrics must scroll to reveal the rest of the line',
                );
                update({ ...state, currentLyric: 0, lyricDurationMs: 0, lyrics: ['短句'] });
                await wait(300);
                assert.equal(
                    await floating.webContents.executeJavaScript(`(() => {
                    const line = document.querySelector('p[aria-current="true"]');
                    return document.querySelectorAll('section p').length === 1 &&
                        getComputedStyle(line).fontSize === '26px' &&
                        line.querySelector('span').getAnimations().length === 0;
                })()`),
                    true,
                    'Short lyrics must restore the original font and stop scrolling',
                );
                for (let i = 0; i < 100; i++) {
                    ipcMain.emit('floating-player-command', sender, 'lyrics');
                    ipcMain.emit('floating-player-command', sender, 'lyrics');
                }
                await wait(300);
                assert.equal(floating.getBounds().width, 420);
                assert.ok(Math.abs(floating.getBounds().height - 392) <= 1);
                assert.equal(floating.getBounds().y, origin.y);
                assert.deepEqual(floating.shape, [{ height: 168, width: 420, x: 0, y: 224 }]);
                ipcMain.emit('floating-player-drag', sender, 'begin', 500, 500);
                ipcMain.emit('floating-player-drag', sender, 'move', 510, 520);
                ipcMain.emit('floating-player-drag', sender, 'end');
                const expanded = floating.getBounds();
                assert.equal(settings.get('floating_player_position').y, expanded.y + 288);
                ipcMain.emit('floating-player-command', sender, 'lyrics');
                await wait(100);
                assert.ok(
                    Math.abs(floating.getBounds().height - 392) <= 1,
                    'Closing animation must not be clipped',
                );
                const closing = await floating.webContents.executeJavaScript(
                    `getComputedStyle(document.querySelector('[data-expanded]')).height`,
                );
                assert.ok(
                    parseFloat(closing) > 56 && parseFloat(closing) < 120,
                    'Closing must animate',
                );
                await wait(220);
                assert.ok(Math.abs(floating.getBounds().height - 392) <= 1);
                assert.equal(floating.getBounds().y, expanded.y);
                assert.deepEqual(floating.shape, [{ height: 104, width: 420, x: 0, y: 288 }]);
                assert.equal(
                    await floating.webContents.executeJavaScript(
                        `document.querySelector('section').inert &&
                        getComputedStyle(document.querySelector('[data-expanded]')).height === '56px' &&
                        (() => {
                            const sample = document.createElement('canvas').getContext('2d');
                            sample.fillStyle = getComputedStyle(document.querySelector('[data-expanded]')).backgroundColor;
                            sample.fillRect(0, 0, 1, 1);
                            const alpha = sample.getImageData(0, 0, 1, 1).data[3];
                            return alpha > 200 && alpha < 250;
                        })() &&
                        getComputedStyle(document.querySelector('[class*="module-background"]')).opacity === '0'`,
                    ),
                    true,
                );
            },
        );
        await check(
            'opening panels keeps every frame anchored without resizing the native surface',
            async () => {
                const sender = { sender: floating.webContents };
                update({
                    ...state,
                    currentSongId: 'row-99',
                    lyrics: ['当前歌词'],
                    queue: Array.from({ length: 100 }, (_, index) => ({
                        artist: '歌手',
                        id: `row-${index}`,
                        title: `歌曲 ${index}`,
                    })),
                });
                await wait(100);
                const origin = floating.getBounds();
                const changes = floating.boundsChanges;
                await floating.webContents.executeJavaScript(`(() => {
                window.panelFrames = []; window.recordPanelFrames = true;
                const record = () => {
                    const bar = document.querySelector('[class*="module-player"]');
                    window.panelFrames.push({ bottom: bar.getBoundingClientRect().bottom,
                        scroll: document.scrollingElement.scrollTop, height: innerHeight });
                    if (window.recordPanelFrames) requestAnimationFrame(record);
                };
                requestAnimationFrame(record);
            })()`);
                for (const panel of [
                    'queue',
                    'queue',
                    'lyrics',
                    'lyrics',
                    'queue',
                    'lyrics',
                    'queue',
                    'queue',
                ]) {
                    ipcMain.emit('floating-player-command', sender, panel);
                    await wait(320);
                }
                const frames = await floating.webContents.executeJavaScript(
                    'window.recordPanelFrames = false; window.panelFrames',
                );
                assert.ok(frames.length >= 50);
                assert.ok(
                    frames.every(
                        (frame) =>
                            Math.abs(frame.bottom - 368) < 1 &&
                            frame.scroll === 0 &&
                            frame.height === 392,
                    ),
                );
                assert.deepEqual(floating.getBounds(), origin);
                assert.equal(
                    floating.boundsChanges,
                    changes,
                    'Panel changes must never resize or move the transparent surface',
                );
                assert.deepEqual(floating.shape, [{ height: 104, width: 420, x: 0, y: 288 }]);
            },
        );
        await check('late IPC cannot reopen a window during quit', async () => {
            app.emit('before-quit');
            const count = windows.length;
            update(state);
            configure(true);
            assert.equal(windows.length, count);
        });
        fs.writeFileSync(report, JSON.stringify(results, null, 2));
        main.destroy();
        app.exit(results.every((result) => result.passed) ? 0 : 1);
    })
    .catch((error) => {
        fs.writeFileSync(report, JSON.stringify({ error: error.message }));
        app.exit(2);
    });
