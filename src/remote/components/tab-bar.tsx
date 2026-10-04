import { motion } from 'motion/react';
import { RiHome5Line, RiMusic2Line, RiRadioLine } from 'react-icons/ri';
import { NavLink } from 'react-router';

import styles from './tab-bar.module.css';

import { Icon } from '/@/shared/components/icon/icon';

interface Tab {
    icon: React.ReactNode;
    label: string;
    to: string;
}

const TABS: Tab[] = [
    { icon: <RiHome5Line size={22} />, label: 'Home', to: '/' },
    { icon: <RiMusic2Line size={22} />, label: 'Library', to: '/library' },
    { icon: <Icon icon="playlist" size={22} />, label: 'Playlists', to: '/playlists' },
    { icon: <RiRadioLine size={22} />, label: 'Radio', to: '/radio' },
    { icon: <Icon icon="queue" size={22} />, label: 'Queue', to: '/queue' },
];

export const TabBar = () => {
    return (
        <nav className={styles.tabBar}>
            {TABS.map((tab) => (
                <NavLink
                    className={({ isActive }) =>
                        isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
                    }
                    end={tab.to === '/'}
                    key={tab.to}
                    to={tab.to}
                >
                    {({ isActive }) => (
                        <>
                            {isActive && (
                                <motion.div
                                    className={styles.activeIndicator}
                                    layoutId="tab-active-indicator"
                                    transition={{ damping: 30, stiffness: 500, type: 'spring' }}
                                />
                            )}
                            <span className={styles.tabIcon}>{tab.icon}</span>
                            <span className={styles.tabLabel}>{tab.label}</span>
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    );
};
