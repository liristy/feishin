import clsx from 'clsx';
import { AnimatePresence, motion, Variants } from 'motion/react';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './full-screen-player-queue.module.css';

import { Lyrics } from '/@/renderer/features/lyrics/lyrics';
import { PlayQueue } from '/@/renderer/features/now-playing/components/play-queue';
import { usePlaybackSettings, useSettingsStore } from '/@/renderer/store';
import {
    useFullScreenPlayerStore,
    useFullScreenPlayerStoreActions,
} from '/@/renderer/store/full-screen-player.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Group } from '/@/shared/components/group/group';
import { AppIcon } from '/@/shared/components/icon/icon';
import { ItemListKey } from '/@/shared/types/types';

const AudioMotionAnalyzerVisualizer = lazy(() =>
    import('../../visualizer/components/audiomotionanalyzer/visualizer').then((module) => ({
        default: module.Visualizer,
    })),
);

const ButterchurnVisualizer = lazy(() =>
    import('../../visualizer/components/butternchurn/visualizer').then((module) => ({
        default: module.Visualizer,
    })),
);

const isDesktopPanelOpen = (activeTab: string, webAudio: boolean) =>
    activeTab === 'queue' || activeTab === 'lyrics' || (activeTab === 'visualizer' && webAudio);

const moduleContentVariants: Variants = {
    animate: {
        opacity: 1,
        transition: {
            duration: 0.15,
            ease: 'easeOut',
        },
        x: 0,
    },
    exit: {
        opacity: 0,
        transition: {
            duration: 0,
            ease: 'easeOut',
        },
        x: 0,
    },
    initial: {
        opacity: 0,
        x: 0,
    },
};

interface ControlItem {
    active: boolean;
    icon: keyof typeof AppIcon;
    label: string;
    onClick: () => void;
}

const Controls = () => {
    const { t } = useTranslation();
    const { activeTab } = useFullScreenPlayerStore();
    const { setStore } = useFullScreenPlayerStoreActions();
    const { webAudio } = usePlaybackSettings();

    const toggleTab = (tab: string) => {
        setStore({ activeTab: activeTab === tab ? '' : tab });
    };

    const headerItems = useMemo(() => {
        const items: ControlItem[] = [
            {
                active: activeTab === 'queue',
                icon: 'queue',
                label: t('page.fullscreenPlayer.upNext'),
                onClick: () => toggleTab('queue'),
            },
            {
                active: activeTab === 'lyrics',
                icon: 'microphone',
                label: t('page.fullscreenPlayer.lyrics'),
                onClick: () => toggleTab('lyrics'),
            },
        ];

        if (webAudio) {
            items.push({
                active: activeTab === 'visualizer',
                icon: 'audioLines',
                label: t('page.fullscreenPlayer.visualizer'),
                onClick: () => toggleTab('visualizer'),
            });
        }

        return items;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, setStore, t, webAudio]);

    return (
        <Group
            className={clsx(styles.controlsContainer, 'full-screen-player-controls-container')}
            gap="xs"
            p="0.5rem"
            pos="absolute"
        >
            {headerItems.map((item) => (
                <div key={`tab-${item.label}`}>
                    <ActionIcon
                        aria-pressed={item.active}
                        icon={item.icon}
                        iconProps={{
                            color: item.active ? 'primary' : undefined,
                            size: 'lg',
                        }}
                        onClick={item.onClick}
                        tooltip={{ label: item.label }}
                        variant="subtle"
                    ></ActionIcon>
                </div>
            ))}
        </Group>
    );
};

export const FullScreenPlayerControls = Controls;

export const FullScreenPlayerQueue = () => {
    const { activeTab } = useFullScreenPlayerStore();
    const { webAudio } = usePlaybackSettings();
    const visualizerType = useSettingsStore((store) => store.visualizer.type);
    const isPanelOpen = isDesktopPanelOpen(activeTab, webAudio);
    const isCollapsed = !isPanelOpen;

    return (
        <div
            className={clsx(styles.gridContainer, 'full-screen-player-queue-container', {
                [styles.gridContainerCollapsed]: isCollapsed,
            })}
        >
            <AnimatePresence initial={false} mode="wait">
                {activeTab === 'queue' ? (
                    <motion.div
                        animate="animate"
                        className={styles.queueContainer}
                        exit="exit"
                        initial="initial"
                        key="queue"
                        variants={moduleContentVariants}
                    >
                        <PlayQueue
                            enableScrollShadow={false}
                            listKey={ItemListKey.FULL_SCREEN}
                            searchTerm={undefined}
                        />
                    </motion.div>
                ) : activeTab === 'lyrics' ? (
                    <motion.div
                        animate="animate"
                        className={styles.moduleContent}
                        exit="exit"
                        initial="initial"
                        key="lyrics"
                        variants={moduleContentVariants}
                    >
                        <Lyrics fadeOutNoLyricsMessage={false} />
                    </motion.div>
                ) : activeTab === 'visualizer' && webAudio ? (
                    <motion.div
                        animate="animate"
                        className={styles.moduleContent}
                        exit="exit"
                        initial="initial"
                        key="visualizer"
                        variants={moduleContentVariants}
                    >
                        <Suspense fallback={<></>}>
                            {visualizerType === 'butterchurn' ? (
                                <ButterchurnVisualizer />
                            ) : (
                                <AudioMotionAnalyzerVisualizer />
                            )}
                        </Suspense>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
};
