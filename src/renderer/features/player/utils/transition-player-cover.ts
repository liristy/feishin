import { flushSync } from 'react-dom';

import './transition-player-cover.css';

let activeTransition: undefined | ViewTransition;
let pendingUpdate: (() => void) | undefined;

const getCoverAppearance = () => {
    const cover =
        document.querySelector('[data-player-cover="expanded"]') ??
        document.querySelector('[data-player-cover="compact"]');
    const image = cover?.querySelector('img') ?? cover;
    const imageStyle = image ? getComputedStyle(image) : null;
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
        radius: imageStyle?.borderTopLeftRadius ?? '0px',
        shadow: imageStyle?.filter.includes('drop-shadow')
            ? imageStyle.filter
            : 'drop-shadow(rgba(0, 0, 0, 0) 0px 0px 0px)',
    };
};

const getPlayerRadius = () => {
    const player = document.querySelector('[data-fullscreen-player]')
        ? (document.querySelector('#default-layout') ??
          document.querySelector('[data-fullscreen-player]'))
        : document.querySelector('#player-bar');
    return player ? getComputedStyle(player).borderTopLeftRadius : '0px';
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
    root.setAttribute('data-player-transition', '');
    root.style.setProperty('--player-cover-radius-from', from.radius);
    root.style.setProperty('--player-cover-shadow-from', from.shadow);
    root.style.setProperty('--player-page-radius-from', getPlayerRadius());

    // Artwork loads independently; opening must never wait for network or decoding.
    const applyUpdate = () => {
        if (pendingUpdate !== applyUpdate) return;
        pendingUpdate = undefined;
        flushSync(update);
        const to = getCoverAppearance();
        root.style.setProperty('--player-cover-radius-to', to.radius);
        root.style.setProperty('--player-cover-shadow-to', to.shadow);
        root.style.setProperty('--player-page-radius-to', getPlayerRadius());
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
        root.removeAttribute('data-player-transition');
        activeTransition = undefined;
    });
};
