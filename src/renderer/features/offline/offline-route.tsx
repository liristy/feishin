import { closeAllModals, openModal } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './offline-route.module.css';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { offline, saveOfflineSong } from '/@/renderer/features/offline/offline';
import { useOfflineStore } from '/@/renderer/features/offline/offline-store';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { SettingsOptions } from '/@/renderer/features/settings/components/settings-option';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { SearchInput } from '/@/renderer/features/shared/components/search-input';
import { useCurrentServerId } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { Progress } from '/@/shared/components/progress/progress';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { Table } from '/@/shared/components/table/table';
import { Tabs } from '/@/shared/components/tabs/tabs';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const megabytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const SongInfo = ({ song }: { song: Song }) => (
    <Group gap="sm" wrap="nowrap">
        <ItemImage
            id={song.imageId || song.id}
            imageContainerProps={{ className: styles.cover }}
            itemType={LibraryItem.SONG}
            serverId={song._serverId}
            type="table"
        />
        <Stack gap={2} miw={0}>
            <Text size="sm" truncate>
                {song.name}
            </Text>
            <Text isMuted size="xs" truncate>
                {song.artistName}
            </Text>
        </Stack>
    </Group>
);

const DownloadSettings = ({ directory }: { directory: string }) => {
    const { t } = useTranslation();
    const listening = useOfflineStore((state) => state.cacheWhileListening);
    return (
        <Stack gap="lg">
            <SettingsOptions
                control={
                    <Switch
                        aria-label={t('offline.listening')}
                        checked={listening}
                        onChange={(event) =>
                            useOfflineStore
                                .getState()
                                .setCacheWhileListening(event.currentTarget.checked)
                        }
                    />
                }
                description={t('offline.listeningDescription')}
                title={t('offline.listening')}
            />
            <Stack gap="xs">
                <Text size="sm">{t('offline.directory')}</Text>
                <Text isMuted size="sm" style={{ overflowWrap: 'anywhere' }}>
                    {directory}
                </Text>
                <Text isMuted size="sm">
                    {t('offline.downloadDescription')}
                </Text>
            </Stack>
        </Stack>
    );
};

export default function OfflineRoute() {
    const { t } = useTranslation();
    const serverId = useCurrentServerId();
    const player = usePlayer();
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<null | string>('downloaded');
    const [limit, setLimit] = useState(50);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    useEffect(() => setSelected(new Set()), [serverId]);
    const { data, error, refetch } = useQuery({
        enabled: !!offline,
        networkMode: 'always',
        queryFn: () => offline!.list(),
        queryKey: ['offline-library'],
        structuralSharing: true,
    });
    const matches = (song: Song) =>
        `${song.name} ${song.artistName} ${song.album}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase());
    const allEntries = (data?.entries || []).filter((entry) => entry.song._serverId === serverId);
    const allJobs = (data?.jobs || []).filter((job) => job.song._serverId === serverId);
    const entries = allEntries.filter((entry) => matches(entry.song));
    const jobs = allJobs.filter((job) => matches(job.song));
    const count = tab === 'transfers' ? jobs.length : entries.length;
    const visibleKeys = (tab === 'transfers' ? jobs : entries).map((item) => item.key);
    const selectedKeys = visibleKeys.filter((key) => selected.has(key));
    const selectedJobs = jobs.filter((job) => selected.has(job.key));
    const retryJobs = selectedJobs.filter(
        (job) => job.status === 'failed' || job.status === 'cancelled',
    );
    const toggle = (key: string) =>
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    const selectRow = (key: string, name: string) => (
        <Table.Td
            className={styles.selection}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            <Checkbox
                aria-label={t('offline.selectSong', { name })}
                checked={selected.has(key)}
                disabled={busy}
                onChange={() => toggle(key)}
            />
        </Table.Td>
    );
    const run = async (action: () => unknown) => {
        setBusy(true);
        try {
            await action();
        } catch {
            toast.error({ message: t('offline.operationFailed') });
        } finally {
            await refetch();
            setBusy(false);
        }
    };
    const batch = async (keys: string[], action: (key: string) => Promise<unknown>) => {
        const results = await Promise.allSettled(keys.map(action));
        const failed = keys.filter((_, index) => results[index].status === 'rejected');
        setSelected(new Set(failed));
        if (failed.length) throw new Error('Some download operations failed');
    };
    const confirm = (message: string, title: string, action: () => unknown) =>
        openModal({
            children: (
                <ConfirmModal
                    labels={{ cancel: t('common.cancel'), confirm: t('common.confirm') }}
                    onConfirm={() => {
                        void run(action);
                        closeAllModals();
                    }}
                >
                    {message}
                </ConfirmModal>
            ),
            title,
        });
    const settings = () =>
        openModal({
            children: <DownloadSettings directory={data?.directory || ''} />,
            size: 'lg',
            title: t('offline.settings'),
        });
    const action = (
        icon: 'delete' | 'download' | 'folder' | 'mediaPlay' | 'refresh' | 'settings' | 'x',
        label: string,
        onClick: () => void,
    ) => (
        <ActionIcon
            aria-label={label}
            disabled={busy}
            icon={icon}
            onClick={onClick}
            tooltip={{ label }}
            variant="subtle"
        />
    );

    return (
        <AnimatedPage>
            <LibraryContainer>
                <PageHeader withTopSpacing>
                    <Flex align="center" gap="sm" justify="space-between" w="100%">
                        <LibraryHeaderBar ignoreMaxWidth>
                            {!!entries.length && tab !== 'transfers' && (
                                <LibraryHeaderBar.PlayButton
                                    itemType={LibraryItem.SONG}
                                    songs={entries.map((entry) => entry.song)}
                                />
                            )}
                            <LibraryHeaderBar.Title>{t('offline.title')}</LibraryHeaderBar.Title>
                            <LibraryHeaderBar.Badge>{allEntries.length}</LibraryHeaderBar.Badge>
                        </LibraryHeaderBar>
                        <Group gap="xs" wrap="nowrap">
                            <SearchInput
                                aria-label={t('common.search')}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setLimit(50);
                                    setSelected(new Set());
                                }}
                                placeholder={t('common.search')}
                                value={search}
                            />
                            {offline &&
                                action(
                                    'folder',
                                    t('offline.openFolder'),
                                    () => void run(() => offline.openFolder()),
                                )}
                            {offline && action('settings', t('offline.settings'), settings)}
                        </Group>
                    </Flex>
                </PageHeader>
                <Tabs
                    className={styles.tabs}
                    onChange={(value) => {
                        setTab(value);
                        setLimit(50);
                        setSelected(new Set());
                    }}
                    value={tab}
                >
                    <Tabs.List className={styles.tabList}>
                        <Tabs.Tab value="downloaded">
                            {t('offline.downloaded')} · {allEntries.length}
                        </Tabs.Tab>
                        <Tabs.Tab value="transfers">
                            {t('offline.transfers')} · {allJobs.length}
                        </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel className={styles.panel} value={tab || 'downloaded'}>
                        {!!selectedKeys.length && (
                            <Group className={styles.batchBar} gap="sm">
                                <Text size="sm">
                                    {t('offline.selected', { count: selectedKeys.length })}
                                </Text>
                                {tab === 'downloaded' ? (
                                    <>
                                        <Button
                                            disabled={busy}
                                            onClick={() =>
                                                void run(() =>
                                                    player.addToQueueByData(
                                                        entries
                                                            .filter((entry) =>
                                                                selected.has(entry.key),
                                                            )
                                                            .map((entry) => entry.song),
                                                        Play.NOW,
                                                    ),
                                                )
                                            }
                                            variant="subtle"
                                        >
                                            {t('offline.playSelected')}
                                        </Button>
                                        <Button
                                            disabled={busy}
                                            onClick={() =>
                                                confirm(
                                                    t('offline.removeSelectedConfirm', {
                                                        count: selectedKeys.length,
                                                    }),
                                                    t('offline.deleteSelected'),
                                                    () =>
                                                        batch(selectedKeys, (key) =>
                                                            offline!.remove(key),
                                                        ),
                                                )
                                            }
                                            variant="subtle"
                                        >
                                            {t('offline.deleteSelected')}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            disabled={busy || !retryJobs.length}
                                            onClick={() =>
                                                void run(() =>
                                                    batch(
                                                        retryJobs.map((job) => job.key),
                                                        (key) =>
                                                            saveOfflineSong(
                                                                retryJobs.find(
                                                                    (job) => job.key === key,
                                                                )!.song,
                                                            ),
                                                    ),
                                                )
                                            }
                                            variant="subtle"
                                        >
                                            {t('offline.retrySelected')}
                                        </Button>
                                        <Button
                                            disabled={busy}
                                            onClick={() =>
                                                void run(() =>
                                                    batch(selectedKeys, (key) =>
                                                        offline!.cancel(key),
                                                    ),
                                                )
                                            }
                                            variant="subtle"
                                        >
                                            {t('offline.cancelSelected')}
                                        </Button>
                                    </>
                                )}
                                <Button
                                    disabled={busy}
                                    onClick={() => setSelected(new Set())}
                                    variant="subtle"
                                >
                                    {t('action.deselectAll')}
                                </Button>
                            </Group>
                        )}
                        <ScrollArea>
                            {error ? (
                                <Text p="lg">{t('offline.operationFailed')}</Text>
                            ) : !count ? (
                                <Stack align="center" className={styles.empty} gap="sm">
                                    <Icon icon="download" size="xl" />
                                    <Text>
                                        {t(
                                            search
                                                ? 'offline.noResults'
                                                : tab === 'transfers'
                                                  ? 'offline.noTransfers'
                                                  : 'offline.noDownloads',
                                        )}
                                    </Text>
                                    <Text isMuted size="sm">
                                        {t(
                                            !offline
                                                ? 'offline.desktopOnly'
                                                : tab === 'downloaded'
                                                  ? 'offline.empty'
                                                  : 'offline.transferHint',
                                        )}
                                    </Text>
                                </Stack>
                            ) : (
                                <Table className={styles.table} highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th className={styles.selection}>
                                                <Checkbox
                                                    aria-label={t('offline.selectAll')}
                                                    checked={
                                                        !!count && selectedKeys.length === count
                                                    }
                                                    disabled={busy}
                                                    indeterminate={
                                                        selectedKeys.length > 0 &&
                                                        selectedKeys.length < count
                                                    }
                                                    onChange={() =>
                                                        setSelected(
                                                            selectedKeys.length === count
                                                                ? new Set()
                                                                : new Set(visibleKeys),
                                                        )
                                                    }
                                                />
                                            </Table.Th>
                                            <Table.Th>{t('offline.song')}</Table.Th>
                                            <Table.Th className={styles.album}>
                                                {t('offline.album')}
                                            </Table.Th>
                                            <Table.Th className={styles.status}>
                                                {t(
                                                    tab === 'transfers'
                                                        ? 'offline.progress'
                                                        : 'offline.size',
                                                )}
                                            </Table.Th>
                                            <Table.Th className={styles.actions}>
                                                <span className={styles.srOnly}>
                                                    {t('offline.actions')}
                                                </span>
                                            </Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {tab === 'transfers'
                                            ? jobs.slice(0, limit).map((job) => (
                                                  <Table.Tr
                                                      data-selected={
                                                          selected.has(job.key) || undefined
                                                      }
                                                      key={job.key}
                                                  >
                                                      {selectRow(job.key, job.song.name)}
                                                      <Table.Td>
                                                          <SongInfo song={job.song} />
                                                      </Table.Td>
                                                      <Table.Td className={styles.album}>
                                                          <Text isMuted size="sm" truncate>
                                                              {job.song.album}
                                                          </Text>
                                                      </Table.Td>
                                                      <Table.Td>
                                                          <Stack gap={4}>
                                                              <Text isMuted size="xs">
                                                                  {t(`offline.${job.status}`)} ·{' '}
                                                                  {megabytes(job.received)}
                                                                  {job.total
                                                                      ? ` / ${megabytes(job.total)}`
                                                                      : ''}
                                                              </Text>
                                                              <Progress
                                                                  size="xs"
                                                                  value={
                                                                      job.total
                                                                          ? Math.min(
                                                                                100,
                                                                                (job.received /
                                                                                    job.total) *
                                                                                    100,
                                                                            )
                                                                          : 0
                                                                  }
                                                              />
                                                          </Stack>
                                                      </Table.Td>
                                                      <Table.Td>
                                                          <Group
                                                              gap={4}
                                                              justify="flex-end"
                                                              wrap="nowrap"
                                                          >
                                                              {(job.status === 'failed' ||
                                                                  job.status === 'cancelled') &&
                                                                  action(
                                                                      'refresh',
                                                                      t('offline.retry'),
                                                                      () =>
                                                                          void run(() =>
                                                                              saveOfflineSong(
                                                                                  job.song,
                                                                              ),
                                                                          ),
                                                                  )}
                                                              {action(
                                                                  'x',
                                                                  t('common.cancel'),
                                                                  () =>
                                                                      void run(() =>
                                                                          offline!.cancel(job.key),
                                                                      ),
                                                              )}
                                                          </Group>
                                                      </Table.Td>
                                                  </Table.Tr>
                                              ))
                                            : entries.slice(0, limit).map((entry) => (
                                                  <Table.Tr
                                                      data-selected={
                                                          selected.has(entry.key) || undefined
                                                      }
                                                      key={entry.key}
                                                      onContextMenu={(event) => {
                                                          event.preventDefault();
                                                          ContextMenuController.call({
                                                              cmd: {
                                                                  items: [entry.song],
                                                                  type: LibraryItem.SONG,
                                                              },
                                                              event,
                                                          });
                                                      }}
                                                      onDoubleClick={() =>
                                                          void run(() =>
                                                              player.addToQueueByData(
                                                                  [entry.song],
                                                                  Play.NOW,
                                                              ),
                                                          )
                                                      }
                                                  >
                                                      {selectRow(entry.key, entry.song.name)}
                                                      <Table.Td>
                                                          <SongInfo song={entry.song} />
                                                      </Table.Td>
                                                      <Table.Td className={styles.album}>
                                                          <Text isMuted size="sm" truncate>
                                                              {entry.song.album}
                                                          </Text>
                                                      </Table.Td>
                                                      <Table.Td>
                                                          <Text isMuted size="sm">
                                                              {megabytes(entry.size)}
                                                          </Text>
                                                      </Table.Td>
                                                      <Table.Td>
                                                          <Group
                                                              gap={4}
                                                              justify="flex-end"
                                                              wrap="nowrap"
                                                          >
                                                              {action(
                                                                  'mediaPlay',
                                                                  t('player.play'),
                                                                  () =>
                                                                      void run(() =>
                                                                          player.addToQueueByData(
                                                                              [entry.song],
                                                                              Play.NOW,
                                                                          ),
                                                                      ),
                                                              )}
                                                              {action(
                                                                  'delete',
                                                                  t('common.delete'),
                                                                  () =>
                                                                      confirm(
                                                                          t(
                                                                              'offline.removeConfirm',
                                                                          ),
                                                                          t('common.delete'),
                                                                          () =>
                                                                              offline!.remove(
                                                                                  entry.key,
                                                                              ),
                                                                      ),
                                                              )}
                                                          </Group>
                                                      </Table.Td>
                                                  </Table.Tr>
                                              ))}
                                    </Table.Tbody>
                                </Table>
                            )}
                            {count > limit && (
                                <Group justify="center" p="md">
                                    <Button
                                        onClick={() => setLimit((value) => value + 50)}
                                        variant="subtle"
                                    >
                                        {t('offline.showMore')}
                                    </Button>
                                </Group>
                            )}
                        </ScrollArea>
                    </Tabs.Panel>
                </Tabs>
            </LibraryContainer>
        </AnimatedPage>
    );
}
