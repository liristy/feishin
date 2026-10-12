import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import styles from './floating-player.module.css';

import { CoverFlowCanvas } from '/@/renderer/features/player/components/cover-flow-canvas';
import { useCoverFlowImage } from '/@/renderer/features/player/hooks/use-cover-flow-image';
import { Icon } from '/@/shared/components/icon/icon';
import '/@/shared/styles/bundled-appearance.css';
import {
    FLOATING_PLAYER_LYRICS_HEIGHT,
    FLOATING_PLAYER_PANEL_HEIGHT,
    FLOATING_PLAYER_TRANSITION_MS,
    FloatingPlayerState,
} from '/@/shared/types/floating-player';

function Background({ state }: { state: FloatingPlayerState }) {
    const flow = useCoverFlowImage(
        state.theme.dynamicBackground && !state.theme.dynamicIsImage ? state.artwork : null,
        state.theme.blur,
    );
    return (
        <div aria-hidden className={styles.background}>
            {state.theme.dynamicBackground && state.artwork && (
                <>
                    {state.theme.dynamicIsImage ? (
                        <div
                            className={styles.backgroundArtwork}
                            style={{ backgroundImage: `url(${JSON.stringify(state.artwork)})` }}
                        />
                    ) : flow ? (
                        <CoverFlowCanvas
                            className={styles.backgroundFlow}
                            playing={state.playing && Boolean(state.panel)}
                            source={flow}
                        />
                    ) : null}
                    <div
                        className={styles.backgroundOverlay}
                        style={{
                            opacity:
                                (state.theme.dynamicIsImage ? 0.42 : 0.2) +
                                (1 - (state.theme.dynamicIsImage ? 0.42 : 0.2)) *
                                    (state.theme.opacity / 120),
                        }}
                    />
                </>
            )}
        </div>
    );
}

function FloatingPlayer() {
    const [state, setState] = useState<FloatingPlayerState | null>(null);
    const [panelState, setPanelState] = useState<FloatingPlayerState | null>(null);
    const activeRow = useRef<HTMLElement | null>(null);
    useEffect(
        () =>
            window.floatingPlayerWindow.onState((next) => {
                setState(next);
                if (next.panel) setPanelState(next);
            }),
        [],
    );
    useEffect(() => {
        const row = activeRow.current;
        const container = row?.parentElement;
        if (state?.panel === 'queue' && row && container)
            container.scrollTo({
                behavior: 'smooth',
                top:
                    container.scrollTop +
                    row.getBoundingClientRect().top -
                    container.getBoundingClientRect().top -
                    (container.clientHeight - row.clientHeight) / 2,
            });
    }, [state?.panel, state?.currentSongId, state?.queue.length]);
    if (!state) return null;
    const { labels } = state;
    const content = state.panel ? state : panelState;
    const command = window.floatingPlayerWindow.command;
    return (
        <div
            className={styles.canvas}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && state.panel) command(state.panel);
            }}
            style={
                {
                    '--image-blur': `${state.theme.blur}rem`,
                    '--panel-duration': `${FLOATING_PLAYER_TRANSITION_MS}ms`,
                    '--panel-height': `${content?.panel === 'lyrics' ? FLOATING_PLAYER_LYRICS_HEIGHT : FLOATING_PLAYER_PANEL_HEIGHT}px`,
                } as CSSProperties
            }
        >
            <div className={styles.surface} data-expanded={Boolean(state.panel)}>
                <Background state={state} />
                {content?.panel && (
                    <section
                        aria-hidden={!state.panel}
                        aria-label={labels[content.panel]}
                        className={styles.panel}
                        inert={!state.panel}
                        key={content.panel}
                    >
                        <div className={styles.panelContent} data-panel={content.panel}>
                            {content.panel === 'lyrics' ? (
                                <div className={styles.lyrics}>
                                    {content.lyrics.length ? (
                                        <AnimatePresence initial={false}>
                                            <LyricLine
                                                duration={content.lyricDurationMs}
                                                key={`${content.currentSongId}:${content.currentLyric}:${content.lyrics[Math.max(0, content.currentLyric)]}`}
                                                text={
                                                    content.lyrics[
                                                        Math.max(0, content.currentLyric)
                                                    ]
                                                }
                                            />
                                        </AnimatePresence>
                                    ) : (
                                        <p className={styles.empty}>
                                            {content.lyricsLoading
                                                ? labels.loading
                                                : labels.noLyrics}
                                        </p>
                                    )}
                                </div>
                            ) : content.queue.length ? (
                                content.queue.map((song, index) => (
                                    <button
                                        aria-current={
                                            song.id === content.currentSongId ? true : undefined
                                        }
                                        className={styles.queueItem}
                                        key={song.id}
                                        onClick={() => command('play-queue-item', song.id)}
                                        ref={(element) => {
                                            if (song.id === content.currentSongId)
                                                activeRow.current = element;
                                        }}
                                    >
                                        <span className={styles.queueIndex}>
                                            {song.id === content.currentSongId ? (
                                                <Icon icon="mediaPlay" size={14} />
                                            ) : (
                                                index + 1
                                            )}
                                        </span>
                                        <span className={styles.queueMetadata}>
                                            <span>{song.title}</span>
                                            <small>{song.artist}</small>
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <p className={styles.empty}>{labels.empty}</p>
                            )}
                        </div>
                    </section>
                )}
                <div
                    aria-label={labels.drag}
                    className={styles.player}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        command('menu');
                    }}
                    onLostPointerCapture={() => window.floatingPlayerWindow.drag('end')}
                    onPointerDown={(event) => {
                        if (event.button !== 0 || (event.target as Element).closest('button'))
                            return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        window.floatingPlayerWindow.drag('begin', event.screenX, event.screenY);
                    }}
                    onPointerMove={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId))
                            window.floatingPlayerWindow.drag('move', event.screenX, event.screenY);
                    }}
                    onPointerUp={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId))
                            event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onWheel={(event) => {
                        if (event.deltaY !== 0)
                            command(event.deltaY < 0 ? 'volume-up' : 'volume-down');
                    }}
                >
                    <div className={styles.controls}>
                        <button
                            aria-label={labels.previous}
                            disabled={!state.canSkip}
                            onClick={() => command('previous')}
                            title={labels.previous}
                        >
                            <Icon icon="mediaPrevious" size={22} />
                        </button>
                        <button
                            aria-label={state.playing ? labels.pause : labels.play}
                            className={styles.play}
                            disabled={!state.hasMedia}
                            onClick={() => command('play-pause')}
                            title={state.playing ? labels.pause : labels.play}
                        >
                            <Icon
                                icon={state.playing ? 'mediaPause' : 'mediaPlay'}
                                key={state.playing ? 'pause' : 'play'}
                                size={26}
                            />
                        </button>
                        <button
                            aria-label={labels.next}
                            disabled={!state.canSkip}
                            onClick={() => command('next')}
                            title={labels.next}
                        >
                            <Icon icon="mediaNext" size={22} />
                        </button>
                    </div>
                    <button
                        aria-label={labels.open}
                        className={styles.cover}
                        onClick={() => command('open')}
                        title={labels.open}
                    >
                        {state.artwork ? (
                            <img alt="" draggable={false} src={state.artwork} />
                        ) : (
                            <Icon icon="emptySongImage" size={22} />
                        )}
                    </button>
                    <div className={styles.metadata}>
                        <div className={styles.title}>{state.title || labels.empty}</div>
                        <div className={styles.artist}>{state.artist || 'qMusic'}</div>
                    </div>
                    <button
                        aria-label={labels.lyrics}
                        aria-pressed={state.panel === 'lyrics'}
                        onClick={() => command('lyrics')}
                        title={labels.lyrics}
                    >
                        <Icon icon="lyrics" size={18} />
                    </button>
                    <button
                        aria-label={labels.queue}
                        aria-pressed={state.panel === 'queue'}
                        onClick={() => command('queue')}
                        title={labels.queue}
                    >
                        <Icon icon="queue" size={18} />
                    </button>
                    <button
                        aria-label={labels.disable}
                        className={styles.close}
                        onClick={() => command('disable')}
                        title={labels.disable}
                    >
                        <Icon icon="x" size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function LyricLine({ duration, text }: { duration: number; text: string }) {
    const lineRef = useRef<HTMLParagraphElement | null>(null);
    const textRef = useRef<HTMLSpanElement | null>(null);
    const present = useIsPresent();
    const reducedMotion = useReducedMotion();
    useLayoutEffect(() => {
        const line = lineRef.current;
        const span = textRef.current;
        if (!line || !span) return;
        let cancelled = false;
        let scroll: Animation | undefined;
        const measure = () => {
            if (cancelled) return;
            scroll?.cancel();
            line.style.fontSize = '26px';
            const width = line.clientWidth;
            if (!width) return;
            const size = Math.min(26, Math.max(20, Math.floor((26 * width) / span.scrollWidth)));
            line.style.fontSize = `${size}px`;
            const overflow = span.scrollWidth - width;
            if (overflow <= 1 || reducedMotion) return;
            scroll = span.animate(
                [
                    { offset: 0, transform: 'translateX(0)' },
                    { offset: 0.12, transform: 'translateX(0)' },
                    { offset: 0.88, transform: `translateX(-${overflow}px)` },
                    { offset: 1, transform: `translateX(-${overflow}px)` },
                ],
                {
                    direction: 'alternate',
                    duration: Math.max(1200, duration || (overflow / 40) * 1000 + 1600),
                    easing: 'linear',
                    iterations: Infinity,
                },
            );
        };
        const observer = new ResizeObserver(measure);
        observer.observe(line);
        void document.fonts.ready.then(measure);
        measure();
        return () => {
            cancelled = true;
            observer.disconnect();
            scroll?.cancel();
        };
    }, [duration, reducedMotion, text]);
    return (
        <motion.p
            animate={{ opacity: 1, y: 0 }}
            aria-current={present ? true : undefined}
            aria-hidden={!present}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
            ref={lineRef}
            tabIndex={present ? 0 : -1}
            transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
            <span ref={textRef}>{text || '\u00a0'}</span>
        </motion.p>
    );
}

createRoot(document.getElementById('root')!).render(<FloatingPlayer />);
