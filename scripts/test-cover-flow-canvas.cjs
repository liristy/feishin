/* eslint-disable @typescript-eslint/no-require-imports */
// Run: pnpm exec electron scripts/test-cover-flow-canvas.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
app.setPath('userData', path.resolve('.scratch/flow-canvas-test-profile'));
app.disableHardwareAcceleration();
app.whenReady()
    .then(async () => {
        const code = ts.transpileModule(
            fs.readFileSync(
                'src/renderer/features/player/components/cover-flow-canvas.tsx',
                'utf8',
            ),
            {
                compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
            },
        ).outputText;
        const window = new BrowserWindow({
            show: true,
            webPreferences: { offscreen: true, sandbox: true },
        });
        await window.loadURL('data:text/html,<canvas id="flow" width="320" height="180"></canvas>');
        const result = await window.webContents.executeJavaScript(`(async () => {
        const canvas = document.querySelector('canvas');
        const context = canvas.getContext('2d');
        const texture = document.createElement('canvas');
        texture.width = texture.height = 64;
        const textureContext = texture.getContext('2d');
        textureContext.filter = 'blur(3px)';
        ['#aa7981', '#d6c8b1', '#393c40', '#8c9398'].forEach((color, i) => {
            textureContext.fillStyle = color;
            textureContext.fillRect(i % 2 * 32 - 4, Math.floor(i / 2) * 32 - 4, 40, 40);
        });
        let effect;
        let playing = true;
        let statusListener;
        let waveformReads = 0;
        let jobs = new Map();
        let id = 0;
        let painted = 0;
        const clearRect = context.clearRect.bind(context);
        context.clearRect = (...args) => { painted++; clearRect(...args); };
        const snapshot = () => {
            const output = document.createElement('canvas');
            output.width = 320; output.height = 180;
            const ctx = output.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            // Include both full-screen dark overlays, not just the undimmed canvas.
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0,0,320,180);
            ctx.fillStyle = 'rgba(0,0,0,' + 25 / 120 + ')'; ctx.fillRect(0,0,320,180);
            return { pixels: ctx.getImageData(0,0,320,180).data, png: output.toDataURL() };
        };
        const media = new EventTarget();
        media.matches = false;
        window.matchMedia = () => media;
        let hidden = false;
        Object.defineProperty(document, 'hidden', { get: () => hidden });
        const exports = {};
        const mocks = {
            '/@/renderer/store/player.store': {
                subscribePlayerStatus: fn => { statusListener = fn; return () => { statusListener = null; }; },
                usePlayerStoreBase: { getState: () => ({ player: { status: playing ? 'playing' : 'paused' }, getCurrentSong: () => ({ _uniqueId: 'song' }) }) },
            },
            '/@/renderer/store/timestamp.store': { useTimestampStoreBase: { getState: () => ({ timestamp: 12 }) } },
            '/@/shared/types/types': { PlayerStatus: { PLAYING: 'playing' } },
            '/@/renderer/features/player/utils/player-waveform': {
                getPlayerWaveformEnergy: (song, timestamp) => {
                    if(song !== 'song' || timestamp !== 12) throw new Error('Waveform must follow the playing song and position');
                    waveformReads++; return 0;
                },
            },
        };
        const require = name => mocks[name] || (name === 'react' ? {
            useEffect: fn => { effect = fn; },
            useRef: () => ({ current: canvas }),
        } : { jsx: (_, props) => props });
        new Function('exports', 'require', 'requestAnimationFrame', 'cancelAnimationFrame', ${JSON.stringify(code)})(
            exports, require, fn => { jobs.set(++id, fn); return id; }, key => jobs.delete(key)
        );
        const props = exports.CoverFlowCanvas({className: 'flow', source: texture.toDataURL()});
        const cleanup = effect();
        for(let retry = 0; retry < 100 && jobs.size === 0; retry++) await new Promise(r => setTimeout(r, 10));
        if(!jobs.size) throw new Error('Texture did not load');
        const tick = time => { const batch = [...jobs.values()]; jobs.clear(); batch.forEach(fn => fn(time)); };
        tick(0);
        const firstSnapshot = snapshot();
        const first = firstSnapshot.pixels;
        const firstPng = firstSnapshot.png;
        for(let frame = 1; frame <= 480; frame++) tick(frame * 1000 / 240);
        const lastSnapshot = snapshot();
        const last = lastSnapshot.pixels;
        let difference = 0;
        for(let i = 0; i < first.length; i++) if(i % 4 !== 3) difference += Math.abs(first[i] - last[i]);
        let edgeJump = 0;
        for(const pixels of [first, last]) for(let y = 0; y < 179; y++) for(let x = 0; x < 319; x++) {
            const i = (y * 320 + x) * 4;
            for(let channel = 0; channel < 3; channel++) edgeJump = Math.max(edgeJump,
                Math.abs(pixels[i + channel] - pixels[i + 4 + channel]),
                Math.abs(pixels[i + channel] - pixels[i + 1280 + channel]));
        }
        const frames = painted;
        const secondPng = lastSnapshot.png;
        const pausedImage = canvas.toDataURL();
        playing = false;
        statusListener();
        tick(60000);
        const pauseStopped = jobs.size === 0 && canvas.toDataURL() === pausedImage && painted === frames;
        playing = true;
        statusListener();
        tick(61000);
        const resumeWithoutJump = canvas.toDataURL() === pausedImage && jobs.size > 0;
        hidden = true;
        tick(61100);
        const hiddenStopped = jobs.size === 0;
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        tick(61200);
        const resumed = jobs.size > 0;
        media.matches = true;
        media.dispatchEvent(new Event('change'));
        tick(61300);
        const reducedStopped = jobs.size === 0;
        cleanup();
        return { difference: difference / (320 * 180 * 3), edgeJump, frames, hiddenStopped, resumed, reducedStopped, pauseStopped, resumeWithoutJump, waveformReads, unsubscribed: statusListener === null, jobs: jobs.size, width: props.width, height: props.height, firstPng, secondPng };
    })()`);
        assert.equal(result.width, 320);
        assert.equal(result.height, 180);
        assert.ok(
            result.frames >= 40 && result.frames <= 49,
            'Painting must stay at or below 24 fps on 240 Hz displays',
        );
        assert.ok(
            result.difference > 1 && result.difference < 5,
            'Muted cover colors should drift gently within two seconds, including dark overlays',
        );
        assert.ok(result.edgeJump < 12, 'Flow must not expose hard edges');
        assert.ok(result.hiddenStopped && result.resumed && result.reducedStopped);
        assert.ok(
            result.pauseStopped && result.resumeWithoutJump,
            'Pause must freeze the canvas and resume without a time jump',
        );
        assert.ok(result.waveformReads > 0 && result.unsubscribed);
        assert.equal(result.jobs, 0);
        for (const [name, data] of [
            ['before', result.firstPng],
            ['after', result.secondPng],
        ]) {
            fs.writeFileSync(
                path.resolve('.scratch/flow-canvas-' + name + '.png'),
                Buffer.from(data.split(',')[1], 'base64'),
            );
        }
        console.log(
            JSON.stringify({
                averageColorChangeInTwoSeconds: result.difference,
                framesInTwoSeconds: result.frames,
                pauseAndResume: 'passed',
                visibilityAndReducedMotion: 'passed',
            }),
        );
        app.quit();
    })
    .catch((error) => {
        console.error(error);
        app.exit(1);
    });
