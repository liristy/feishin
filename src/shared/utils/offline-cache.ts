import { createStore, get, keys, set } from 'idb-keyval';

import { ImageRequest } from '/@/shared/types/domain-types';

export const offlineDataStore = createStore('feishin-offline-v1', 'data');
export const isOffline = () => !navigator.onLine;

export async function cachedImage(
    request: ImageRequest,
    init?: RequestInit,
    onRefresh?: (blob: Blob) => void,
): Promise<Blob> {
    const key = `image:${request.cacheKey}`;
    let cached = await get<{ blob: Blob; savedAt: number }>(key, offlineDataStore).catch(
        () => undefined,
    );
    const exactSize = !!cached;
    if (!cached && key.startsWith('image:subsonic:')) {
        const prefix = key.slice(0, key.lastIndexOf(':') + 1);
        const alternate = (await keys(offlineDataStore).catch(() => []))
            .filter((candidate) => String(candidate).startsWith(prefix))
            .sort((a, b) => {
                const resolution = (value: IDBValidKey) =>
                    Number(String(value).slice(prefix.length)) || Number.MAX_SAFE_INTEGER;
                return resolution(b) - resolution(a);
            })[0];
        if (alternate) cached = await get(alternate, offlineDataStore).catch(() => undefined);
    }
    if (cached && (isOffline() || (exactSize && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000)))
        return cached.blob;
    if (isOffline()) throw new Error('Image is not cached');
    const refresh = async () => {
        const response = await fetch(request.url, {
            credentials: request.credentials,
            headers: request.headers,
            ...init,
            signal: init?.signal
                ? AbortSignal.any([init.signal, AbortSignal.timeout(4000)])
                : AbortSignal.timeout(4000),
        });
        if (!response.ok) throw new Error(`Failed to load image: ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error('Empty image');
        // Storage exhaustion must not prevent displaying an otherwise usable image.
        await set(key, { blob, savedAt: Date.now() }, offlineDataStore).catch(() => undefined);
        return blob;
    };
    if (cached) {
        void refresh()
            .then(onRefresh)
            .catch(() => undefined);
        return cached.blob;
    }
    return refresh();
}
