import { useEffect } from 'react';

import styles from './use-fullscreen-toggle.module.css';

import { useFullScreenPlayerStore } from '/@/renderer/store/full-screen-player.store';

/**
 * Id applied to the expanded visualizer's inner container so that F11 can target it
 * directly. Fullscreening that element (rather than the whole document) promotes it to
 * the browser's top layer, so it covers the window bar and playerbar instead of being
 * boxed in by them.
 */
export const VISUALIZER_FULLSCREEN_TARGET_ID = 'visualizer-fullscreen-target';

export const useFullscreenToggle = () => {
    const expanded = useFullScreenPlayerStore((state) => state.expanded);

    useEffect(() => {
        if (!expanded) return;

        let timer: ReturnType<typeof setTimeout> | undefined;
        const root = document.documentElement;
        const showCursor = () => {
            clearTimeout(timer);
            root.classList.remove(styles.idleCursor);
            if (document.fullscreenElement) {
                timer = setTimeout(() => root.classList.add(styles.idleCursor), 3000);
            }
        };
        const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;

        showCursor();
        document.addEventListener('fullscreenchange', showCursor);
        for (const event of events) window.addEventListener(event, showCursor, { passive: true });

        return () => {
            clearTimeout(timer);
            root.classList.remove(styles.idleCursor);
            document.removeEventListener('fullscreenchange', showCursor);
            for (const event of events) window.removeEventListener(event, showCursor);
        };
    }, [expanded]);

    useEffect(() => {
        const toggleFullscreen = () => {
            // Already fullscreen: back out, regardless of what was fullscreened.
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
                return;
            }

            const { visualizerExpanded } = useFullScreenPlayerStore.getState();

            const visualizerTarget = visualizerExpanded
                ? document.getElementById(VISUALIZER_FULLSCREEN_TARGET_ID)
                : null;

            // Expanded visualizer -> fullscreen just the visualizer.
            // Anything else -> normal whole-window fullscreen.
            const target = visualizerTarget ?? document.documentElement;

            target.requestFullscreen().catch(() => {});
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'F11') return;

            event.preventDefault();
            toggleFullscreen();
        };

        // Capture phase so this still fires while a text input has focus.
        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, []);
};
