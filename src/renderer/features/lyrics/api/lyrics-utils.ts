import {
    LyricsKind,
    LyricsResponse,
    StructuredLyric,
    SyncedCueLine,
    SyncedWordCue,
    SynchronizedLyricLine,
    SynchronizedLyrics,
    SynchronizedLyricsLineTuple,
} from '/@/shared/types/domain-types';

export const isLyricsLineTuple = (
    line: SynchronizedLyricLine | SynchronizedLyricsLineTuple,
): line is SynchronizedLyricsLineTuple => Array.isArray(line);

export const normalizeLyricsLine = (
    line: SynchronizedLyricLine | SynchronizedLyricsLineTuple,
): SynchronizedLyricLine => {
    if (isLyricsLineTuple(line)) {
        return { startMs: line[0], text: line[1] ?? '' };
    }

    return {
        ...line,
        text: line.text ?? '',
    };
};

export const normalizeLyrics = (
    lyrics: SynchronizedLyrics | SynchronizedLyricsLineTuple[],
): SynchronizedLyrics => lyrics.map(normalizeLyricsLine);

export const getLyricLineStartMs = (
    line: SynchronizedLyricLine | SynchronizedLyricsLineTuple,
): number => normalizeLyricsLine(line).startMs;

export const getLyricLineText = (
    line: SynchronizedLyricLine | SynchronizedLyricsLineTuple,
): string => normalizeLyricsLine(line).text ?? '';

export const getCurrentLyricIndex = (lyrics: SynchronizedLyrics, timeInMs: number): number => {
    if (!lyrics.length) {
        return -1;
    }

    let index = -1;
    for (let idx = 0; idx < lyrics.length; idx += 1) {
        if (timeInMs < getLyricLineStartMs(lyrics[idx])) {
            break;
        }
        index = idx;
    }

    return index;
};

export const getCurrentWordIndex = (cueLine: SyncedCueLine, timeInMs: number): number => {
    if (!cueLine.words.length) {
        return -1;
    }

    for (let wordIndex = 0; wordIndex < cueLine.words.length; wordIndex += 1) {
        const word = cueLine.words[wordIndex];
        if (timeInMs >= word.startMs && timeInMs < word.endMs) {
            return wordIndex;
        }
    }

    return -1;
};

export const getWordProgress = (word: SyncedWordCue, timeInMs: number): number => {
    const duration = word.endMs - word.startMs;

    if (duration <= 0) {
        return timeInMs >= word.endMs ? 100 : 0;
    }

    const elapsed = Math.max(0, Math.min(duration, timeInMs - word.startMs));
    return (elapsed / duration) * 100;
};

export const getLineEndMs = (line: SynchronizedLyricLine): number => {
    if (!line.cueLines?.length) {
        return line.startMs;
    }

    let endMs = line.startMs;

    for (const cueLine of line.cueLines) {
        endMs = Math.max(endMs, cueLine.endMs);

        for (const word of cueLine.words) {
            endMs = Math.max(endMs, word.endMs);
        }
    }

    return endMs;
};

export const hasLyricText = ({ cueLines, text }: SynchronizedLyricLine): boolean =>
    !!(text.replaceAll('_BREAK_', '').trim() || cueLines?.some((cue) => cue.value.trim()));

export const getLyricGaps = (
    lyrics: SynchronizedLyrics,
): Map<number, { endMs: number; startMs: number }> => {
    const gaps = new Map<number, { endMs: number; startMs: number }>();
    let hasPreviousLine = false;
    let timedEndMs = 0;
    let estimatedEndMs = 0;
    let blankStartMs: number | undefined;

    lyrics.forEach((line, index) => {
        if (!hasLyricText(line)) {
            blankStartMs ??= line.startMs;
            return;
        }

        const startMs = Math.max(timedEndMs, blankStartMs ?? estimatedEndMs);
        const gapStartMs = hasPreviousLine ? startMs : 0;
        const duration = line.startMs - gapStartMs;
        if (duration > 0 && (!hasPreviousLine || blankStartMs !== undefined || duration >= 3000)) {
            gaps.set(index, { endMs: line.startMs, startMs: gapStartMs });
        }

        const endMs = getLineEndMs(line);
        timedEndMs = Math.max(timedEndMs, endMs);
        // ponytail: line-only lyrics have no vocal end. Allow five seconds for the phrase and
        // use cue ends or explicit blank timestamps when the provider supplies them.
        estimatedEndMs = endMs > line.startMs ? endMs : line.startMs + 5000;
        hasPreviousLine = true;
        blankStartMs = undefined;
    });

    return gaps;
};

export const lyricsHasWordCues = (lyrics: SynchronizedLyrics): boolean =>
    lyrics.some((line) => line.cueLines?.some((cueLine) => cueLine.words.length > 0));

export const splitInlineLyricsTranslation = (lyrics: LyricsResponse) => {
    const lines = typeof lyrics === 'string' ? lyrics.split('\n') : lyrics.map(getLyricLineText);
    const splitLines = lines.map((line) => line.split('_BREAK_'));
    const translation = splitLines.map(([, ...parts]) => parts.join(' ').trim()).join('\n');
    if (!translation.trim()) return null;

    return {
        lyrics:
            typeof lyrics === 'string'
                ? splitLines.map(([text]) => text).join('\n')
                : lyrics.map((line, index) => ({ ...line, text: splitLines[index][0] })),
        translation,
    };
};

export const alignTranslationLyrics = (
    lyrics: SynchronizedLyrics,
    translation: SynchronizedLyrics,
): null | SynchronizedLyrics => {
    const matches = new Map<number, { distance: number; line: SynchronizedLyricLine }>();
    const orderedLyrics = lyrics
        .map(({ startMs }, index) => ({ index, startMs }))
        .sort((a, b) => a.startMs - b.startMs);
    const orderedTranslation = [...translation].sort((a, b) => a.startMs - b.startMs);
    let mainIndex = 0;

    // Match nearby timestamps across different lyric versions without carrying a translation over.
    for (const line of orderedTranslation) {
        if (!line.text.trim() || !orderedLyrics.length) continue;

        while (
            mainIndex + 1 < orderedLyrics.length &&
            orderedLyrics[mainIndex + 1].startMs <= line.startMs
        ) {
            mainIndex++;
        }
        const current = orderedLyrics[mainIndex];
        const next = orderedLyrics[mainIndex + 1];
        const match =
            next && Math.abs(next.startMs - line.startMs) < Math.abs(current.startMs - line.startMs)
                ? next
                : current;
        const distance = Math.abs(match.startMs - line.startMs);
        const previous = matches.get(match.index);
        if (distance <= 1500 && (!previous || distance < previous.distance)) {
            matches.set(match.index, { distance, line: { ...line, startMs: match.startMs } });
        }
    }

    return matches.size
        ? lyrics.map(({ startMs }, index) => matches.get(index)?.line ?? { startMs, text: '' })
        : null;
};

export const findOverlayLineMatchByTime = (
    overlayLyrics: null | SynchronizedLyrics | undefined,
    startMs: number,
    lineIndex?: number,
): SynchronizedLyricLine | undefined => {
    if (!overlayLyrics?.length) {
        return undefined;
    }

    if (lineIndex !== undefined && lineIndex >= 0 && lineIndex < overlayLyrics.length) {
        const indexedLine = normalizeLyricsLine(overlayLyrics[lineIndex]);
        if (indexedLine.startMs <= startMs) {
            return indexedLine;
        }
    }

    let match: SynchronizedLyricLine | undefined;

    for (const rawLine of overlayLyrics) {
        const line = normalizeLyricsLine(rawLine);
        if (line.startMs <= startMs) {
            match = line;
            continue;
        }

        break;
    }

    return match;
};

export const findOverlayLineByTime = (
    overlayLyrics: null | SynchronizedLyrics | undefined,
    startMs: number,
    lineIndex?: number,
): string | undefined => findOverlayLineMatchByTime(overlayLyrics, startMs, lineIndex)?.text;

export const overlayLineHasWordCues = (line: SynchronizedLyricLine | undefined): boolean =>
    !!line?.cueLines?.some((cueLine) => cueLine.words.length > 0);

export const getOverlayCueLinesForLine = (
    overlayLyrics: null | SynchronizedLyrics | undefined,
    mainLineStartMs: number,
    lineIndex?: number,
): null | SyncedCueLine[] => {
    const match = findOverlayLineMatchByTime(overlayLyrics, mainLineStartMs, lineIndex);

    if (!match?.cueLines?.length || !overlayLineHasWordCues(match)) {
        return null;
    }

    return match.cueLines;
};

export type LyricsLayers = {
    main: StructuredLyric[];
    others: StructuredLyric[];
    overlayLayers: StructuredLyric[];
    pronunciation: null | StructuredLyric;
    translation: null | StructuredLyric;
};

const getStructuredKind = (lyric: StructuredLyric): LyricsKind => lyric.kind ?? 'main';

export const getLyricsLayers = (local: StructuredLyric[]): LyricsLayers => {
    const main: StructuredLyric[] = [];
    const others: StructuredLyric[] = [];
    const overlayLayers: StructuredLyric[] = [];
    let pronunciation: null | StructuredLyric = null;
    let translation: null | StructuredLyric = null;

    for (const lyric of local) {
        const kind = getStructuredKind(lyric);

        if (kind === 'main') {
            main.push(lyric);
        } else {
            others.push(lyric);

            if (lyric.synced) {
                overlayLayers.push(lyric);
            }
        }

        if (kind === 'translation' && !translation) {
            translation = lyric;
        }

        if (kind === 'pronunciation' && !pronunciation) {
            pronunciation = lyric;
        }
    }

    return { main, others, overlayLayers, pronunciation, translation };
};

export const getSelectedStructuredIndex = (
    local: StructuredLyric[],
    selectedIndex?: number,
): number => {
    if (selectedIndex !== undefined) {
        const index = Math.min(selectedIndex, local.length - 1);
        const selected = local[index];
        if (selected && getStructuredKind(selected) === 'main') return index;
    }

    const mainIndex = local.findIndex(
        (lyric) => lyric.synced && getStructuredKind(lyric) === 'main',
    );

    if (mainIndex >= 0) return mainIndex;

    return Math.max(
        0,
        local.findIndex((lyric) => getStructuredKind(lyric) === 'main'),
    );
};

export const getOverlayLayerKey = (lyric: StructuredLyric): string => {
    const kind = getStructuredKind(lyric);
    return `${kind}:${lyric.lang}`;
};

export const formatStructuredLyricLabel = (lyric: StructuredLyric): string => {
    const kind = getStructuredKind(lyric);
    return kind === 'main' ? lyric.lang : `${lyric.lang} (${kind})`;
};
