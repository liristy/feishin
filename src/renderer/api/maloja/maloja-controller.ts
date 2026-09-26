import axios from 'axios';
import { z } from 'zod';

import i18n from '/@/i18n/i18n';
import { logger } from '/@/renderer/utils/logger';
import {
    malojaChartsSchema,
    malojaCountSchema,
    MalojaEntity,
    MalojaFilter,
    malojaFilterParams,
    malojaHistorySchema,
    malojaInfoSchema,
    MalojaKind,
    malojaPerformanceSchema,
    malojaPulseSchema,
    malojaServerSchema,
    malojaTopSchema,
    normalizeMalojaUrl,
} from '/@/shared/api/maloja/maloja-types';

export const MALOJA_PAGE_SIZE = 50;

type MalojaArgs = { filter?: MalojaFilter; signal?: AbortSignal; url: string };

const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
    const result = schema.safeParse(data);
    if (!result.success) {
        logger.warn('Invalid Maloja response', { issues: result.error.issues });
        throw new Error(i18n.t('listeningHistory.loadError'));
    }
    return result.data;
};

const get = async (
    endpoint: string,
    { filter, signal, url }: MalojaArgs,
    extra?: Record<string, string>,
) => {
    const params = malojaFilterParams(filter);
    for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
    return (
        await axios.get<unknown>(`${normalizeMalojaUrl(url)}/apis/mlj_1/${endpoint}`, {
            params,
            signal,
            timeout: 30000,
        })
    ).data;
};

const chartEntity = (
    entry: ReturnType<typeof malojaChartsSchema.parse>['list'][number],
    kind: MalojaKind,
): MalojaEntity => {
    if (kind === 'artists' && entry.artist !== undefined)
        return { artists: [], id: entry.artist_id, kind, name: entry.artist };
    if (kind === 'albums' && entry.album)
        return {
            artists: entry.album.artists ?? [],
            id: entry.album_id,
            kind,
            name: entry.album.albumtitle,
        };
    if (kind === 'tracks' && entry.track)
        return {
            album:
                typeof entry.track.album === 'string'
                    ? entry.track.album
                    : entry.track.album?.albumtitle,
            artists: entry.track.artists,
            id: entry.track_id,
            kind,
            name: entry.track.title,
        };
    throw new Error(i18n.t('listeningHistory.loadError'));
};

export const getMalojaCharts = async (args: MalojaArgs & { kind: MalojaKind }) => {
    const { list } = parse(malojaChartsSchema, await get(`charts/${args.kind}`, args));
    return list.map((entry, index) => ({
        entity: chartEntity(entry, args.kind),
        plays: entry.scrobbles,
        rank: entry.rank ?? index + 1,
    }));
};

export const getMalojaCount = async (args: MalojaArgs) =>
    parse(malojaCountSchema, await get('numscrobbles', args)).amount;
export const getMalojaServer = async (args: MalojaArgs) =>
    parse(malojaServerSchema, await get('serverinfo', args));
export const getMalojaInfo = async (args: MalojaArgs & { entity: MalojaEntity }) => {
    const endpoint = { albums: 'albuminfo', artists: 'artistinfo', tracks: 'trackinfo' }[
        args.entity.kind
    ];
    return parse(
        malojaInfoSchema,
        await get(endpoint, { ...args, filter: { entity: args.entity } }),
    );
};
export const getMalojaPulse = async (args: MalojaArgs & { page: number }) => {
    const { list } = parse(
        malojaPulseSchema,
        await get('pulse', args, {
            page: String(args.page),
            perpage: '60',
            reverse: 'yes',
        }),
    );
    return {
        hasNextPage: list.length === 60,
        items: list.reverse().map(({ range, scrobbles }) => ({
            from: range.fromstring,
            label: range.description,
            plays: scrobbles,
            to: range.tostr,
        })),
    };
};
export const getMalojaPerformance = async (args: MalojaArgs & { page: number }) => {
    const { list } = parse(
        malojaPerformanceSchema,
        await get('performance', args, {
            page: String(args.page),
            perpage: '60',
            reverse: 'yes',
        }),
    );
    return {
        hasNextPage: list.length === 60,
        items: list.reverse().map(({ range, rank }) => ({
            label: range.description,
            rank,
        })),
    };
};
export const getMalojaTop = async (args: MalojaArgs & { kind: MalojaKind }) => {
    const { list } = parse(malojaTopSchema, await get(`top/${args.kind}`, args));
    return list.reverse().map(({ range, top }) => ({
        label: range.description,
        winners: top.map((entry) => ({
            entity: chartEntity(entry, args.kind),
            plays: entry.scrobbles,
        })),
    }));
};

export const getListeningHistory = async ({
    filter,
    page,
    signal,
    url,
}: {
    filter?: MalojaFilter;
    page: number;
    signal?: AbortSignal;
    url: string;
}) => {
    const { list } = parse(
        malojaHistorySchema,
        await get(
            'scrobbles',
            { filter, signal, url },
            {
                page: String(page),
                perpage: String(MALOJA_PAGE_SIZE),
            },
        ),
    );
    return {
        hasNextPage: list.length === MALOJA_PAGE_SIZE,
        items: list.map(({ duration, origin, time, track, track_id }) => ({
            album: typeof track.album === 'string' ? track.album : (track.album?.albumtitle ?? ''),
            artists: track.artists,
            duration,
            entity: {
                album: typeof track.album === 'string' ? track.album : track.album?.albumtitle,
                artists: track.artists,
                id: track_id,
                kind: 'tracks' as const,
                name: track.title,
            },
            origin,
            playedAt: time * 1000,
            title: track.title,
        })),
    };
};
