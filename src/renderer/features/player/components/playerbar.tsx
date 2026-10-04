import clsx from 'clsx';
import { lazy, MouseEvent, Suspense } from 'react';

import styles from './playerbar.module.css';

import { CenterControls } from '/@/renderer/features/player/components/center-controls';
import { LeftControls } from '/@/renderer/features/player/components/left-controls';
import { PlayerbarSlider } from '/@/renderer/features/player/components/playerbar-slider';
import { RightControls } from '/@/renderer/features/player/components/right-controls';
import { useIsRadioActive } from '/@/renderer/features/radio/hooks/use-radio-player';
import { useIsMobile } from '/@/renderer/hooks/use-is-mobile';
import { Spinner } from '/@/shared/components/spinner/spinner';

const MobilePlayerbar = lazy(() =>
    import('./mobile-playerbar').then((module) => ({
        default: module.MobilePlayerbar,
    })),
);
import { useFullScreenPlayerStore, useSetFullScreenPlayerStore } from '/@/renderer/store';
import { usePlayerbarOpenDrawer } from '/@/renderer/store';
import { PlaybackSelectors } from '/@/shared/constants/playback-selectors';

export const Playerbar = () => {
    const playerbarOpenDrawer = usePlayerbarOpenDrawer();
    const { expanded: isFullScreenPlayerExpanded } = useFullScreenPlayerStore();
    const setFullScreenPlayerStore = useSetFullScreenPlayerStore();
    const isMobile = useIsMobile();
    const isRadioActive = useIsRadioActive();

    const handleToggleFullScreenPlayer = (e?: KeyboardEvent | MouseEvent<HTMLDivElement>) => {
        e?.stopPropagation();
        setFullScreenPlayerStore({ expanded: !isFullScreenPlayerExpanded });
    };

    if (isMobile) {
        return (
            <Suspense fallback={<Spinner />}>
                <MobilePlayerbar />
            </Suspense>
        );
    }

    return (
        <div
            className={clsx(styles.container, PlaybackSelectors.mediaPlayer)}
            onClick={playerbarOpenDrawer ? handleToggleFullScreenPlayer : undefined}
        >
            <div
                className={clsx(styles.controlsGrid, {
                    [styles.compact]: !isFullScreenPlayerExpanded,
                })}
            >
                <div
                    className={clsx(styles.leftGridItem, {
                        [styles.hidden]: isFullScreenPlayerExpanded,
                    })}
                >
                    <LeftControls compact={!isFullScreenPlayerExpanded} />
                    {!isFullScreenPlayerExpanded && !isRadioActive && <PlayerbarSlider compact />}
                </div>
                <div className={styles.centerGridItem} data-player-controls>
                    <CenterControls
                        compact={!isFullScreenPlayerExpanded}
                        showSlider={isFullScreenPlayerExpanded}
                    />
                </div>
                <div
                    className={clsx(styles.rightGridItem, {
                        [styles.revealOnHover]: isFullScreenPlayerExpanded,
                    })}
                >
                    <RightControls compact={!isFullScreenPlayerExpanded} />
                </div>
            </div>
        </div>
    );
};
