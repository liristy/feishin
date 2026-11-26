/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
// Run: node --test scripts/tests/unit/test-enhanced-lrc.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    vm.runInNewContext(code, {
        exports,
        require: (id) => mocks[id] ?? require(id),
        ...globals,
    });
    return exports;
}

const enhanced = load('src/renderer/features/lyrics/api/enhanced-lrc.ts');
const { splitWordCues } = load('src/renderer/features/lyrics/api/split-word-cue.ts');
const lyricsUtils = load('src/renderer/features/lyrics/api/lyrics-utils.ts');
const {
    alignTranslationLyrics,
    findOverlayLineByTime,
    getSelectedStructuredIndex,
    splitInlineLyricsTranslation,
} = lyricsUtils;
let feature;
let serverLyrics;
let lyricsSettings = { fetch: true };
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const api = load(
    'src/renderer/features/lyrics/api/lyrics-api.ts',
    {
        '/@/renderer/api': {
            api: {
                controller: {
                    getLyrics: async () => serverLyrics,
                    getStructuredLyrics: async () => serverLyrics,
                },
            },
        },
        '/@/renderer/api/query-keys': {
            queryKeys: {
                songs: {
                    lyrics: (serverId, query) => [serverId, 'song', 'lyrics', 'select', query],
                },
            },
        },
        '/@/renderer/features/lyrics/api/enhanced-lrc': enhanced,
        '/@/renderer/features/lyrics/api/lyrics-utils': lyricsUtils,
        '/@/renderer/lib/react-query': { queryClient: client },
        '/@/renderer/store': {
            getServerById: () => ({ name: 'test' }),
            useSettingsStore: { getState: () => ({ lyrics: lyricsSettings }) },
        },
        '/@/shared/api/utils': { hasFeature: (_server, requested) => requested === feature },
        '/@/shared/types/features-types': {
            ServerFeature: {
                LYRICS_MULTIPLE_STRUCTURED: 'multiple',
                LYRICS_SINGLE_STRUCTURED: 'single',
            },
        },
        '/@/shared/utils/offline-cache': { isOffline: () => false },
        'is-electron': () => true,
    },
    {
        window: {
            api: {
                lyrics: {
                    getRemoteLyricsByRemoteId: async () => serverLyrics,
                    getRemoteLyricsBySong: async () => ({ lyrics: serverLyrics }),
                },
            },
        },
    },
);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('automatic internet lyrics expire and keep identical track IDs on separate servers', async () => {
    let clock = 0;
    let lyrics = 'old internet lyrics';
    const handlers = new Map();
    const hit = { artist: 'Artist', id: 'remote', name: 'Song', score: 0, source: 'lrclib.net' };
    load(
        'src/main/features/core/lyrics/index.ts',
        {
            '../settings': { store: { get: () => ['lrclib.net'] } },
            './furigana': {},
            './genius': {},
            './lrclib': { getLyricsBySongId: async () => lyrics, getSearchResults: async () => [hit] },
            './netease': {},
            './shared': { orderSearchResults: ({ results }) => results },
            './simpmusic': {},
            '/@/main/logger': { error: assert.fail },
            electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } },
        },
        { Date: { now: () => clock } },
    );
    const fetchLyrics = (serverId) => handlers.get('lyric-by-song')(null, {
        _serverId: serverId,
        artists: [{ name: 'Artist' }],
        duration: 10000,
        id: 'same-id',
        name: 'Song',
    });
    assert.equal((await fetchLyrics('first')).lyrics, 'old internet lyrics');
    lyrics = 'updated internet lyrics';
    assert.equal((await fetchLyrics('first')).lyrics, 'old internet lyrics');
    assert.equal((await fetchLyrics('second')).lyrics, 'updated internet lyrics');
    clock = 300_001;
    assert.equal((await fetchLyrics('first')).lyrics, 'updated internet lyrics');
});

test('lyric gaps use blank markers, confirmed vocal ends and long line-only pauses', () => {
    const line = (startMs, text = 'lyric') => ({ startMs, text });
    const timed = (startMs, endMs) => ({
        ...line(startMs),
        cueLines: [{ endMs, startMs, value: 'lyric', words: [] }],
    });
    const gaps = (lines) => plain(Array.from(lyricsUtils.getLyricGaps(lines)));
    assert.deepEqual(gaps([line(3000), line(6000), line(19000), line(21000, ''), line(22500)]), [
        [0, { endMs: 3000, startMs: 0 }],
        [2, { endMs: 19000, startMs: 11000 }],
        [4, { endMs: 22500, startMs: 21000 }],
    ]);
    assert.deepEqual(gaps([timed(0, 7000), timed(2000, 4000), line(4500, ''), line(11000)]), [
        [3, { endMs: 11000, startMs: 7000 }],
    ]);
    assert.deepEqual(gaps([timed(0, 5000), timed(4500, 6000), line(8000), line(16000, '')]), []);
});

test('a Hangul word cue animates each syllable within the supplied time range', () => {
    const original = { endMs: 2500, startMs: 1000, text: '그날의 ' };
    const actual = splitWordCues([original, { endMs: 2600, startMs: 2500, text: '밤' }]);
    assert.deepEqual(plain(actual).map(({ endMs, startMs, text }) => [text, startMs, endMs]), [
        ['그', 1000, 1500],
        ['날', 1500, 2000],
        ['의 ', 2000, 2500],
        ['밤', 2500, 2600],
    ]);
    assert.deepEqual(
        plain(splitWordCues([{ ...original, text: '그날' }])).map((word) => word.text),
        ['그', '날'],
    );
});

test('a saved overlay selection falls back to the original lyrics', () => {
    const local = [
        { kind: 'main', synced: true },
        { kind: 'translation', synced: true },
        { kind: 'main', synced: true },
        { kind: 'pronunciation', synced: true },
    ];
    assert.equal(getSelectedStructuredIndex(local, 1), 0);
    assert.equal(getSelectedStructuredIndex(local, 2), 2);
    assert.equal(getSelectedStructuredIndex(local, 3), 0);
});

test('timed translations follow their own line and leave gaps empty', () => {
    const lyrics = [510, 686, 9247, 22559].map((startMs) => ({ startMs, text: '원문' }));
    const translation = api.formatLyricsForDisplay('[00:00.686]第一句\n[00:22.000]第三句');
    const aligned = alignTranslationLyrics(lyrics, translation);

    assert.deepEqual(
        lyrics.map((line, index) => findOverlayLineByTime(aligned, line.startMs, index)),
        ['', '第一句', '', '第三句'],
    );
});

test('inline translations keep the original timing and blank translation rows', () => {
    const lyrics = api.formatLyricsForDisplay('[00:01.000]첫 줄_BREAK_第一句\n[00:03.000]둘째 줄');
    assert.deepEqual(plain(splitInlineLyricsTranslation(lyrics)), {
        lyrics: [
            { startMs: 1000, text: '첫 줄' },
            { startMs: 3000, text: '둘째 줄' },
        ],
        translation: '第一句\n',
    });
    assert.equal(splitInlineLyricsTranslation('[unknown] A lyric'), null);
});

test('ELRC preserves word timing, text and terminal markers for karaoke', () => {
    const rows = api.formatLyricsForDisplay(
        '[ar:Artist]\r\n[00:01.00]<00:01.00>Hello, <00:01.500>世界😀<00:02.25>\r\n[00:03.0]Next',
    );
    assert.equal(rows[0].text, 'Hello, 世界😀');
    assert.deepEqual(plain(rows[0].cueLines[0]), {
        endMs: 2250,
        index: 0,
        startMs: 1000,
        value: 'Hello, 世界😀',
        words: [
            { endMs: 1500, startMs: 1000, text: 'Hello, ' },
            { endMs: 2250, startMs: 1500, text: '世界😀' },
        ],
    });
    assert.deepEqual(plain(rows[1]), { startMs: 3000, text: 'Next' });
});

test('missing end tags, untagged prefixes and invalid timing remain usable', () => {
    const rows = api.formatLyricsForDisplay(
        '[00:01]Sing <00:02>along\n[00:04]<00:04>好<00:04.5>呀\n[00:06]\n[00:07] <00:08>Last',
    );
    assert.equal(rows[0].cueLines[0].words[0].text, 'Sing ');
    assert.equal(rows[0].cueLines[0].words[1].endMs, 4000);
    assert.equal(rows[1].cueLines[0].words[1].endMs, 6000);
    assert.deepEqual(plain(rows[2]), { startMs: 6000, text: '' });
    assert.deepEqual(plain(rows[3].cueLines[0].words), [
        { endMs: 9000, startMs: 8000, text: ' Last' },
    ]);
    const invalid = api.formatLyricsForDisplay('[00:01]<00:03>A<00:02>B');
    assert.equal(invalid[0].text, 'AB');
    assert.equal(invalid[0].cueLines, undefined);
    const spaced = api.formatLyricsForDisplay('[00:01]<00:01>Hello<00:02> <00:03>world<00:04>');
    assert.equal(spaced[0].cueLines[0].words.map((word) => word.text).join(''), 'Hello world');
    assert.equal(
        api.formatLyricsForDisplay('Plain lyrics\n<not a timestamp>'),
        'Plain lyrics\n<not a timestamp>',
    );
    assert.equal(
        api.formatLyricsForDisplay('[1000,500](0,250)Hello (250,250)world')[0].text,
        'Hello world',
    );
});

test('all fetching paths parse ELRC and preserve authoritative server cues', async () => {
    const song = { id: 'song', lyrics: '[00:01]<00:01>One<00:02>' };
    const fetchLocal = () => api.fetchLocalLyrics({ serverId: 'test', song });
    feature = undefined;
    assert.equal((await fetchLocal()).lyrics[0].cueLines[0].endMs, 2000);
    feature = 'single';
    serverLyrics = [{ startMs: 1000, text: '<00:01>Two<00:02>' }];
    assert.equal((await fetchLocal()).lyrics[0].text, 'Two');
    feature = 'multiple';
    const authoritative = {
        cueLines: [{ words: [{ endMs: 3500, startMs: 3200, text: 'Three' }] }],
        startMs: 3000,
        text: 'Three',
    };
    serverLyrics = [
        {
            lyrics: [{ startMs: 1000, text: '<00:01>Two<00:02>' }, authoritative],
            offsetMs: 250,
            synced: true,
        },
    ];
    const local = await fetchLocal();
    assert.equal(local[0].offsetMs, 250);
    assert.equal(local[0].lyrics[0].cueLines[0].words[0].endMs, 2000);
    assert.equal(local[0].lyrics[1], authoritative);
    serverLyrics = song.lyrics;
    assert.equal((await api.fetchRemoteLyricsAuto(song)).lyrics[0].text, 'One');
    assert.equal((await api.fetchRemoteLyricsById({}))[0].cueLines[0].endMs, 2000);
});

test('restored line-only lyrics refetch word timing while retaining the saved offset', async () => {
    lyricsSettings = { fetch: false, preferLocalLyrics: true };
    feature = 'multiple';
    const line = { startMs: 1000, text: 'Hello world' };
    const enhancedLine = {
        ...line,
        cueLines: [
            {
                endMs: 3000,
                index: 0,
                startMs: 1000,
                value: line.text,
                words: [
                    { endMs: 2000, startMs: 1000, text: 'Hello ' },
                    { endMs: 3000, startMs: 2000, text: 'world' },
                ],
            },
        ],
    };
    serverLyrics = [{ lyrics: [enhancedLine], offsetMs: 40, synced: true }];
    const options = api.lyricsQueries.songLyrics(
        { query: { songId: 'song' }, serverId: 'test' },
        { id: 'song' },
    );
    client.setQueryData(
        options.queryKey,
        {
            local: [{ lyrics: [line], synced: true }],
            manualOffsetMs: 125,
            overrideData: null,
            overrideSelection: null,
            remoteAuto: null,
            selected: { lyrics: [line] },
            selectedOffsetMs: 125,
            selectedStructuredIndex: 0,
            selectedSynced: true,
            suppressRemoteAuto: false,
        },
        { updatedAt: Date.now() - 1000 },
    );
    const observer = new QueryObserver(client, options);
    let unsubscribe;
    try {
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error('Old persisted lyrics never refreshed')),
                1000,
            );
            unsubscribe = observer.subscribe((result) => {
                if (!result.isFetching && result.data?.selected?.lyrics[0].cueLines) {
                    clearTimeout(timeout);
                    resolve(result.data);
                }
            });
        });
        assert.equal(result.selected.lyrics[0].cueLines[0].words.length, 2);
        assert.equal(result.selectedOffsetMs, 125);
    } finally {
        unsubscribe?.();
        client.clear();
    }
});
