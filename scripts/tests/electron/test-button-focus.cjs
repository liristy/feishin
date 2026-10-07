/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node node_modules/electron/cli.js scripts/tests/electron/test-button-focus.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/shared/hooks/use-button-focus.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

app.setPath('userData', path.resolve('.scratch/button-focus-profile'));
app.whenReady()
    .then(async () => {
        const win = new BrowserWindow({ show: false });
        await win.loadURL(
            'data:text/html,' +
                encodeURIComponent(`<div id="root">
                <button id="plain"><svg><path id="icon" d="M0 0H10"/></svg></button>
                <div id="role" role="button" tabindex="0">Custom button</div>
                <a id="link" data-button-control href="#">Link button</a>
                <input id="submit" type="submit"/>
                <input id="reset" type="reset"/>
                <input id="input-button" type="button"/>
                <input id="text"/><input id="checkbox" type="checkbox"/>
                <button id="dialog">Open dialog</button></div>
                <div id="portal"><button id="portal-button">Portal button</button></div>`),
        );
        const result = await win.webContents.executeJavaScript(`(() => {
            const exports = {};
            let cleanup;
            const require = () => ({useEffect: effect => {cleanup = effect();}});
            ${source}
            exports.useButtonFocus();
            const get = id => document.getElementById(id);
            const click = (node, detail) => node.dispatchEvent(new MouseEvent('click', {
                bubbles:true, cancelable:true, detail,
            }));
            const cases = [];
            for (const id of ['plain','role','link','submit','reset','input-button','portal-button']) {
                for (const detail of [0,1,2]) {
                    const button = get(id);
                    button.focus();
                    click(id === 'plain' ? get('icon') : button, detail);
                    cases.push({id,detail,focused:document.activeElement === button});
                }
            }
            const plain = get('plain');
            let focusedDuringAction;
            plain.addEventListener('click', event => {
                event.stopPropagation();
                focusedDuringAction = document.activeElement === plain;
            });
            plain.focus();
            click(plain,1);
            const clearedBeforeAction = !focusedDuringAction;
            const inputFocus = ['text','checkbox'].map(id => {
                const input = get(id);
                input.focus();
                click(input,1);
                return document.activeElement === input;
            });
            get('dialog').addEventListener('click', () => get('text').focus());
            get('dialog').focus();
            click(get('dialog'),1);
            const dialogInputFocused = document.activeElement === get('text');
            cleanup();
            plain.focus();
            click(plain,1);
            return {cases,clearedBeforeAction,inputFocus,dialogInputFocused,
                cleanedUp:document.activeElement === plain};
        })()`);
        for (const item of result.cases) {
            assert.equal(item.focused, item.detail === 0, `${item.id}: keep only keyboard focus`);
        }
        assert.ok(result.clearedBeforeAction, 'Clear focus before window actions');
        assert.ok(result.inputFocus.every(Boolean), 'Inputs retain their focus');
        assert.ok(result.dialogInputFocused, 'Dialog actions can focus an input');
        assert.ok(result.cleanedUp, 'Unmount removes the document listener');
        console.log('Pointer button focus, keyboard focus, portals, inputs and cleanup passed.');
        app.quit();
    })
    .catch((error) => {
        console.error(error);
        app.exit(1);
    });
