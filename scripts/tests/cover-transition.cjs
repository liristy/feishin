/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { app, BrowserWindow, ipcMain } = require('electron');
// Run: node_modules/electron/dist/electron.exe scripts/tests/cover-transition.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const base = path.resolve(__dirname, '../../src/renderer/features/player/utils');
const script = ts.transpileModule(fs.readFileSync(`${base}/transition-player-cover.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const css = fs.readFileSync(`${base}/transition-player-cover.css`, 'utf8');
const playerBarCss = fs.readFileSync(
    path.resolve(base, '../../../layouts/default-layout/player-bar.module.css'),
    'utf8',
);

app.whenReady().then(async () => {
    const window = new BrowserWindow({
        height: 800,
        show: false,
        webPreferences: {
            backgroundThrottling: false,
            contextIsolation: false,
            nodeIntegration: true,
        },
        width: 1000,
    });
    const readyToShow = new Promise((resolve) => window.once('ready-to-show', resolve));
    ipcMain.handle('cover-frame-pixels', async (_, { control, measureMarker, rect, viewport }) => {
        const screenshot = await window.webContents.capturePage();
        const size = screenshot.getSize();
        const bitmap = screenshot.toBitmap();
        const pixel = (x, y) => {
            const offset =
                (Math.floor((y * size.height) / viewport.height) * size.width +
                    Math.floor((x * size.width) / viewport.width)) *
                4;
            return [...bitmap.subarray(offset, offset + 3)];
        };
        const marker = { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity };
        if (measureMarker) {
            for (
                let y = Math.ceil(rect.y);
                y < Math.min(rect.y + rect.height, viewport.height);
                y++
            ) {
                for (
                    let x = Math.ceil(rect.x);
                    x < Math.min(rect.x + rect.width, viewport.width);
                    x++
                ) {
                    const [blue, green, red] = pixel(x, y);
                    if (green > 180 && red < 80 && blue < 80) {
                        marker.left = Math.min(marker.left, x);
                        marker.right = Math.max(marker.right, x);
                        marker.top = Math.min(marker.top, y);
                        marker.bottom = Math.max(marker.bottom, y);
                    }
                }
            }
        }
        return {
            bottom: pixel(viewport.width - 10, viewport.height - 2),
            center: pixel(rect.x + rect.width / 2, rect.y + rect.height / 2),
            control: pixel(control.x, control.y),
            corners: [
                pixel(rect.x + 2, rect.y + 2),
                pixel(rect.x + rect.width - 3, rect.y + 2),
                pixel(rect.x + 2, rect.y + rect.height - 3),
                pixel(rect.x + rect.width - 3, rect.y + rect.height - 3),
            ],
            markerRatio: measureMarker
                ? (marker.right - marker.left + 1) / (marker.bottom - marker.top + 1)
                : null,
        };
    });
    try {
        await window.loadURL(
            `data:text/html,${encodeURIComponent(`<style>${css}${playerBarCss}
            :root { --theme-colors-background-alternate: white; }
            body { background: white; }
            </style>
            <div id="player-bar" class="container" style="position:fixed;inset:auto 0 0;height:90px">
            <div data-player-cover="compact" style="position:fixed;left:12px;bottom:12px;width:60px;height:60px;background:red;border-radius:12px"></div>
            <div data-player-controls style="position:fixed;z-index:200;left:480px;bottom:12px;width:40px;height:40px;background:blue"></div></div>`)}`,
        );
        await readyToShow;
        await window.webContents.capturePage();
        const result = await window.webContents.executeJavaScript(`(async () => {
            const exports = {};
            const require = (id) => id.endsWith('.css') ? undefined : window.require(${JSON.stringify(require.resolve('react-dom'))});
            ${script}
            const transition = exports.transitionPlayerCover;
            const start = document.startViewTransition.bind(document);
            let current;
            document.startViewTransition = (update) => current = start(update);
            document.documentElement.style.setProperty('--theme-radius-md', '12px');
            const bar = document.querySelector('#player-bar');
            const open = () => {
                bar.classList.add('fullscreen');
                document.body.insertAdjacentHTML('beforeend', '<section data-fullscreen-player style="position:fixed;inset:0;background:#222"><div data-player-cover="expanded" style="position:fixed;left:200px;top:100px;width:400px;height:400px;background:red;border-radius:24px"></div></section>');
            };
            const close = () => {
                bar.classList.remove('fullscreen');
                document.querySelector('section')?.remove();
            };
            const inspect = async (measureMarker = false) => {
                await current.ready;
                const barBackground = getComputedStyle(bar).backgroundColor;
                const preserveAspect = document.documentElement.hasAttribute('data-player-cover-preserve-aspect');
                const animation = document.getAnimations().find(a => a.effect.pseudoElement === '::view-transition-group(player-cover)');
                if (!animation) throw new Error('Missing native shared-cover animation');
                const animations = document.getAnimations();
                animations.forEach(item => item.pause());
                const frames = animation.effect.getKeyframes();
                const duration = animation.effect.getTiming().duration;
                const samples = [];
                const controlRect = document.querySelector('[data-player-controls]').getBoundingClientRect();
                const opening = !!document.querySelector('[data-player-cover="expanded"]');
                for (const time of [0, 0.2, 0.5, 0.8, 0.98].map(fraction => fraction * duration)) {
                    animations.forEach(item => { item.currentTime = time; });
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    const group = getComputedStyle(document.documentElement, '::view-transition-group(player-cover)');
                    const transform = new DOMMatrix(group.transform);
                    const pair = getComputedStyle(document.documentElement, '::view-transition-image-pair(player-cover)');
                    const page = getComputedStyle(document.documentElement, opening ? '::view-transition-new(fullscreen-player)' : '::view-transition-old(fullscreen-player)');
                    const oldCover = getComputedStyle(document.documentElement, '::view-transition-old(player-cover)');
                    const newCover = getComputedStyle(document.documentElement, '::view-transition-new(player-cover)');
                    const pixels = await window.require('electron').ipcRenderer.invoke('cover-frame-pixels', {
                        rect: {x:transform.e, y:transform.f, width:parseFloat(group.width), height:parseFloat(group.height)},
                        control: {x:controlRect.x+20,y:controlRect.y+20},
                        measureMarker,
                        viewport: {width:innerWidth,height:innerHeight},
                    });
                    samples.push({...pixels, time, width:parseFloat(group.width), radius:parseFloat(pair.borderTopLeftRadius), pageY:new DOMMatrix(page.transform).f, pageHeight:parseFloat(page.height), oldOpacity:parseFloat(oldCover.opacity), newOpacity:parseFloat(newCover.opacity)});
                }
                animations.forEach(item => item.finish());
                await current.finished;
                return { frames: frames.map(f => ({width:f.width,transform:f.transform})), samples, duration, barBackground, preserveAspect, cleanedUp:!document.documentElement.hasAttribute('data-player-cover-preserve-aspect') };
            };
            await new Promise(requestAnimationFrame);
            transition(open);
            const opening = await inspect().catch(error => { throw new Error('opening: ' + error); });
            transition(close);
            const closing = await inspect().catch(error => { throw new Error('closing: ' + error); });
            const rectangular = [];
            const compact = document.querySelector('[data-player-cover="compact"]');
            for (const [width, height, nativeBox] of [[400,200,true], [200,400,true], [400,200,false], [200,400,false]]) {
                const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="red"/><circle cx="'+width/2+'" cy="'+height/2+'" r="30" fill="lime"/></svg>');
                const small = new Image();
                small.src = src;
                small.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px';
                await small.decode();
                compact.replaceChildren(small);
                const large = new Image();
                large.src = src;
                large.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:24px';
                await large.decode();
                transition(() => {
                    open();
                    const cover = document.querySelector('[data-player-cover="expanded"]');
                    cover.style.width = (nativeBox ? width : 400) + 'px';
                    cover.style.height = (nativeBox ? height : 400) + 'px';
                    cover.style.background = 'transparent';
                    cover.append(large);
                });
                const expanding = await inspect(true);
                transition(close);
                rectangular.push({width, height, nativeBox, expanding, collapsing:await inspect(true)});
            }
            compact.replaceChildren();
            transition(open);
            transition(close);
            await current.finished;
            const interruptedClosed = !document.querySelector('section');
            window.matchMedia = () => ({matches:true});
            transition(open);
            const reducedMotionImmediate = !!document.querySelector('section');
            close();
            document.startViewTransition = undefined;
            transition(open);
            return {opening,closing,rectangular,interruptedClosed,reducedMotionImmediate,unsupportedImmediate:!!document.querySelector('section')};
        })().catch(error => { throw new Error(error.stack || String(error)); })`);
        assert.equal(result.opening.frames[0].width, '60px');
        assert.equal(result.opening.frames.at(-1).width, '400px');
        assert.equal(result.closing.frames[0].width, '400px');
        assert.equal(result.closing.frames.at(-1).width, '60px');
        assert.equal(result.opening.duration, 500);
        assert.equal(result.closing.duration, 300);
        assert.equal(result.opening.preserveAspect, false);
        for (const fixture of result.rectangular) {
            for (const direction of [fixture.expanding, fixture.collapsing]) {
                assert.ok(direction.preserveAspect && direction.cleanedUp);
                for (const sample of direction.samples) {
                    assert.ok(
                        Math.abs(sample.markerRatio - 1) < 0.15,
                        'A circular detail must stay round on landscape and portrait artwork',
                    );
                    assert.ok(Math.abs(sample.oldOpacity + sample.newOpacity - 1) < 0.002);
                    assert.deepEqual(sample.center, [0, 255, 0]);
                    assert.deepEqual(sample.control, [255, 0, 0]);
                }
                assert.equal(direction.samples[0].newOpacity, 0);
                assert.ok(direction.samples.at(-1).newOpacity > 0.999);
            }
        }
        assert.equal(result.closing.barBackground, 'rgb(255, 255, 255)');
        assert.equal(result.closing.samples[0].bottom[0], 34);
        assert.ok(result.closing.samples[1].bottom[0] > 34);
        assert.ok(result.closing.samples[1].bottom[0] < 253);
        assert.ok(
            result.closing.samples.at(-1).bottom.every((channel) => channel >= 253),
            'The bottom must blend into the playback bar before the page disappears',
        );
        for (const sample of result.closing.samples) {
            const coverProgress = (400 - sample.width) / 340;
            const pageProgress = sample.pageY / sample.pageHeight;
            assert.ok(
                Math.abs(coverProgress - pageProgress) < 0.002,
                'Page and cover must close at the same pace',
            );
        }
        assert.notEqual(result.opening.frames[0].transform, result.opening.frames.at(-1).transform);
        assert.notEqual(result.closing.frames[0].transform, result.closing.frames.at(-1).transform);
        assert.ok(result.opening.samples[2].width > 60 && result.opening.samples[2].width < 400);
        assert.ok(result.closing.samples[2].width > 60 && result.closing.samples[2].width < 400);
        assert.ok(
            result.interruptedClosed &&
                result.reducedMotionImmediate &&
                result.unsupportedImmediate,
        );
        console.log(JSON.stringify(result));
        for (const sample of [...result.opening.samples, ...result.closing.samples]) {
            assert.deepEqual(
                sample.control,
                [255, 0, 0],
                'Playback controls must stay visible throughout the transition',
            );
            for (const corner of sample.corners) {
                assert.notDeepEqual(
                    corner,
                    [0, 0, 255],
                    'All four corners must stay clipped throughout the transition',
                );
            }
            assert.deepEqual(sample.center, [0, 0, 255], 'The moving cover must remain visible');
            assert.ok(sample.radius >= 12 && sample.radius <= 24);
        }
        assert.equal(result.opening.samples[0].radius, 12);
        assert.ok(result.opening.samples.at(-1).radius > 23.9);
        assert.equal(result.closing.samples[0].radius, 24);
        assert.ok(result.closing.samples.at(-1).radius < 12.1);
        assert.ok(result.opening.samples[0].pageY > 700);
        assert.ok(result.opening.samples.at(-1).pageY < 1);
        assert.equal(result.closing.samples[0].pageY, 0);
        assert.ok(result.closing.samples.at(-1).pageY > 700);
        console.log(
            'Native cover movement, scaling in both directions, interruption and fallback passed.',
        );
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
});
