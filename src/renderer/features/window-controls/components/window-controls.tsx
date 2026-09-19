import clsx from 'clsx';
import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';

import styles from './window-controls.module.css';

import { Icon } from '/@/shared/components/icon/icon';

const browser = isElectron() ? window.api.browser : null;

const close = () => browser?.exit();

const minimize = () => browser?.minimize();

const toggleMaximize = () => browser?.toggleMaximize();

export const WindowControls = () => {
    const { t } = useTranslation();

    const handleMinimize = () => minimize();

    const handleMaximize = () => toggleMaximize();

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
