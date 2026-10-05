import { Outlet } from 'react-router';

import styles from './titlebar-outlet.module.css';

import { Titlebar } from '/@/renderer/features/titlebar/components/titlebar';
import { useFullScreenPlayerStore } from '/@/renderer/store';
import { useWindowBarStyle } from '/@/renderer/store/settings.store';
import { Platform } from '/@/shared/types/types';

export const TitlebarOutlet = () => {
    const windowBarStyle = useWindowBarStyle();
    const expanded = useFullScreenPlayerStore((state) => state.expanded);

    return (
        <>
            {windowBarStyle === Platform.WEB && !expanded && (
                <header className={styles.container}>
                    <Titlebar />
                </header>
            )}
            <Outlet />
        </>
    );
};
