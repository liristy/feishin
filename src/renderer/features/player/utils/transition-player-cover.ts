import { flushSync } from 'react-dom';

import './transition-player-cover.css';

let activeTransition: undefined | ViewTransition;
let pendingUpdate: (() => void) | undefined;

const getCoverAppearance = () => {
    const cover =
        document.querySelector('[data-player-cover="expanded"]') ??
        document.querySelector('[data-player-cover="compact"]');
    const image = cover?.querySelector('img') ?? cover;
    const bounds = cover?.getBoundingClientRect();
    return {
        preserveAspectRatio:
            !!bounds &&
            (Math.abs(bounds.width - bounds.height) > 1 ||
                Array.from(cover!.querySelectorAll('img')).some(
                    (img) =>
                        getComputedStyle(img).objectFit === 'contain' ||
                        (img.naturalWidth > 0 && img.naturalWidth !== img.naturalHeight),
                )),
        radius: image ? getComputedStyle(image).borderTopLeftRadius : '0px',
    };
};

export const transitionPlayerCover = (update: () => void) => {
    activeTransition?.skipTransition();
    // Finish an interrupted update before taking the next pair of snapshots.
    pendingUpdate?.();

    if (
        !document.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        update();
        return;
    }

    const root = document.documentElement;
    const from = getCoverAppearance();
    root.style.setProperty('--player-cover-radius-from', from.radius);

    const applyUpdate = () => {
        if (pendingUpdate !== applyUpdate) return;
        pendingUpdate = undefined;
        flushSync(update);
        const to = getCoverAppearance();
        root.style.setProperty('--player-cover-radius-to', to.radius);
        root.toggleAttribute(
            'data-player-cover-preserve-aspect',
            from.preserveAspectRatio || to.preserveAspectRatio,
        );
    };
    pendingUpdate = applyUpdate;
    activeTransition = document.startViewTransition(applyUpdate);
    const transition = activeTransition;
    // Skipping a transition rejects ready, but still applies the requested state.
    void activeTransition.ready.catch(() => {});
    void transition.finished.then(() => {
        if (activeTransition !== transition) return;
        root.removeAttribute('data-player-cover-preserve-aspect');
        activeTransition = undefined;
    });
};
