import clsx from 'clsx';
import isElectron from 'is-electron';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './window-controls.module.css';

import { Icon } from '/@/shared/components/icon/icon';

const browser = isElectron() ? window.api.browser : null;

const close = () => browser?.exit();

const minimize = () => browser?.minimize();

const maximize = () => browser?.maximize();

const unmaximize = () => browser?.unmaximize();

export const WindowControls = () => {
    const { t } = useTranslation();
    const [max, setMax] = useState(false);

    const handleMinimize = () => minimize();

    const handleMaximize = () => {
        if (max) {
            unmaximize();
        } else {
            maximize();
        }
        setMax(!max);
    };

    const handleClose = () => close();

    return (
        <>
            {isElectron() && (
                <>
                    <div className={styles.windowsButtonGroup}>
                        <button
                            aria-label={t('common.minimize')}
                            className={styles.windowsButton}
                            onClick={handleMinimize}
                            type="button"
                        >
                            <Icon icon="minus" size={16} />
                        </button>
                        <button
                            aria-label={t('common.maximize')}
                            className={styles.windowsButton}
                            onClick={handleMaximize}
                            type="button"
                        >
                            <Icon icon="square" size={12} />
                        </button>
                        <button
                            aria-label={t('common.close')}
                            className={clsx(styles.windowsButton, styles.exitButton)}
                            onClick={handleClose}
                            type="button"
                        >
                            <Icon icon="x" size={16} />
                        </button>
                    </div>
                </>
            )}
        </>
    );
};
