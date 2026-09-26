import { useQuery } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '../routes/listening-history-route.module.css';

import { listeningHistoryQueries as queries } from '/@/renderer/features/listening-history/api/listening-history-api';
import { EntityArtwork } from '/@/renderer/features/listening-history/components/entity-artwork';
import { TrackPlayButton } from '/@/renderer/features/listening-history/components/track-play-button';
import { MalojaEntity, MalojaFilter, MalojaKind } from '/@/shared/api/maloja/maloja-types';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

export type MalojaPanelProps = {
    filter: MalojaFilter;
    onSelect: (entity: MalojaEntity) => void;
    url: string;
};
const kinds: MalojaKind[] = ['artists', 'albums', 'tracks'];

const QueryState = ({
    children,
    query,
}: {
    children: ReactNode;
    query: { isError: boolean; isPending: boolean; refetch: () => unknown };
}) => {
    const { t } = useTranslation();
    if (query.isPending)
        return (
            <div className={styles.loading}>
                <Spinner />
            </div>
        );
    if (query.isError)
        return (
            <Stack align="center" gap="sm" p="lg" role="alert">
                <Text isMuted size="sm">
                    {t('listeningHistory.loadError')}
                </Text>
                <Button onClick={() => void query.refetch()} variant="subtle">
                    {t('common.refresh')}
                </Button>
            </Stack>
        );
    return children;
};

const Empty = () => {
    const { t } = useTranslation();
    return (
        <Text className={styles.empty} isMuted size="sm">
            {t('listeningHistory.empty')}
        </Text>
    );
};

const Pagination = ({
    busy,
    hasNext,
    onChange,
    page,
}: {
    busy?: boolean;
    hasNext: boolean;
    onChange: (page: number) => void;
    page: number;
}) => {
    const { t } = useTranslation();
    return (
        <Group className={styles.pagination} justify="space-between">
            <Text isMuted size="sm">
                {t('listeningHistory.page', { page: page + 1 })}
            </Text>
            <Group gap="xs">
                <ActionIcon
                    aria-label={t('listeningHistory.previous')}
                    disabled={page === 0 || busy}
                    icon="arrowLeftS"
                    onClick={() => onChange(page - 1)}
                    variant="subtle"
                />
                <ActionIcon
                    aria-label={t('listeningHistory.next')}
                    disabled={!hasNext || busy}
                    icon="arrowRightS"
                    onClick={() => onChange(page + 1)}
                    variant="subtle"
                />
            </Group>
        </Group>
    );
};

export const KindSelector = ({
    onChange,
    value,
}: {
    onChange: (value: MalojaKind) => void;
    value: MalojaKind;
}) => {
    const { t } = useTranslation();
    return (
        <SegmentedControl
            data={kinds.map((kind) => ({ label: t(`listeningHistory.${kind}`), value: kind }))}
            onChange={(value) => onChange(value as MalojaKind)}
            size="xs"
            value={value}
        />
    );
};

export const RankingPanel = ({
    compact,
    filter,
    kind,
    onSelect,
    url,
}: MalojaPanelProps & { compact?: boolean; kind: MalojaKind }) => {
    const { i18n, t } = useTranslation();
    const query = useQuery(queries.charts(url, kind, filter));
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const rows = (query.data ?? []).filter(({ entity }) =>
        `${entity.name} ${entity.artists.join(' ')}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
    );
    const shown = compact ? rows.slice(0, 5) : rows.slice(page * 50, (page + 1) * 50);
    const maximum = query.data?.[0]?.plays || 1;
    return (
        <section className={styles.card}>
            <Group className={styles.cardHeader} justify="space-between">
                <TextTitle order={3}>{t(`listeningHistory.${kind}`)}</TextTitle>
                <Text isMuted size="xs">
                    {t('listeningHistory.ranking')}
                </Text>
            </Group>
            {!compact && (
                <TextInput
                    aria-label={t('common.search')}
                    className={styles.search}
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        setPage(0);
                    }}
                    placeholder={t('common.search')}
                    value={search}
                />
            )}
            <QueryState query={query}>
                {shown.length ? (
                    <ol className={styles.list}>
                        {shown.map(({ entity, plays, rank }) => (
                            <li className={styles.playableRow} key={JSON.stringify(entity)}>
                                <button
                                    className={styles.rankRow}
                                    onClick={() => onSelect(entity)}
                                    type="button"
                                >
                                    <span className={styles.rank}>{rank}</span>
                                    <EntityArtwork entity={entity} url={url} />
                                    <span className={styles.rankInfo}>
                                        <Text
                                            className={styles.trackTitle}
                                            fw={500}
                                            size="sm"
                                            title={entity.name}
                                        >
                                            {entity.name}
                                        </Text>
                                        {entity.artists.length > 0 && (
                                            <Text className={styles.artist} isMuted size="xs">
                                                {entity.artists.join(', ')}
                                            </Text>
                                        )}
                                        <span aria-hidden="true" className={styles.rankMeter}>
                                            <span
                                                style={{
                                                    width: `${Math.min(100, (plays / maximum) * 100)}%`,
                                                }}
                                            />
                                        </span>
                                    </span>
                                    <span
                                        className={styles.plays}
                                        title={t('listeningHistory.listens')}
                                    >
                                        {plays.toLocaleString(i18n.language)}
                                    </span>
                                </button>
                                <TrackPlayButton entity={entity} />
                            </li>
                        ))}
                    </ol>
                ) : (
                    <Empty />
                )}
            </QueryState>
            {!compact && (
                <Pagination
                    hasNext={rows.length > (page + 1) * 50}
                    onChange={setPage}
                    page={page}
                />
            )}
        </section>
    );
};

export const PulsePanel = ({ compact, filter, url }: MalojaPanelProps & { compact?: boolean }) => {
    const { i18n, t } = useTranslation();
    const [step, setStep] = useState<MalojaFilter['step']>(
        filter.range === 'thisweek' || filter.range === 'thismonth' ? 'day' : 'month',
    );
    const [trail, setTrail] = useState(1);
    const [cumulative, setCumulative] = useState(false);
    const [page, setPage] = useState(0);
    const query = useQuery(queries.pulse(url, { ...filter, cumulative, step, trail }, page));
    const items = query.data?.items ?? [];
    const maximum = Math.max(1, ...items.map((item) => item.plays));
    return (
        <section className={styles.card}>
            <Group className={styles.cardHeader} justify="space-between">
                <TextTitle order={3}>{t('listeningHistory.trend')}</TextTitle>
                <Select
                    aria-label={t('listeningHistory.interval')}
                    data={['day', 'week', 'month', 'year'].map((value) => ({
                        label: t(`listeningHistory.${value}`),
                        value,
                    }))}
                    onChange={(value) => {
                        setStep(value as MalojaFilter['step']);
                        setPage(0);
                    }}
                    size="xs"
                    value={step}
                    width={110}
                />
            </Group>
            {!compact && (
                <Group className={styles.chartOptions}>
                    <NumberInput
                        label={t('listeningHistory.trail')}
                        max={100}
                        min={1}
                        onChange={(value) => {
                            setTrail(Number(value) || 1);
                            setPage(0);
                        }}
                        size="xs"
                        value={trail}
                        width={160}
                    />
                    <Checkbox
                        checked={cumulative}
                        label={t('listeningHistory.cumulative')}
                        onChange={(event) => {
                            setCumulative(event.currentTarget.checked);
                            setPage(0);
                        }}
                    />
                </Group>
            )}
            <QueryState query={query}>
                {items.length ? (
                    <>
                        <div className={styles.chart}>
                            <div aria-hidden="true" className={styles.axis}>
                                <span>{maximum.toLocaleString(i18n.language)}</span>
                                <span>{Math.round(maximum / 2).toLocaleString(i18n.language)}</span>
                                <span>0</span>
                            </div>
                            <div
                                aria-label={t('listeningHistory.trend')}
                                className={styles.bars}
                                role="group"
                            >
                                {items.map((item, index) => (
                                    <button
                                        aria-label={`${item.label}: ${t('listeningHistory.entries', { count: item.plays })}`}
                                        className={styles.barSlot}
                                        key={`${item.label}-${index}`}
                                        title={`${item.label}: ${item.plays}`}
                                        type="button"
                                    >
                                        <span
                                            className={styles.bar}
                                            style={{ height: `${(item.plays / maximum) * 100}%` }}
                                        />
                                        <span className={styles.barTooltip}>
                                            {item.label}
                                            <br />
                                            {t('listeningHistory.entries', { count: item.plays })}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Group className={styles.chartLabels} justify="space-between">
                            <Text isMuted size="xs">
                                {items[0].label}
                            </Text>
                            <Text isMuted size="xs">
                                {items.at(-1)?.label}
                            </Text>
                        </Group>
                        {!compact && (
                            <details className={styles.dataDetails}>
                                <summary>{t('listeningHistory.dataTable')}</summary>
                                <div className={styles.dataGrid}>
                                    {items.map((item, index) => (
                                        <Group
                                            justify="space-between"
                                            key={`${item.label}-${index}`}
                                        >
                                            <Text size="sm">{item.label}</Text>
                                            <Text size="sm">
                                                {t('listeningHistory.entries', {
                                                    count: item.plays,
                                                })}
                                            </Text>
                                        </Group>
                                    ))}
                                </div>
                            </details>
                        )}
                    </>
                ) : (
                    <Empty />
                )}
            </QueryState>
            {!compact && (
                <Pagination
                    busy={query.isFetching}
                    hasNext={!!query.data?.hasNextPage}
                    onChange={setPage}
                    page={page}
                />
            )}
        </section>
    );
};

export const HistoryPanel = ({
    compact,
    filter,
    onSelect,
    url,
}: MalojaPanelProps & { compact?: boolean }) => {
    const { i18n, t } = useTranslation();
    const [page, setPage] = useState(0);
    const query = useQuery(queries.list(url, page, filter));
    const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' });
    const timeFormat = new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
    });
    const groups = new Map<string, NonNullable<typeof query.data>['items']>();
    for (const item of compact
        ? (query.data?.items.slice(0, 6) ?? [])
        : (query.data?.items ?? [])) {
        const date = dateFormat.format(item.playedAt);
        const group = groups.get(date);
        if (group) group.push(item);
        else groups.set(date, [item]);
    }
    return (
        <section className={styles.card}>
            <Group className={styles.cardHeader} justify="space-between">
                <TextTitle order={3}>{t('listeningHistory.history')}</TextTitle>
                <Icon icon="duration" size="sm" />
            </Group>
            <QueryState query={query}>
                {groups.size ? (
                    Array.from(groups, ([date, items]) => (
                        <section className={styles.historyDay} key={date}>
                            <Text className={styles.dayHeader} fw={600} size="xs">
                                {date}
                            </Text>
                            <ol className={styles.list}>
                                {items.map((item, index) => (
                                    <li
                                        className={styles.playableRow}
                                        key={`${item.playedAt}-${index}`}
                                    >
                                        <button
                                            className={styles.historyRow}
                                            onClick={() => onSelect(item.entity)}
                                            type="button"
                                        >
                                            <EntityArtwork entity={item.entity} url={url} />
                                            <span className={styles.track}>
                                                <Text
                                                    className={styles.trackTitle}
                                                    fw={500}
                                                    size="sm"
                                                    title={item.title}
                                                >
                                                    {item.title}
                                                </Text>
                                                <Text className={styles.artist} isMuted size="xs">
                                                    {item.artists.join(', ')}
                                                    {item.album ? ` · ${item.album}` : ''}
                                                </Text>
                                                {!compact && item.duration != null && (
                                                    <Text isMuted size="xs">
                                                        {t('listeningHistory.seconds', {
                                                            count: item.duration,
                                                        })}
                                                    </Text>
                                                )}
                                            </span>
                                            <time
                                                className={styles.time}
                                                dateTime={new Date(item.playedAt).toISOString()}
                                            >
                                                {timeFormat.format(item.playedAt)}
                                            </time>
                                        </button>
                                        <TrackPlayButton entity={item.entity} />
                                    </li>
                                ))}
                            </ol>
                        </section>
                    ))
                ) : (
                    <Empty />
                )}
            </QueryState>
            {!compact && (
                <Pagination
                    busy={query.isFetching}
                    hasNext={!!query.data?.hasNextPage}
                    onChange={setPage}
                    page={page}
                />
            )}
        </section>
    );
};

export const Overview = (props: MalojaPanelProps) => {
    const { i18n, t } = useTranslation();
    const total = useQuery(queries.count(props.url, props.filter));
    const artists = useQuery(queries.charts(props.url, 'artists', props.filter));
    const albums = useQuery(queries.charts(props.url, 'albums', props.filter));
    const tracks = useQuery(queries.charts(props.url, 'tracks', props.filter));
    const stats = [
        { label: 'listens', query: total, value: total.data },
        { label: 'artists', query: artists, value: artists.data?.length },
        { label: 'albums', query: albums, value: albums.data?.length },
        { label: 'tracks', query: tracks, value: tracks.data?.length },
    ];
    return (
        <Stack gap="lg">
            <div className={styles.stats}>
                {stats.map(({ label, query, value }) => (
                    <div className={styles.stat} key={label}>
                        <Text isMuted size="sm">
                            {t(`listeningHistory.${label}`)}
                        </Text>
                        <Text className={styles.statValue}>
                            {query.isPending
                                ? '…'
                                : query.isError
                                  ? '-'
                                  : value?.toLocaleString(i18n.language)}
                        </Text>
                        {query.isError && (
                            <Button
                                onClick={() => void query.refetch()}
                                size="compact-xs"
                                variant="subtle"
                            >
                                {t('common.refresh')}
                            </Button>
                        )}
                    </div>
                ))}
            </div>
            <PulsePanel {...props} compact />
            <div className={styles.rankings}>
                {kinds.map((kind) => (
                    <RankingPanel {...props} compact key={kind} kind={kind} />
                ))}
            </div>
            <HistoryPanel {...props} compact />
        </Stack>
    );
};

export const TopPanel = ({
    filter,
    kind,
    onSelect,
    url,
}: MalojaPanelProps & { kind: MalojaKind }) => {
    const { t } = useTranslation();
    const [step, setStep] = useState<MalojaFilter['step']>('month');
    const [page, setPage] = useState(0);
    const query = useQuery(queries.top(url, kind, { ...filter, step }));
    const items = query.data?.slice(page * 24, (page + 1) * 24) ?? [];
    return (
        <section className={styles.card}>
            <Group className={styles.cardHeader} justify="space-between">
                <TextTitle order={3}>{t('listeningHistory.top')}</TextTitle>
                <Select
                    aria-label={t('listeningHistory.interval')}
                    data={['week', 'month', 'year'].map((value) => ({
                        label: t(`listeningHistory.${value}`),
                        value,
                    }))}
                    onChange={(value) => {
                        setStep(value as MalojaFilter['step']);
                        setPage(0);
                    }}
                    size="xs"
                    value={step}
                    width={110}
                />
            </Group>
            <QueryState query={query}>
                {items.length ? (
                    items.map((period, index) => (
                        <section className={styles.historyDay} key={`${period.label}-${index}`}>
                            <Text className={styles.dayHeader} fw={600} size="sm">
                                {period.label}
                            </Text>
                            {period.winners.length ? (
                                period.winners.map(({ entity, plays }) => (
                                    <div
                                        className={styles.playableRow}
                                        key={JSON.stringify(entity)}
                                    >
                                        <button
                                            className={styles.historyRow}
                                            onClick={() => onSelect(entity)}
                                            type="button"
                                        >
                                            <EntityArtwork entity={entity} url={url} />
                                            <span className={styles.track}>
                                                <Text fw={500}>{entity.name}</Text>
                                                <Text isMuted size="xs">
                                                    {entity.artists.join(', ')}
                                                </Text>
                                            </span>
                                            <Text isMuted size="sm">
                                                {t('listeningHistory.entries', { count: plays })}
                                            </Text>
                                        </button>
                                        <TrackPlayButton entity={entity} />
                                    </div>
                                ))
                            ) : (
                                <Empty />
                            )}
                        </section>
                    ))
                ) : (
                    <Empty />
                )}
            </QueryState>
            <Pagination
                hasNext={(query.data?.length ?? 0) > (page + 1) * 24}
                onChange={setPage}
                page={page}
            />
        </section>
    );
};

const Performance = ({ filter, url }: MalojaPanelProps) => {
    const { t } = useTranslation();
    const [step, setStep] = useState<MalojaFilter['step']>('month');
    const [page, setPage] = useState(0);
    const query = useQuery(queries.performance(url, { ...filter, step }, page));
    return (
        <section className={styles.card}>
            <Group className={styles.cardHeader} justify="space-between">
                <TextTitle order={3}>{t('listeningHistory.performance')}</TextTitle>
                <Select
                    aria-label={t('listeningHistory.interval')}
                    data={['week', 'month', 'year'].map((value) => ({
                        label: t(`listeningHistory.${value}`),
                        value,
                    }))}
                    onChange={(value) => {
                        setStep(value as MalojaFilter['step']);
                        setPage(0);
                    }}
                    size="xs"
                    value={step}
                    width={110}
                />
            </Group>
            <QueryState query={query}>
                {query.data?.items.length ? (
                    <div className={styles.performance}>
                        {query.data.items.map((item, index) => (
                            <div className={styles.performanceItem} key={`${item.label}-${index}`}>
                                <Text isMuted size="xs">
                                    {item.label}
                                </Text>
                                <Text fw={600} size="lg">
                                    {item.rank == null ? '-' : `#${item.rank}`}
                                </Text>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Empty />
                )}
            </QueryState>
            <Pagination
                busy={query.isFetching}
                hasNext={!!query.data?.hasNextPage}
                onChange={setPage}
                page={page}
            />
        </section>
    );
};

export const EntityDetail = ({ entity, ...props }: MalojaPanelProps & { entity: MalojaEntity }) => {
    const { i18n, t } = useTranslation();
    const query = useQuery(queries.info(props.url, entity));
    const scoped = { ...props, filter: { ...props.filter, entity } };
    return (
        <Stack gap="lg">
            <section className={styles.card}>
                <div className={styles.entityHeader}>
                    <EntityArtwork
                        entity={{ ...entity, id: query.data?.id ?? entity.id }}
                        large
                        url={props.url}
                    />
                    <Stack gap="sm">
                        <Text isMuted size="xs">
                            {t(`listeningHistory.${entity.kind}`)}
                        </Text>
                        <TextTitle order={2}>{entity.name}</TextTitle>
                        <Group gap="xs">
                            <TrackPlayButton entity={entity} />
                            {entity.artists.map((artist) => (
                                <Button
                                    key={artist}
                                    onClick={() =>
                                        props.onSelect({
                                            artists: [],
                                            kind: 'artists',
                                            name: artist,
                                        })
                                    }
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    {artist}
                                </Button>
                            ))}
                        </Group>
                    </Stack>
                </div>
                <QueryState query={query}>
                    <Text className={styles.detailCaption} isMuted size="xs">
                        {t('listeningHistory.lifetime')}
                    </Text>
                    <div className={styles.detailStats}>
                        {[
                            ['listens', query.data?.scrobbles.toLocaleString(i18n.language)],
                            [
                                'ranking',
                                query.data?.position == null ? '-' : `#${query.data.position}`,
                            ],
                            [
                                'topWeeks',
                                query.data?.topweeks?.toLocaleString(i18n.language) ?? '-',
                            ],
                            [
                                'certification',
                                query.data?.certification
                                    ? t(`listeningHistory.${query.data.certification}`, {
                                          defaultValue: query.data.certification,
                                      })
                                    : '-',
                            ],
                        ].map(([label, value]) => (
                            <Stack gap={4} key={label}>
                                <Text isMuted size="xs">
                                    {t(`listeningHistory.${label}`)}
                                </Text>
                                <Text fw={600} size="xl">
                                    {value}
                                </Text>
                                {label === 'certification' && entity.kind !== 'artists' && (
                                    <Text isMuted size="xs">
                                        {t('listeningHistory.certificationDescription')}
                                    </Text>
                                )}
                            </Stack>
                        ))}
                    </div>
                    {!!query.data?.medals && (
                        <Group className={styles.awards} gap="lg">
                            {(['gold', 'silver', 'bronze'] as const).map((medal) => (
                                <Stack gap={4} key={medal}>
                                    <Text fw={500} size="sm">
                                        {t(`listeningHistory.${medal}`)}
                                    </Text>
                                    <Text isMuted size="sm">
                                        {query.data?.medals?.[medal].join(', ') || '-'}
                                    </Text>
                                </Stack>
                            ))}
                        </Group>
                    )}
                    {query.data?.associated?.length || query.data?.replace ? (
                        <Group className={styles.awards} gap="xs">
                            <Text isMuted size="sm">
                                {t('listeningHistory.associated')}
                            </Text>
                            {[
                                ...(query.data.associated ?? []),
                                ...(query.data.replace ? [query.data.replace] : []),
                            ].map((name) => (
                                <Button
                                    key={name}
                                    onClick={() =>
                                        props.onSelect({ artists: [], kind: 'artists', name })
                                    }
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    {name}
                                </Button>
                            ))}
                        </Group>
                    ) : null}
                </QueryState>
            </section>
            <PulsePanel {...scoped} />
            <Performance {...scoped} />
            {entity.kind !== 'tracks' && <RankingPanel {...scoped} kind="tracks" />}
            {entity.kind === 'artists' && <RankingPanel {...scoped} kind="albums" />}
            <HistoryPanel {...scoped} />
        </Stack>
    );
};
