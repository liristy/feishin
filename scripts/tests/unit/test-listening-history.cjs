/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Run with: node --test scripts/tests/unit/test-listening-history.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(id) {
    if (id === '/@/i18n/i18n') return { t: (key) => key };
    if (id === '/@/renderer/utils/logger') return { logger: { warn: () => {} } };
    if (!id.startsWith('/@/')) return require(id);
    const file = path.resolve(__dirname, '../../../src', id.slice(3)) + '.ts';
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS },
        fileName: file,
    }).outputText;
    vm.runInNewContext(
        code,
        { exports: module.exports, module, require: load, URL, URLSearchParams },
        { filename: file },
    );
    return module.exports;
}

const { normalizeMalojaUrl } = load('/@/shared/api/maloja/maloja-types');
const { getListeningHistory, MALOJA_PAGE_SIZE } = load('/@/renderer/api/maloja/maloja-controller');
const {
    getMalojaCharts,
    getMalojaCount,
    getMalojaInfo,
    getMalojaPerformance,
    getMalojaPulse,
    getMalojaTop,
} = load('/@/renderer/api/maloja/maloja-controller');

test('Restoring a custom sidebar keeps one history entry and its saved order', () => {
    const { mergeOverridingColumns } = load('/@/renderer/store/utils');
    const saved = [{ id: 'Home' }, { disabled: true, id: 'Listening History' }];
    const merged = mergeOverridingColumns(
        { general: { sidebarItems: saved } },
        {
            general: {
                malojaUrl: '',
                sidebarItems: [{ id: 'Home' }, { id: 'Albums' }, { id: 'Listening History' }],
            },
        },
    );
    assert.deepEqual(merged.general.sidebarItems, saved);
    assert.equal(merged.general.malojaUrl, '');
});

test('Maloja read-only history, pagination, validation and cancellation', async () => {
    assert.equal(
        normalizeMalojaUrl(' https://example.com/music///?foo=bar#home '),
        'https://example.com/music',
    );
    for (const url of [
        'example.com',
        'file:///tmp/music',
        'javascript:alert(1)',
        'https://user:secret@example.com',
    ]) {
        assert.throws(() => normalizeMalojaUrl(url));
    }

    const requests = [];
    let response = {
        list: Array.from({ length: MALOJA_PAGE_SIZE }, (_, index) => ({
            duration: 180,
            extra: 'Future fields are allowed',
            time: 1750000000 - index,
            track: {
                album: { albumtitle: 'Album' },
                artists: ['Artist A', 'Artist B'],
                title: `Song ${index}`,
            },
        })),
        status: 'ok',
    };
    const server = http.createServer((req, res) => {
        requests.push({
            authorization: req.headers.authorization,
            method: req.method,
            url: req.url,
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(response));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/music/`;
    try {
        const first = await getListeningHistory({ page: 0, url });
        assert.equal(first.hasNextPage, true);
        assert.equal(first.items[0].playedAt, 1750000000000);
        assert.equal(first.items[0].album, 'Album');
        assert.equal(first.items[0].artists.join(', '), 'Artist A, Artist B');
        assert.equal(first.items[49].title, 'Song 49');
        assert.deepEqual(requests[0], {
            authorization: undefined,
            method: 'GET',
            url: '/music/apis/mlj_1/scrobbles?page=0&perpage=50',
        });

        response = {
            list: [
                { time: 1, track: { album: 'Legacy', artists: [], title: 'Legacy album' } },
                { time: 0, track: { album: null, artists: [], title: 'No album' } },
                { time: 0, track: { artists: [], title: 'Missing album' } },
            ],
            status: 'ok',
        };
        const second = await getListeningHistory({ page: 1, url });
        assert.equal(second.hasNextPage, false);
        assert.equal(second.items[0].album, 'Legacy');
        assert.equal(second.items[1].album, '');
        assert.equal(second.items[2].album, '');
        assert.match(requests[1].url, /page=1&perpage=50$/);

        response = { list: [], status: 'ok' };
        assert.equal((await getListeningHistory({ page: 2, url })).items.length, 0);
        for (const invalid of [
            { list: [], status: 'error' },
            { status: 'ok' },
            { list: [{ time: 'bad', track: { artists: [], title: 'Bad' } }], status: 'ok' },
            '<html>Login required</html>',
        ]) {
            response = invalid;
            await assert.rejects(getListeningHistory({ page: 0, url }));
        }
        const abort = new AbortController();
        abort.abort();
        await assert.rejects(getListeningHistory({ page: 0, signal: abort.signal, url }));
        assert.ok(requests.every((req) => req.method === 'GET' && !req.authorization));
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('Maloja dashboard preserves ties, missing ranks, counts and exact entity/time filters', async () => {
    const requests = [];
    const range = {
        description: 'September 2026',
        fromstamp: 1788220800,
        fromstring: '2026/09/01',
        tostamp: 1790812799,
        tostr: '2026/09/30',
    };
    const track = {
        album: { albumtitle: 'Album', artists: null },
        artists: ['Artist One', '二号'],
        title: 'A & B',
    };
    const charts = {
        albums: [{ album: track.album, album_id: 8, rank: 1, scrobbles: 9 }],
        artists: [{ artist: 'Artist One', artist_id: 7, rank: 1, scrobbles: 11 }],
        tracks: [{ rank: 1, scrobbles: 5, track, track_id: 9 }],
    };
    let broken = false;
    const server = http.createServer((req, res) => {
        const request = new URL(req.url, 'http://localhost');
        requests.push({ method: req.method, url: request });
        const endpoint = request.pathname.replace('/prefix/apis/mlj_1/', '');
        const responses = {
            'charts/albums': { list: charts.albums, status: 'ok' },
            'charts/artists': { list: charts.artists, status: 'ok' },
            'charts/tracks': { list: charts.tracks, status: 'ok' },
            numscrobbles: { amount: 123, status: 'ok' },
            performance: {
                list: [
                    { range, rank: 1 },
                    { range, rank: null },
                ],
                status: 'ok',
            },
            pulse: {
                list: [
                    { range, scrobbles: 12 },
                    { range: { ...range, description: 'August 2026' }, scrobbles: 0 },
                ],
                status: 'ok',
            },
            'top/tracks': {
                list: [
                    {
                        range,
                        top: [
                            charts.tracks[0],
                            { ...charts.tracks[0], track: { ...track, title: 'Tied winner' } },
                        ],
                    },
                ],
                status: 'ok',
            },
            trackinfo: {
                certification: 'gold',
                id: 9,
                medals: { bronze: ['2024'], gold: ['2025'], silver: [] },
                position: 2,
                scrobbles: 55,
                topweeks: 3,
            },
        };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(broken ? { status: 'error' } : responses[endpoint]));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/prefix`;
    try {
        assert.equal(await getMalojaCount({ filter: { range: 'thismonth' }, url }), 123);
        assert.equal(requests.at(-1).url.searchParams.get('in'), 'thismonth');
        for (const kind of ['artists', 'albums', 'tracks']) {
            const rows = await getMalojaCharts({ kind, url });
            assert.equal(rows[0].entity.kind, kind);
            assert.equal(rows[0].rank, 1);
        }
        const entity = (await getMalojaCharts({ kind: 'tracks', url }))[0].entity;
        const filter = {
            cumulative: true,
            entity,
            from: '2026-09-01',
            step: 'week',
            to: '2026-09-30',
            trail: 2,
        };
        const pulse = await getMalojaPulse({ filter, page: 2, url });
        assert.equal(pulse.items[0].plays, 0);
        assert.equal(pulse.items[1].plays, 12);
        const params = requests.at(-1).url.searchParams;
        assert.deepEqual(params.getAll('trackartist'), ['Artist One', '二号']);
        for (const [key, value] of Object.entries({
            cumulative: 'yes',
            from: '2026/09/01',
            page: '2',
            perpage: '60',
            reverse: 'yes',
            step: 'week',
            title: 'A & B',
            trail: '2',
            until: '2026/09/30',
        }))
            assert.equal(params.get(key), value);
        const performance = await getMalojaPerformance({ filter, page: 0, url });
        assert.equal(performance.items[0].rank, null);
        assert.equal(performance.items[1].rank, 1);
        const top = await getMalojaTop({ filter, kind: 'tracks', url });
        assert.equal(top[0].winners.length, 2);
        assert.equal(top[0].winners[1].entity.name, 'Tied winner');
        const info = await getMalojaInfo({ entity, filter, url });
        assert.equal(info.topweeks, 3);
        assert.equal(info.medals.gold[0], '2025');
        assert.equal(
            requests.at(-1).url.searchParams.has('from'),
            false,
            'Details are explicitly lifetime statistics',
        );
        broken = true;
        await assert.rejects(getMalojaCharts({ kind: 'tracks', url }));
        await assert.rejects(getMalojaCount({ url }), { message: 'listeningHistory.loadError' });
        assert.ok(requests.every((request) => request.method === 'GET'));
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
