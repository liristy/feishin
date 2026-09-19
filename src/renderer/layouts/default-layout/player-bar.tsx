import clsx from 'clsx';

import styles from './player-bar.module.css';

import { Playerbar } from '/@/renderer/features/player/components/playerbar';
import { useIsMobile } from '/@/renderer/hooks/use-is-mobile';
import { useFullScreenPlayerStore, usePlayerbarOpenDrawer } from '/@/renderer/store';

export const PlayerBar = () => {
    const playerbarOpenDrawer = usePlayerbarOpenDrawer();
    const expanded = useFullScreenPlayerStore((state) => state.expanded);
    const isMobile = useIsMobile();

    return (
        <div
            className={clsx({
                [styles.container]: true,
                [styles.fullscreen]: expanded && !isMobile,
                [styles.openDrawer]: playerbarOpenDrawer,
            })}
            id="player-bar"
        >
            <Playerbar />
        </div>
    );
};
