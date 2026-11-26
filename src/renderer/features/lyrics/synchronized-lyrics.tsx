import clsx from 'clsx';
import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react';

import styles from './synchronized-lyrics.module.css';

import '/@/renderer/features/lyrics/styles/synchronized-lyrics-animation.css';
import {
    findOverlayLineByTime,
    getLyricGaps,
    getLyricLineStartMs,
    getLyricLineText,
    hasLyricText,
    normalizeLyrics,
} from '/@/renderer/features/lyrics/api/lyrics-utils';
import { LyricsScrollContent } from '/@/renderer/features/lyrics/components/lyrics-scroll-content';
import { useLyricsAnimationEngine } from '/@/renderer/features/lyrics/hooks/use-lyrics-animation-engine';
import {
    LYRICS_SCROLL_CONTAINER_ID,
    useSynchronizedLyricsBase,
} from '/@/renderer/features/lyrics/hooks/use-synchronized-lyrics-base';
import { LyricGap, LyricLine } from '/@/renderer/features/lyrics/lyric-line';
import { subscribePlayerStatus, usePlayerStoreBase } from '/@/renderer/store';
import { subscribePlayerProgress, useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import {
    FullLyricsMetadata,
    SynchronizedLyrics as SynchronizedLyricsData,
} from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

export interface SynchronizedLyricsProps extends Omit<FullLyricsMetadata, 'lyrics'> {
    extraOverlayLyrics?: SynchronizedLyricsData[];
    lyrics: SynchronizedLyricsData;
    offsetMs?: number;
    preview?: boolean;
    pronunciationLyrics?: null | SynchronizedLyricsData;
    romajiLyrics?: null | SynchronizedLyricsData;
    settingsKey?: string;
    style?: React.CSSProperties;
    translatedLyrics?: null | string;
    translationLyrics?: null | SynchronizedLyricsData;
}

const SEEK_DETECT_THRESHOLD_MS = 500;
const PREVIEW_FONT_SIZE = 20;
const PREVIEW_GAP = 20;

export const SynchronizedLyrics = ({
    artist,
    lyrics,
    name,
    offsetMs,
    preview = false,
    pronunciationLyrics,
    romajiLyrics,
    settingsKey = 'default',
    source,
    style,
    translatedLyrics,
    translationLyrics,
}: SynchronizedLyricsProps) => {
    const {
        containerRef,
        containerStyle,
        delayMsRef,
        followRef,
        followScrollAlignmentRef,
        handleLineClick,
        hideScrollbar,
        lineLeadTimeMsRef,
        lyricRef,
        resumeAutoscroll,
        scrollAnimStateRef,
        settings,
        showScrollbar,
        userScrollingRef,
    } = useSynchronizedLyricsBase(settingsKey, offsetMs);

    const effectiveFontSize = preview ? PREVIEW_FONT_SIZE : settings.fontSize;
    const effectiveGap = preview ? PREVIEW_GAP : settings.gap;
    const effectivePaddingLeft = preview ? 0 : settings.paddingLeft;
    const effectivePaddingRight = preview ? 0 : settings.paddingRight;

    const normalizedLyrics = useMemo(() => normalizeLyrics(lyrics), [lyrics]);
    const gaps = useMemo(
        () => (preview ? undefined : getLyricGaps(normalizedLyrics)),
        [normalizedLyrics, preview],
    );
    const rafRef = useRef<null | number>(null);
    const statusRef = useRef(usePlayerStoreBase.getState().player.status);
    const lastSyncedTimeRef = useRef(0);
    const playbackAnchorRef = useRef({
        // eslint-disable-next-line react-hooks/purity
        eventCreationTime: Date.now(),
        timeMs: useTimestampStoreBase.getState().timestamp * 1000,
    });

    const {
        rebuildLyricsData,
        reset,
        resumeAutoscroll: resumeEngineAutoscroll,
        tick,
    } = useLyricsAnimationEngine({
        animStateRef: scrollAnimStateRef,
        containerRef,
        followRef,
        followScrollAlignmentRef,
        fontSize: effectiveFontSize,
        gap: effectiveGap,
        lineIdPrefix: 'lyric',
        lineLeadTimeMsRef,
        lyrics: normalizedLyrics,
        paddingLeft: effectivePaddingLeft,
        paddingRight: effectivePaddingRight,
        scrollContainerId: LYRICS_SCROLL_CONTAINER_ID,
        userScrollingRef,
    });

    const syncAtTime = useCallback(
        (
            timeInMs: number,
            isPlaying: boolean,
            options?: { eventCreationTime?: number; forceReset?: boolean; forceResync?: boolean },
        ) => {
            if (options?.forceReset) {
                reset();
                rebuildLyricsData();
            }

            const eventCreationTime = options?.eventCreationTime ?? Date.now();
            tick(timeInMs, isPlaying, { eventCreationTime, forceResync: options?.forceResync });
            lastSyncedTimeRef.current = timeInMs + (isPlaying ? Date.now() - eventCreationTime : 0);
        },
        [rebuildLyricsData, reset, tick],
    );

    const updatePlaybackAnchor = useCallback((timestampSec: number) => {
        playbackAnchorRef.current = { eventCreationTime: Date.now(), timeMs: timestampSec * 1000 };
    }, []);

    const stopRaf = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const startRaf = useCallback(() => {
        stopRaf();

        const runTick = () => {
            if (statusRef.current !== PlayerStatus.PLAYING) {
                stopRaf();
                return;
            }

            const anchor = playbackAnchorRef.current;
            syncAtTime(anchor.timeMs + delayMsRef.current, true, {
                eventCreationTime: anchor.eventCreationTime,
            });

            rafRef.current = requestAnimationFrame(runTick);
        };

        rafRef.current = requestAnimationFrame(runTick);
    }, [delayMsRef, stopRaf, syncAtTime]);

    const syncFromCurrentTimestamp = useCallback(() => {
        const timestamp = useTimestampStoreBase.getState().timestamp;
        updatePlaybackAnchor(timestamp);
        const isPlaying = statusRef.current === PlayerStatus.PLAYING;
        syncAtTime(timestamp * 1000 + delayMsRef.current, isPlaying, {
            forceReset: true,
            forceResync: true,
        });
    }, [delayMsRef, syncAtTime, updatePlaybackAnchor]);

    useEffect(() => {
        lyricRef.current = normalizedLyrics;
        lastSyncedTimeRef.current = 0;

        const frame = requestAnimationFrame(() => {
            rebuildLyricsData();

            if (statusRef.current === PlayerStatus.PLAYING) {
                startRaf();
            } else {
                syncFromCurrentTimestamp();
            }
        });

        return () => {
            cancelAnimationFrame(frame);
            stopRaf();
            reset();
        };
    }, [
        lyricRef,
        normalizedLyrics,
        rebuildLyricsData,
        reset,
        startRaf,
        stopRaf,
        syncFromCurrentTimestamp,
    ]);

    useEffect(() => {
        syncFromCurrentTimestamp();
    }, [offsetMs, syncFromCurrentTimestamp]);

    useEffect(() => {
        statusRef.current = usePlayerStoreBase.getState().player.status;

        const unsubscribe = subscribePlayerStatus(({ status }) => {
            statusRef.current = status;

            if (status !== PlayerStatus.PLAYING) {
                stopRaf();
                syncFromCurrentTimestamp();
                return;
            }

            syncFromCurrentTimestamp();
            startRaf();
        });

        return unsubscribe;
    }, [startRaf, stopRaf, syncFromCurrentTimestamp]);

    useEffect(() => {
        const unsubscribe = subscribePlayerProgress(({ timestamp }) => {
            const timeInMs = timestamp * 1000 + delayMsRef.current;
            const isPlaying = statusRef.current === PlayerStatus.PLAYING;
            const isSeek =
                lastSyncedTimeRef.current > 0 &&
                Math.abs(timeInMs - lastSyncedTimeRef.current) > SEEK_DETECT_THRESHOLD_MS;
            updatePlaybackAnchor(timestamp);

            if (!isPlaying) {
                syncAtTime(timeInMs, false, { forceReset: true, forceResync: true });
                return;
            }

            if (isSeek) {
                syncAtTime(timeInMs, true, {
                    eventCreationTime: playbackAnchorRef.current.eventCreationTime,
                    forceReset: true,
                    forceResync: true,
                });
            }
        });

        return unsubscribe;
    }, [delayMsRef, syncAtTime, updatePlaybackAnchor]);

    const handleContainerClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if ((event.target as HTMLElement).closest('[data-lyric-time]')) {
                resumeAutoscroll();
                resumeEngineAutoscroll();
                handleLineClick(event);
            }
        },
        [handleLineClick, resumeAutoscroll, resumeEngineAutoscroll],
    );

    const getOverlayText = (
        overlayLyrics: null | SynchronizedLyricsData | undefined,
        startMs: number,
        lineIndex: number,
        fallback?: null | string,
    ) => {
        if (overlayLyrics) {
            return findOverlayLineByTime(overlayLyrics, startMs, lineIndex);
        }

        return fallback;
    };

    return (
        <div
            className={clsx(
                styles.container,
                preview && styles.preview,
                'synchronized-lyrics overlay-scrollbar',
            )}
            id={LYRICS_SCROLL_CONTAINER_ID}
            onClick={handleContainerClick}
            onMouseEnter={showScrollbar}
            onMouseLeave={hideScrollbar}
            ref={containerRef}
            style={{ ...containerStyle, ...style }}
        >
            <LyricsScrollContent
                gap={effectiveGap}
                paddingLeft={effectivePaddingLeft}
                paddingRight={effectivePaddingRight}
                preview={preview}
            >
                {settings.showProvider && source && (
                    <LyricLine
                        alignment={settings.alignment}
                        fontSize={effectiveFontSize}
                        text={`${source}`}
                    />
                )}
                {settings.showMatch && (
                    <LyricLine
                        alignment={settings.alignment}
                        data-lyrics-match
                        fontSize={effectiveFontSize}
                        text={`${name} — ${artist}`}
                    />
                )}
                {normalizedLyrics.map((rawLine, idx) => {
                    if (!hasLyricText(rawLine)) return null;
                    const gap = gaps?.get(idx);
                    const gapRow = gap && (
                        <LyricGap
                            alignment={settings.alignment}
                            beforeIndex={idx}
                            fontSize={effectiveFontSize}
                            startMs={gap.startMs}
                        />
                    );
                    const lineStartMs = getLyricLineStartMs(rawLine);
                    const lineText = getLyricLineText(rawLine);
                    const pronunciationText = getOverlayText(
                        pronunciationLyrics,
                        lineStartMs,
                        idx,
                        romajiLyrics?.[idx] ? getLyricLineText(romajiLyrics[idx]) : undefined,
                    );
                    const translationText = getOverlayText(
                        translationLyrics,
                        lineStartMs,
                        idx,
                        translatedLyrics?.split('\n')[idx],
                    );

                    return (
                        <Fragment key={idx}>
                            {gapRow}
                            <LyricLine
                                alignment={settings.alignment}
                                className="lyric-line synchronized"
                                data-lyric-time={lineStartMs}
                                fontSize={effectiveFontSize}
                                id={`lyric-${idx}`}
                                romajiText={pronunciationText}
                                text={lineText}
                                translatedText={translationText}
                                wave
                            />
                        </Fragment>
                    );
                })}
            </LyricsScrollContent>
        </div>
    );
};
