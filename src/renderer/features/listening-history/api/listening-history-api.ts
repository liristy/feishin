import { queryOptions } from '@tanstack/react-query';

import { api } from '/@/renderer/api';
import { queryKeys } from '/@/renderer/api/query-keys';
import { MalojaEntity, MalojaFilter, MalojaKind } from '/@/shared/api/maloja/maloja-types';

const options = {
    gcTime: 30 * 60 * 1000,
    retry: false,
    staleTime: 60000,
    throwOnError: false,
} as const;

export const listeningHistoryQueries = {
    charts: (url: string, kind: MalojaKind, filter: MalojaFilter) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) => api.controller.getMalojaCharts({ filter, kind, signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'charts', { filter, kind }),
        }),
    count: (url: string, filter: MalojaFilter) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) => api.controller.getMalojaCount({ filter, signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'count', filter),
        }),
    info: (url: string, entity: MalojaEntity) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) => api.controller.getMalojaInfo({ entity, signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'info', entity),
        }),
    list: (url: string, page: number, filter?: MalojaFilter) =>
        queryOptions({
            ...options,
            enabled: !!url,
            queryFn: ({ signal }) =>
                api.controller.getListeningHistory({ filter, page, signal, url }),
            queryKey: queryKeys.listeningHistory.list(url, page, filter),
        }),
    performance: (url: string, filter: MalojaFilter, page: number) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) =>
                api.controller.getMalojaPerformance({ filter, page, signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'performance', { filter, page }),
        }),
    pulse: (url: string, filter: MalojaFilter, page: number) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) => api.controller.getMalojaPulse({ filter, page, signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'pulse', { filter, page }),
        }),
    server: (url: string) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) => api.controller.getMalojaServer({ signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'server', null),
        }),
    top: (url: string, kind: MalojaKind, filter: MalojaFilter) =>
        queryOptions({
            ...options,
            queryFn: ({ signal }) => api.controller.getMalojaTop({ filter, kind, signal, url }),
            queryKey: queryKeys.listeningHistory.data(url, 'top', { filter, kind }),
        }),
};
