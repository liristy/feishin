/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run: node scripts/tests/unit/test-lyrics-vocals.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(
    ts.transpileModule(
        fs.readFileSync('src/renderer/features/lyrics/api/lyrics-vocals.ts', 'utf8'),
        {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        },
    ).outputText,
    { exports: exported },
);
const { getVocalSides } = exported;
const line = (startMs, endMs, text) => ({
    cueLines: [{ endMs, index: 0, startMs, value: text, words: [] }],
    startMs,
    text,
});
const serial = [
    line(1000, 1020, '男：'),
    line(1020, 2000, '第一句'),
    line(2000, 2020, '女：'),
    line(2020, 3000, '第二句'),
];
assert.equal(
    getVocalSides(serial).size,
    0,
    'Speaker labels alone never imply simultaneous singing',
);
const parallel = [line(1000, 3000, '第一句'), line(2000, 4000, '第二句')];
assert.deepEqual(
    Array.from(getVocalSides(parallel).values()),
    ['left', 'right'],
    'Overlapping intervals work without singer labels',
);
assert.equal(
    getVocalSides([line(1000, 2000, '第一句'), line(2000, 3000, '第二句')]).size,
    0,
    'Touching intervals are sequential',
);
console.log('Only overlapping vocal intervals create the duet layout.');
