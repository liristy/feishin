/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node scripts/test-player-waveform.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsUnderTest = {};
vm.runInNewContext(
    ts.transpileModule(
        fs.readFileSync('src/renderer/features/player/utils/player-waveform.ts', 'utf8'),
        {
            compilerOptions: { module: ts.ModuleKind.CommonJS },
        },
    ).outputText,
    { exports: exportsUnderTest },
);
const { getPlayerWaveformEnergy, setPlayerWaveform } = exportsUnderTest;
const samples = new Float32Array(2000);
samples.fill(0.05, 0, 1000);
samples.fill(0.3, 1000);
const audio = {
    getChannelData: () => samples,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate: 1000,
};
const releaseOld = setPlayerWaveform('old', audio);
const release = setPlayerWaveform('current', audio);
releaseOld();
assert.equal(getPlayerWaveformEnergy('old', 0), 0);
const quiet = getPlayerWaveformEnergy('current', 0);
const loud = getPlayerWaveformEnergy('current', 1);
assert.ok(
    quiet > 0 && loud > quiet * 4 && loud <= 1,
    'Energy must follow the waveform at the playback position',
);
for (const position of [-1, NaN, Infinity, 3])
    assert.equal(getPlayerWaveformEnergy('current', position), 0);
release();
assert.equal(getPlayerWaveformEnergy('current', 1), 0);
console.log('Waveform energy follows playback position and rejects stale or missing audio.');
