import type {
    SyncedCueLine,
    SynchronizedLyricLine,
    SynchronizedLyrics,
} from '/@/shared/types/domain-types';

type Side = 'left' | 'right';
type Vocal = SyncedCueLine | SynchronizedLyricLine;

export const getNextLyricTime = (lyrics: SynchronizedLyrics, index: number): number => {
    for (let next = index + 1; next < lyrics.length; next += 1) {
        if (lyrics[next].startMs > lyrics[index].startMs) return lyrics[next].startMs;
    }
    return Infinity;
};

// Keep each identified singer on the same side across overlapping phrases.
export const getVocalSides = (lyrics: SynchronizedLyrics): Map<Vocal, Side> => {
    const sides = new Map<Vocal, Side>();
    const agents = new Map<string, Side>();
    const vocals = lyrics
        .flatMap((line, index) =>
            (line.cueLines?.length ? line.cueLines : [line]).map((vocal) => ({
                agent: 'agentId' in vocal ? vocal.agentId : undefined,
                end:
                    'endMs' in vocal
                        ? Math.max(vocal.endMs, ...vocal.words.map((word) => word.endMs))
                        : getNextLyricTime(lyrics, index),
                start: vocal.startMs,
                text: ('value' in vocal ? vocal.value : vocal.text).trim(),
                vocal,
            })),
        )
        .sort((a, b) => a.start - b.start);
    let active: typeof vocals = [];
    for (const current of vocals) {
        active = active.filter((previous) => previous.end > current.start);
        if (!current.text || current.end <= current.start) continue;
        for (const previous of active) {
            if (
                previous.text === current.text ||
                (current.agent && current.agent === previous.agent)
            )
                continue;
            const previousSide =
                sides.get(previous.vocal) ??
                (previous.agent ? agents.get(previous.agent) : undefined) ??
                'left';
            const currentSide =
                sides.get(current.vocal) ??
                (current.agent ? agents.get(current.agent) : undefined) ??
                (previousSide === 'left' ? 'right' : 'left');
            sides.set(previous.vocal, previousSide);
            sides.set(current.vocal, currentSide);
            if (previous.agent) agents.set(previous.agent, previousSide);
            if (current.agent) agents.set(current.agent, currentSide);
        }
        active.push(current);
    }
    return sides;
};
