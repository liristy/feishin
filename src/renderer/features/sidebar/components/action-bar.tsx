import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from './action-bar.module.css';

import { AppMenu } from '/@/renderer/features/titlebar/components/app-menu';
import { useCommandPalette } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { DropdownMenu } from '/@/shared/components/dropdown-menu/dropdown-menu';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';

export const ActionBar = ({ searchVisible = true }: { searchVisible?: boolean }) => {
    const { t } = useTranslation();
    const { open } = useCommandPalette();

    return (
        <div className={styles.container}>
            <Group className={styles.brandRow} gap="xs" justify="space-between" wrap="nowrap">
                <DropdownMenu position="bottom-start">
                    <DropdownMenu.Target>
                        <ActionIcon
                            aria-label={t('common.menu')}
                            icon="appLogo"
                            iconProps={{ size: 24 }}
                            size="sm"
                            variant="subtle"
                        />
                    </DropdownMenu.Target>
                    <DropdownMenu.Dropdown>
                        <AppMenu />
                    </DropdownMenu.Dropdown>
                </DropdownMenu>
                <Group gap={0} wrap="nowrap">
                    <NavigateButtons />
                </Group>
            </Group>
            <Button
                classNames={{
                    inner: styles.searchInner,
                    label: styles.searchLabel,
                    root: styles.search,
                }}
                data-visible={searchVisible}
                inert={!searchVisible}
                onClick={open}
                variant="subtle"
            >
                <Group gap="sm" wrap="nowrap">
                    <Icon color="primary" icon="search" size={18} />
                    {t('common.search')}
                </Group>
            </Button>
        </div>
    );
};

const NavigateButtons = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <>
            <ActionIcon
                aria-label={t('common.back')}
                icon="arrowLeftS"
                onClick={() => navigate(-1)}
                variant="subtle"
            />
            <ActionIcon
                aria-label={t('common.forward')}
                icon="arrowRightS"
                onClick={() => navigate(1)}
                variant="subtle"
            />
        </>
    );
};
