/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run: node --test scripts/tests/unit/test-lyrics-spring.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

test('lyric rows glide in sequence and retain velocity on a consecutive line', () => {
    let now = 0;
    const animations = new Set();
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(
            fs.readFileSync('src/renderer/features/lyrics/api/lyrics-spring-scroll.ts', 'utf8'),
            {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
            },
        ).outputText,
        {
            exports,
            performance: { now: () => now },
        },
    );
    let scrollTop = 100;
    let scrollReads = 0;
    const container = {
        clientHeight: 600,
        getBoundingClientRect: () => ({ bottom: 600, height: 600, top: 0 }),
        scrollHeight: 1080,
        get scrollTop() {
            scrollReads++;
            return scrollTop;
        },
        set scrollTop(value) {
            scrollTop = value;
        },
    };
    const rows = Array.from({ length: 6 }, (_, index) => {
        let active;
        return {
            animate(keyframes, { duration }) {
                const start = now;
                const y = (frame) => parseFloat(frame.translate.split(' ')[1]);
                const animation = {
                    duration,
                    get currentTime() { return Math.min(duration, now - start); },
                    offset() {
                        const frame = this.currentTime / duration * (keyframes.length - 1);
                        const low = Math.floor(frame);
                        const high = Math.min(low + 1, keyframes.length - 1);
                        return y(keyframes[low]) + (y(keyframes[high]) - y(keyframes[low])) * (frame - low);
                    },
                    cancel() { animations.delete(animation); if (active === animation) active = undefined; },
                };
                active = animation;
                animations.add(animation);
                return animation;
            },
            getBoundingClientRect: () => ({ bottom: (index + 1) * 80, top: index * 80 }),
            offset: () => active?.offset() ?? 0,
        };
    });
    const advance = (milliseconds) => {
        now = milliseconds;
        for (const animation of [...animations]) {
            if (animation.currentTime >= animation.duration) animation.onfinish?.();
        }
    };
    const offset = (row) => row.offset();
    const cancel = exports.animateLyricsSpring(container, 200, rows, 0);
    const startingReads = scrollReads;
    advance(33);
    assert.equal(scrollReads, startingReads, 'Animation frames do not read scroll position after writing');
    assert.equal(container.scrollTop, 100, 'Real scroll is committed once, after the animation');
    const initialMovement = -offset(rows[0]);
    assert.ok(
        initialMovement > 0 && initialMovement < 7,
        'Gentle start instead of an immediate jump',
    );
    advance(80);
    assert.ok(offset(rows[4]) > offset(rows[1]), 'Later rows follow later');
    advance(200);
    const rowPosition = container.scrollTop - offset(rows[4]);
    cancel();
    const position = container.scrollTop;
    exports.animateLyricsSpring(container, 300, rows, 1);
    assert.equal(container.scrollTop, position);
    assert.ok(
        Math.abs(container.scrollTop - offset(rows[4]) - rowPosition) < 0.1,
        'Retarget preserves every row position',
    );
    advance(216);
    assert.ok(
        -offset(rows[0]) > initialMovement,
        'The next line retains motion instead of restarting from rest',
    );
    advance(2700);
    assert.equal(container.scrollTop, 300);
    assert.ok(rows.every((row) => offset(row) === 0));
    assert.equal(animations.size, 0);

    // Tracked glyph positions in the supplied Apple Music recording, normalized
    // to a 143px line advance with pickup at 5.183s. Check phrasing, not frame rate.
    advance(3000);
    exports.animateLyricsSpring(container, 443, rows, 0);
    const reference = [
        [17, 143],
        [50, 133],
        [84, 112],
        [117, 86],
        [150, 65],
        [184, 46],
        [217, 31],
        [250, 21],
        [284, 13],
        [317, 8],
        [350, 5],
        [384, 3],
        [417, 1],
    ];
    for (const [elapsed, remaining] of reference) {
        advance(3000 + elapsed);
        assert.ok(
            Math.abs(443 - (container.scrollTop - offset(rows[0])) - remaining) < 2,
            `The reference pickup and landing match at ${elapsed}ms`,
        );
        if (elapsed === 317) {
            assert.ok(
                Math.abs(443 - (container.scrollTop - offset(rows[2])) - 31) < 2,
                'The third row has the same rise, delayed by 100ms',
            );
            assert.ok(
                Math.abs(443 - (container.scrollTop - offset(rows[4])) - 86) < 2,
                'The fifth row follows 200ms later instead of bunching up',
            );
        }
    }
    advance(4200);
    assert.equal(container.scrollTop, 443);
    assert.equal(animations.size, 0);
});
