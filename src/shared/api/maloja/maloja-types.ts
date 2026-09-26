import { z } from 'zod';

export type MalojaEntity = {
    album?: string;
    artists: string[];
    id?: number | string;
    kind: MalojaKind;
    name: string;
};
export type MalojaFilter = {
    cumulative?: boolean;
    entity?: MalojaEntity;
    from?: string;
    range?: string;
    step?: 'day' | 'month' | 'week' | 'year';
    to?: string;
    trail?: number;
};
export type MalojaKind = 'albums' | 'artists' | 'tracks';

const idSchema = z.union([z.number(), z.string()]).optional();
const countSchema = z.number().finite().nonnegative();
const albumSchema = z.object({ albumtitle: z.string(), artists: z.array(z.string()).nullish() });
const trackSchema = z.object({
    album: z.union([z.string(), albumSchema]).nullish(),
    artists: z.array(z.string()),
    length: countSchema.nullish(),
    title: z.string(),
});
const rangeSchema = z.object({
    description: z.string(),
    fromstamp: z.number().finite(),
    fromstring: z.string(),
    tostamp: z.number().finite(),
    tostr: z.string(),
});
const chartEntrySchema = z.object({
    album: albumSchema.optional(),
    album_id: idSchema,
    artist: z.string().optional(),
    artist_id: idSchema,
    rank: countSchema.optional(),
    real_scrobbles: countSchema.optional(),
    scrobbles: countSchema,
    track: trackSchema.optional(),
    track_id: idSchema,
});
const listSchema = <T extends z.ZodTypeAny>(entry: T) =>
    z.object({
        list: z.array(entry),
        status: z.enum(['ok', 'success']),
    });
export const malojaChartsSchema = listSchema(chartEntrySchema);
export const malojaPulseSchema = listSchema(
    z.object({ range: rangeSchema, scrobbles: countSchema }),
);
export const malojaPerformanceSchema = listSchema(
    z.object({ range: rangeSchema, rank: countSchema.nullable() }),
);
export const malojaTopSchema = listSchema(
    z.object({ range: rangeSchema, top: z.array(chartEntrySchema) }),
);
export const malojaCountSchema = z.object({
    amount: countSchema,
    status: z.enum(['ok', 'success']),
});
export const malojaServerSchema = z.object({
    name: z.string().nullable(),
    versionstring: z.string(),
});
export const malojaInfoSchema = z.object({
    associated: z.array(z.string()).optional(),
    certification: z.string().nullable().optional(),
    id: idSchema,
    medals: z
        .object({
            bronze: z.array(z.string()),
            gold: z.array(z.string()),
            silver: z.array(z.string()),
        })
        .optional(),
    position: countSchema.nullable().optional(),
    replace: z.string().optional(),
    scrobbles: countSchema,
    topweeks: countSchema.optional(),
});

export const malojaFilterParams = (filter: MalojaFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.range) params.set('in', filter.range);
    if (filter.from) params.set('from', filter.from.replaceAll('-', '/'));
    if (filter.to) params.set('until', filter.to.replaceAll('-', '/'));
    if (filter.step) params.set('step', filter.step);
    if (filter.trail) params.set('trail', String(filter.trail));
    if (filter.cumulative) params.set('cumulative', 'yes');
    const entity = filter.entity;
    if (entity?.kind === 'artists') {
        params.set('artist', entity.name);
        params.set('associated', 'yes');
    } else if (entity) {
        params.set(entity.kind === 'albums' ? 'albumtitle' : 'title', entity.name);
        for (const artist of entity.artists)
            params.append(entity.kind === 'albums' ? 'albumartist' : 'trackartist', artist);
    }
    return params;
};

export const normalizeMalojaUrl = (value: string): string => {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Invalid Maloja URL');
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
};

// Native API: https://github.com/krateng/maloja/blob/master/API.md
export const malojaHistorySchema = z.object({
    list: z.array(
        z.object({
            duration: countSchema.nullish(),
            origin: z.string().nullish(),
            time: z.number().finite().nonnegative().max(8.64e12),
            track: trackSchema,
            track_id: idSchema,
        }),
    ),
    status: z.enum(['ok', 'success']),
});
