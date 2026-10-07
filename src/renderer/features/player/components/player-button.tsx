import clsx from 'clsx';
import { t } from 'i18next';
import { forwardRef, isValidElement, MouseEvent, ReactNode } from 'react';

import styles from './player-button.module.css';

import { ActionIcon, ActionIconProps } from '/@/shared/components/action-icon/action-icon';
import { Icon, IconProps } from '/@/shared/components/icon/icon';
import { Tooltip, TooltipProps } from '/@/shared/components/tooltip/tooltip';
import { PlaybackSelectors } from '/@/shared/constants/playback-selectors';

interface PlayerButtonProps extends Omit<ActionIconProps, 'icon' | 'variant'> {
    icon: ReactNode;
    isActive?: boolean;
    tooltip?: Omit<TooltipProps, 'children'>;
    variant: 'main' | 'secondary' | 'tertiary';
}

export const PlayerButton = forwardRef<HTMLButtonElement, PlayerButtonProps>(
    ({ icon, isActive, tooltip, variant, ...rest }: PlayerButtonProps, ref) => {
        const iconType = isValidElement<IconProps>(icon) ? icon.props.icon : undefined;
        const direction = iconType === 'mediaPrevious' ? -1 : iconType === 'mediaNext' ? 1 : 0;
        const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            if (event.detail > 0) event.currentTarget.blur();
            if (direction && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const image = event.currentTarget.querySelector('svg');
                image?.getAnimations().forEach((animation) => animation.cancel());
                image?.animate(
                    [
                        { transform: `translateX(${direction * 6}px) scale(0.75)` },
                        { transform: 'translateX(0) scale(1)' },
                    ],
                    { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
                );
            }
            rest.onClick?.(event);
        };
        if (tooltip) {
            return (
                <Tooltip {...tooltip}>
                    <ActionIcon
                        aria-pressed={isActive}
                        className={clsx({
                            [styles.active]: isActive,
                            [styles.transportButton]: direction,
                        })}
                        data-player-action={
                            direction ? (direction < 0 ? 'previous' : 'next') : undefined
                        }
                        ref={ref}
                        {...rest}
                        onClick={handleClick}
                        variant="subtle"
                    >
                        {icon}
                    </ActionIcon>
                </Tooltip>
            );
        }

        return (
            <ActionIcon
                aria-pressed={isActive}
                className={clsx(styles.playerButton, styles[variant], {
                    [styles.active]: isActive,
                    [styles.transportButton]: direction,
                })}
                data-player-action={direction ? (direction < 0 ? 'previous' : 'next') : undefined}
                ref={ref}
                {...rest}
                onClick={handleClick}
                variant="subtle"
            >
                {icon}
            </ActionIcon>
        );
    },
);

interface PlayButtonProps extends Omit<ActionIconProps, 'icon' | 'variant'> {
    isPaused?: boolean;
}

export const MainPlayButton = forwardRef<HTMLButtonElement, PlayButtonProps>(
    ({ isPaused, onClick, ...props }: PlayButtonProps, ref) => {
        const playerStateClass = isPaused
            ? PlaybackSelectors.playerStatePaused
            : PlaybackSelectors.playerStatePlaying;

        return (
            <ActionIcon
                className={clsx(styles.main, styles.transportButton, playerStateClass)}
                data-player-action="play"
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.detail > 0) e.currentTarget.blur();
                    onClick?.(e);
                }}
                ref={ref}
                tooltip={{
                    label: isPaused ? (t('player.play') as string) : (t('player.pause') as string),
                    openDelay: 0,
                }}
                {...props}
            >
                <Icon
                    className={styles.playIcon}
                    icon={isPaused ? 'mediaPlay' : 'mediaPause'}
                    key={isPaused ? 'play' : 'pause'}
                    size={28}
                />
            </ActionIcon>
        );
    },
);
