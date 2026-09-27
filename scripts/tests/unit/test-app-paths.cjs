/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

test('renaming the app preserves existing data and explicit profile paths', () => {
    const root = path.resolve(__dirname, '../../..');
    const source = fs.readFileSync(path.join(root, 'src/main/app-paths.ts'), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const appData = path.resolve('profiles');
    const legacyPath = path.join(appData, 'feishin');
    const customPath = path.join(appData, 'custom');

    for (const [initialPath, expectedPath] of [
        [path.join(appData, 'qMusic'), legacyPath],
        [legacyPath, legacyPath],
        [customPath, customPath],
    ]) {
        let userData = initialPath;
        const app = {
            getName: () => 'qMusic',
            getPath: (name) => (name === 'appData' ? appData : userData),
            setPath: (name, value) => {
                assert.equal(name, 'userData');
                userData = value;
            },
        };
        vm.runInNewContext(compiled, {
            exports: {},
            require: (name) => (name === 'electron' ? { app } : require(name)),
        });
        assert.equal(userData, expectedPath);
    }

    const entry = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
    assert.ok(entry.startsWith("import './app-paths';"));
});
