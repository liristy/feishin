import { hashKey } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { get, set } from 'idb-keyval';

import i18n from '/@/i18n/i18n';
import { queryKeys } from '/@/renderer/api/query-keys';
import { eventEmitter } from '/@/renderer/events/event-emitter';
import { readOfflineLibrary } from '/@/renderer/features/offline/offline-library';
import { getListRefreshMutationKey } from '/@/renderer/features/shared/list-refresh-key';
import { queryClient } from '/@/renderer/lib/react-query';
import { logger } from '/@/renderer/utils/logger';
import { ItemListKey } from '/@/shared/types/types';
import { isOffline, offlineDataStore } from '/@/shared/utils/offline-cache';

export const isOfflineNetworkError = (error: unknown) =>
    isAxiosError(error)
        ? error.code !== 'ERR_CANCELED' && (!error.response || error.response.status >= 500)
        : error instanceof TypeError ||
          (error instanceof Error && /network|timeout|fetch failed/i.test(error.message));

export async function offlineRead(
    endpoint: string,
    args: unknown[],
    fetchData: (signal: AbortSignal) => unknown,
) {
    const input = args[0] as {
        apiClientProps?: {
            server?: { url?: string; userId?: string; username?: string };
            serverId?: string;
            signal?: AbortSignal;
        };
        context?: unknown;
        query?: Record<string, unknown>;
    };
    const songList = endpoint === 'getSongList' || endpoint === 'getSongListCount';
    const listKey = input?.query?.favorite ? ItemListKey.FAVORITE_SONG : ItemListKey.SONG;
    const preferFresh =
        endpoint === 'getLyrics' ||
        endpoint === 'getStructuredLyrics' ||
        (songList &&
            queryClient.isMutating({ mutationKey: getListRefreshMutationKey(listKey) }) > 0);
    const server = input?.apiClientProps?.server;
    const scope = [input?.apiClientProps?.serverId, server?.url, server?.userId, server?.username];
    const key = `api:${hashKey([...scope, endpoint, input?.query, input?.context])}`;
    const read = () => get<{ value: unknown }>(key, offlineDataStore).catch(() => undefined);
    const local = async (requestError?: unknown) => {
        const cached = await read();
        if (cached) return cached.value;
        const value = await readOfflineLibrary(scope, endpoint, input?.query).catch(
            () => undefined,
        );
        if (value !== undefined) return value;
        throw requestError ?? new Error(i18n.t('offline.notCached'));
    };
    const callerSignal = input?.apiClientProps?.signal;
    callerSignal?.throwIfAborted();
    if (isOffline()) {
        return local();
    }
    const controller = new AbortController();
    const signal = callerSignal
        ? AbortSignal.any([callerSignal, controller.signal])
        : controller.signal;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let preview: undefined | { value: unknown };
    let receivedResponse = false;
    const request = (async () => {
        try {
            const value = await Promise.race([
                Promise.resolve().then(() => fetchData(signal)),
                new Promise<never>((_resolve, reject) => {
                    timeout = setTimeout(() => {
                        controller.abort();
                        reject(new TypeError('Server request timeout'));
                    }, 30_000);
                }),
            ]);
            receivedResponse = true;
            void set(key, { savedAt: Date.now(), value }, offlineDataStore)
                .then(() => {
                    const serverId = input?.apiClientProps?.serverId;
                    if (!preview || !serverId || callerSignal?.aborted) return;
                    const id = input?.query?.id;
                    if (typeof id === 'string' && endpoint === 'getPlaylistSongList') {
                        queryClient.setQueriesData(
                            { queryKey: queryKeys.playlists.songList(serverId, id) },
                            value,
                        );
                    } else if (typeof id === 'string' && endpoint === 'getPlaylistDetail') {
                        queryClient.setQueriesData(
                            {
                                exact: true,
                                queryKey: queryKeys.playlists.detail(serverId, id, { id }),
                            },
                            value,
                        );
                    } else if (songList && input?.query?.sortBy !== 'random') {
                        const signature = (data: unknown) => {
                            const page = data as {
                                items?: { id: string }[];
                                totalRecordCount?: number;
                            };
                            return page?.items
                                ? JSON.stringify([
                                      page.totalRecordCount,
                                      page.items.map((item) => item.id),
                                  ])
                                : data;
                        };
                        if (signature(value) !== signature(preview.value)) {
                            void queryClient.invalidateQueries({
                                queryKey: [serverId, 'songs', 'list'],
                                refetchType: 'none',
                            });
                            eventEmitter.emit('ITEM_LIST_REFRESH', {
                                key: listKey,
                            });
                        }
                    }
                })
                .catch(() => {
                    logger.warn('Could not persist offline library data', { endpoint });
                });
            return value;
        } catch (error) {
            if (
                !callerSignal?.aborted &&
                (controller.signal.aborted || isOfflineNetworkError(error))
            ) {
                logger.debug('Using saved library while server is unavailable', { endpoint });
                return local(
                    controller.signal.aborted ? new Error('Server request timeout') : error,
                );
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    })();
    if (preferFresh) return request;
    return Promise.race([
        request,
        read().then(async (cached) => {
            if (!cached) return request;
            // Let an already settled network response (including an authentication error) win.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            callerSignal?.throwIfAborted();
            if (receivedResponse) return request;
            preview = cached;
            return cached.value;
        }),
    ]);
}
