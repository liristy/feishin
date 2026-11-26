import type { SynchronizedLyrics } from '/@/shared/types/domain-types';

export const lrcTimestampMs = (minutes: string, seconds: string, fraction = ''): number =>
    (Number(minutes) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, '0'));

// Servers may remove the line timestamps while leaving ELRC word tags in the text.
export const parseEnhancedLrc = (lyrics: SynchronizedLyrics): SynchronizedLyrics =>
    lyrics.map((line, index) => {
        if (line.cueLines?.length) {
            return line;
        }

        const tags = Array.from(line.text.matchAll(/<(\d+):([0-5]\d)(?:\.(\d{1,3}))?>/g));
        if (!tags.length) {
            return line;
        }

        const text = line.text.replaceAll(/<(\d+):([0-5]\d)(?:\.(\d{1,3}))?>/g, '');
        const boundaries = tags.map((tag) => ({
            end: tag.index + tag[0].length,
            index: tag.index,
            startMs: lrcTimestampMs(tag[1], tag[2], tag[3]),
        }));
        const prefix = line.text.slice(0, tags[0].index);
        if (prefix.trim()) {
            boundaries.unshift({ end: 0, index: 0, startMs: line.startMs });
        }

        // Invalid timing still displays readable lyrics without broken karaoke intervals.
        if (boundaries.some((tag, i) => i > 0 && tag.startMs < boundaries[i - 1].startMs)) {
            return { ...line, text };
        }

        const words = boundaries.flatMap((tag, i) => {
            const next = boundaries[i + 1];
            const wordText =
                (i === 0 && !prefix.trim() ? prefix : '') + line.text.slice(tag.end, next?.index);
            if (!wordText) {
                return [];
            }

            // ELRC has no required end tag. Use the next line, or one second for the final word.
            const nextLineStart = lyrics[index + 1]?.startMs;
            const endMs =
                next?.startMs ??
                (nextLineStart !== undefined && nextLineStart > tag.startMs
                    ? nextLineStart
                    : tag.startMs + 1000);
            return [{ endMs, startMs: tag.startMs, text: wordText }];
        });

        return {
            ...line,
            ...(words.length && {
                cueLines: [
                    {
                        endMs: words[words.length - 1].endMs,
                        index,
                        startMs: line.startMs,
                        value: text,
                        words,
                    },
                ],
            }),
            text,
        };
    });
