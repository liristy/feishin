import clsx from 'clsx';
import { IconBase, IconBaseProps } from 'react-icons';

import styles from './volume-icon.module.css';

export const VolumeIcon = ({
    className,
    level = 2,
    ...props
}: IconBaseProps & { level?: number }) => {
    return (
        <IconBase
            className={clsx(styles.root, className)}
            data-volume-level={level}
            viewBox="0 0 24 24"
            {...props}
        >
            <path
                className={styles.speaker}
                d="M10.9 4.5 6.3 8H3.6c-.9 0-1.6.7-1.6 1.6v4.8c0 .9.7 1.6 1.6 1.6h2.7l4.6 3.5c.5.4 1.1 0 1.1-.6V5.1c0-.6-.6-1-1.1-.6Z"
                fill="currentColor"
            />
            <g
                className={styles.waves}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.7"
            >
                <path d="M15.3 8.3a5.2 5.2 0 0 1 0 7.4" />
                <path className={styles.outerWave} d="M18.5 5.2a9.6 9.6 0 0 1 0 13.6" />
            </g>
            <path
                className={styles.mute}
                d="m15.5 8.5 6 7m0-7-6 7"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.7"
            />
        </IconBase>
    );
};
