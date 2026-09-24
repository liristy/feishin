import clsx from 'clsx';
import { AnimatePresence, motion, Variants } from 'motion/react';
import { CSSProperties, memo, ReactNode, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';

import styles from './full-screen-player.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { CoverFlowCanvas } from '/@/renderer/features/player/components/cover-flow-canvas';
import { FullScreenPlayerImage } from '/@/renderer/features/player/components/full-screen-player-image';
import {
    FullScreenPlayerControls,
    FullScreenPlayerQueue,
} from '/@/renderer/features/player/components/full-screen-player-queue';
import { SharedFullscreenPlayerSettings } from '/@/renderer/features/player/components/shared-full-screen-player-settings';
import { useCoverFlowImage } from '/@/renderer/features/player/hooks/use-cover-flow-image';
import {
    useIsRadioActive,
    useRadioPlayer,
} from '/@/renderer/features/radio/hooks/use-radio-player';
import { WindowControls } from '/@/renderer/features/window-controls/components/window-controls';
import { useFastAverageColor } from '/@/renderer/hooks';
import {
    useFullScreenPlayerStore,
    useFullScreenPlayerStoreActions,
    useImagePlaceholderPriority,
    usePlayerSong,
} from '/@/renderer/store';
import { Group } from '/@/shared/components/group/group';
import { useImageHashUrl } from '/@/shared/hooks/use-image-hash-url';
import { ExplicitStatus, LibraryItem } from '/@/shared/types/domain-types';

const mainBackground = 'var(--theme-colors-background)';

interface BackgroundImageProps {
    dynamicBackground: boolean | undefined;
    dynamicImageBlur: number | undefined;
    dynamicIsImage: boolean | undefined;
}

const BackgroundImage = memo(
    ({ dynamicBackground, dynamicImageBlur, dynamicIsImage }: BackgroundImageProps) => {
        const currentSong = usePlayerSong();
        const imageUrl = useItemImageUrl({
            id: currentSong?.imageId || undefined,
            imageUrl: currentSong?.imageUrl,
            itemType: LibraryItem.SONG,
            type: 'itemCard',
        });
        const imagePlaceholderPriority = useImagePlaceholderPriority();
        const hashUrl = useImageHashUrl(
            currentSong?.thumbHash,
            currentSong?.blurHash,
            null,
            imagePlaceholderPriority,
        );
        const sourceUrl =
            currentSong?.explicitStatus !== ExplicitStatus.EXPLICIT && hashUrl ? hashUrl : imageUrl;
        const flowUrl = useCoverFlowImage(
            dynamicBackground && !dynamicIsImage ? imageUrl || sourceUrl : null,
            dynamicImageBlur ?? 0,
            sourceUrl,
        );
        const backgroundUrl = dynamicIsImage ? sourceUrl : flowUrl;

        if (!dynamicBackground) return null;

        return (
            <AnimatePresence initial={false}>
                {backgroundUrl && (
                    <motion.div
                        animate={{ opacity: 1 }}
                        className={styles.backgroundImage}
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key={currentSong?._uniqueId || currentSong?.id || 'none'}
                        style={{ '--image-blur': `${dynamicImageBlur ?? 0}rem` } as CSSProperties}
                        transition={{ duration: 1.5, ease: 'easeInOut' }}
                    >
                        {dynamicIsImage ? (
                            <div
                                className={styles.backgroundArtwork}
                                style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }}
                            />
                        ) : (
                            <CoverFlowCanvas
                                className={styles.backgroundFlow}
                                source={backgroundUrl}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        );
    },
);

BackgroundImage.displayName = 'BackgroundImage';

interface BackgroundOverlayProps {
    dynamicBackground: boolean | undefined;
    opacity: number;
}

const BackgroundOverlay = memo(({ dynamicBackground, opacity }: BackgroundOverlayProps) => {
    if (!dynamicBackground) {
        return null;
    }

    // Opacity is divided by 120 instead of 100, to prevent a complete black background at maximum opacity
    const alpha = Math.min(1, Math.max(0, opacity / 120));

    return (
        <div
            className={styles.backgroundOverlay}
            style={{ backgroundColor: `rgba(0, 0, 0, ${alpha})` }}
        />
    );
});

BackgroundOverlay.displayName = 'BackgroundOverlay';

const containerVariants: Variants = {
    closed: {
        transition: {
            duration: 0.5,
            ease: 'easeOut',
        },
        y: '100%',
    },
    open: (custom) => {
        const { background, dynamicBackground } = custom;
        return {
            backgroundColor: dynamicBackground ? background : mainBackground,
            transition: {
                delay: 0.1,
                duration: 0.5,
                ease: 'easeOut',
            },
            y: 0,
        };
    },
};

interface PlayerContainerProps {
    children: ReactNode;
    dynamicBackground: boolean | undefined;
    dynamicImageBlur: number | undefined;
    dynamicIsImage: boolean | undefined;
    opacity: number;
}

const PlayerContainer = memo(
    ({
        children,
        dynamicBackground,
        dynamicImageBlur,
        dynamicIsImage,
        opacity,
    }: PlayerContainerProps) => {
        const currentSong = usePlayerSong();
        const isRadioActive = useIsRadioActive();
        const { currentStationArt: currentRadioStationArt } = useRadioPlayer();

        const imageId = isRadioActive ? currentRadioStationArt?.imageId : currentSong?.imageId;
        const currentImageUrl = isRadioActive
            ? currentRadioStationArt?.imageUrl
            : currentSong?.imageUrl;

        const imageUrl = useItemImageUrl({
            id: imageId || undefined,
            imageUrl: currentImageUrl,
            itemType: LibraryItem.SONG,
            type: 'itemCard',
        });
        const { background } = useFastAverageColor({
            algorithm: 'dominant',
            src: imageUrl,
            srcLoaded: true,
        });

        return (
            <motion.div
                animate="open"
                className={styles.container}
                custom={{ background, dynamicBackground }}
                exit="closed"
                initial="closed"
                transition={{ duration: 2 }}
                variants={containerVariants}
            >
                <div className={styles.background}>
                    <BackgroundImage
                        dynamicBackground={dynamicBackground}
                        dynamicImageBlur={dynamicImageBlur}
                        dynamicIsImage={dynamicIsImage}
                    />
                    <BackgroundOverlay dynamicBackground={dynamicBackground} opacity={opacity} />
                    {dynamicBackground && (
                        <div
                            className={clsx(
                                styles.backgroundImageOverlay,
                                !dynamicIsImage && styles.flowOverlay,
                            )}
                        />
                    )}
                </div>
                {children}
            </motion.div>
        );
    },
);

PlayerContainer.displayName = 'PlayerContainer';

export const FullScreenPlayer = () => {
    const { activeTab, dynamicBackground, dynamicImageBlur, dynamicIsImage, opacity } =
        useFullScreenPlayerStore();
    const { setStore } = useFullScreenPlayerStoreActions();
    const hasActiveModule =
        activeTab === 'queue' || activeTab === 'lyrics' || activeTab === 'visualizer';

    const isRadioActive = useIsRadioActive();
    const { isPlaying: isRadioPlaying } = useRadioPlayer();

    const isPlayingRadio = isRadioActive && isRadioPlaying;
    const effectiveDynamicBackground = dynamicBackground && !isPlayingRadio;

    const location = useLocation();
    const isOpenedRef = useRef<boolean | null>(null);

    useLayoutEffect(() => {
        if (isOpenedRef.current !== null) {
            setStore({ expanded: false });
        }

        isOpenedRef.current = true;
    }, [location, setStore]);

    return (
        <PlayerContainer
            dynamicBackground={effectiveDynamicBackground}
            dynamicImageBlur={dynamicImageBlur}
            dynamicIsImage={dynamicIsImage}
            opacity={opacity}
        >
            <div className={styles.windowControls}>
                <WindowControls />
            </div>
            <Group
                className={clsx(styles.headerControls, 'full-screen-player-controls-container')}
                gap="sm"
                p="0.5rem"
                pos="absolute"
                style={{
                    background: `rgb(var(--theme-colors-background-transparent))`,
                    left: 0,
                    top: 0,
                }}
            >
                <SharedFullscreenPlayerSettings />
            </Group>
            <div className={styles.responsiveContainer}>
                <div
                    className={clsx(styles.imageColumn, {
                        [styles.imageColumnCentered]: !hasActiveModule,
                    })}
                >
                    <FullScreenPlayerImage />
                </div>
                <FullScreenPlayerQueue />
            </div>
            <FullScreenPlayerControls />
        </PlayerContainer>
    );
};
