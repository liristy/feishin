import clsx from 'clsx';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, Link } from 'react-router';
import { shallow } from 'zustand/shallow';

import styles from './left-controls.module.css';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import {
    JOINED_ARTISTS_MUTED_PROPS,
    JoinedArtists,
} from '/@/renderer/features/albums/components/joined-artists';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { RadioMetadataDisplay } from '/@/renderer/features/player/components/radio-metadata-display';
import {
    useIsRadioActive,
    useRadioPlayer,
} from '/@/renderer/features/radio/hooks/use-radio-player';
import { useHotkeys } from '/@/renderer/hooks/use-hotkeys';
import { AppRoute } from '/@/renderer/router/routes';
import {
    useAppStore,
    useAppStoreActions,
    useFullScreenPlayerStore,
    useHotkeySettings,
    usePlayerSong,
    useSetFullScreenPlayerStore,
    useSidebarImageEnabled,
} from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { TextScrolling } from '/@/shared/components/text-scrolling/text-scrolling';
import { Text } from '/@/shared/components/text/text';
import { Tooltip } from '/@/shared/components/tooltip/tooltip';
import { PlaybackSelectors } from '/@/shared/constants/playback-selectors';
import { LibraryItem } from '/@/shared/types/domain-types';

export const LeftControls = ({ compact = false }: { compact?: boolean }) => {
    const { t } = useTranslation();
    const { setSideBar } = useAppStoreActions();
    const {
        expanded: isFullScreenPlayerExpanded,
        visualizerExpanded: isFullScreenVisualizerExpanded,
    } = useFullScreenPlayerStore();
    const setFullScreenPlayerStore = useSetFullScreenPlayerStore();

    const { collapsed: sidebarCollapsed, image: sidebarImageShown } = useAppStore(
        (state) => ({
            collapsed: state.sidebar.collapsed,
            image: state.sidebar.image,
        }),
        shallow,
    );

    const currentSong = usePlayerSong();
    const isRadioActive = useIsRadioActive();
    const { currentStationArt } = useRadioPlayer();
    const { bindings } = useHotkeySettings();
    const sidebarImageEnabled = useSidebarImageEnabled();

    const isRadioMode = isRadioActive;
    const hasRadioStationImage = Boolean(currentStationArt?.imageId || currentStationArt?.imageUrl);
    const hideImage = !sidebarCollapsed && sidebarImageEnabled && sidebarImageShown;
    const isSongDefined = Boolean(currentSong?.id) && !isRadioMode;
    const title = currentSong?.name;
    const artists = currentSong?.artists;

    const handleToggleFullScreenPlayer = (e?: KeyboardEvent | MouseEvent<HTMLDivElement>) => {
        // don't toggle if right click
        if (e && 'button' in e && e.button === 2) {
            return;
        }

        e?.stopPropagation();

        const shouldClose = isFullScreenPlayerExpanded || isFullScreenVisualizerExpanded;

        if (shouldClose) {
            setFullScreenPlayerStore({
                expanded: false,
                visualizerExpanded: false,
                visualizerReturnToPlayer: false,
            });
        } else {
            setFullScreenPlayerStore({ expanded: true });
        }
    };

    const handleToggleSidebarImage = (e?: MouseEvent<HTMLButtonElement>) => {
        e?.stopPropagation();
        setSideBar({ image: true });
    };

    const handleToggleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentSong) {
            return;
        }

        ContextMenuController.call({
            cmd: { items: [currentSong], type: LibraryItem.SONG },
            event: e,
        });
    };

    const stopPropagation = (e?: MouseEvent) => e?.stopPropagation();

    useHotkeys([
        [
            bindings.toggleFullscreenPlayer.allowGlobal
                ? ''
                : bindings.toggleFullscreenPlayer.hotkey,
            handleToggleFullScreenPlayer,
        ],
    ]);

    return (
        <div className={styles.leftControlsContainer}>
            <LayoutGroup>
                <AnimatePresence initial={false} mode="popLayout">
                    {!hideImage && (
                        <div className={styles.imageWrapper}>
                            <motion.div
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                className={styles.image}
                                data-player-cover="compact"
                                exit={{ opacity: 0, x: -50 }}
                                initial={{ opacity: 0, x: -50 }}
                                key="playerbar-image"
                                onClick={handleToggleFullScreenPlayer}
                                onContextMenu={handleToggleContextMenu}
                                role="button"
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                whileHover={{ scale: 1.1 }}
                            >
                                <Tooltip label={t('player.toggleFullscreenPlayer')}>
                                    {isRadioMode && hasRadioStationImage ? (
                                        <ItemImage
                                            className={clsx(
                                                styles.playerbarImage,
                                                PlaybackSelectors.playerCoverArt,
                                            )}
                                            enableDebounce={false}
                                            enableViewport={false}
                                            fetchPriority="high"
                                            id={currentStationArt?.imageId ?? undefined}
                                            itemType={LibraryItem.RADIO_STATION}
                                            serverId={currentStationArt?.serverId}
                                            src={currentStationArt?.imageUrl ?? ''}
                                            thumbHash={currentStationArt?.thumbHash ?? null}
                                            type="table"
                                        />
                                    ) : isRadioMode ? (
                                        <Center
                                            className={clsx(
                                                styles.playerbarImage,
                                                styles.radioImage,
                                            )}
                                        >
                                            <Icon color="muted" icon="radio" size="40%" />
                                        </Center>
                                    ) : (
                                        <ItemImage
                                            blurHash={currentSong?.blurHash}
                                            className={clsx(
                                                styles.playerbarImage,
                                                PlaybackSelectors.playerCoverArt,
                                            )}
                                            enableDebounce={false}
                                            enableViewport={false}
                                            explicitStatus={currentSong?.explicitStatus}
                                            fetchPriority="high"
                                            id={currentSong?.imageId}
                                            itemType={LibraryItem.SONG}
                                            serverId={currentSong?._serverId}
                                            thumbHash={currentSong?.thumbHash}
                                            type="table"
                                        />
                                    )}
                                </Tooltip>
                                {!sidebarCollapsed && sidebarImageEnabled && (
                                    <ActionIcon
                                        icon="arrowUpS"
                                        iconProps={{ size: 'xl' }}
                                        onClick={handleToggleSidebarImage}
                                        opacity={0.8}
                                        radius="md"
                                        size="xs"
                                        style={{
                                            cursor: 'default',
                                            position: 'absolute',
                                            right: 2,
                                            top: 2,
                                        }}
                                        tooltip={{
                                            label: t('common.expand'),
                                            openDelay: 0,
                                        }}
                                    />
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
                <div className={styles.metadataStack}>
                    {isRadioMode ? (
                        <RadioMetadataDisplay
                            onStopPropagation={stopPropagation}
                            onToggleContextMenu={handleToggleContextMenu}
                        />
                    ) : (
                        <>
                            <div className={styles.lineItem} onClick={stopPropagation}>
                                <Group
                                    align="center"
                                    className={styles.titleGroup}
                                    gap="xs"
                                    wrap="nowrap"
                                >
                                    <TextScrolling
                                        className={PlaybackSelectors.songTitle}
                                        fw={500}
                                        gap={80}
                                        onContextMenu={handleToggleContextMenu}
                                        pause={3}
                                        speed={30}
                                    >
                                        {title || '-'}
                                        {currentSong?.trackSubtitle && (
                                            <Text component="span" isMuted size="sm">
                                                {' ('}
                                                {currentSong.trackSubtitle}
                                                {')'}
                                            </Text>
                                        )}
                                    </TextScrolling>
                                    {isSongDefined && !compact && (
                                        <ActionIcon
                                            icon="ellipsisVertical"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (currentSong) {
                                                    ContextMenuController.call({
                                                        cmd: {
                                                            items: [currentSong],
                                                            type: LibraryItem.SONG,
                                                        },
                                                        event: e,
                                                    });
                                                }
                                            }}
                                            size="xs"
                                            styles={{
                                                root: {
                                                    '--ai-size-xs': '1.15rem',
                                                },
                                            }}
                                            variant="subtle"
                                        />
                                    )}
                                </Group>
                            </div>
                            <div
                                className={clsx(styles.lineItem, styles.secondary)}
                                onClick={stopPropagation}
                            >
                                <div
                                    className={clsx(
                                        styles.artistMetadata,
                                        PlaybackSelectors.songArtist,
                                    )}
                                >
                                    <TextScrolling gap={80} pause={3} speed={30}>
                                        <JoinedArtists
                                            artistName={currentSong?.artistName || ''}
                                            artists={artists || []}
                                            linkProps={{
                                                ...JOINED_ARTISTS_MUTED_PROPS.linkProps,
                                                size: compact ? 'xs' : 'md',
                                            }}
                                            rootTextProps={{
                                                ...JOINED_ARTISTS_MUTED_PROPS.rootTextProps,
                                                className: styles.joinedArtists,
                                                size: compact ? 'xs' : 'md',
                                            }}
                                        />
                                    </TextScrolling>
                                </div>
                                {compact && currentSong?.album && (
                                    <>
                                        <Text component="span">·</Text>
                                        <div className={styles.compactAlbum}>
                                            <TextScrolling
                                                className={PlaybackSelectors.songAlbum}
                                                component={Link}
                                                gap={80}
                                                isLink
                                                pause={3}
                                                size="xs"
                                                speed={30}
                                                to={
                                                    currentSong.albumId
                                                        ? generatePath(
                                                              AppRoute.LIBRARY_ALBUMS_DETAIL,
                                                              {
                                                                  albumId: currentSong.albumId,
                                                              },
                                                          )
                                                        : ''
                                                }
                                            >
                                                {currentSong.album}
                                            </TextScrolling>
                                        </div>
                                    </>
                                )}
                            </div>
                            {!compact && (
                                <div
                                    className={clsx(
                                        styles.lineItem,
                                        styles.secondary,
                                        PlaybackSelectors.songAlbum,
                                    )}
                                    onClick={stopPropagation}
                                >
                                    <TextScrolling
                                        component={Link}
                                        fw={500}
                                        gap={80}
                                        isLink
                                        pause={3}
                                        size="md"
                                        speed={30}
                                        to={
                                            currentSong?.albumId
                                                ? generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, {
                                                      albumId: currentSong.albumId,
                                                  })
                                                : ''
                                        }
                                    >
                                        {currentSong?.album || '-'}
                                    </TextScrolling>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </LayoutGroup>
        </div>
    );
};
