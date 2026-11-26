import isElectron from 'is-electron';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './lyrics-actions.module.css';

import { useLyricsSettings, usePlayerSong } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { Popover } from '/@/shared/components/popover/popover';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';
import { Tooltip } from '/@/shared/components/tooltip/tooltip';
import { LyricsKind } from '/@/shared/types/domain-types';

export type OverlayLayerToggle = {
    key: string;
    kind: Exclude<LyricsKind, 'translation'>;
    label: string;
};

interface LyricsActionsProps {
    hasLyrics: boolean;
    offsetMs: number;
    onRemoveLyric: () => void;
    onToggleOverlayLayer?: (key: string) => void;
    onToggleTranslation?: () => void;
    onTranslateLyric?: () => void;
    onUpdateOffset: (offsetMs: number) => void;
    overlayLayers?: OverlayLayerToggle[];
    showEditingControls?: boolean;
    translationVisible?: boolean;
    visibleOverlayKeys?: Set<string>;
}

export const LyricsActions = ({
    hasLyrics,
    offsetMs,
    onRemoveLyric,
    onToggleOverlayLayer,
    onToggleTranslation,
    onTranslateLyric,
    onUpdateOffset,
    overlayLayers = [],
    showEditingControls = true,
    translationVisible = false,
    visibleOverlayKeys = new Set(),
}: LyricsActionsProps) => {
    const { t } = useTranslation();
    const currentSong = usePlayerSong();
    const { sources } = useLyricsSettings();

    const handleLyricOffset = (e: number | string) => {
        onUpdateOffset(Number(e));
    };

    const isActionsDisabled = !currentSong;
    const isDesktop = isElectron();
    const { extraOverlayLayers, quickOverlayLayers } = useMemo(() => {
        const quick: OverlayLayerToggle[] = [];
        const extra: OverlayLayerToggle[] = [];

        for (const layer of overlayLayers) {
            if (layer.kind === 'pronunciation') {
                quick.push(layer);
                continue;
            }

            extra.push(layer);
        }

        return {
            extraOverlayLayers: extra,
            quickOverlayLayers: quick,
        };
    }, [overlayLayers]);

    const hasActiveExtraOverlay = extraOverlayLayers.some((layer) =>
        visibleOverlayKeys.has(layer.key),
    );

    const showTopRow = quickOverlayLayers.length > 0 || extraOverlayLayers.length > 0;

    const overlayToggleIcons = quickOverlayLayers.map((layer) => {
        const isActive = visibleOverlayKeys.has(layer.key);
        const tooltip = `${isActive ? 'Hide' : 'Show'} ${t('page.fullscreenPlayer.showPronunciation').toLowerCase()}`;

        return onToggleOverlayLayer ? (
            <ActionIcon
                aria-label={tooltip}
                className={isActive ? styles.overlayToggleActive : undefined}
                disabled={isActionsDisabled}
                icon="audioLines"
                iconProps={isActive ? { color: 'primary', size: 'lg' } : { size: 'lg' }}
                key={layer.key}
                onClick={() => onToggleOverlayLayer(layer.key)}
                size="sm"
                tooltip={{
                    label: tooltip,
                    openDelay: 0,
                }}
                variant="subtle"
            />
        ) : null;
    });

    const extraLayersPopover =
        extraOverlayLayers.length > 0 && onToggleOverlayLayer ? (
            <Popover position="top" withArrow>
                <Popover.Target>
                    <ActionIcon
                        aria-label={t('page.fullscreenPlayer.lyricLayers')}
                        className={hasActiveExtraOverlay ? styles.overlayToggleActive : undefined}
                        disabled={isActionsDisabled}
                        icon="list"
                        iconProps={
                            hasActiveExtraOverlay
                                ? { color: 'primary', size: 'lg' }
                                : { size: 'lg' }
                        }
                        size="sm"
                        tooltip={{
                            label: t('page.fullscreenPlayer.lyricLayers'),
                            openDelay: 0,
                        }}
                        variant="subtle"
                    />
                </Popover.Target>
                <Popover.Dropdown maw={280} miw={220} onClick={(e) => e.stopPropagation()} p="sm">
                    <Stack gap="sm">
                        <Text fw={600} isNoSelect size="sm">
                            {t('page.fullscreenPlayer.lyricLayers')}
                        </Text>
                        {extraOverlayLayers.map((layer) => (
                            <div className={styles.layerRow} key={layer.key}>
                                <Text className={styles.layerLabel} isNoSelect size="sm">
                                    {layer.label}
                                </Text>
                                <Switch
                                    aria-label={layer.label}
                                    checked={visibleOverlayKeys.has(layer.key)}
                                    onChange={() => onToggleOverlayLayer(layer.key)}
                                />
                            </div>
                        ))}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        ) : null;

    return (
        <div className={styles.root}>
            {showTopRow ? (
                <Group className={styles.topRow} gap="xs" justify="center">
                    {overlayToggleIcons}
                    {extraLayersPopover}
                </Group>
            ) : null}
            <Group className={styles.controlsRow} gap="xs" justify="center">
                {showEditingControls && (
                    <>
                        <ActionIcon
                            aria-label="Decrease lyric offset"
                            disabled={isActionsDisabled}
                            icon="minus"
                            iconProps={{ size: 14 }}
                            onClick={() => handleLyricOffset(offsetMs - 50)}
                            size={24}
                            tooltip={{
                                label: t('common.slower'),
                                openDelay: 0,
                            }}
                            variant="subtle"
                        />
                        <Tooltip label={t('setting.lyricOffset')} openDelay={0}>
                            <NumberInput
                                aria-label="Lyric offset"
                                disabled={isActionsDisabled}
                                onChange={handleLyricOffset}
                                size="xs"
                                styles={{ input: { textAlign: 'center' } }}
                                value={offsetMs || 0}
                                width={60}
                            />
                        </Tooltip>
                        <ActionIcon
                            aria-label="Increase lyric offset"
                            disabled={isActionsDisabled}
                            icon="plus"
                            iconProps={{ size: 14 }}
                            onClick={() => handleLyricOffset(offsetMs + 50)}
                            size={24}
                            tooltip={{
                                label: t('common.faster'),
                                openDelay: 0,
                            }}
                            variant="subtle"
                        />
                    </>
                )}
                {showEditingControls && isDesktop && sources.length ? (
                    <Button
                        disabled={isActionsDisabled}
                        onClick={onRemoveLyric}
                        uppercase
                        variant="subtle"
                    >
                        {hasLyrics ? t('common.clear') : t('common.refresh')}
                    </Button>
                ) : null}
                {onToggleTranslation && (
                    <ActionIcon
                        aria-label={t('common.translation')}
                        aria-pressed={translationVisible}
                        disabled={isActionsDisabled}
                        icon="languages"
                        iconProps={{
                            color: translationVisible ? 'primary' : undefined,
                            size: 'lg',
                        }}
                        onClick={onToggleTranslation}
                        size="sm"
                        tooltip={{
                            label: t('common.translation'),
                            openDelay: 0,
                        }}
                        variant="subtle"
                    />
                )}
                {isDesktop && sources.length && onTranslateLyric ? (
                    <Button
                        disabled={isActionsDisabled}
                        onClick={onTranslateLyric}
                        uppercase
                        variant="subtle"
                    >
                        {t('common.translation')}
                    </Button>
                ) : null}
            </Group>
        </div>
    );
};
