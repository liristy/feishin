import {
    animateScrollTop,
    computeScrollDurationMs,
} from '/@/renderer/features/lyrics/api/lyrics-scroll';
import { animateLyricsSpring } from '/@/renderer/features/lyrics/api/lyrics-spring-scroll';
import {
    getLineEndMs,
    getLyricLineStartMs,
    lyricsHasWordCues,
} from '/@/renderer/features/lyrics/api/lyrics-utils';
import { getNextLyricTime, getVocalSides } from '/@/renderer/features/lyrics/api/lyrics-vocals';
import { SynchronizedLyrics } from '/@/shared/types/domain-types';

const ANIMATING_CLASS = 'lyrics-word-animating';
const PRE_ANIMATING_CLASS = 'lyrics-word-pre-animating';
const PAUSED_CLASS = 'lyrics-word-paused';
const LINE_ACTIVE_CLASS = 'lyrics-line-active';
const LINE_READY_CLASS = 'lyrics-line-ready';
const LINE_ANIMATING_CLASS = 'lyrics-line-animating';
const LINE_PRE_ANIMATING_CLASS = 'lyrics-line-pre-animating';

const TIME_JUMP_THRESHOLD = 0.5;
const CENTER_SCROLL_POS_RATIO = 0.5;
const FULLSCREEN_READING_RATIO = 0.382;
const DEFAULT_LINE_LEAD_TIME_MS = 800;
const FULLSCREEN_LINE_LEAD_SEC = 0.48;
const RICHSYNC_TIMING_OFFSET_MS = 150;
const SYNC_TIMING_OFFSET_MS = 115;
const HIGHLIGHT_DURATION_MULTIPLIER = 1.6;
const WORD_LIFT_SETTLE_SEC = 0.45;

export interface AnimEngineState {
    lastActiveElements: LineData[];
    lastEventCreationTime: number;
    lastPlaybackTime: number;
    lastPlayState: boolean;
    lastTime: number;
    scroll: ScrollState;
    selectedElementIndex: number;
}

export interface BuildLyricsDataOptions {
    container: HTMLElement;
    lineIdPrefix: 'karaoke-line' | 'lyric';
    lyrics: SynchronizedLyrics;
}

export interface LineData {
    accumulatedOffsetMs: number;
    animationStartTimeMs: number;
    duration: number;
    element: HTMLElement;
    hasWordCues: boolean;
    height: number;
    isAnimating: boolean;
    isAnimationPlayStatePlaying: boolean;
    isScrolled: boolean;
    isSelected: boolean;
    lastAnimSetupAt: number;
    lyricIndex: number;
    nextTime: number;
    overlayParts: PartData[];
    parts: PartData[];
    position: number;
    scrollGroup?: { first: number; last: number };
    time: number;
    vocalSide?: 'left' | 'right';
}

export interface LyricsData {
    container: HTMLElement;
    lineIdPrefix: 'karaoke-line' | 'lyric';
    lines: LineData[];
    syncType: LyricsSyncType;
    viewportHeight: number;
}

export type LyricsSyncType = 'none' | 'richsync' | 'synced';

export interface PartData {
    animationStartTimeMs: number;
    duration: number;
    element: HTMLElement;
    floating?: boolean;
    isAnimating: boolean;
    nextWordTime?: number;
    renderedLift?: number;
    renderedProgress?: number;
    time: number;
}

export interface ScrollState {
    cancelScroll: (() => void) | null;
    doneFirstInstantScroll: boolean;
    nextScrollAllowedTime: number;
    pendingScroll: boolean;
    programmaticScrollUntil: number;
    queuedScroll: boolean;
    scrollPos: number;
    scrollResumeTime: number;
    skipScrolls: number;
    skipScrollsDecayTimes: number[];
    wasUserScrolling: boolean;
}

export interface TickOptions {
    currentTimeMs: number;
    eventCreationTime: number;
    follow?: boolean;
    followScrollAlignment?: number;
    forceResync?: boolean;
    isPlaying: boolean;
    lineLeadTimeMs?: number;
    lyricsData: LyricsData;
    onLineActive?: (lineIndex: number) => void;
    scrollContainer: HTMLElement;
    smoothScroll?: boolean;
}

export const getFollowScrollPositionRatio = (followScrollAlignment = 0): number => {
    return Math.min(0.95, Math.max(0.05, CENTER_SCROLL_POS_RATIO + followScrollAlignment / 100));
};

const reflow = (element: HTMLElement): void => {
    void element.offsetHeight;
};

const smoothStep = (progress: number): number => progress * progress * (3 - 2 * progress);

export const createScrollState = (): ScrollState => ({
    cancelScroll: null,
    doneFirstInstantScroll: false,
    nextScrollAllowedTime: 0,
    pendingScroll: false,
    programmaticScrollUntil: 0,
    queuedScroll: false,
    scrollPos: -1,
    scrollResumeTime: 0,
    skipScrolls: 0,
    skipScrollsDecayTimes: [],
    wasUserScrolling: false,
});

export const createAnimEngineState = (): AnimEngineState => ({
    lastActiveElements: [],
    lastEventCreationTime: 0,
    lastPlaybackTime: 0,
    lastPlayState: false,
    lastTime: 0,
    scroll: createScrollState(),
    selectedElementIndex: 0,
});

export const resetAnimEngine = (state: AnimEngineState): void => {
    cancelActiveLyricsScroll(state.scroll);
    state.lastActiveElements = [];
    state.scroll.skipScrollsDecayTimes = [];
    state.scroll.doneFirstInstantScroll = false;
    state.scroll.pendingScroll = false;
    state.scroll.queuedScroll = false;
};

const collectLineParts = (lineElement: HTMLElement): PartData[] => {
    const words = lineElement.querySelectorAll<HTMLElement>(
        '.karaoke-word[data-duration]:not(.karaoke-overlay-word)',
    );
    const floating = !!lineElement.closest('[data-fullscreen-player]');

    return Array.from(words, (element, index) => {
        const time = Number.parseFloat(element.dataset.time ?? '0');
        const next = words[index + 1];
        const nextTime = Number(next?.dataset.time);
        return {
            animationStartTimeMs: Number.POSITIVE_INFINITY,
            duration: Number.parseFloat(element.dataset.duration ?? '0'),
            element,
            floating,
            isAnimating: false,
            nextWordTime:
                next?.parentElement === element.parentElement && nextTime > time
                    ? nextTime
                    : undefined,
            time,
        };
    });
};

const collectOverlayParts = (lineElement: HTMLElement): PartData[] => {
    const words = lineElement.querySelectorAll<HTMLElement>('.karaoke-overlay-word[data-duration]');

    return Array.from(words).map((element) => ({
        animationStartTimeMs: Number.POSITIVE_INFINITY,
        duration: Number.parseFloat(element.dataset.duration ?? '0'),
        element,
        isAnimating: false,
        time: Number.parseFloat(element.dataset.time ?? '0'),
    }));
};

const cancelSungAnimationCleanup = (element: HTMLElement): void => {
    const existingTimeout = Number(element.dataset.sungCleanupTimeout);
    if (existingTimeout) {
        window.clearTimeout(existingTimeout);
        delete element.dataset.sungCleanupTimeout;
    }
};

const completeSungVisualCleanup = (element: HTMLElement): void => {
    cancelSungAnimationCleanup(element);
    element.style.removeProperty('--karaoke-swipe-delay');
    element.style.removeProperty('--karaoke-anim-delay');
    element.classList.remove(ANIMATING_CLASS);
    element.classList.remove(PRE_ANIMATING_CLASS);
    element.classList.remove(PAUSED_CLASS);
};

const getRemainingHighlightDurationSec = (
    durationSec: number,
    startTimeSec: number,
    interpolatedTimeSec: number,
): number => {
    const highlightDurationSec = durationSec * HIGHLIGHT_DURATION_MULTIPLIER;
    const elapsedSec = Math.max(0, interpolatedTimeSec - startTimeSec);
    return Math.max(0, highlightDurationSec - elapsedSec);
};

const scheduleSungAnimationCleanup = (
    element: HTMLElement,
    durationSec: number,
    startTimeSec: number,
    interpolatedTimeSec: number,
): void => {
    const remainingSec = getRemainingHighlightDurationSec(
        durationSec,
        startTimeSec,
        interpolatedTimeSec,
    );

    if (remainingSec <= 0.05) {
        completeSungVisualCleanup(element);
        return;
    }

    cancelSungAnimationCleanup(element);

    const timeoutId = window.setTimeout(() => {
        delete element.dataset.sungCleanupTimeout;
        completeSungVisualCleanup(element);
    }, remainingSec * 1000);

    element.dataset.sungCleanupTimeout = String(timeoutId);
};

const clearElementAnimation = (element: HTMLElement): void => {
    cancelSungAnimationCleanup(element);
    element.style.removeProperty('--karaoke-swipe-delay');
    element.style.removeProperty('--karaoke-anim-delay');
    element.classList.remove(ANIMATING_CLASS);
    element.classList.remove(PRE_ANIMATING_CLASS);
    element.classList.remove(PAUSED_CLASS);
};

const clearWordSungState = (part: PartData): void => {
    part.element.classList.remove('sung');
};

const markWordSung = (part: PartData, interpolatedTimeSec: number): void => {
    part.animationStartTimeMs = Number.POSITIVE_INFINITY;
    part.isAnimating = false;
    part.element.classList.add('sung');
    scheduleSungAnimationCleanup(part.element, part.duration, part.time, interpolatedTimeSec);
};

const setupPartAnimation = (part: PartData, interpolatedTimeSec: number, now: number): void => {
    const partTimeDelta = interpolatedTimeSec - part.time;

    part.element.classList.remove(ANIMATING_CLASS);
    part.element.classList.remove(PAUSED_CLASS);
    part.element.style.setProperty(
        '--karaoke-swipe-delay',
        `${-partTimeDelta - part.duration * 0.1}s`,
    );
    part.element.style.setProperty('--karaoke-anim-delay', `${-partTimeDelta}s`);
    part.element.classList.add(PRE_ANIMATING_CLASS);

    reflow(part.element);

    part.element.classList.add(ANIMATING_CLASS);
    part.animationStartTimeMs = now - partTimeDelta * 1000;
    part.isAnimating = true;
};

const animateWordParts = (parts: PartData[], interpolatedTimeSec: number, now: number): void => {
    for (const part of parts) {
        if (part.floating) {
            updateFloatingWord(part, interpolatedTimeSec);
            continue;
        }
        const partEnd = part.time + part.duration;

        if (interpolatedTimeSec >= partEnd) {
            if (!part.element.classList.contains('sung')) {
                markWordSung(part, interpolatedTimeSec);
            }
        } else if (interpolatedTimeSec < part.time) {
            if (part.isAnimating || part.element.classList.contains('sung')) {
                clearPartAnimation(part);
                clearWordSungState(part);
            }
        } else if (!part.isAnimating) {
            setupPartAnimation(part, interpolatedTimeSec, now);
        }
    }
};

const updateFloatingWord = (part: PartData, time: number): void => {
    const elapsed = Math.max(0, time - part.time);
    const progress =
        time < part.time ? 0 : part.duration > 0 ? Math.min(1, elapsed / part.duration) : 1;
    const wordEnd = part.time + Math.max(0, part.duration);
    const settleStart = part.nextWordTime ?? wordEnd;
    const pickupDuration = Math.min(0.68, Math.min(wordEnd, settleStart) - part.time);
    const pickup = Math.min(1, elapsed / Math.max(0.001, pickupDuration));
    const settle = Math.min(1, Math.max(0, (time - settleStart) / WORD_LIFT_SETTLE_SEC));
    const lift = (smoothStep(pickup) + smoothStep(settle)) / 2;
    if (progress !== part.renderedProgress) {
        part.element.style.setProperty('--karaoke-progress', String(progress));
        part.element.classList.toggle('sung', progress >= 1);
        part.renderedProgress = progress;
    }
    if (lift !== part.renderedLift) {
        part.element.style.setProperty('--karaoke-lift', String(lift));
        part.renderedLift = lift;
    }
};

const clearWordParts = (parts: PartData[], interpolatedTimeSec: number): void => {
    for (const part of parts) {
        if (part.floating) {
            updateFloatingWord(part, interpolatedTimeSec);
        } else if (interpolatedTimeSec >= part.time + part.duration) {
            markWordSung(part, interpolatedTimeSec);
        } else {
            clearPartAnimation(part);
            clearWordSungState(part);
        }
    }
};

const resumeWordParts = (parts: PartData[]): void => {
    for (const part of parts) {
        part.element.classList.remove(PAUSED_CLASS);
    }
};

const clearLineOverlayState = (lineElement: HTMLElement): void => {
    for (const element of lineElement.querySelectorAll<HTMLElement>('.karaoke-overlay-word')) {
        clearElementAnimation(element);
        element.classList.remove('sung');
    }
};

export const buildLyricsDataFromDom = ({
    container,
    lineIdPrefix,
    lyrics,
}: BuildLyricsDataOptions): LyricsData | null => {
    const hasWordCues = lyricsHasWordCues(lyrics);
    const vocalSides = getVocalSides(lyrics);
    const lines: LineData[] = [];

    for (let index = 0; index < lyrics.length; index += 1) {
        const lineElement = container.querySelector<HTMLElement>(`[id="${lineIdPrefix}-${index}"]`);
        if (!lineElement) {
            continue;
        }

        const line = lyrics[index];
        const side = vocalSides.get(line);
        if (side) lineElement.dataset.lyricSide = side;
        else delete lineElement.dataset.lyricSide;
        const cueSides = new Set<'left' | 'right'>();
        for (const element of lineElement.querySelectorAll<HTMLElement>('[data-lyric-cue-index]')) {
            const cue = line.cueLines?.[Number(element.dataset.lyricCueIndex)];
            const cueSide = cue && vocalSides.get(cue);
            if (cueSide) {
                cueSides.add(cueSide);
                element.dataset.lyricSide = cueSide;
            } else {
                delete element.dataset.lyricSide;
            }
        }
        const startMs = getLyricLineStartMs(line);
        const endMs = getLineEndMs(line);
        const durationMs = Math.max(0, endMs - startMs);
        const parts = hasWordCues && line.cueLines?.length ? collectLineParts(lineElement) : [];
        const overlayParts = collectOverlayParts(lineElement);

        const lineData: LineData = {
            accumulatedOffsetMs: 0,
            animationStartTimeMs: Number.POSITIVE_INFINITY,
            duration: durationMs / 1000,
            element: lineElement,
            hasWordCues: parts.length > 0,
            height: -1,
            isAnimating: false,
            isAnimationPlayStatePlaying: false,
            isScrolled: false,
            isSelected: false,
            lastAnimSetupAt: 0,
            lyricIndex: index,
            nextTime: getNextLyricTime(lyrics, index) / 1000,
            overlayParts,
            parts,
            position: -1,
            time: startMs / 1000,
            vocalSide: side ?? (cueSides.size === 1 ? cueSides.values().next().value : undefined),
        };
        const gapElement = container.querySelector<HTMLElement>(`[data-lyric-gap="${index}"]`);
        if (gapElement) {
            lines.push({
                ...lineData,
                duration: 0,
                element: gapElement,
                hasWordCues: false,
                lyricIndex: -1,
                nextTime: lineData.time,
                overlayParts: [],
                parts: [],
                time: Number(gapElement.dataset.gapStart) / 1000,
                vocalSide: undefined,
            });
        }
        lines.push(lineData);
    }

    for (let first = 0; first < lines.length; first++) {
        const lead = lines[first];
        if (!lead.vocalSide) continue;
        const end = lead.duration > 0 ? lead.time + lead.duration : lead.nextTime;
        let last = first;
        while (last + 1 < lines.length) {
            const response = lines[last + 1];
            if (
                !response.vocalSide ||
                response.vocalSide === lead.vocalSide ||
                response.time >= end
            ) {
                break;
            }
            last++;
        }
        if (last > first) {
            const group = { first, last };
            for (let index = first; index <= last; index++) lines[index].scrollGroup = group;
            first = last;
        }
    }

    if (!lines.length) {
        return null;
    }

    const allZero = lines.every((line) => line.time === 0);
    let syncType: LyricsSyncType = allZero ? 'none' : 'synced';
    if (hasWordCues) {
        syncType = 'richsync';
    }

    return {
        container,
        lineIdPrefix,
        lines,
        syncType,
        viewportHeight: 0,
    };
};

export const recalculateLinePositions = (lyricsData: LyricsData): void => {
    const { container, lines } = lyricsData;
    const containerRect = container.getBoundingClientRect();
    const viewportHeight = container.clientHeight;
    if (
        viewportHeight !== lyricsData.viewportHeight &&
        container.closest('[data-fullscreen-player]')
    ) {
        container.style.setProperty(
            '--lyric-reading-inset',
            `${viewportHeight * FULLSCREEN_READING_RATIO}px`,
        );
    }
    lyricsData.viewportHeight = viewportHeight;

    const scrollTop = container.scrollTop;
    for (const line of lines) {
        const rect = line.element.getBoundingClientRect();
        const offset =
            Number.parseFloat(getComputedStyle(line.element).translate.split(' ')[1]) || 0;
        line.position = rect.top - containerRect.top + scrollTop - offset;
        line.height = rect.height;
    }
};

const clearPartAnimation = (part: PartData): void => {
    cancelSungAnimationCleanup(part.element);
    part.element.style.removeProperty('--karaoke-swipe-delay');
    part.element.style.removeProperty('--karaoke-anim-delay');
    part.element.style.removeProperty('--karaoke-progress');
    part.element.style.removeProperty('--karaoke-lift');
    part.element.classList.remove(ANIMATING_CLASS);
    part.element.classList.remove(PRE_ANIMATING_CLASS);
    part.element.classList.remove(PAUSED_CLASS);
    part.animationStartTimeMs = Number.POSITIVE_INFINITY;
    part.isAnimating = false;
    part.renderedLift = undefined;
    part.renderedProgress = undefined;
};

const clearLineAnimation = (line: LineData): void => {
    line.element.style.removeProperty('--karaoke-swipe-delay');
    line.element.style.removeProperty('--karaoke-anim-delay');
    line.element.classList.remove(LINE_ANIMATING_CLASS);
    line.element.classList.remove(LINE_PRE_ANIMATING_CLASS);
    line.element.classList.remove(PAUSED_CLASS);
    line.animationStartTimeMs = Number.POSITIVE_INFINITY;
};

const clearLineKaraokeHighlights = (lineData: LineData, interpolatedTimeSec: number): void => {
    if (lineData.hasWordCues) {
        for (const part of lineData.parts) {
            if (part.floating) {
                updateFloatingWord(part, interpolatedTimeSec);
                continue;
            }
            clearPartAnimation(part);
            clearWordSungState(part);
        }
    } else {
        clearLineAnimation(lineData);
    }

    if (lineData.overlayParts.length) {
        clearWordParts(lineData.overlayParts, interpolatedTimeSec);
    }

    lineData.isSelected = false;
    lineData.isAnimating = false;
    lineData.isAnimationPlayStatePlaying = false;
};

const setupLineAnimation = (line: LineData, interpolatedTimeSec: number, now: number): void => {
    const timeDelta = interpolatedTimeSec - line.time;

    line.element.classList.remove(LINE_ANIMATING_CLASS);
    line.element.classList.remove(PAUSED_CLASS);
    line.element.style.setProperty('--karaoke-swipe-delay', `${-timeDelta - line.duration * 0.1}s`);
    line.element.style.setProperty('--karaoke-anim-delay', `${-timeDelta}s`);
    line.element.classList.add(LINE_PRE_ANIMATING_CLASS);

    reflow(line.element);

    line.element.classList.add(LINE_ANIMATING_CLASS);
    line.animationStartTimeMs = now - timeDelta * 1000;
    line.isAnimating = true;
    line.lastAnimSetupAt = now;
    line.isAnimationPlayStatePlaying = true;
    line.accumulatedOffsetMs = 0;
};

const decaySkipScrolls = (state: ScrollState, now: number): void => {
    let decayCount = 0;

    for (const decayTime of state.skipScrollsDecayTimes) {
        if (decayTime > now) {
            break;
        }
        decayCount += 1;
    }

    if (decayCount > 0) {
        state.skipScrollsDecayTimes = state.skipScrollsDecayTimes.slice(decayCount);
        state.skipScrolls = Math.max(0, state.skipScrolls - decayCount);
    }
};

const cancelActiveLyricsScroll = (ss: ScrollState): void => {
    if (ss.cancelScroll) {
        ss.cancelScroll();
        ss.cancelScroll = null;
    }
};

export const animateLyricsScrollTo = (
    state: AnimEngineState,
    scrollContainer: HTMLElement,
    scrollPos: number,
    smoothScroll = true,
): number => {
    const ss = state.scroll;
    const now = Date.now();
    cancelActiveLyricsScroll(ss);
    const scrollTop = scrollContainer.scrollTop;

    let useSmoothScroll = smoothScroll;
    const floating =
        scrollContainer.matches('.synchronized-karaoke-lyrics, .synchronized-lyrics') &&
        !!scrollContainer.closest('[data-fullscreen-player]');
    if (floating && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        useSmoothScroll = false;
    }
    if (scrollTop === 0 && !ss.doneFirstInstantScroll) {
        useSmoothScroll = false;
        ss.doneFirstInstantScroll = true;
        ss.nextScrollAllowedTime = 0;
    }

    const delta = scrollPos - scrollTop;
    if (floating && Math.abs(delta) > scrollContainer.clientHeight * 1.5) {
        useSmoothScroll = false;
    }

    if (useSmoothScroll && Math.abs(delta) > 2) {
        if (floating) {
            const rows = Array.from(
                scrollContainer.querySelectorAll<HTMLElement>(
                    '.karaoke-line.synchronized, .lyric-line.synchronized, [data-lyric-gap]',
                ),
            );
            ss.cancelScroll = animateLyricsSpring(
                scrollContainer,
                scrollPos,
                rows,
                state.selectedElementIndex,
            );
            ss.nextScrollAllowedTime = now + 20;
            ss.programmaticScrollUntil = now + 2500;
            ss.scrollPos = scrollPos;
            return 2400;
        }
        const durationMs = computeScrollDurationMs(delta);
        ss.cancelScroll = animateScrollTop(scrollContainer, scrollPos);
        ss.nextScrollAllowedTime = durationMs + now + 20;
        ss.programmaticScrollUntil = now + durationMs + 50;
        ss.scrollPos = scrollPos;
        ss.skipScrolls += 1;
        ss.skipScrollsDecayTimes.push(now + 2000);
        return durationMs;
    }

    scrollContainer.scrollTop = scrollPos;
    ss.programmaticScrollUntil = now + 100;
    ss.scrollPos = scrollPos;
    ss.skipScrolls += 1;
    ss.skipScrollsDecayTimes.push(now + 2000);
    return 0;
};

const scrollToPosition = (
    state: AnimEngineState,
    scrollContainer: HTMLElement,
    scrollPos: number,
    smoothScroll: boolean,
): void => {
    animateLyricsScrollTo(state, scrollContainer, scrollPos, smoothScroll);
};

export const tickLyricsAnimation = (state: AnimEngineState, opts: TickOptions): number => {
    const now = Date.now();
    const {
        currentTimeMs,
        follow = true,
        forceResync = false,
        isPlaying,
        smoothScroll = true,
    } = opts;
    const { eventCreationTime, lyricsData, onLineActive, scrollContainer } = opts;
    lyricsData.container.classList.toggle('lyrics-motion-paused', !isPlaying);

    if (currentTimeMs === 0 && !isPlaying && lyricsData.lines[0]?.lyricIndex !== -1) {
        for (const line of lyricsData.lines) {
            line.element.classList.remove(
                LINE_ACTIVE_CLASS,
                LINE_READY_CLASS,
                'lyrics-line-floating',
                'lyrics-line-after-gap',
            );
        }
        return -1;
    }

    const currentTimeSec = currentTimeMs / 1000;
    const timeJumped =
        forceResync ||
        Math.abs(
            currentTimeSec -
                state.lastTime -
                (eventCreationTime - state.lastEventCreationTime) / 1000,
        ) > TIME_JUMP_THRESHOLD;

    if (timeJumped) {
        cancelActiveLyricsScroll(state.scroll);

        for (const lineData of lyricsData.lines) {
            lineData.isAnimating = false;
            lineData.isSelected = false;
            lineData.isAnimationPlayStatePlaying = false;

            if (lineData.isScrolled) {
                lineData.element.classList.remove(LINE_ACTIVE_CLASS);
                lineData.isScrolled = false;
            }

            if (lineData.hasWordCues) {
                for (const part of lineData.parts) {
                    clearPartAnimation(part);
                    clearWordSungState(part);
                }
            } else {
                clearLineAnimation(lineData);
            }

            if (lineData.overlayParts.length) {
                for (const part of lineData.overlayParts) {
                    clearPartAnimation(part);
                    clearWordSungState(part);
                }
            }
        }

        state.scroll.pendingScroll = true;
    }

    const timeOffsetSec = isPlaying ? (now - eventCreationTime) / 1000 : 0;
    const estimatedTimeSec = currentTimeSec + timeOffsetSec;
    // A late player sample can trail the interpolated clock. Hold the frame until it catches up.
    const playbackTimeSec =
        isPlaying && state.lastPlayState && !timeJumped
            ? Math.max(state.lastPlaybackTime, estimatedTimeSec)
            : estimatedTimeSec;

    state.lastTime = currentTimeSec;
    state.lastPlayState = isPlaying;
    state.lastPlaybackTime = playbackTimeSec;
    state.lastEventCreationTime = eventCreationTime;

    const floating = !!lyricsData.container.closest('[data-fullscreen-player]');
    const timingOffsetMs = floating
        ? 0
        : lyricsData.syncType === 'richsync'
          ? RICHSYNC_TIMING_OFFSET_MS
          : SYNC_TIMING_OFFSET_MS;
    const interpolatedTimeSec = playbackTimeSec + timingOffsetMs / 1000;
    const leadTimeSec = floating
        ? FULLSCREEN_LINE_LEAD_SEC
        : (opts.lineLeadTimeMs ?? DEFAULT_LINE_LEAD_TIME_MS) / 1000;

    const { lineIdPrefix, lines, syncType } = lyricsData;
    // Keep the reading line where the first row appears, so even the intro can scroll a full row.
    const readingTop = floating && !opts.followScrollAlignment ? lines[0]?.position : undefined;
    const isLineSyncMode = lineIdPrefix === 'lyric';
    if (syncType === 'none') {
        return -1;
    }

    const activeGap = lines.find(
        (line) =>
            line.lyricIndex === -1 &&
            (line.time === 0 || playbackTimeSec >= line.time) &&
            playbackTimeSec < line.nextTime,
    );
    const scrollHeight = lyricsData.viewportHeight;
    const activeElems: LineData[] = [];
    let newLyricSelected = timeJumped;
    let activeLineIndex = -1;

    if (!isPlaying) {
        for (const lineData of lines) {
            clearLineKaraokeHighlights(lineData, interpolatedTimeSec);

            if (lineData.isScrolled && lineData.lyricIndex !== -1) {
                lineData.element.classList.remove(LINE_ACTIVE_CLASS);
                lineData.isScrolled = false;
            }
        }
    }

    for (let index = 0; index < lines.length; index += 1) {
        const lineData = lines[index];
        const isGap = lineData.lyricIndex === -1;
        const time = lineData.time;
        const nextTime = lineData.nextTime;
        if (isGap) {
            const showing = lineData === activeGap;
            if (showing || lineData.element.classList.contains(LINE_ACTIVE_CLASS)) {
                const progress = Math.min(
                    1,
                    Math.max(0, (playbackTimeSec - time) / (nextTime - time)),
                );
                lineData.element.style.setProperty('--lyric-gap-progress', String(progress));
            }
            lineData.element.classList.toggle(LINE_ACTIVE_CLASS, showing);
            if (!showing) {
                lineData.isScrolled = false;
                continue;
            }
        }
        const isInLineWindow =
            playbackTimeSec < nextTime || playbackTimeSec < time + lineData.duration;

        const canApproach = !activeGap || (floating && follow && activeGap.nextTime === time);
        const isScrollCandidate =
            isGap || (canApproach && playbackTimeSec >= time - leadTimeSec && isInLineWindow);

        const isSinging = !activeGap && playbackTimeSec >= time && isInLineWindow;
        if (floating && !isGap) {
            lineData.element.classList.toggle(LINE_READY_CLASS, isScrollCandidate && !isSinging);
            if (!lineData.hasWordCues) {
                lineData.element.classList.toggle('lyrics-line-floating', isSinging);
            }
            if (lines[index - 1]?.lyricIndex === -1) {
                const progress = (playbackTimeSec - time) / 0.55;
                const rising = isSinging && progress < 1 && (!follow || readingTop === undefined);
                if (rising) {
                    const offset = 0.4 * (1 - smoothStep(progress));
                    lineData.element.style.setProperty('--lyric-gap-pickup', `${offset}em`);
                }
                lineData.element.classList.toggle('lyrics-line-after-gap', rising);
            }
        }

        if (isScrollCandidate) {
            activeElems.push(lineData);
            state.selectedElementIndex = index;
            activeLineIndex = activeGap ? -1 : lineData.lyricIndex;

            if (isPlaying && !lineData.isScrolled) {
                newLyricSelected = true;
                state.scroll.pendingScroll = true;
                lineData.isScrolled = true;
                if (lineData.lyricIndex >= 0) onLineActive?.(lineData.lyricIndex);

                if (!isLineSyncMode && !floating) {
                    lineData.element.classList.add(LINE_ACTIVE_CLASS);
                }
            }
        } else {
            lineData.isScrolled = false;

            if (!isLineSyncMode) {
                lineData.element.classList.remove(LINE_ACTIVE_CLASS);
            }
        }

        if (!isGap && (isLineSyncMode || floating)) {
            lineData.element.classList.toggle(LINE_ACTIVE_CLASS, isSinging);
        }

        if (!isPlaying || isGap) {
            continue;
        }

        if (isLineSyncMode && !lineData.hasWordCues) {
            continue;
        }

        const setUpEarly = 2;
        const wordEnd = time + lineData.duration;
        const effectiveEnd = Math.max(nextTime, wordEnd + 0.05);
        const isFloatingTail =
            floating &&
            lineData.hasWordCues &&
            interpolatedTimeSec >= wordEnd &&
            interpolatedTimeSec < wordEnd + WORD_LIFT_SETTLE_SEC;
        const isLineInRange =
            isFloatingTail ||
            (!activeGap &&
                interpolatedTimeSec + setUpEarly >= time &&
                interpolatedTimeSec < effectiveEnd);

        if (isLineInRange) {
            if (!lineData.isSelected) {
                resumeWordParts(lineData.parts);
                resumeWordParts(lineData.overlayParts);
                lineData.element.classList.remove(PAUSED_CLASS);
                lineData.isSelected = true;
            }

            lineData.isAnimationPlayStatePlaying = true;

            if (!lineData.hasWordCues && !lineData.isAnimating) {
                setupLineAnimation(lineData, interpolatedTimeSec, now);
            }

            if (lineData.hasWordCues) {
                animateWordParts(lineData.parts, interpolatedTimeSec, now);
            }

            if (lineData.overlayParts.length) {
                animateWordParts(lineData.overlayParts, interpolatedTimeSec, now);
            }
        } else if (lineData.isSelected) {
            if (lineData.hasWordCues) {
                clearWordParts(lineData.parts, interpolatedTimeSec);
            } else {
                clearLineAnimation(lineData);
            }

            if (lineData.overlayParts.length) {
                clearWordParts(lineData.overlayParts, interpolatedTimeSec);
            }

            lineData.isSelected = false;
            lineData.isAnimating = false;
            lineData.isAnimationPlayStatePlaying = false;
        }
    }

    const ss = state.scroll;
    const scrollPausedByUser = ss.scrollResumeTime >= now;
    const canAutoscroll = follow && !scrollPausedByUser;

    if (canAutoscroll) {
        if (activeElems.length === 0 && lines.length > 0) {
            const firstLyric = lines.find((line) => line.lyricIndex >= 0);
            if (firstLyric) activeElems.push(firstLyric);
        }

        state.lastActiveElements = activeElems.filter((entry) => playbackTimeSec >= entry.time);

        const shouldScroll =
            ss.wasUserScrolling || newLyricSelected || ss.queuedScroll || ss.pendingScroll;
        if (activeElems.length > 0 && shouldScroll) {
            const scrollPosRatio = getFollowScrollPositionRatio(opts.followScrollAlignment);
            const scrollPosOffset = scrollHeight * scrollPosRatio;
            const singingLines = state.lastActiveElements;
            const focus = activeElems[activeElems.length - 1];
            const group = floating ? focus.scrollGroup : undefined;
            const scrollLines = !floating && singingLines.length > 1 ? singingLines : [focus];
            const firstActive = group ? lines[group.first] : scrollLines[0];
            const lastActive = group ? lines[group.last] : scrollLines[scrollLines.length - 1];
            const positions = [firstActive.position, lastActive.position + lastActive.height];

            if (positions.length > 0 && positions.every((pos) => pos >= 0)) {
                const avgPos = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
                let scrollPos =
                    readingTop !== undefined && readingTop >= 0
                        ? firstActive.position - readingTop
                        : avgPos - scrollPosOffset;
                scrollPos = Math.min(scrollPos, firstActive.position);
                scrollPos = Math.max(
                    scrollPos,
                    lastActive.position - scrollHeight + lastActive.height,
                );
                scrollPos = Math.min(scrollPos, lastActive.position);
                scrollPos = Math.max(0, scrollPos);

                if (now > ss.nextScrollAllowedTime) {
                    ss.queuedScroll = false;
                    ss.pendingScroll = false;
                    if (
                        !group ||
                        Math.abs(ss.scrollPos - scrollPos) >= 1 ||
                        timeJumped ||
                        ss.wasUserScrolling
                    ) {
                        if (group) state.selectedElementIndex = group.first;
                        scrollToPosition(state, scrollContainer, scrollPos, smoothScroll);
                    }
                } else {
                    ss.queuedScroll = true;
                }
            }
        }
    }

    decaySkipScrolls(ss, now);

    if (ss.wasUserScrolling && ss.scrollResumeTime < now) {
        ss.wasUserScrolling = false;
        ss.pendingScroll = true;
    }

    return activeLineIndex;
};

export const handleLyricsUserScroll = (state: AnimEngineState, pauseDurationMs = 3000): void => {
    const ss = state.scroll;
    cancelActiveLyricsScroll(ss);
    ss.programmaticScrollUntil = 0;
    ss.skipScrolls = 0;
    ss.skipScrollsDecayTimes = [];
    ss.wasUserScrolling = true;
    ss.scrollResumeTime = Date.now() + pauseDurationMs;
};

export const resumeLyricsAutoscroll = (state: AnimEngineState): void => {
    state.scroll.wasUserScrolling = false;
    state.scroll.scrollResumeTime = 0;
};

export const shouldSkipLyricsScrollEvent = (state: AnimEngineState): boolean => {
    if (Date.now() < state.scroll.programmaticScrollUntil) {
        return true;
    }

    if (state.scroll.skipScrolls > 0) {
        state.scroll.skipScrolls -= 1;
        return true;
    }

    return false;
};

export const resetLyricsAnimationDom = (lyricsData: LyricsData | null): void => {
    if (!lyricsData) {
        return;
    }

    for (const line of lyricsData.lines) {
        line.element.classList.remove(
            LINE_ACTIVE_CLASS,
            LINE_READY_CLASS,
            LINE_ANIMATING_CLASS,
            LINE_PRE_ANIMATING_CLASS,
            'singing',
            'complete',
            'lyrics-line-after-gap',
        );
        line.isScrolled = false;
        line.isSelected = false;
        line.isAnimating = false;

        for (const part of line.parts) {
            clearPartAnimation(part);
            clearWordSungState(part);
        }

        for (const part of line.overlayParts) {
            clearPartAnimation(part);
            clearWordSungState(part);
        }

        clearLineOverlayState(line.element);
        clearLineAnimation(line);
    }
};
