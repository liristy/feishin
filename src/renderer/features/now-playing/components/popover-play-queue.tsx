import { t } from 'i18next';
import { useRef, useState } from 'react';

import styles from './popover-play-queue.module.css';

import { ItemListHandle } from '/@/renderer/components/item-list/types';
import { PlayQueue } from '/@/renderer/features/now-playing/components/play-queue';
import { PlayQueueListControls } from '/@/renderer/features/now-playing/components/play-queue-list-controls';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Popover } from '/@/shared/components/popover/popover';
import { Stack } from '/@/shared/components/stack/stack';
import { useDisclosure } from '/@/shared/hooks/use-disclosure';
import { ItemListKey } from '/@/shared/types/types';

interface PopoverPlayQueueProps {
    onClose?: () => void;
    onToggle?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    opened?: boolean;
}

export const PopoverPlayQueue = ({
    onClose,
    onToggle,
    opened: controlledOpened,
}: PopoverPlayQueueProps = {}) => {
    const queueRef = useRef<ItemListHandle | null>(null);
    const [search, setSearch] = useState<string | undefined>(undefined);

    const [internalOpened, internalHandlers] = useDisclosure(false);

    const opened = controlledOpened !== undefined ? controlledOpened : internalOpened;
    const handleClose = onClose ? onClose : internalHandlers.close;
    const handleToggle = onToggle ? onToggle : internalHandlers.toggle;

    return (
        <Popover
            arrowSize={8}
            classNames={{ dropdown: styles.dropdown }}
            offset={12}
            onClose={handleClose}
            opened={opened}
            position="top"
            radius="lg"
            transitionProps={{
                transition: 'fade',
            }}
            withArrow
        >
            <Popover.Target>
                <ActionIcon
                    aria-label={t('player.viewQueue')}
                    aria-pressed={opened}
                    icon="queue"
                    iconProps={{
                        color: opened ? 'primary' : undefined,
                        size: 'lg',
                    }}
                    onClick={handleToggle}
                    size="sm"
                    tooltip={{
                        label: t('player.viewQueue'),
                        openDelay: 0,
                    }}
                    variant="subtle"
                />
            </Popover.Target>
            <Popover.Dropdown
                aria-label={t('player.viewQueue')}
                h="600px"
                id="popover-play-queue"
                mah="80dvh"
                maw="calc(100vw - 32px)"
                opacity={0.98}
                p="sm"
                role="region"
                w="560px"
            >
                <Stack gap={0} h="100%" w="100%">
                    <PlayQueueListControls
                        handleSearch={setSearch}
                        searchTerm={search}
                        tableRef={queueRef}
                        type={ItemListKey.SIDE_QUEUE}
                    />
                    <PlayQueue
                        listKey={ItemListKey.SIDE_QUEUE}
                        ref={queueRef}
                        searchTerm={search}
                    />
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
