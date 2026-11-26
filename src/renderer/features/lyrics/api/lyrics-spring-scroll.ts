type Motion = Sample & {
    cancel: () => void;
    rows: Map<HTMLElement, Sample>;
    updatedAt: number;
};
type Sample = { acceleration: number; position: number; readyAt: number; velocity: number };

const motions = new WeakMap<HTMLElement, Motion>();
const ROW_DELAY_MS = 50;
const SPRING_DURATION_MS = 800;
const KEYFRAME_INTERVAL_MS = 8;

export function animateLyricsSpring(
    container: HTMLElement,
    requestedTarget: number,
    rows: HTMLElement[],
    focusedRow: number,
): () => void {
    const previous = motions.get(container);
    previous?.cancel();
    const startedAt = performance.now();
    const start = container.scrollTop;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const target = Math.min(maxScroll, Math.max(0, requestedTarget));
    const continuing =
        previous && startedAt - previous.updatedAt < 100 && Math.abs(previous.position - start) < 1;
    const initial: Sample = {
        acceleration: continuing ? previous.acceleration : 0,
        position: start,
        readyAt: 0,
        velocity: continuing ? previous.velocity : 0,
    };
    const viewport = container.getBoundingClientRect();
    const travel = target - start;
    const overscan = viewport.height / 4;
    const visibleRows = rows
        .map((row, index) => ({ index, row }))
        .filter(({ row }) => {
            const bounds = row.getBoundingClientRect();
            return (
                bounds.bottom >= viewport.top + Math.min(0, travel) - overscan &&
                bounds.top <= viewport.bottom + Math.max(0, travel) + overscan
            );
        });

    const rowStarts = new Map<HTMLElement, Sample>(
        visibleRows.map(({ index, row }) => {
            const state = continuing ? (previous.rows.get(row) ?? initial) : initial;
            const moving = Math.abs(state.velocity) > 0.1 || Math.abs(state.acceleration) > 0.5;
            const delay = Math.min(8, Math.max(0, index - focusedRow)) * ROW_DELAY_MS;
            const remainingDelay = state.readyAt - (startedAt - (previous?.updatedAt ?? startedAt));
            const readyAt = moving
                ? 0
                : remainingDelay > 0
                  ? Math.min(delay, remainingDelay)
                  : delay;
            return [row, { ...state, readyAt }];
        }),
    );

    // Animate only position on the compositor. Commit the real scroll once when the motion ends.
    const animations = Array.from(rowStarts, ([row, state]) => {
        const duration = SPRING_DURATION_MS + state.readyAt;
        const count = Math.ceil(duration / KEYFRAME_INTERVAL_MS);
        const keyframes = Array.from({ length: count + 1 }, (_, index) => {
            const fraction = index / count;
            const position =
                index === count
                    ? target
                    : sampleSpring(state, target, fraction * duration).position;
            return { offset: fraction, translate: `0 ${start - position}px` };
        });
        return { animation: row.animate(keyframes, { duration, fill: 'both' }), duration };
    });
    if (!animations.length) {
        container.scrollTop = target;
        motions.delete(container);
        return () => {};
    }

    const last = animations.reduce((longest, item) =>
        item.duration > longest.duration ? item : longest,
    ).animation;
    let stopped = false;
    const commitScroll = (position: number) => {
        container.scrollTop = Math.min(maxScroll, Math.max(0, position));
        for (const { animation } of animations) animation.cancel();
    };
    const motion: Motion = {
        ...initial,
        cancel: () => {
            if (stopped) return;
            stopped = true;
            const elapsed = Number(last.currentTime ?? 0);
            Object.assign(motion, sampleSpring(initial, target, elapsed));
            motion.updatedAt = performance.now();
            for (const [row, state] of rowStarts) {
                const sample = sampleSpring(state, target, elapsed);
                motion.rows.set(row, { ...sample, readyAt: Math.max(0, state.readyAt - elapsed) });
            }
            commitScroll(motion.position);
        },
        rows: new Map(),
        updatedAt: startedAt,
    };
    motions.set(container, motion);
    last.onfinish = () => {
        if (stopped) return;
        stopped = true;
        commitScroll(target);
        motions.delete(container);
    };
    return motion.cancel;
}

function sampleSpring(initial: Sample, target: number, timeMs: number): Sample {
    const time = Math.max(0, timeMs - initial.readyAt) / 1000;
    // Third-order spring. Carry velocity and acceleration into the next phrase.
    const damping = 19.2;
    const displacement = initial.position - target;
    const linear = initial.velocity + damping * displacement;
    const quadratic =
        (initial.acceleration + 2 * damping * initial.velocity + damping * damping * displacement) /
        2;
    const position = displacement + linear * time + quadratic * time * time;
    const velocity = linear + 2 * quadratic * time;
    const decay = Math.exp(-damping * time);
    return {
        acceleration:
            (2 * quadratic - 2 * damping * velocity + damping * damping * position) * decay,
        position: target + position * decay,
        readyAt: initial.readyAt,
        velocity: (velocity - damping * position) * decay,
    };
}
