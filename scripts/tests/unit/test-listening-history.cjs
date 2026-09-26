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
    const saved = [{ id: 'Home' }, { id: 'Listening History', disabled: true }];
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
        status: 'ok',
        list: Array.from({ length: MALOJA_PAGE_SIZE }, (_, index) => ({
            time: 1750000000 - index,
            track: {
                title: `Song ${index}`,
                artists: ['Artist A', 'Artist B'],
                album: { albumtitle: 'Album' },
            },
            duration: 180,
            extra: 'Future fields are allowed',
        })),
    };
    const server = http.createServer((req, res) => {
        requests.push({
            method: req.method,
            url: req.url,
            authorization: req.headers.authorization,
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
            method: 'GET',
            url: '/music/apis/mlj_1/scrobbles?page=0&perpage=50',
            authorization: undefined,
        });

        response = {
            status: 'ok',
            list: [
                { time: 1, track: { title: 'Legacy album', artists: [], album: 'Legacy' } },
                { time: 0, track: { title: 'No album', artists: [], album: null } },
                { time: 0, track: { title: 'Missing album', artists: [] } },
            ],
        };
        const second = await getListeningHistory({ page: 1, url });
        assert.equal(second.hasNextPage, false);
        assert.equal(second.items[0].album, 'Legacy');
        assert.equal(second.items[1].album, '');
        assert.equal(second.items[2].album, '');
        assert.match(requests[1].url, /page=1&perpage=50$/);

        response = { status: 'ok', list: [] };
        assert.equal((await getListeningHistory({ page: 2, url })).items.length, 0);
        for (const invalid of [
            { status: 'error', list: [] },
            { status: 'ok' },
            { status: 'ok', list: [{ time: 'bad', track: { title: 'Bad', artists: [] } }] },
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
        title: 'A & B',
        artists: ['Artist One', '二号'],
        album: { albumtitle: 'Album', artists: null },
    };
    const charts = {
        artists: [{ artist: 'Artist One', artist_id: 7, rank: 1, scrobbles: 11 }],
        albums: [{ album: track.album, album_id: 8, rank: 1, scrobbles: 9 }],
        tracks: [{ track, track_id: 9, rank: 1, scrobbles: 5 }],
    };
    let broken = false;
    const server = http.createServer((req, res) => {
        const request = new URL(req.url, 'http://localhost');
        requests.push({ method: req.method, url: request });
        const endpoint = request.pathname.replace('/prefix/apis/mlj_1/', '');
        const responses = {
            'charts/artists': { status: 'ok', list: charts.artists },
            'charts/albums': { status: 'ok', list: charts.albums },
            'charts/tracks': { status: 'ok', list: charts.tracks },
            numscrobbles: { status: 'ok', amount: 123 },
            pulse: {
                status: 'ok',
                list: [
                    { range, scrobbles: 12 },
                    { range: { ...range, description: 'August 2026' }, scrobbles: 0 },
                ],
            },
            performance: {
                status: 'ok',
                list: [
                    { range, rank: 1 },
                    { range, rank: null },
                ],
            },
            'top/tracks': {
                status: 'ok',
                list: [
                    {
                        range,
                        top: [
                            charts.tracks[0],
                            { ...charts.tracks[0], track: { ...track, title: 'Tied winner' } },
                        ],
                    },
                ],
            },
            trackinfo: {
                scrobbles: 55,
                position: 2,
                id: 9,
                certification: 'gold',
                topweeks: 3,
                medals: { gold: ['2025'], silver: [], bronze: ['2024'] },
            },
        };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(broken ? { status: 'error' } : responses[endpoint]));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/prefix`;
    try {
        assert.equal(await getMalojaCount({ url, filter: { range: 'thismonth' } }), 123);
        assert.equal(requests.at(-1).url.searchParams.get('in'), 'thismonth');
        for (const kind of ['artists', 'albums', 'tracks']) {
            const rows = await getMalojaCharts({ url, kind });
            assert.equal(rows[0].entity.kind, kind);
            assert.equal(rows[0].rank, 1);
        }
        const entity = (await getMalojaCharts({ url, kind: 'tracks' }))[0].entity;
        const filter = {
            entity,
            from: '2026-09-01',
            to: '2026-09-30',
            step: 'week',
            trail: 2,
            cumulative: true,
        };
        const pulse = await getMalojaPulse({ url, filter, page: 2 });
        assert.equal(pulse.items[0].plays, 0);
        assert.equal(pulse.items[1].plays, 12);
        const params = requests.at(-1).url.searchParams;
        assert.deepEqual(params.getAll('trackartist'), ['Artist One', '二号']);
        for (const [key, value] of Object.entries({
            title: 'A & B',
            from: '2026/09/01',
            until: '2026/09/30',
            step: 'week',
            trail: '2',
            cumulative: 'yes',
            page: '2',
            perpage: '60',
            reverse: 'yes',
        }))
            assert.equal(params.get(key), value);
        const performance = await getMalojaPerformance({ url, filter, page: 0 });
        assert.equal(performance.items[0].rank, null);
        assert.equal(performance.items[1].rank, 1);
        const top = await getMalojaTop({ url, kind: 'tracks', filter });
        assert.equal(top[0].winners.length, 2);
        assert.equal(top[0].winners[1].entity.name, 'Tied winner');
        const info = await getMalojaInfo({ url, entity, filter });
        assert.equal(info.topweeks, 3);
        assert.equal(info.medals.gold[0], '2025');
        assert.equal(
            requests.at(-1).url.searchParams.has('from'),
            false,
            'Details are explicitly lifetime statistics',
        );
        broken = true;
        await assert.rejects(getMalojaCharts({ url, kind: 'tracks' }));
        await assert.rejects(getMalojaCount({ url }), { message: 'listeningHistory.loadError' });
        assert.ok(requests.every((request) => request.method === 'GET'));
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
