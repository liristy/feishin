import { createStore, del, get, keys, set } from 'idb-keyval';

import { ImageRequest } from '/@/shared/types/domain-types';

export const offlineDataStore = createStore('feishin-offline-v1', 'data');
export const isOffline = () => !navigator.onLine;

const imageRequests = new Map<string, Promise<Blob>>();
const usableImage = (blob: Blob) =>
    blob.size > 0 &&
    (!blob.type || blob.type.startsWith('image/') || blob.type === 'application/octet-stream');

export async function cachedImage(
    request: ImageRequest,
    init?: RequestInit,
    onRefresh?: (blob: Blob) => void,
): Promise<Blob> {
    init?.signal?.throwIfAborted();
    const key = `image:${request.cacheKey}`;
    let cached = await get<{ blob: Blob; savedAt: number }>(key, offlineDataStore).catch(
        () => undefined,
    );
    if (cached && !usableImage(cached.blob)) {
        cached = undefined;
        await del(key, offlineDataStore).catch(() => undefined);
    }
    let sufficientSize = !!cached;
    if (!cached && /^image:(subsonic|jellyfin):/.test(key)) {
        const prefix = key.slice(0, key.lastIndexOf(':') + 1);
        const alternate = (await keys(offlineDataStore).catch(() => []))
            .filter((candidate) => String(candidate).startsWith(prefix))
            .sort((a, b) => {
                const resolution = (value: IDBValidKey) =>
                    Number(String(value).slice(prefix.length)) || Number.MAX_SAFE_INTEGER;
                return resolution(b) - resolution(a);
            })[0];
        if (alternate) {
            cached = await get(alternate, offlineDataStore).catch(() => undefined);
            sufficientSize =
                (Number(String(alternate).slice(prefix.length)) || Infinity) >=
                (Number(key.slice(prefix.length)) || Infinity);
            if (cached && !usableImage(cached.blob)) cached = undefined;
        }
    }
    init?.signal?.throwIfAborted();
    if (
        cached &&
        (isOffline() || (sufficientSize && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000))
    )
        return cached.blob;
    if (isOffline()) throw new Error('Image is not cached');
    const refresh = () => {
        const existing = imageRequests.get(key);
        if (existing) return existing;
        const pending = (async () => {
            const response = await fetch(request.url, {
                credentials: request.credentials,
                headers: request.headers,
                ...init,
                // A disappearing row must not cancel an image another view is using.
                signal: AbortSignal.timeout(30000),
            });
            if (!response.ok) throw new Error(`Failed to load image: ${response.status}`);
            const blob = await response.blob();
            if (!usableImage(blob)) throw new Error('Invalid image response');
            // Storage exhaustion must not prevent displaying an otherwise usable image.
            await set(key, { blob, savedAt: Date.now() }, offlineDataStore).catch(() => undefined);
            return blob;
        })();
        imageRequests.set(key, pending);
        void pending.finally(() => imageRequests.delete(key)).catch(() => undefined);
        return pending;
    };
    if (cached) {
        void refresh()
            .then((blob) => {
                if (!init?.signal?.aborted) onRefresh?.(blob);
            })
            .catch(() => undefined);
        return cached.blob;
    }
    const pending = refresh();
    const signal = init?.signal;
    if (!signal) return pending;
    return new Promise<Blob>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        void pending
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
    });
}
