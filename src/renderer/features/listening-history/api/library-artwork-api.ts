import { queryOptions } from '@tanstack/react-query';

import { api } from '/@/renderer/api';
import { queryKeys } from '/@/renderer/api/query-keys';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { artistsQueries } from '/@/renderer/features/artists/api/artists-api';
import { searchQueries } from '/@/renderer/features/search/api/search-api';
import { MalojaEntity } from '/@/shared/api/maloja/maloja-types';
import { Album, AlbumArtist, Artist, LibraryItem, Song } from '/@/shared/types/domain-types';

type ArtworkItem = Album | AlbumArtist | Artist | Song;
const normalize = (value: string) =>
    value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const options = {
    gcTime: 30 * 60 * 1000,
    retry: false,
    staleTime: 10 * 60 * 1000,
    throwOnError: false,
} as const;

// Only walk library response containers, never unrelated settings or server credentials.
export const findLibraryArtwork = (
    entity: MalojaEntity,
    serverId: string,
    sources: unknown[],
    albumArtistOnly = false,
): ArtworkItem | null => {
    const items: ArtworkItem[] = [];
    const visit = (value: unknown) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== 'object') return;
        const item = value as ArtworkItem;
        if (
            item._serverId === serverId &&
            [
                LibraryItem.ALBUM,
                LibraryItem.ALBUM_ARTIST,
                LibraryItem.ARTIST,
                LibraryItem.SONG,
            ].includes(item._itemType)
        )
            items.push(item);
        const container = value as Record<string, unknown>;
        for (const key of ['items', 'pages', 'albumArtists', 'albums', 'songs'])
            visit(container[key]);
    };
    sources.forEach(visit);
    const expected =
        entity.kind === 'artists'
            ? albumArtistOnly
                ? [LibraryItem.ALBUM_ARTIST]
                : [LibraryItem.ALBUM_ARTIST, LibraryItem.ARTIST]
            : [entity.kind === 'albums' ? LibraryItem.ALBUM : LibraryItem.SONG];
    const matches = items.filter((item) => {
        if (!expected.includes(item._itemType) || normalize(item.name) !== normalize(entity.name))
            return false;
        if (entity.kind === 'artists') return true;
        const credited = item as Album | Song;
        const names = (entity.kind === 'albums' ? credited.albumArtists : credited.artists).map(
            (artist) => normalize(artist.name),
        );
        // Scrobbles may store the server's combined display credit as one artist.
        const displayName =
            entity.kind === 'albums' ? credited.albumArtistName : (credited as Song).artistName;
        if (displayName) names.push(normalize(displayName));
        if (
            entity.artists.length &&
            !entity.artists.every((artist) => names.includes(normalize(artist)))
        )
            return false;
        return (
            entity.kind !== 'tracks' ||
            !entity.album ||
            normalize((item as Song).album ?? '') === normalize(entity.album)
        );
    });
    if (entity.kind === 'artists') {
        // Prefer the artist's own portrait, then the same-name album artist's portrait.
        return (
            matches.find(
                (item) => item._itemType === LibraryItem.ARTIST && (item.imageId || item.imageUrl),
            ) ??
            matches.find(
                (item) =>
                    item._itemType === LibraryItem.ALBUM_ARTIST && (item.imageId || item.imageUrl),
            ) ??
            matches[0] ??
            null
        );
    }
    // Missing credits or several releases with different artwork are ambiguous.
    if (new Set(matches.map((item) => item.imageId || item.imageUrl || item.id)).size > 1)
        return null;
    return matches[0] ?? null;
};

export const libraryArtworkQuery = (
    serverId: string,
    entity: MalojaEntity,
    albumArtistOnly = false,
) =>
    queryOptions({
        ...options,
        queryFn: async ({ client }) => {
            const cached = findLibraryArtwork(
                entity,
                serverId,
                client
                    .getQueriesData({
                        predicate: (query) =>
                            query.queryKey[0] === serverId &&
                            ['albumArtists', 'albums', 'artists', 'songs'].includes(
                                String(query.queryKey[1]),
                            ),
                    })
                    .map(([, data]) => data),
                albumArtistOnly,
            );
            if (cached?.imageId || cached?.imageUrl) return cached;
            const result = await client.fetchQuery(
                searchQueries.search({
                    options,
                    query: {
                        albumArtistLimit: 50,
                        albumLimit: 50,
                        query: entity.name,
                        songLimit: 50,
                    },
                    serverId,
                }),
            );
            let match = findLibraryArtwork(entity, serverId, [result], albumArtistOnly);
            if (entity.kind === 'artists') {
                const artist = match
                    ? await client.fetchQuery(
                          artistsQueries.albumArtistDetail({
                              options,
                              query: { id: match.id },
                              serverId,
                          }),
                      )
                    : null;
                if (artist?.imageId || artist?.imageUrl) return artist;
                // Navidrome can return a successful placeholder for imageAbsent artists.
                // Use a credited track's cover only after checking the artist portrait.
                match =
                    result.songs.find(
                        (song) =>
                            song._serverId === serverId &&
                            (song.imageId || song.imageUrl) &&
                            (song.artists.length
                                ? song.artists.map((credit) => credit.name)
                                : [song.artistName]
                            ).some((name) => normalize(name) === normalize(entity.name)),
                    ) ?? null;
                if (!match) return artist;
            }
            if (!match) return null;
            // Fetch the same normalized detail as the library, including uploaded-image revisions.
            const args = { options, query: { id: match.id }, serverId };
            if (match._itemType === LibraryItem.ALBUM)
                return client.fetchQuery(albumQueries.detail(args));
            if (match._itemType !== LibraryItem.SONG)
                return client.fetchQuery(artistsQueries.albumArtistDetail(args));
            return client.fetchQuery({
                ...options,
                queryFn: ({ signal }) =>
                    api.controller.getSongDetail({
                        apiClientProps: { serverId, signal },
                        query: args.query,
                    }),
                queryKey: queryKeys.songs.detail(serverId, args.query),
            });
        },
        queryKey: queryKeys.listeningHistory.artwork(serverId, {
            ...(albumArtistOnly ? { albumArtistOnly: true } : {}),
            album: entity.album,
            artists: entity.artists.map(normalize).sort(),
            kind: entity.kind,
            name: normalize(entity.name),
        }),
    });
