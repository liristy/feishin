/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-empty-function */
const assert = require('node:assert/strict');

const { loadSource } = require('./test-mpv-sync.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
let disconnected = true,
    effect,
    entries = [],
    messages = 0,
    pending,
    playback = 'local';
const songs = Array.from({ length: 5 }, (_, i) => ({
    _serverId: 'test',
    _uniqueId: String(i),
    id: String(i),
}));
const state = {
    getCurrentSong: () => songs[state.player.index],
    getQueue: () => ({ items: songs }),
    mediaPause: () => {
        state.player.status = 'PAUSED';
    },
    mediaPlayByIndex: (index) => {
        state.player.index = index;
    },
    player: { index: 0, repeat: 'none', shuffle: 'none', status: 'PLAYING' },
    queue: { shuffled: [0, 3, 1, 4, 2] },
};
const { OfflinePlaybackHook } = loadSource('src/renderer/features/offline/offline-playback.tsx', {
    '/@/i18n/i18n': { t: (key) => key },
    '/@/renderer/features/offline/offline': {
        offline: {
            list: async () => {
                if (pending) await pending;
                return { entries: entries.map((song) => ({ song })) };
            },
        },
    },
    '/@/renderer/features/offline/offline-store': { useOfflineStatus: () => disconnected },
    '/@/renderer/store': {
        usePlaybackType: () => playback,
        usePlayerSong: () => state.getCurrentSong(),
        usePlayerStatus: () => state.player.status,
        usePlayerStore: { getState: () => state },
    },
    '/@/renderer/utils/logger': { logger: { debug() {}, warn() {} } },
    '/@/shared/components/toast/toast': {
        toast: {
            info() {
                messages++;
            },
        },
    },
    '/@/shared/types/types': {
        PlayerRepeat: { ALL: 'all' },
        PlayerShuffle: { NONE: 'none' },
        PlayerStatus: { PLAYING: 'PLAYING' },
        PlayerType: { LOCAL: 'local', WEB: 'web' },
    },
    '/@/shared/utils/offline-cache': { isOffline: () => disconnected },
    react: {
        useEffect: (callback) => {
            effect = callback;
        },
    },
});
async function run() {
    OfflinePlaybackHook();
    const cleanup = effect();
    await tick();
    return cleanup;
}
(async () => {
    entries = [songs[3]];
    await run();
    assert.equal(state.player.index, 3, 'Skip consecutive unavailable songs');
    state.player.index = 0;
    state.player.shuffle = 'track';
    entries = [songs[1], songs[4]];
    await run();
    assert.equal(state.player.index, 1, 'Follow shuffle order');
    state.player.index = 4;
    state.player.repeat = 'all';
    state.player.shuffle = 'none';
    entries = [songs[1]];
    await run();
    assert.equal(state.player.index, 1, 'Repeat all may wrap to a saved song');
    state.player.index = 0;
    state.player.repeat = 'one';
    entries = [songs[2]];
    await run();
    assert.equal(state.player.index, 2, 'Repeat one must not loop on an unavailable song');
    entries = [];
    state.player.repeat = 'all';
    await run();
    assert.equal(state.player.status, 'PAUSED');
    assert.equal(messages, 1, 'All unavailable pauses once');
    await run();
    assert.equal(messages, 1);
    state.player.status = 'PLAYING';
    entries = [{ ...songs[3], _serverId: 'other' }];
    state.player.index = 0;
    await run();
    assert.equal(state.player.status, 'PAUSED', 'Other server download must not match');
    state.player.status = 'PAUSED';
    entries = [songs[3]];
    await run();
    assert.equal(state.player.index, 0, 'Paused startup must retain position');
    state.player.status = 'PLAYING';
    let resolve;
    pending = new Promise((r) => (resolve = r));
    OfflinePlaybackHook();
    const cleanup = effect();
    state.player.index = 4;
    cleanup();
    resolve();
    await tick();
    assert.equal(state.player.index, 4, 'Do not override a newer user selection');
    pending = undefined;
    disconnected = false;
    state.player.index = 0;
    await run();
    assert.equal(state.player.index, 0, 'Online queue remains unchanged');
    console.log(
        'Offline skip checks passed: consecutive gaps, shuffle, repeat one/all, exhaustion, server isolation and stale work.',
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
