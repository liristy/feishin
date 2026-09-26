/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { QueryClient } = require('@tanstack/react-query');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: {
                esModuleInterop: true,
                jsx: ts.JsxEmit.ReactJSX,
                module: ts.ModuleKind.CommonJS,
            },
        }).outputText,
        { AbortSignal, exports, require: (id) => mocks[id] || require(id), ...globals },
    );
    return exports;
}
const LibraryItem = { ALBUM: 'album', ALBUM_ARTIST: 'albumArtist', ARTIST: 'artist', SONG: 'song' };
const queryKeys = load('src/renderer/api/query-keys.ts', {
    '/@/shared/types/domain-types': { LibraryItem },
}).queryKeys;

test('History artwork reuses library data, canonical detail and server-scoped query cache', async () => {
    let searches = 0;
    let details = 0;
    const song = {
        _itemType: 'song',
        _serverId: 'a',
        album: '叶惠美',
        artists: [{ name: '周杰伦' }],
        id: 'song',
        imageId: 'library-cover',
        name: '晴天',
    };
    const artist = {
        _itemType: 'albumArtist',
        _serverId: 'a',
        id: 'artist',
        imageId: 'uploaded&_v=2',
        name: '周杰伦',
    };
    const api = {
        controller: {
            getSongDetail: async () => {
                details++;
                return song;
            },
        },
    };
    const search = ({ options, query, serverId }) => ({
        ...options,
        queryFn: async () => {
            searches++;
            return {
                albumArtists: [artist],
                albums: [],
                songs: [{ ...song, imageId: 'search-cover' }],
            };
        },
        queryKey: queryKeys.search.list(serverId, query),
    });
    const { findLibraryArtwork, libraryArtworkQuery } = load(
        'src/renderer/features/listening-history/api/library-artwork-api.ts',
        {
            '/@/renderer/api': { api },
            '/@/renderer/api/query-keys': { queryKeys },
            '/@/renderer/features/albums/api/album-api': { albumQueries: {} },
            '/@/renderer/features/artists/api/artists-api': {
                artistsQueries: {
                    albumArtistDetail: ({ options, query, serverId }) => ({
                        ...options,
                        queryFn: async () => artist,
                        queryKey: queryKeys.albumArtists.detail(serverId, query),
                    }),
                },
            },
            '/@/renderer/features/search/api/search-api': { searchQueries: { search } },
            '/@/shared/types/domain-types': { LibraryItem },
        },
    );
    const entity = { album: '叶惠美', artists: ['周杰伦'], kind: 'tracks', name: '晴天' };
    assert.equal(findLibraryArtwork(entity, 'a', [{ pages: [{ items: [song] }] }]), song);
    assert.equal(findLibraryArtwork(entity, 'b', [song]), null);
    assert.equal(findLibraryArtwork({ ...entity, artists: ['Other singer'] }, 'a', [song]), null);
    assert.equal(findLibraryArtwork({ ...entity, album: 'Live' }, 'a', [song]), null);
    const duet = {
        ...song,
        album: '理性与感性 作品音乐会',
        artistName: '李宗盛 • 梁静茹',
        artists: [{ name: '李宗盛' }, { name: '梁静茹' }],
        name: '明明白白我的心 (Live)',
    };
    const duetEntity = {
        album: duet.album,
        artists: [duet.artistName],
        kind: 'tracks',
        name: duet.name,
    };
    assert.equal(findLibraryArtwork(duetEntity, 'a', [duet]), duet);
    assert.equal(
        findLibraryArtwork({ ...duetEntity, artists: ['李宗盛', '梁静茹'] }, 'a', [duet]),
        duet,
    );
    assert.equal(
        findLibraryArtwork({ ...duetEntity, artists: ['李宗盛 • 其他歌手'] }, 'a', [duet]),
        null,
    );
    assert.equal(findLibraryArtwork({ ...duetEntity, album: 'Other release' }, 'a', [duet]), null);
    assert.equal(
        findLibraryArtwork({ ...entity, album: undefined }, 'a', [
            song,
            { ...song, album: 'Live', imageId: 'live-cover' },
        ]),
        null,
    );
    assert.equal(
        findLibraryArtwork({ artists: [], kind: 'artists', name: ' 周杰伦 ' }, 'a', [artist]),
        artist,
    );
    const artistEntity = { artists: [], kind: 'artists', name: '周杰伦' };
    const trackArtist = { ...artist, _itemType: 'artist', id: 'track-artist', imageId: null };
    assert.equal(
        findLibraryArtwork(artistEntity, 'a', [trackArtist, artist]),
        artist,
        'A missing artist portrait falls back to the album artist',
    );
    const ownPortrait = { ...trackArtist, imageId: 'own-portrait' };
    assert.equal(
        findLibraryArtwork(artistEntity, 'a', [artist, ownPortrait]),
        ownPortrait,
        'Keep the artist portrait when available',
    );
    assert.equal(
        findLibraryArtwork(artistEntity, 'a', [ownPortrait, artist], true),
        artist,
        'A failed artist image can explicitly resolve the album artist',
    );
    const album = { ...song, _itemType: 'album', albumArtists: song.artists, name: '叶惠美' };
    assert.equal(
        findLibraryArtwork({ artists: ['周杰伦'], kind: 'albums', name: '叶惠美' }, 'a', [album]),
        album,
    );
    const client = new QueryClient();
    try {
        client.setQueryData(queryKeys.songs.list('a', {}), { items: [song] });
        assert.equal(await client.fetchQuery(libraryArtworkQuery('a', entity)), song);
        assert.equal(searches, 0, 'Already loaded library songs need no search');
        client.setQueryData(queryKeys.artists.list('a', {}), { items: [ownPortrait] });
        client.setQueryData(queryKeys.albumArtists.list('a', {}), { items: [artist] });
        assert.equal(await client.fetchQuery(libraryArtworkQuery('a', artistEntity)), ownPortrait);
        assert.equal(await client.fetchQuery(libraryArtworkQuery('a', artistEntity, true)), artist);
        assert.equal(searches, 0, 'Album artist fallback also reuses library data');
        client.clear();
        const [first, second] = await Promise.all([
            client.fetchQuery(libraryArtworkQuery('a', entity)),
            client.fetchQuery(libraryArtworkQuery('a', { ...entity, id: 123 })),
        ]);
        assert.equal(
            first.imageId,
            'library-cover',
            'Use canonical library artwork, not alternate search IDs',
        );
        assert.equal(second.imageId, first.imageId);
        assert.equal(searches, 1);
        assert.equal(details, 1);
        assert.equal(
            client.getQueryData(queryKeys.songs.detail('a', { id: 'song' })).imageId,
            'library-cover',
        );
        await client.fetchQuery(libraryArtworkQuery('a', entity));
        assert.equal(searches, 1, 'Reopening history reuses the mapping');
        assert.equal(
            await client.fetchQuery(libraryArtworkQuery('b', entity)),
            null,
            'Never reuse artwork from another server',
        );
        client.clear();
        artist.imageId = null;
        const fallback = await client.fetchQuery(libraryArtworkQuery('a', artistEntity));
        assert.equal(
            fallback,
            song,
            'A portraitless artist uses a credited song cover with canonical library metadata',
        );
        client.clear();
        song.artists = [{ name: 'Unrelated singer' }];
        assert.equal(
            await client.fetchQuery(libraryArtworkQuery('a', artistEntity)),
            artist,
            'Never use a similarly named song by another singer as the cover',
        );
    } finally {
        client.clear();
    }
});

test('Navidrome imageAbsent suppresses successful placeholder images while preserving uploaded portraits', () => {
    const { ndNormalize } = load('src/shared/api/navidrome/navidrome-normalize.ts', {
        '/@/shared/api/partial-iso-date': {},
        '/@/shared/types/domain-types': { LibraryItem },
        '/@/shared/types/types': { ServerType: { NAVIDROME: 'navidrome' } },
    });
    const artist = { albumCount: 0, id: 'artist', imageAbsent: true, name: '印子月', songCount: 2 };
    assert.equal(ndNormalize.albumArtist(artist, { id: 'a' }).imageId, null);
    assert.equal(
        ndNormalize.albumArtist({ ...artist, imageAbsent: false }, { id: 'a' }).imageId,
        'artist',
    );
    assert.equal(
        ndNormalize.albumArtist(
            { ...artist, updatedAt: 'v2', uploadedImage: 'custom' },
            { id: 'a' },
        ).imageId,
        'artist&_=v2',
    );
});

test('Statistics playback uses the matched library song and leaves the queue alone on no match or server switch', async () => {
    let mutation;
    let currentServer = 'a';
    let result = { _itemType: 'song', _serverId: 'a', id: 'canonical-song' };
    const queued = [];
    const notices = [];
    const { TrackPlayButton } = load(
        'src/renderer/features/listening-history/components/track-play-button.tsx',
        {
            '/@/renderer/features/listening-history/api/library-artwork-api': {
                libraryArtworkQuery: () => ({}),
            },
            '/@/renderer/features/player/context/player-context': {
                usePlayer: () => ({ addToQueueByData: (...args) => queued.push(args) }),
            },
            '/@/renderer/store': {
                useAuthStore: { getState: () => ({ currentServer: { id: currentServer } }) },
                useCurrentServerId: () => 'a',
            },
            '/@/shared/components/action-icon/action-icon': { ActionIcon: 'button' },
            '/@/shared/components/toast/toast': {
                toast: {
                    error: (notice) => notices.push(notice),
                    info: (notice) => notices.push(notice),
                },
            },
            '/@/shared/types/domain-types': { LibraryItem },
            '/@/shared/types/types': { Play: { NOW: 'now' } },
            '@tanstack/react-query': {
                useMutation: (options) => {
                    mutation = options;
                    return { isPending: false, mutate: () => options.mutationFn() };
                },
                useQueryClient: () => ({ fetchQuery: async () => result }),
            },
            'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
        },
    );
    const entity = { artists: ['周杰伦'], kind: 'tracks', name: '晴天' };
    const button = TrackPlayButton({ entity });
    assert.equal(button.props.icon, 'mediaPlay');
    await mutation.mutationFn();
    assert.equal(queued.length, 1);
    assert.equal(queued[0][0][0], result);
    assert.equal(queued[0][1], 'now');
    result = null;
    await mutation.mutationFn();
    assert.equal(notices[0].message, 'listeningHistory.trackNotFound');
    result = { _itemType: 'album', id: 'not-a-song' };
    await mutation.mutationFn();
    currentServer = 'b';
    result = { _itemType: 'song', _serverId: 'a', id: 'late-result' };
    await mutation.mutationFn();
    assert.equal(queued.length, 1);
    mutation.onError(new Error('network'));
    assert.equal(notices.at(-1).message, 'listeningHistory.playError');
    assert.equal(TrackPlayButton({ entity: { ...entity, kind: 'artists' } }), null);
});

test('Image cache merges concurrent loads, isolates cancellation, rejects HTML and retries failures', async () => {
    const storage = new Map();
    const pending = [];
    const cache = load(
        'src/shared/utils/offline-cache.ts',
        {
            'idb-keyval': {
                createStore: () => ({}),
                del: async (key) => storage.delete(key),
                get: async (key) => storage.get(key),
                keys: async () => [...storage.keys()],
                set: async (key, value) => storage.set(key, value),
            },
        },
        {
            fetch: (url, init) =>
                new Promise((resolve, reject) => pending.push({ init, reject, resolve, url })),
            navigator: { onLine: true },
        },
    );
    const request = { cacheKey: 'subsonic:a::cover:80', url: 'https://library/cover' };
    const abort = new AbortController();
    const first = cache.cachedImage(request, { signal: abort.signal });
    const rejected = assert.rejects(first, { name: 'AbortError' });
    const second = cache.cachedImage(request);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pending.length, 1);
    abort.abort();
    await rejected;
    assert.equal(
        pending[0].init.signal.aborted,
        false,
        'Another view still needs the shared image',
    );
    pending[0].resolve(new Response(new Blob(['cover'], { type: 'image/png' })));
    assert.equal(await (await second).text(), 'cover');
    await cache.cachedImage(request);
    assert.equal(pending.length, 1);
    const bad = { cacheKey: 'bad', url: 'https://maloja/image' };
    storage.set('image:bad', {
        blob: new Blob(['<html>cached login</html>'], { type: 'text/html' }),
        savedAt: Date.now(),
    });
    const invalid = cache.cachedImage(bad);
    const invalidRejected = assert.rejects(invalid, /Invalid image/);
    await new Promise((resolve) => setImmediate(resolve));
    pending[1].resolve(
        new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    await invalidRejected;
    assert.equal(storage.has('image:bad'), false);
    const retry = cache.cachedImage(bad);
    await new Promise((resolve) => setImmediate(resolve));
    pending[2].resolve(new Response(new Blob(['good'], { type: 'image/jpeg' })));
    assert.equal(await (await retry).text(), 'good');
});
