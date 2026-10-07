/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node node_modules/electron/cli.js scripts/tests/electron/test-player-button-transition.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

app.setPath('userData', path.resolve('.scratch/player-button-transition-profile'));
app.whenReady()
    .then(async () => {
        const { preprocessCSS, resolveConfig } = await import('vite');
        const config = await resolveConfig(
            { configFile: false, css: { modules: { generateScopedName: 'fs-[name]-[local]' } } },
            'build',
        );
        const styles = await Promise.all(
            [
                'src/shared/components/action-icon/action-icon.module.css',
                'src/renderer/features/player/components/player-button.module.css',
                'src/renderer/features/player/components/playerbar.module.css',
            ].map((file) =>
                preprocessCSS(fs.readFileSync(file, 'utf8'), path.resolve(file), config),
            ),
        );
        const [action, button, bar] = styles.map((style) => style.modules);
        const win = new BrowserWindow({
            show: false,
            webPreferences: { backgroundThrottling: false, offscreen: true },
        });
        await win.loadURL(
            'data:text/html;charset=utf-8,' +
                encodeURIComponent(`<style>${styles.map((style) => style.code).join('\n')}
                :root { --mantine-scale:1; --theme-colors-foreground:#eee;
                    --theme-colors-surface:#333; --theme-colors-primary-filled:#f00; }
                body { background:#222; }
                button { width:48px; height:48px; margin:40px; }
                </style><div class="${bar['controls-grid']}">
                <button data-variant="default" class="${action.root} ${button.main}">▶</button>
                </div>`),
        );
        const samples = await win.webContents.executeJavaScript(`(async () => {
            const grid=document.querySelector('div'),button=document.querySelector('button');
            const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
            const samples=[];
            await wait(250);
            for (const compact of [true,false,true]) {
                grid.classList.toggle(${JSON.stringify(bar.compact)},compact);
                for (const delay of [0,50,250]) {
                    await wait(delay);
                    const style=getComputedStyle(button);
                    samples.push({compact,delay,width:style.borderTopWidth,color:style.borderTopColor});
                }
            }
            return samples;
        })()`);
        for (const sample of samples) {
            assert.equal(sample.width, '0px', 'No transient play-button border during resizing');
        }
        console.log('Play button stays borderless when opening and closing fullscreen.');
        app.quit();
    })
    .catch((error) => {
        console.error(error);
        app.exit(1);
    });
