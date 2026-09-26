import { closeModal, openModal } from '@mantine/modals';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import styles from './listening-history-route.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { PageHeader } from '/@/renderer/components/page-header/page-header';
import {
    EntityDetail,
    HistoryPanel,
    KindSelector,
    Overview,
    PulsePanel,
    RankingPanel,
    TopPanel,
} from '/@/renderer/features/listening-history/components/maloja-panels';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { useSettingsStore, useSettingsStoreActions } from '/@/renderer/store';
import {
    MalojaEntity,
    MalojaFilter,
    MalojaKind,
    normalizeMalojaUrl,
} from '/@/shared/api/maloja/maloja-types';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { Tabs } from '/@/shared/components/tabs/tabs';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

const SETTINGS_MODAL = 'maloja-settings';

const MalojaSettings = ({ onSaved, url }: { onSaved?: () => void; url: string }) => {
    const { t } = useTranslation();
    const { setSettings } = useSettingsStoreActions();
    const [value, setValue] = useState(url);
    const [invalid, setInvalid] = useState(false);
    return (
        <form
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                try {
                    const malojaUrl = value.trim() ? normalizeMalojaUrl(value) : '';
                    setInvalid(false);
                    setValue(malojaUrl);
                    setSettings({ general: { malojaUrl } });
                    onSaved?.();
                } catch {
                    setInvalid(true);
                }
            }}
        >
            <Stack gap="lg">
                <TextInput
                    error={invalid ? t('listeningHistory.invalidUrl') : undefined}
                    label={t('listeningHistory.url')}
                    onChange={(event) => {
                        setValue(event.currentTarget.value);
                        setInvalid(false);
                    }}
                    placeholder="https://maloja.example.com"
                    type="url"
                    value={value}
                />
                <Text isMuted size="sm">
                    {t('listeningHistory.description')}
                </Text>
                <Group justify="flex-end">
                    <Button type="submit" variant="filled">
                        {t('common.save')}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const RangeSelector = ({
    onChange,
    value,
}: {
    onChange: (filter: MalojaFilter) => void;
    value: MalojaFilter;
}) => {
    const { t } = useTranslation();
    const [range, setRange] = useState(value.from ? 'custom' : (value.range ?? 'alltime'));
    const [from, setFrom] = useState(value.from ?? '');
    const [to, setTo] = useState(value.to ?? '');
    return (
        <Group className={styles.range} gap="sm">
            <Select
                aria-label={t('listeningHistory.range')}
                data={['today', 'thisweek', 'thismonth', 'thisyear', 'alltime', 'custom'].map(
                    (option) => ({ label: t(`listeningHistory.${option}`), value: option }),
                )}
                onChange={(next) => {
                    if (!next) return;
                    setRange(next);
                    if (next !== 'custom') onChange(next === 'alltime' ? {} : { range: next });
                }}
                size="sm"
                value={range}
                width={140}
            />
            {range === 'custom' && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (from && to && from <= to) onChange({ from, to });
                    }}
                >
                    <Group gap="xs">
                        <TextInput
                            aria-label={t('listeningHistory.from')}
                            max={to || undefined}
                            onChange={(event) => setFrom(event.currentTarget.value)}
                            required
                            size="sm"
                            type="date"
                            value={from}
                        />
                        <TextInput
                            aria-label={t('listeningHistory.to')}
                            min={from || undefined}
                            onChange={(event) => setTo(event.currentTarget.value)}
                            required
                            size="sm"
                            type="date"
                            value={to}
                        />
                        <Button
                            disabled={!from || !to || from > to}
                            size="sm"
                            type="submit"
                            variant="subtle"
                        >
                            {t('listeningHistory.apply')}
                        </Button>
                    </Group>
                </form>
            )}
        </Group>
    );
};

const Dashboard = ({ url }: { url: string }) => {
    const { t } = useTranslation();
    const initial = (
        useLocation().state as null | {
            listeningHistory?: {
                entity?: MalojaEntity;
                filter?: MalojaFilter;
                kind?: MalojaKind;
                tab?: string;
            };
        }
    )?.listeningHistory;
    const client = useQueryClient();
    const busy = useIsFetching({ queryKey: queryKeys.listeningHistory.root(url) });
    const [filter, setFilter] = useState<MalojaFilter>(initial?.filter ?? { range: 'thismonth' });
    const [tab, setTab] = useState<null | string>(initial?.tab ?? 'overview');
    const [kind, setKind] = useState<MalojaKind>(initial?.kind ?? 'artists');
    const [entity, setEntity] = useState<MalojaEntity | null>(initial?.entity ?? null);
    const panelProps = { filter, onSelect: setEntity, url };
    const openSettings = () =>
        openModal({
            children: <MalojaSettings onSaved={() => closeModal(SETTINGS_MODAL)} url={url} />,
            modalId: SETTINGS_MODAL,
            size: 'md',
            title: t('listeningHistory.settings'),
        });
    return (
        <LibraryContainer>
            <PageHeader height="64px" withTopSpacing>
                <Group className={styles.header} justify="space-between" wrap="nowrap">
                    <TextTitle className={styles.title} order={1}>
                        {t('listeningHistory.title')}
                    </TextTitle>
                    <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                            aria-label={t('common.refresh')}
                            icon="refresh"
                            loading={!!busy}
                            onClick={() =>
                                void client.invalidateQueries({
                                    queryKey: queryKeys.listeningHistory.root(url),
                                })
                            }
                            size="md"
                            tooltip={{ label: t('common.refresh') }}
                            variant="subtle"
                        />
                        <ActionIcon
                            aria-label={t('listeningHistory.settings')}
                            icon="settings"
                            onClick={openSettings}
                            size="md"
                            tooltip={{ label: t('listeningHistory.settings') }}
                            variant="subtle"
                        />
                    </Group>
                </Group>
            </PageHeader>
            <ScrollArea className={styles.scroll} key={entity ? JSON.stringify(entity) : tab}>
                <Stack className={styles.dashboard} gap="lg">
                    <Group className={styles.toolbar} justify="space-between">
                        {entity ? (
                            <Button
                                leftSection={<Icon icon="arrowLeftS" size="sm" />}
                                onClick={() => setEntity(null)}
                                size="sm"
                                variant="subtle"
                            >
                                {t('listeningHistory.back')}
                            </Button>
                        ) : (
                            <Tabs className={styles.navigation} onChange={setTab} value={tab}>
                                <Tabs.List>
                                    {['overview', 'ranking', 'trend', 'top', 'history'].map(
                                        (value) => (
                                            <Tabs.Tab key={value} value={value}>
                                                {t(`listeningHistory.${value}`)}
                                            </Tabs.Tab>
                                        ),
                                    )}
                                </Tabs.List>
                            </Tabs>
                        )}
                        <RangeSelector onChange={setFilter} value={filter} />
                    </Group>
                    {entity ? (
                        <EntityDetail
                            {...panelProps}
                            entity={entity}
                            key={`${JSON.stringify(entity)}-${JSON.stringify(filter)}`}
                        />
                    ) : (
                        <>
                            {(tab === 'ranking' || tab === 'top') && (
                                <Group>
                                    <KindSelector onChange={setKind} value={kind} />
                                </Group>
                            )}
                            <div key={`${tab}-${kind}-${JSON.stringify(filter)}`}>
                                {tab === 'overview' && <Overview {...panelProps} />}
                                {tab === 'ranking' && <RankingPanel {...panelProps} kind={kind} />}
                                {tab === 'trend' && <PulsePanel {...panelProps} />}
                                {tab === 'top' && <TopPanel {...panelProps} kind={kind} />}
                                {tab === 'history' && <HistoryPanel {...panelProps} />}
                            </div>
                        </>
                    )}
                </Stack>
            </ScrollArea>
        </LibraryContainer>
    );
};

export default function ListeningHistoryRoute() {
    const { t } = useTranslation();
    const url = useSettingsStore((state) => state.general.malojaUrl);
    return (
        <AnimatedPage>
            {url ? (
                <Dashboard key={url} url={url} />
            ) : (
                <LibraryContainer>
                    <PageHeader withTopSpacing>
                        <Group className={styles.header}>
                            <TextTitle className={styles.title} order={1}>
                                {t('listeningHistory.title')}
                            </TextTitle>
                        </Group>
                    </PageHeader>
                    <ScrollArea className={styles.scroll}>
                        <Stack className={styles.setup} gap="xl">
                            <Stack align="center" gap="md">
                                <div className={styles.setupIcon}>
                                    <Icon icon="audioLines" size={32} />
                                </div>
                                <Stack align="center" gap="xs">
                                    <TextTitle order={2}>{t('listeningHistory.connect')}</TextTitle>
                                    <Text isMuted ta="center">
                                        {t('listeningHistory.configure')}
                                    </Text>
                                </Stack>
                            </Stack>
                            <MalojaSettings url={url} />
                        </Stack>
                    </ScrollArea>
                </LibraryContainer>
            )}
        </AnimatedPage>
    );
}
