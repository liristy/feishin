/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run: pnpm exec electron scripts/tests/electron/test-text-scrolling.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const esbuild = createRequire(require.resolve('vite'))('esbuild');
app.setPath('userData', path.resolve('.scratch/text-scrolling-test-profile'));
app.disableHardwareAcceleration();
app.whenReady()
    .then(async () => {
        const bundle = await esbuild.build({
            bundle: true,
            define: { 'process.env.NODE_ENV': '"production"' },
            format: 'iife',
            jsx: 'automatic',
            outdir: '.scratch/text-scrolling-fixture',
            plugins: [
                {
                    name: 'fixture',
                    setup(build) {
                        build.onResolve({ filter: /^\/@\// }, (args) => ({
                            namespace: 'fixture',
                            path: args.path,
                        }));
                        build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
                            contents: args.path.endsWith('/text')
                                ? `import {forwardRef} from 'react'; export const Text=forwardRef(({children},ref)=><div ref={ref}>{children}</div>);`
                                : 'export const createPolymorphicComponent=component=>component;',
                            loader: 'jsx',
                            resolveDir: process.cwd(),
                        }));
                        build.onLoad({ filter: /\.css$/ }, () => ({
                            contents: `export default {scrollingTextContainer:'scrolling-text-container',track:'track'};`,
                            loader: 'js',
                        }));
                    },
                },
            ],
            stdin: {
                contents: `import React from 'react';
                import {createRoot} from 'react-dom/client';
                import {BaseTextScrolling} from './src/shared/components/text-scrolling/text-scrolling';
                createRoot(document.querySelector('#host')).render(React.createElement(BaseTextScrolling,
                    {gap:100,pause:0.01,speed:500}, 'The title needs to remain visible'));`,
                resolveDir: process.cwd(),
            },
            write: false,
        });
        const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text;
        const css = fs.readFileSync(
            'src/shared/components/text-scrolling/text-scrolling.module.css',
            'utf8',
        );
        const win = new BrowserWindow({
            show: true,
            webPreferences: { backgroundThrottling: false, offscreen: true, sandbox: true },
        });
        await win.loadURL(
            'data:text/html;charset=utf-8,' +
                encodeURIComponent(
                    `<style>${css}</style><div id="host" style="width:220px;font-size:40px"></div>`,
                ),
        );
        await win.webContents.executeJavaScript(js);
        const check = async (style, expected, label) => {
            const result = await win.webContents.executeJavaScript(`(async()=>{
            const host=document.querySelector('#host');
            Object.assign(host.style,${JSON.stringify(style)});
            await new Promise(resolve=>setTimeout(resolve,150));
            const track=host.firstElementChild.firstElementChild;
            return {copies:track.children.length,animations:track.getAnimations().length};
        })()`);
            assert.equal(result.copies, expected, label);
            if (expected === 1) assert.equal(result.animations, 0, label + ': no stale animation');
        };
        await check({}, 2, 'Narrow container scrolls a long title');
        await check(
            { width: '2000px' },
            1,
            'Container expansion stops scrolling without a window resize',
        );
        await check({ width: '220px' }, 2, 'Container contraction restarts scrolling');
        await check(
            { fontSize: '8px' },
            1,
            'Font metric changes stop scrolling when the title fits',
        );
        fs.writeFileSync(
            '.scratch/text-scrolling-test-result.txt',
            'PASS: title follows container and font size changes, clearing stale animations.',
        );
        win.destroy();
        app.quit();
    })
    .catch((error) => {
        fs.writeFileSync('.scratch/text-scrolling-test-result.txt', error.stack);
        app.exit(1);
    });
