/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run with: node scripts/test-favorites-sorting.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let searchParams = new URLSearchParams();
let pathname = '/songs';
const storage = new Map();
const server = { id: 'navidrome-test', type: 'navidrome' };
const mocks = {
    '/@/i18n/i18n': { t: (key) => key },
    '/@/renderer/store': { useCurrentServer: () => server },
    '/@/renderer/utils/url-transition': { runInUrlTransition: (fn) => fn() },
    '/@/shared/hooks/use-debounced-callback': { useDebouncedCallback: (fn) => fn },
    '/@/shared/hooks/use-local-storage': {
        useLocalStorage: ({ defaultValue, key }) => [
            storage.get(key) ?? defaultValue,
            (update) => storage.set(key, update(storage.get(key) ?? defaultValue)),
        ],
    },
    react: { useCallback: (fn) => fn, useMemo: (fn) => fn() },
    'react-router': {
        useMatch: (route) => (pathname === route ? {} : null),
        useSearchParams: () => [
            searchParams,
            (update) => {
                searchParams = update(searchParams);
            },
        ],
    },
};
const cache = new Map();
function load(id) {
    if (mocks[id]) return mocks[id];
    if (!id.startsWith('/@/')) return require(id);
    if (cache.has(id)) return cache.get(id).exports;
    const file = path.resolve(__dirname, '../src', id.slice(3)) + '.ts';
    const module = { exports: {} };
    cache.set(id, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS },
        fileName: file,
    }).outputText;
    vm.runInNewContext(
        code,
        { exports: module.exports, module, require: load, URLSearchParams },
        { filename: file },
    );
    return module.exports;
}

const { ItemListKey } = load('/@/shared/types/types');
const { SongListSort, songListSortMap, SortOrder } = load('/@/shared/types/domain-types');
const { useSongListFilters } = load('/@/renderer/features/songs/hooks/use-song-list-filters');
const { useSortByFilter } = load('/@/renderer/features/shared/hooks/use-sort-by-filter');
const { useSortOrderFilter } = load('/@/renderer/features/shared/hooks/use-sort-order-filter');
const favorites = ItemListKey.FAVORITE_SONG;
const songs = ItemListKey.SONG;
const sort = (key) => {
    const { query } = useSongListFilters(key);
    return [query.sortBy, query.sortOrder];
};
const setSort = (key, by, order) => {
    useSortByFilter(SongListSort.NAME, key).setSortBy(by);
    useSortOrderFilter(SortOrder.ASC, key).setSortOrder(order);
    searchParams = new URLSearchParams(); // Navigate away and reopen with no URL overrides.
};

assert.notEqual(favorites, songs);
assert.deepEqual(sort(favorites), [SongListSort.FAVORITED, SortOrder.DESC]);
assert.deepEqual(sort(songs), [SongListSort.NAME, SortOrder.ASC]);
assert.equal(songListSortMap.navidrome[sort(favorites)[0]], 'starred_at');
setSort(songs, SongListSort.ALBUM, SortOrder.ASC);
assert.deepEqual(sort(favorites), [SongListSort.FAVORITED, SortOrder.DESC]);
setSort(favorites, SongListSort.FAVORITED, SortOrder.ASC);
assert.deepEqual(sort(favorites), [SongListSort.FAVORITED, SortOrder.ASC]);
assert.deepEqual(sort(songs), [SongListSort.ALBUM, SortOrder.ASC]);
setSort(favorites, SongListSort.NAME, SortOrder.DESC);
assert.deepEqual(sort(favorites), [SongListSort.NAME, SortOrder.DESC]);
assert.deepEqual(sort(songs), [SongListSort.ALBUM, SortOrder.ASC]);
searchParams = new URLSearchParams({ sortBy: SongListSort.FAVORITED, sortOrder: SortOrder.ASC });
assert.deepEqual(sort(favorites), [SongListSort.FAVORITED, SortOrder.ASC]);
searchParams = new URLSearchParams();
assert.deepEqual(sort(favorites), [SongListSort.NAME, SortOrder.DESC]);
console.log(
    'Favorites defaults, Navidrome date mapping, independent persistence and URL overrides passed.',
);

const { PlaylistListSort } = load('/@/shared/types/domain-types');
const { usePlaylistListFilters } = load(
    '/@/renderer/features/playlists/hooks/use-playlist-list-filters',
);
const { useSidebarPlaylistSort } = load(
    '/@/renderer/features/sidebar/hooks/use-sidebar-playlist-sort',
);
const sidebarSort = () => {
    const { sortBy, sortOrder } = useSidebarPlaylistSort();
    return [sortBy, sortOrder];
};
const librarySort = () => {
    const { query } = usePlaylistListFilters();
    return [query.sortBy, query.sortOrder ?? SortOrder.ASC];
};
pathname = '/playlists';
assert.deepEqual(sidebarSort(), librarySort());
assert.deepEqual(sidebarSort(), [PlaylistListSort.NAME, SortOrder.ASC]);
setSort(ItemListKey.PLAYLIST, PlaylistListSort.UPDATED_AT, SortOrder.DESC);
assert.deepEqual(sidebarSort(), librarySort());
assert.deepEqual(sidebarSort(), [PlaylistListSort.UPDATED_AT, SortOrder.DESC]);
searchParams = new URLSearchParams({
    sortBy: PlaylistListSort.SONG_COUNT,
    sortOrder: SortOrder.ASC,
});
assert.deepEqual(sidebarSort(), librarySort());
for (const route of ['/songs', '/albums', '/playlists/example/songs']) {
    pathname = route;
    searchParams = new URLSearchParams({ sortBy: SongListSort.ALBUM, sortOrder: SortOrder.ASC });
    assert.deepEqual(sidebarSort(), [PlaylistListSort.UPDATED_AT, SortOrder.DESC]);
}
server.id = 'other-server';
assert.deepEqual(sidebarSort(), [PlaylistListSort.NAME, SortOrder.ASC]);
server.id = 'navidrome-test';
assert.deepEqual(sidebarSort(), [PlaylistListSort.UPDATED_AT, SortOrder.DESC]);
console.log(
    'Sidebar playlist sorting matches the library, follows saved changes and ignores unrelated routes/servers.',
);
