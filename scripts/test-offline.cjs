/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
// Run: node scripts/test-offline.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
    const output = {};
    vm.runInNewContext(
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: {
                esModuleInterop: true,
                jsx: ts.JsxEmit.ReactJSX,
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText,
        {
            AbortController,
            AbortSignal,
            Blob,
            clearTimeout,
            exports: output,
            fetch,
            Headers,
            Request,
            require: (id) => mocks[id] || require(id),
            Response,
            setTimeout,
            URL,
            ...globals,
        },
        { filename: file },
    );
    return output;
}

const files = load('src/main/utils/offline-files.ts');
assert.notEqual(files.offlineKey('server-a', '1'), files.offlineKey('server-b', '1'));
assert.notEqual(files.offlineKey('a:b', 'c'), files.offlineKey('a', 'b:c'));
assert.ok(!/[<>:"/\\|?*]/.test(files.offlineFilename('../bad/track', 'a'.repeat(64), '../mp3')));
assert.equal(
    files.offlineRelativePath(
        { container: 'flac', relativePath: '歌手/专辑/01 - 歌曲.strm' },
        'a'.repeat(64),
    ),
    '歌手/专辑/01 - 歌曲.flac',
);
for (const relativePath of [
    '../../secret.mp3',
    'C:\\secret.mp3',
    '/secret.mp3',
    'CON/../NUL.mp3',
]) {
    const result = files.offlineRelativePath(
        { album: 'Album', artistName: 'Artist', container: 'mp3', relativePath },
        'a'.repeat(64),
    );
    assert.ok(!result.split('/').includes('..'));
    assert.ok(result.startsWith('Artist/Album/'));
}
assert.deepEqual(JSON.parse(JSON.stringify(files.offlineRange('bytes=2-4', 10))), {
    end: 4,
    start: 2,
});
assert.deepEqual(JSON.parse(JSON.stringify(files.offlineRange('bytes=-3', 10))), {
    end: 9,
    start: 7,
});
for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=1-2,4-5', 'bad'])
    assert.equal(files.offlineRange(range, 10), null);

async function main() {
    const middleware = require('zustand/middleware');
    let settings = JSON.stringify({
        state: { cacheWhileListening: false, offlineMode: true },
        version: 0,
    });
    const settingsStorage = {
        getItem: () => settings,
        removeItem: () => {
            settings = null;
        },
        setItem: (_key, value) => {
            settings = value;
        },
    };
    const preferences = load('src/renderer/features/offline/offline-store.ts', {
        'zustand/middleware': {
            persist: (initializer, options) =>
                middleware.persist(initializer, {
                    ...options,
                    storage: middleware.createJSONStorage(() => settingsStorage),
                }),
        },
    });
    assert.equal(preferences.useOfflineStore.getState().cacheWhileListening, false);
    assert.equal(preferences.useOfflineStore.getState().offlineMode, undefined);
    assert.equal(JSON.parse(settings).version, 1);
    assert.equal(JSON.parse(settings).state.offlineMode, undefined);

    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'feishin-offline-test-'));
    const audio = Buffer.alloc(44 + 16000);
    audio.write('RIFF');
    audio.writeUInt32LE(audio.length - 8, 4);
    audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16);
    audio.writeUInt16LE(1, 20);
    audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(8000, 24);
    audio.writeUInt32LE(16000, 28);
    audio.writeUInt16LE(2, 32);
    audio.writeUInt16LE(16, 34);
    audio.write('data', 36);
    audio.writeUInt32LE(16000, 40);
    let requests = 0;
    const server = http.createServer((req, res) => {
        requests++;
        if (req.url === '/bad') return res.end('<html>login required</html>');
        res.writeHead(200, { 'Content-Length': audio.length, 'Content-Type': 'audio/wav' });
        if (req.url === '/slow') {
            res.write(audio.subarray(0, 44));
            const timer = setTimeout(() => res.end(audio.subarray(44)), 250);
            res.on('close', () => clearTimeout(timer));
        } else res.end(audio);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    let persisted = { entries: {} };
    const Store = class {
        get(key) {
            return structuredClone(persisted[key]);
        }
        set(key, value) {
            persisted[key] = structuredClone(value);
        }
    };
    const musicMetadata = await import('music-metadata');
    let protocolHandler;
    let deferredStat;
    const handlers = new Map();
    const boot = () =>
        load('src/main/features/core/offline.ts', {
            '/@/main/logger': { error() {}, warn() {} },
            '/@/main/utils/offline-files': files,
            electron: {
                app: {
                    getPath: (name) => path.join(root, name),
                    whenReady: () => Promise.resolve(),
                },
                ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
                protocol: {
                    handle: (_name, handler) => {
                        protocolHandler = handler;
                    },
                    registerSchemesAsPrivileged() {},
                },
                shell: { openPath: async () => '' },
            },
            'electron-store': Store,
            'music-metadata': musicMetadata,
            'node:fs/promises': {
                ...fsp,
                stat: (file) => {
                    const intercept = deferredStat;
                    deferredStat = undefined;
                    return intercept ? intercept(file) : fsp.stat(file);
                },
            },
        });
    const call = (name, ...args) => handlers.get(`offline-${name}`)(null, ...args);
    const song = (id, serverId = 'server-a') => ({
        _serverId: serverId,
        artistName: 'Artist',
        container: 'wav',
        id,
        name: '../歌曲:测试',
    });
    const wait = async (key, state) => {
        for (let i = 0; i < 200; i++) {
            const snapshot = await call('list');
            if (
                state === 'saved'
                    ? snapshot.entries.some(
                          (entry) => entry.key === key && entry.layoutVersion === 1,
                      ) && !snapshot.jobs.some((job) => job.key === key)
                    : snapshot.jobs.some((job) => job.key === key && job.status === state)
            )
                return snapshot;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(`Timed out waiting for ${state}`);
    };
    try {
        boot();
        await assert.rejects(call('save', { song: song('unsafe'), url: 'file:///C:/secret' }));
        const key = await call('save', { song: song('1'), url: `${url}/ok` });
        const first = (await wait(key, 'saved')).entries[0];
        assert.ok(first.path.startsWith(path.join(root, 'music', 'Feishin')));
        assert.deepEqual(await fsp.readFile(first.path), audio);
        assert.ok((await musicMetadata.parseFile(first.path)).format.codec);
        const structured = { ...song('path-a'), relativePath: 'Artist/Album/01 - Song.strm' };
        const samePath = { ...structured, id: 'path-b' };
        const structuredKey = await call('save', { song: structured, url: `${url}/slow` });
        const collisionKey = await call('save', { song: samePath, url: `${url}/slow` });
        await wait(structuredKey, 'saved');
        await wait(collisionKey, 'saved');
        const structuredFile = (await call('resolve', 'server-a', 'path-a')).path;
        const collisionFile = (await call('resolve', 'server-a', 'path-b')).path;
        assert.equal(
            structuredFile,
            path.join(root, 'music', 'Feishin', 'Artist', 'Album', '01 - Song.wav'),
        );
        assert.notEqual(
            collisionFile,
            structuredFile,
            'Different songs must not overwrite one another',
        );
        assert.deepEqual(await fsp.readFile(collisionFile), audio);
        const before = requests;
        await call('save', { song: song('1'), url: `${url}/ok` });
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(requests, before, 'Completed audio must not be downloaded twice');

        const beforeConcurrent = requests;
        const concurrentKey = await call('save', {
            song: song('2'),
            url: `${url}/slow`,
        });
        await wait(concurrentKey, 'downloading');
        await call('save', { song: song('2'), url: `${url}/slow` });
        const concurrent = (await wait(concurrentKey, 'saved')).entries.find(
            (entry) => entry.key === concurrentKey,
        );
        assert.ok(concurrent.path.startsWith(path.join(root, 'music', 'Feishin')));
        assert.equal(
            requests,
            beforeConcurrent + 1,
            'Listening and manual downloads share one transfer',
        );

        const bad = await call('save', { song: song('bad'), url: `${url}/bad` });
        assert.ok(!(await wait(bad, 'failed')).entries.some((entry) => entry.key === bad));
        const cancelled = await call('save', {
            song: song('cancel'),
            url: `${url}/slow`,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        await call('cancel', cancelled);
        assert.ok(
            !(await wait(cancelled, 'cancelled')).entries.some((entry) => entry.key === cancelled),
        );

        // Seed the previous version's cache and migrate without any server request.
        const legacyKey = files.offlineKey('server-a', 'legacy');
        const brokenKey = files.offlineKey('server-a', 'broken');
        const cacheDirectory = path.join(root, 'userData', 'offline-audio');
        await fsp.mkdir(cacheDirectory, { recursive: true });
        for (const [id, key, bytes] of [
            ['legacy', legacyKey, audio],
            ['broken', brokenKey, Buffer.from('invalid')],
        ]) {
            const file = path.join(cacheDirectory, `${id}.wav`);
            await fsp.writeFile(file, bytes);
            persisted.entries[key] = {
                downloaded: false,
                key,
                path: file,
                savedAt: Date.now(),
                size: bytes.length,
                song: song(id),
            };
        }
        const beforeMigration = requests;
        boot();
        let releaseStat;
        deferredStat = async (file) => {
            await new Promise((resolve) => {
                releaseStat = resolve;
            });
            return fsp.stat(file);
        };
        const resolvingDuringMigration = call('resolve', 'server-a', 'legacy');
        const migrated = (await wait(legacyKey, 'saved')).entries.find(
            (entry) => entry.key === legacyKey,
        );
        releaseStat();
        assert.equal(
            (await resolvingDuringMigration).path,
            migrated.path,
            'Concurrent playback resolves the migrated file',
        );
        assert.ok(migrated.path.startsWith(path.join(root, 'music', 'Feishin')));
        assert.deepEqual(await fsp.readFile(migrated.path), audio);
        assert.equal(fs.existsSync(path.join(cacheDirectory, 'legacy.wav')), false);
        await wait(brokenKey, 'failed');
        assert.equal(requests, beforeMigration, 'Migration must not contact the server');
        assert.ok(
            await call('resolve', 'server-a', 'broken'),
            'Failed migration keeps its source and index',
        );
        assert.equal(fs.existsSync(path.join(cacheDirectory, 'broken.wav')), true);
        await call('remove', brokenKey);
        boot();
        assert.equal((await call('resolve', 'server-a', 'legacy')).path, migrated.path);
        const local = await call('resolve', 'server-a', '1');
        assert.equal(local.path, first.path, 'Restart must preserve the library');
        assert.equal(
            await call('resolve', 'server-b', '1'),
            null,
            'Servers must have isolated audio',
        );
        const response = await protocolHandler(
            new Request(local.url, { headers: { Range: 'bytes=44-99' } }),
        );
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), `bytes 44-99/${audio.length}`);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio.subarray(44, 100));
        assert.equal(
            (await protocolHandler(new Request(local.url, { headers: { Range: 'bytes=999999-' } })))
                .status,
            416,
        );
        assert.equal(
            (await protocolHandler(new Request('feishin-offline://audio/../../secret'))).status,
            404,
        );
        await fsp.unlink(first.path);
        assert.equal(
            await call('resolve', 'server-a', '1'),
            null,
            'Externally deleted files must not resolve',
        );
        assert.ok(!(await call('list')).jobs.some((job) => 'url' in job || 'controller' in job));
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('feishin-offline-test-'));
        await fsp.rm(root, { force: true, recursive: true });
    }

    const storage = new Map();
    let disconnected = false;
    const idb = {
        get: async (key) => storage.get(key),
        getMany: async (keys) => keys.map((key) => storage.get(key)),
        keys: async () => [...storage.keys()],
        set: async (key, value) => storage.set(key, value),
    };
    const library = load('src/renderer/features/offline/offline-library.ts', {
        '/@/shared/utils/offline-cache': { offlineDataStore: {} },
        'idb-keyval': idb,
        'is-electron': () => false,
    });
    const cache = load(
        'src/renderer/features/offline/offline-api-cache.ts',
        {
            '/@/i18n/i18n': { t: (key) => key },
            '/@/renderer/features/offline/offline-library': library,
            '/@/renderer/utils/logger': { logger: { debug() {}, warn() {} } },
            '/@/shared/utils/offline-cache': {
                isOffline: () => disconnected,
                offlineDataStore: {},
            },
            'idb-keyval': idb,
        },
        { Error, TypeError },
    );
    const args = [
        {
            apiClientProps: { server: { url: 'https://server', username: 'alice' }, serverId: 'a' },
            query: { a: 1, b: 2 },
        },
    ];
    const { hashKey } = require('@tanstack/react-query');
    const scope = ['a', 'https://server', null, 'alice'];
    const albums = [
        {
            _itemType: 'album',
            _serverId: 'a',
            id: 'b',
            name: 'Beta',
            songs: [
                {
                    _itemType: 'song',
                    _serverId: 'a',
                    albumId: 'b',
                    id: 'song-b',
                    libraryId: 1,
                    name: 'Track B',
                },
            ],
        },
        { _itemType: 'album', _serverId: 'a', id: 'a', name: 'Alpha', userFavorite: true },
    ];
    storage.set(
        `api:${hashKey([...scope, 'getAlbumList', { musicFolderId: '1', sortBy: 'random', startIndex: 0 }, {}])}`,
        { savedAt: 1, value: { items: albums } },
    );
    const localAlbums = await library.readOfflineLibrary(scope, 'getAlbumList', {
        limit: 1,
        musicFolderId: '1',
        sortBy: 'name',
        sortOrder: 'ASC',
        startIndex: 1,
    });
    assert.equal(localAlbums.items[0].id, 'b');
    assert.equal(localAlbums.totalRecordCount, 2);
    assert.equal(
        (await library.readOfflineLibrary(scope, 'getAlbumList', { favorite: true })).items[0].name,
        'Alpha',
    );
    assert.equal(
        (await library.readOfflineLibrary(scope, 'getAlbumDetail', { id: 'b' })).songs[0].name,
        'Track B',
    );
    assert.equal(
        (await library.readOfflineLibrary(scope, 'search', { query: 'Track' })).songs.length,
        1,
    );
    assert.equal(
        (await library.readOfflineLibrary(['a', 'https://server', null, 'bob'], 'getAlbumList'))
            .items.length,
        0,
        'Do not mix user accounts',
    );
    assert.equal(
        (await library.readOfflineLibrary(scope, 'getAlbumList', { musicFolderId: '2' })).items
            .length,
        0,
        'Preserve library filters',
    );
    await cache.offlineRead('getSongList', args, async () => ['song']);
    disconnected = true;
    assert.deepEqual(
        await cache.offlineRead('getSongList', [{ ...args[0], query: { a: 1, b: 2 } }], () =>
            assert.fail('Offline reads must not fetch'),
        ),
        ['song'],
    );
    await assert.rejects(
        cache.offlineRead('getSongDetail', [{ ...args[0], query: { id: 'missing' } }], () => []),
    );
    disconnected = false;
    const unauthorized = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        response: { status: 401 },
    });
    await assert.rejects(
        cache.offlineRead('getSongList', args, async () => {
            throw unauthorized;
        }),
    );
    const started = Date.now();
    assert.deepEqual(await cache.offlineRead('getSongList', args, () => new Promise(() => {})), [
        'song',
    ]);
    assert.ok(Date.now() - started < 1200, 'Saved content must not wait for a stalled server');
    assert.deepEqual(
        await cache.offlineRead('getSongList', args, async () => {
            throw new TypeError('Failed to fetch');
        }),
        ['song'],
    );
    let imageFetches = 0;
    const imageNavigator = { onLine: true };
    const imageCache = load(
        'src/shared/utils/offline-cache.ts',
        {
            'idb-keyval': { ...idb, createStore: () => ({}) },
        },
        {
            fetch: async () => {
                imageFetches++;
                return new Response(new Blob(['image'], { type: 'image/png' }));
            },
            navigator: imageNavigator,
        },
    );
    await imageCache.cachedImage({
        cacheKey: 'server:cover:80',
        url: 'https://server/cover?token=old',
    });
    imageNavigator.onLine = false;
    assert.equal(
        await (
            await imageCache.cachedImage({
                cacheKey: 'server:cover:80',
                url: 'https://server/cover?token=new',
            })
        ).text(),
        'image',
    );
    assert.equal(imageFetches, 1, 'Cached covers must work offline after credentials change');
    await assert.rejects(
        imageCache.cachedImage({ cacheKey: 'server:missing:80', url: 'https://server/missing' }),
    );
    storage.set('image:subsonic:a::cover:80', { blob: new Blob(['cover']), savedAt: 1 });
    assert.equal(
        await (
            await imageCache.cachedImage({
                cacheKey: 'subsonic:a::cover:400',
                url: 'https://server/cover',
            })
        ).text(),
        'cover',
        'Reuse saved covers at another display size offline',
    );
    storage.set('image:subsonic:a::cover:800', {
        blob: new Blob(['sharp cover']),
        savedAt: Date.now(),
    });
    assert.equal(
        await (
            await imageCache.cachedImage({
                cacheKey: 'subsonic:a::cover:400',
                url: 'https://server/cover',
            })
        ).text(),
        'sharp cover',
        'Prefer the largest available offline cover',
    );
    imageNavigator.onLine = true;
    let refreshed;
    const refreshDone = new Promise((resolve) => {
        refreshed = resolve;
    });
    assert.equal(
        await (
            await imageCache.cachedImage(
                { cacheKey: 'subsonic:a::cover:400', url: 'https://server/cover' },
                undefined,
                refreshed,
            )
        ).text(),
        'sharp cover',
    );
    assert.equal(
        await (await refreshDone).text(),
        'image',
        'Refresh the requested resolution even when another size is fresh',
    );
    assert.equal(await storage.get('image:subsonic:a::cover:400').blob.text(), 'image');
    const fetchesAfterRefresh = imageFetches;
    await imageCache.cachedImage({
        cacheKey: 'subsonic:a::cover:400',
        url: 'https://server/cover',
    });
    assert.equal(
        imageFetches,
        fetchesAfterRefresh,
        'Do not validate a fresh exact-size cache on every render',
    );
    let openedPath;
    let downloadStatus = 'downloaded';
    const explorer = load(
        'src/renderer/features/context-menu/actions/show-in-file-explorer-action.tsx',
        {
            '/@/renderer/features/offline/offline': {
                offline: {
                    resolve: async () => ({ path: 'C:/Music/Feishin/Artist/Album/Track.flac' }),
                },
            },
            '/@/renderer/features/offline/offline-store': {
                useSongDownloadStatus: () => downloadStatus,
            },
            '/@/shared/components/context-menu/context-menu': { ContextMenu: { Item: 'button' } },
            '/@/shared/components/toast/toast': {
                toast: { error: (error) => assert.fail(JSON.stringify(error)) },
            },
            'is-electron': () => true,
            react: { useCallback: (fn) => fn },
            'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
        },
        {
            window: {
                api: {
                    utils: {
                        openItem: async (value) => {
                            openedPath = value;
                        },
                    },
                },
            },
        },
    );
    const menu = explorer.ShowInFileExplorerAction({
        items: [{ _serverId: 'a', id: '1', path: '/music/server-only.strm' }],
    });
    await menu.props.onSelect();
    assert.equal(openedPath, 'C:/Music/Feishin/Artist/Album/Track.flac');
    downloadStatus = undefined;
    assert.equal(
        explorer.ShowInFileExplorerAction({
            items: [{ _serverId: 'a', id: '1', path: '/music/server-only.strm' }],
        }),
        null,
        'Hide explorer for undownloaded songs, even when server path exists',
    );
    downloadStatus = 'downloading';
    assert.equal(
        explorer.ShowInFileExplorerAction({ items: [{ _serverId: 'a', id: '1' }] }),
        null,
        'Incomplete downloads cannot be revealed',
    );
    const imageStates = [];
    const nativeImage = load('src/shared/components/image/use-native-image.ts', {
        '/@/shared/utils/offline-cache': {
            cachedImage: () => assert.fail('Do not fetch or persist a resolved blob URL again'),
        },
        react: {
            useEffect: (effect) => effect(),
            useMemo: (factory) => factory(),
            useRef: (current) => ({ current }),
            useState: (initial) => [initial, (state) => imageStates.push(state)],
        },
    });
    nativeImage.useNativeImage({
        enabled: true,
        request: { cacheKey: 'blob:resolved', url: 'blob:resolved' },
    });
    assert.ok(
        imageStates.some(
            (state) => state.status === 'loaded' && state.displaySrc === 'blob:resolved',
        ),
    );
    console.log(
        'Offline checks passed: audio validation, unified downloads, legacy migration, cancellation, restart, range seeking, cache isolation and network fallback.',
    );
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
