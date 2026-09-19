import { hashKey } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { get, set } from 'idb-keyval';

import i18n from '/@/i18n/i18n';
import { readOfflineLibrary } from '/@/renderer/features/offline/offline-library';
import { logger } from '/@/renderer/utils/logger';
import { isOffline, offlineDataStore } from '/@/shared/utils/offline-cache';

export const isOfflineNetworkError = (error: unknown) =>
    isAxiosError(error)
        ? error.code !== 'ERR_CANCELED' && (!error.response || error.response.status >= 500)
        : error instanceof TypeError ||
          (error instanceof Error && /network|timeout|fetch failed/i.test(error.message));

const unavailableUntil = new Map<string, number>();
if (typeof window !== 'undefined')
    window.addEventListener('online', () => unavailableUntil.clear());

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
    const server = input?.apiClientProps?.server;
    const scope = [input?.apiClientProps?.serverId, server?.url, server?.userId, server?.username];
    const scopeKey = hashKey(scope);
    const key = `api:${hashKey([...scope, endpoint, input?.query, input?.context])}`;
    const read = () => get<{ value: unknown }>(key, offlineDataStore).catch(() => undefined);
    const cached = await read();
    const local = async () => {
        if (cached) return cached.value;
        const value = await readOfflineLibrary(scope, endpoint, input?.query).catch(
            () => undefined,
        );
        if (value !== undefined) return value;
        throw new Error(i18n.t('offline.notCached'));
    };
    const callerSignal = input?.apiClientProps?.signal;
    callerSignal?.throwIfAborted();
    if (isOffline() || (unavailableUntil.get(scopeKey) || 0) > Date.now()) return local();
    const controller = new AbortController();
    const signal = callerSignal
        ? AbortSignal.any([callerSignal, controller.signal])
        : controller.signal;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const request = (async () => {
        try {
            const value = await Promise.race([
                Promise.resolve().then(() => fetchData(signal)),
                new Promise<never>((_resolve, reject) => {
                    timeout = setTimeout(() => {
                        controller.abort();
                        reject(new TypeError('Server request timeout'));
                    }, 4000);
                }),
            ]);
            unavailableUntil.delete(scopeKey);
            await set(key, { savedAt: Date.now(), value }, offlineDataStore).catch(() => {
                logger.warn('Could not persist offline library data', { endpoint });
            });
            return value;
        } catch (error) {
            if (
                !callerSignal?.aborted &&
                (controller.signal.aborted || isOfflineNetworkError(error))
            ) {
                unavailableUntil.set(scopeKey, Date.now() + 30_000);
                logger.debug('Using saved library while server is unavailable', { endpoint });
                return local();
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    })();
    if (!cached) return request;
    // Show saved content promptly even when the network adapter is online but the server is not.
    let fallback: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            request,
            new Promise((resolve, reject) => {
                fallback = setTimeout(
                    () =>
                        callerSignal?.aborted ? reject(callerSignal.reason) : resolve(cached.value),
                    350,
                );
            }),
        ]);
    } finally {
        clearTimeout(fallback);
    }
}
