/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node scripts/test-cover-flow-image.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let stored = null;
let effect;
const images = [];
const canvases = [];
const warnings = [];
const moduleUnderTest = { exports: {} };
const source = fs.readFileSync(
    'src/renderer/features/player/hooks/use-cover-flow-image.ts',
    'utf8',
);
vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    {
        document: {
            createElement: () => {
                const canvas = {
                    context: {
                        drawImage: (...args) => {
                            canvas.draw = args;
                        },
                    },
                    getContext: () => canvas.context,
                    toDataURL: () => `data:image/png;base64,texture${canvases.length}`,
                };
                canvases.push(canvas);
                return canvas;
            },
        },
        exports: moduleUnderTest.exports,
        Image: class {
            constructor() {
                images.push(this);
            }
        },
        require: (id) => {
            if (id === 'react')
                return {
                    useEffect: (fn) => {
                        effect = fn;
                    },
                    useState: () => [
                        stored,
                        (value) => {
                            stored = value;
                        },
                    ],
                };
            return { logger: { warn: (message) => warnings.push(message) } };
        },
    },
);
const { useCoverFlowImage } = moduleUnderTest.exports;
assert.equal(useCoverFlowImage('cover-one', 6), null);
const cleanup = effect();
images[0].onload();
assert.equal(canvases[0].width, 64);
assert.equal(canvases[0].height, 64);
assert.match(canvases[0].context.filter, /blur\(3px\) saturate\(1.8\)/);
assert.match(useCoverFlowImage('cover-one', 6), /^data:image\/png/);
assert.equal(canvases.length, 1, 'Renders must reuse the prepared texture');
assert.equal(useCoverFlowImage('cover-two', 6), null, 'Do not display the previous album texture');
const staleOnLoad = images[0].onload;
cleanup();
staleOnLoad();
assert.equal(canvases.length, 1, 'Ignore image completion after cleanup');
effect();
images[1].onload();
assert.match(useCoverFlowImage('cover-two', 6), /texture2$/);
assert.equal(useCoverFlowImage(null, 6), null, 'Disabled flow must not keep rendering');
assert.equal(effect(), undefined);
assert.equal(useCoverFlowImage('broken-cover', 6), null);
effect();
images[2].onerror();
assert.equal(warnings.length, 1);
assert.doesNotMatch(warnings[0], /broken-cover/, 'Diagnostics must not expose artwork URLs');
useCoverFlowImage('remote-cover', 6, 'hash-preview');
effect();
images[3].onerror();
assert.equal(
    images[3].src,
    'hash-preview',
    'Failed original cover must fall back to the local preview',
);
images[3].onload();
assert.match(useCoverFlowImage('remote-cover', 6, 'hash-preview'), /texture3$/);
images[3].onerror();
assert.equal(warnings.length, 2, 'A failed fallback must not retry indefinitely');
console.log(
    'Cover texture is bounded, baked once, updates safely and handles disabled/failed artwork.',
);
