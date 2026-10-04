import { flushSync } from 'react-dom';

import './transition-player-cover.css';

let activeTransition: undefined | ViewTransition;
let pendingUpdate: (() => Promise<void>) | undefined;

// Wait for the large artwork before Chromium captures the expanded player.
const waitForCover = (cover: Element) =>
    new Promise<void>((resolve) => {
        const finish = () => {
            window.clearTimeout(timeout);
            observer.disconnect();
            cover.removeEventListener('load', check, true);
            cover.removeEventListener('error', finish, true);
            resolve();
        };
        const check = () => {
            const image = cover.querySelector('img');
            const bounds = cover.getBoundingClientRect();
            const resolution = Math.max(bounds.width, bounds.height) * window.devicePixelRatio;
            if (
                image?.complete &&
                image.naturalWidth > 0 &&
                Math.max(image.naturalWidth, image.naturalHeight) >= resolution
            ) {
                void image
                    .decode()
                    .then(() => {
                        if (image.isConnected) finish();
                    })
                    .catch(() => {});
            }
        };
        const observer = new MutationObserver(check);
        const timeout = window.setTimeout(finish, 1000);
        observer.observe(cover, { attributes: true, childList: true, subtree: true });
        cover.addEventListener('load', check, true);
        cover.addEventListener('error', finish, true);
        check();
    });

const getCoverAppearance = () => {
    const cover =
        document.querySelector('[data-player-cover="expanded"]') ??
        document.querySelector('[data-player-cover="compact"]');
    const image = cover?.querySelector('img') ?? cover;
    const bounds = cover?.getBoundingClientRect();
    return {
        loaded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
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
    void pendingUpdate?.();

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
    root.style.setProperty('--player-page-radius-from', getPlayerRadius());

    const applyUpdate = async () => {
        if (pendingUpdate !== applyUpdate) return;
        pendingUpdate = undefined;
        flushSync(update);
        const expandedCover = document.querySelector('[data-player-cover="expanded"]');
        if (expandedCover && from.loaded) await waitForCover(expandedCover);
        if (expandedCover && !expandedCover.isConnected) return;
        const to = getCoverAppearance();
        root.style.setProperty('--player-cover-radius-to', to.radius);
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
