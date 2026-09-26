import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from './weekly-listening-charts.module.css';

import { listeningHistoryQueries } from '/@/renderer/features/listening-history/api/listening-history-api';
import { EntityArtwork } from '/@/renderer/features/listening-history/components/entity-artwork';
import { AppRoute } from '/@/renderer/router/routes';
import { useSettingsStore } from '/@/renderer/store';
import { MalojaEntity, MalojaKind } from '/@/shared/api/maloja/maloja-types';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Skeleton } from '/@/shared/components/skeleton/skeleton';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

const WeeklyChart = ({
    kind,
    onOpen,
    url,
}: {
    kind: 'artists' | 'tracks';
    onOpen: (kind: MalojaKind, entity?: MalojaEntity) => void;
    url: string;
}) => {
    const { i18n, t } = useTranslation();
    const query = useQuery(listeningHistoryQueries.charts(url, kind, { range: 'thisweek' }));
    return (
        <section className={styles.chart} data-kind={kind}>
            <button
                aria-label={`${t(`listeningHistory.${kind}`)} · ${t('listeningHistory.fullRanking')}`}
                className={styles.chartHeading}
                onClick={() => onOpen(kind)}
                type="button"
            >
                <span className={styles.headingLabel}>
                    <Icon icon={kind === 'artists' ? 'artist' : 'disc'} size="sm" />
                    {t(`listeningHistory.${kind}`)}
                </span>
                <span className={styles.headingArrow}>
                    <Icon icon="arrowRightS" size="sm" />
                </span>
            </button>
            {query.isPending ? (
                <Skeleton height={164} />
            ) : query.isError && !query.data ? (
                <Button
                    onClick={() => void query.refetch()}
                    size="compact-xs"
                    title={t('listeningHistory.loadError')}
                    variant="subtle"
                >
                    {t('common.refresh')}
                </Button>
            ) : query.data?.length ? (
                <ol className={styles.list}>
                    {query.data.slice(0, 5).map(({ entity, plays, rank }, index) => (
                        <li data-featured={index === 0 || undefined} key={JSON.stringify(entity)}>
                            <button
                                className={styles.row}
                                onClick={() => onOpen(kind, entity)}
                                title={[entity.name, ...entity.artists].join(' · ')}
                                type="button"
                            >
                                <span className={styles.rank}>{String(rank).padStart(2, '0')}</span>
                                <span className={styles.artwork}>
                                    <EntityArtwork
                                        entity={entity}
                                        large={index === 0}
                                        size={index === 0 ? 72 : 28}
                                        url={url}
                                    />
                                </span>
                                <span className={styles.label}>
                                    <span className={styles.name}>{entity.name}</span>
                                    {!!entity.artists.length && (
                                        <span className={styles.credit}>
                                            {entity.artists.join(', ')}
                                        </span>
                                    )}
                                </span>
                                <span
                                    aria-label={t('listeningHistory.entries', { count: plays })}
                                    className={styles.plays}
                                >
                                    {index === 0
                                        ? t('listeningHistory.entries', { count: plays })
                                        : plays.toLocaleString(i18n.language)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
            ) : (
                <Text isMuted size="xs">
                    {t('listeningHistory.empty')}
                </Text>
            )}
        </section>
    );
};

export const WeeklyListeningCharts = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const url = useSettingsStore((state) => state.general.malojaUrl);
    const open = (kind: MalojaKind, entity?: MalojaEntity) =>
        navigate(AppRoute.LISTENING_HISTORY, {
            state: {
                listeningHistory: { entity, filter: { range: 'thisweek' }, kind, tab: 'ranking' },
            },
        });
    return (
        <Stack className={styles.section} gap="xs">
            <TextTitle order={2} size="md">
                {t('listeningHistory.weeklyCharts')}
            </TextTitle>
            {url ? (
                <div className={styles.charts}>
                    {(['artists', 'tracks'] as const).map((kind) => (
                        <WeeklyChart key={kind} kind={kind} onOpen={open} url={url} />
                    ))}
                </div>
            ) : (
                <Group>
                    <Button onClick={() => navigate(AppRoute.LISTENING_HISTORY)} variant="light">
                        {t('listeningHistory.connect')}
                    </Button>
                </Group>
            )}
        </Stack>
    );
};
