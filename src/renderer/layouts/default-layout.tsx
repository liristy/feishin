import clsx from 'clsx';
import isElectron from 'is-electron';
import { CSSProperties } from 'react';

import styles from './default-layout.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { MainContent } from '/@/renderer/layouts/default-layout/main-content';
import { PlayerBar } from '/@/renderer/layouts/default-layout/player-bar';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import { useAppStore, useFullScreenPlayerStore } from '/@/renderer/store';
import { useSettingsStore, useWindowBarStyle } from '/@/renderer/store/settings.store';
import { Platform, PlayerType } from '/@/shared/types/types';

if (!isElectron()) {
    useSettingsStore.getState().actions.setSettings({
        playback: {
            type: PlayerType.WEB,
        },
    });
}

interface DefaultLayoutProps {
    shell?: boolean;
}

export const DefaultLayout = ({ shell }: DefaultLayoutProps) => {
    const windowBarStyle = useWindowBarStyle();
    const expanded = useFullScreenPlayerStore((state) => state.expanded);
    const sidebarWidth = useAppStore((state) =>
        state.sidebar.collapsed ? '80px' : state.sidebar.leftWidth,
    );

    return (
        <>
            <div
                className={clsx(styles.layout, {
                    [styles.fullscreen]: expanded,
                    [styles.macos]: windowBarStyle === Platform.MACOS,
                    [styles.windows]: windowBarStyle === Platform.WINDOWS,
                })}
                id="default-layout"
                style={{ '--player-sidebar-width': shell ? '0px' : sidebarWidth } as CSSProperties}
            >
                <WindowBar />
                <MainContent shell={shell} />
                <PlayerBar />
            </div>
            <ContextMenuController.Root />
        </>
    );
};
