import clsx from 'clsx';
import { ComponentPropsWithoutRef, memo, useMemo } from 'react';

import styles from './lyric-line.module.css';

import { prepareFloatingLyric } from '/@/renderer/features/lyrics/api/lyric-glyphs';
import { sanitize } from '/@/renderer/utils/sanitize';
import { Box } from '/@/shared/components/box/box';
import { Stack } from '/@/shared/components/stack/stack';

interface LyricLineProps extends ComponentPropsWithoutRef<'div'> {
    alignment: 'center' | 'left' | 'right';
    fontSize: number;
    romajiText?: null | string;
    text?: string;
    translatedText?: null | string;
    wave?: boolean;
}

export const LyricLine = memo(
    ({
        alignment,
        className,
        fontSize,
        romajiText,
        text,
        translatedText,
        wave = false,
        ...props
    }: LyricLineProps) => {
        const lines = useMemo(
            () =>
                (text ?? '')
                    .split('_BREAK_')
                    .map((line) => (wave ? prepareFloatingLyric(line) : sanitize(line))),
            [text, wave],
        );

        const style = useMemo(
            () => ({
                fontSize,
                textAlign: alignment,
            }),
            [fontSize, alignment],
        );

        return (
            <Box className={clsx(styles.lyricLine, className)} style={style} {...props}>
                <Stack gap={0}>
                    {lines.map((line, index) => (
                        <span dangerouslySetInnerHTML={{ __html: line }} key={index} />
                    ))}
                    {romajiText && (
                        <span
                            className={styles.romajiLine}
                            dangerouslySetInnerHTML={{ __html: sanitize(romajiText) }}
                        />
                    )}
                    {translatedText && translatedText !== text && (
                        <span
                            className={styles.translationLine}
                            dangerouslySetInnerHTML={{ __html: sanitize(translatedText) }}
                        />
                    )}
                </Stack>
            </Box>
        );
    },
);

LyricLine.displayName = 'LyricLine';

export const LyricGap = ({
    alignment,
    beforeIndex,
    fontSize,
    startMs,
}: Pick<LyricLineProps, 'alignment' | 'fontSize'> & { beforeIndex: number; startMs: number }) => (
    <Box
        aria-hidden
        className={styles.lyricLine}
        data-gap-start={startMs}
        data-lyric-gap={beforeIndex}
        style={{ fontSize, textAlign: alignment }}
    >
        <span className={styles.gapDots}>
            <span />
            <span />
            <span />
        </span>
    </Box>
);
