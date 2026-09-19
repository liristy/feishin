import { hashKey } from '@tanstack/react-query';
import { getMany, keys } from 'idb-keyval';
import isElectron from 'is-electron';

import { offlineDataStore } from '/@/shared/utils/offline-cache';

type Item = Record<string, unknown> & { _itemType: string; _serverId: string; id: string };
type Query = Record<string, unknown>;

// Reuse normalized records from saved responses, regardless of pagination or sorting.
// Only the current server URL/account is eligible; credentials are never cache keys.
export async function readOfflineLibrary(scope: unknown[], endpoint: string, query: Query = {}) {
    const prefix = `api:${hashKey(scope).slice(0, -1)},`;
    const cacheKeys = (await keys(offlineDataStore)).filter((key) =>
        String(key).startsWith(prefix),
    );
    const snapshots = await getMany<{ savedAt?: number; value: unknown }>(
        cacheKeys,
        offlineDataStore,
    );
    const items = new Map<string, Item>();
    const libraries = new Map<string, Set<string>>();
    const visit = (value: unknown, depth = 0, folderIds: string[] = []): void => {
        if (!value || typeof value !== 'object' || depth > 6) return;
        if (Array.isArray(value)) return value.forEach((item) => visit(item, depth + 1, folderIds));
        const item = value as Item;
        if (item._serverId === scope[0] && item._itemType && item.id) {
            const key = `${item._itemType}:${item.id}`;
            items.set(key, { ...items.get(key), ...item });
            libraries.set(
                key,
                new Set([
                    ...(item.libraryId != null ? [String(item.libraryId)] : []),
                    ...(libraries.get(key) || []),
                    ...folderIds,
                ]),
            );
        }
        Object.values(value).forEach((child) => visit(child, depth + 1, folderIds));
    };
    snapshots
        .map((row, index) => ({ ...row, query: JSON.parse(String(cacheKeys[index]).slice(4))[5] }))
        .sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
        .forEach((row) => {
            const folders = row.query?.musicFolderId;
            visit(
                row.value,
                0,
                folders == null ? [] : (Array.isArray(folders) ? folders : [folders]).map(String),
            );
        });
    if (isElectron()) {
        const downloads = await window.api.offline.list();
        downloads.entries.forEach((entry) =>
            visit(
                entry.song,
                0,
                entry.song.libraryId == null ? [] : [String(entry.song.libraryId)],
            ),
        );
    }
    const all = [...items.values()];
    const related = (value: unknown): string[] =>
        Array.isArray(value) ? value.map((item) => String((item as { id: string }).id)) : [];
    const includes = (filter: unknown, values: unknown[]) =>
        filter == null ||
        (Array.isArray(filter) && !filter.length) ||
        (Array.isArray(filter) ? filter : [filter]).some((id) =>
            values.map(String).includes(String(id)),
        );
    const matches = (item: Item) => {
        const text = [item.name, item.artistName, item.albumArtistName, item.album]
            .join(' ')
            .toLocaleLowerCase();
        const term = query.searchTerm || query.query;
        return (
            (!term || text.includes(String(term).toLocaleLowerCase())) &&
            (query.favorite == null || Boolean(item.userFavorite) === query.favorite) &&
            (query.hasRating == null || Number(item.userRating) > 0 === query.hasRating) &&
            (query.compilation == null ||
                (item.isCompilation ?? item.compilation) === query.compilation) &&
            (!query.isRecentlyPlayed || Boolean(item.lastPlayedAt)) &&
            (!query.minYear || Number(item.year ?? item.releaseYear) >= Number(query.minYear)) &&
            (!query.maxYear || Number(item.year ?? item.releaseYear) <= Number(query.maxYear)) &&
            includes(query.albumIds, [item.albumId]) &&
            includes(query.artistIds, [...related(item.artists), ...related(item.albumArtists)]) &&
            includes(query.albumArtistIds, related(item.albumArtists)) &&
            includes(query.genreIds, related(item.genres)) &&
            includes(query.musicFolderId, [
                ...(libraries.get(`${item._itemType}:${item.id}`) || []),
            ])
        );
    };
    const list = (type: string) => {
        const filtered = all.filter((item) => item._itemType === type && matches(item));
        const aliases: Record<string, string> = {
            albumArtist: 'albumArtistName',
            artist: 'artistName',
            favorited: 'starredAt',
            rating: 'userRating',
            recentlyAdded: 'createdAt',
            recentlyPlayed: 'lastPlayedAt',
        };
        const sort = aliases[String(query.sortBy)] || String(query.sortBy || 'name');
        if (sort !== 'random')
            filtered.sort((a, b) => {
                const left = a[sort] ?? '';
                const right = b[sort] ?? '';
                const order =
                    typeof left === 'number' && typeof right === 'number'
                        ? left - right
                        : String(left).localeCompare(String(right), undefined, { numeric: true });
                return (query.sortOrder === 'DESC' ? -1 : 1) * order;
            });
        return filtered;
    };
    if (endpoint === 'search') {
        return {
            albumArtists: list('albumArtist').slice(
                Number(query.albumArtistStartIndex) || 0,
                (Number(query.albumArtistStartIndex) || 0) + (Number(query.albumArtistLimit) || 20),
            ),
            albums: list('album').slice(
                Number(query.albumStartIndex) || 0,
                (Number(query.albumStartIndex) || 0) + (Number(query.albumLimit) || 20),
            ),
            songs: list('song').slice(
                Number(query.songStartIndex) || 0,
                (Number(query.songStartIndex) || 0) + (Number(query.songLimit) || 20),
            ),
        };
    }
    const match = /^get(AlbumArtist|Artist|Album|Song|Playlist|Genre)(ListCount|List|Detail)$/.exec(
        endpoint,
    );
    if (match) {
        const type = match[1][0].toLowerCase() + match[1].slice(1);
        if (match[2] === 'Detail') {
            const item = items.get(`${type}:${query.id}`);
            if (item && type === 'album')
                return {
                    ...item,
                    songs:
                        item.songs ??
                        all.filter((song) => song._itemType === 'song' && song.albumId === item.id),
                };
            return item;
        }
        // Custom server expressions cannot be evaluated safely by the local catalogue.
        if (query._custom && Object.keys(query._custom).length) return undefined;
        const filtered = list(type);
        if (match[2] === 'ListCount') return filtered.length;
        const startIndex = Number(query.startIndex) || 0;
        const end = Number(query.limit) > 0 ? startIndex + Number(query.limit) : undefined;
        return {
            items: filtered.slice(startIndex, end),
            startIndex,
            totalRecordCount: filtered.length,
        };
    }
    if (endpoint === 'getPlaylistSongList' || endpoint === 'getPlaylistSongListCount') {
        const saved = snapshots.find((row, index) => {
            const parts = JSON.parse(String(cacheKeys[index]).slice(4));
            return row && parts[4] === 'getPlaylistSongList' && parts[5]?.id === query.id;
        });
        if (saved)
            return endpoint.endsWith('Count')
                ? (saved.value as { items: unknown[] }).items.length
                : saved.value;
    }
    return undefined;
}
