/* eslint-disable @typescript-eslint/no-require-imports */
// Run: pnpm exec electron scripts/tests/electron/test-flow-dither.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

app.setPath('userData', path.resolve('.scratch/flow-dither-test-profile'));
app.whenReady()
    .then(async () => {
        const texture = fs
            .readFileSync('src/renderer/assets/gradient-dither.png')
            .toString('base64');
        const css = fs
            .readFileSync(
                'src/renderer/features/player/components/full-screen-player.module.css',
                'utf8',
            )
            .match(/\.flow-overlay\s*\{([^}]+)\}/)[1]
            .replace(/url\([^)]+\)/, 'url("data:image/png;base64,' + texture + '")');
        const window = new BrowserWindow({
            width: 1920,
            height: 1080,
            show: false,
            webPreferences: { offscreen: true },
        });
        await window.loadURL(
            'data:text/html,<body style="margin:0"><canvas width="224" height="126" style="width:100vw;height:100vh"></canvas><div style="position:fixed;inset:0;background:rgba(0,0,0,.20833)"></div><div id="overlay" style="position:fixed;inset:0"></div>',
        );
        const initialize = () => {
            const canvas = document.querySelector('canvas');
            const ctx = canvas.getContext('2d', { alpha: false, colorType: 'float16' });
            const gradient = ctx.createLinearGradient(0, 0, 224, 0);
            gradient.addColorStop(0, 'rgb(50,50,50)');
            gradient.addColorStop(1, 'rgb(110,110,110)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 224, 126);
        };
        await window.webContents.executeJavaScript('(' + initialize.toString() + ')()');
        const captures = [];
        for (const enabled of [false, true]) {
            const setOverlay = async (styles) => {
                document.getElementById('overlay').style.cssText =
                    'position:fixed;inset:0;' + styles;
                await new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
            };
            const styles = css + (enabled ? '' : ';background-image:none');
            await window.webContents.executeJavaScript(
                '(' + setOverlay.toString() + ')(' + JSON.stringify(styles) + ')',
            );
            const capture = await window.webContents.capturePage();
            fs.writeFileSync(
                path.resolve('.scratch/flow-banding-' + (enabled ? 'after' : 'before') + '.png'),
                capture.toPNG(),
            );
            const pixels = capture.toBitmap();
            const { width, height } = capture.getSize();
            let runs = 0;
            for (let y = 0; y < height; y++)
                for (let x = 1; x < width; x++) {
                    const i = (y * width + x) * 4;
                    if (pixels[i] !== pixels[i - 4]) runs++;
                }
            captures.push({ pixels, runLength: (width * height) / (runs + height) });
        }
        let difference = 0;
        let maxDifference = 0;
        for (let i = 0; i < captures[0].pixels.length; i += 4) {
            const delta = Math.abs(captures[0].pixels[i] - captures[1].pixels[i]);
            difference += delta;
            maxDifference = Math.max(maxDifference, delta);
        }
        difference /= captures[0].pixels.length / 4;
        console.log(
            JSON.stringify({
                beforeRunLength: captures[0].runLength,
                afterRunLength: captures[1].runLength,
                averagePixelChange: difference,
                maxPixelChange: maxDifference,
            }),
        );
        assert.ok(
            captures[1].runLength < captures[0].runLength / 4,
            'Display dithering must break broad, flat color steps',
        );
        assert.ok(
            difference < 1 && maxDifference <= 2,
            'Dithering must remain near a single display color step',
        );
        app.quit();
    })
    .catch((error) => {
        console.error(error);
        app.exit(1);
    });
