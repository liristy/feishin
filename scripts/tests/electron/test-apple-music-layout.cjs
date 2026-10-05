/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
// Build first, then: node node_modules/electron/cli.js scripts/tests/electron/test-apple-music-layout.cjs
// Uses a temporary profile and a local music server; never reads the user's music or credentials.
const { app, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'feishin-apple-layout-'));
const output = path.resolve('.scratch/apple-music');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', profile);
app.setPath('music', profile);
app.requestSingleInstanceLock = () => true;
process.env.DISABLE_AUTO_UPDATES = 'true';
fs.writeFileSync(
    path.join(profile, 'config.json'),
    JSON.stringify({ window_enable_tray: false, window_window_bar_style: 'web' }),
);
const names = ['Midnight City', 'Golden Hour', 'Blue Weekend', 'After Hours', 'Dreamland', 'Bloom'];
const albums = Array.from({ length: 12 }, (_, index) => ({
    artist: ['The Midnight', 'Kacey Musgraves', 'Wolf Alice'][index % 3],
    artistId: `artist-${index % 3}`,
    coverArt: String(index),
    created: '2026-09-01T00:00:00Z',
    duration: 1800,
    id: String(index),
    name: names[index % names.length],
    playCount: 20 - index,
    songCount: 10,
    year: 2026,
}));
const song = {
    ...albums[0],
    album: albums[0].name,
    albumArtists: [{ id: 'artist-0', name: albums[0].artist }],
    albumId: '0',
    artists: [{ id: 'artist-0', name: albums[0].artist }],
    contentType: 'audio/wav',
    discNumber: 1,
    duration: 120,
    id: 'song-0',
    isDir: false,
    isVideo: false,
    parent: '0',
    path: 'fixture.wav',
    size: 1920044,
    suffix: 'wav',
    title: 'A little closer',
    track: 1,
    type: 'music',
};
const audio = Buffer.alloc(44 + 8000 * 2 * 120);
audio.write('RIFF', 0);
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
audio.writeUInt32LE(audio.length - 44, 40);
const fixtureServer = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(request.url, 'http://localhost');
    const endpoint = url.pathname.split('/').at(-1).replace('.view', '');
    if (url.pathname.startsWith('/apis/mlj_1/charts/')) {
        const artists = [
            'The Midnight',
            'Kacey Musgraves',
            'Wolf Alice',
            'The Weeknd',
            'Glass Animals',
        ];
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
            JSON.stringify({
                list: Array.from({ length: 5 }, (_, index) => ({
                    ...(endpoint === 'artists'
                        ? { artist: artists[index], artist_id: index }
                        : {
                              track: {
                                  album: albums[index].name,
                                  artists: [albums[index].artist],
                                  title: index === 0 ? song.title : albums[index].name,
                              },
                              track_id: index,
                          }),
                    rank: index + 1,
                    scrobbles: 84 - index * 13,
                })),
                status: 'ok',
            }),
        );
        return;
    }
    if (endpoint === 'stream') {
        response.writeHead(200, { 'Content-Type': 'audio/wav' });
        response.end(audio);
        return;
    }
    if (endpoint === 'getCoverArt' || endpoint === 'image') {
        const index =
            Number(
                url.searchParams.get('id') ??
                    url.searchParams.get('artist_id') ??
                    url.searchParams.get('track_id'),
            ) || 0;
        const size = Number(url.searchParams.get('size')) || 1600;
        const colors = ['#323765', '#c17d43', '#427d81', '#b9606c', '#8b725e', '#45744f'];
        response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        response.end(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 600 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${colors[index % 6]}"/><stop offset="1" stop-color="#161827"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="430" cy="180" r="150" fill="#ffffff" opacity=".15"/><circle cx="90" cy="500" r="220" fill="#ffffff" opacity=".08"/><text x="36" y="350" fill="white" font-family="sans-serif" font-size="48" font-weight="bold">${names[index % 6]}</text></svg>`,
        );
        return;
    }
    const payload = {
        album: { ...albums[0], song: [song] },
        albumList2: {
            album: albums.slice(
                Number(url.searchParams.get('offset')) || 0,
                (Number(url.searchParams.get('offset')) || 0) +
                    (Number(url.searchParams.get('size')) || 12),
            ),
        },
        artists: { index: [] },
        genres: { genre: [] },
        lyricsList: {
            structuredLyrics: [
                {
                    lang: 'en',
                    line: [
                        { start: 0, value: 'The night is quiet' },
                        { start: 5000, value: 'The city lights are shining' },
                        { start: 10000, value: 'A little closer to the morning' },
                    ],
                    synced: true,
                },
            ],
        },
        musicFolders: { musicFolder: [] },
        playlists: {
            playlist: Array.from({ length: 40 }, (_, index) => ({
                ...albums[index % albums.length],
                id: `playlist-${index}`,
                name: ['Late night', 'Work focus', 'On repeat'][index] ?? `Playlist ${index + 1}`,
                owner: 'test',
                public: false,
            })),
        },
        randomSongs: {
            song: Array.from({ length: 12 }, (_, index) => ({
                ...song,
                albumArtists: [{ id: `artist-${index % 3}`, name: albums[index].artist }],
                artist: albums[index].artist,
                artists: [{ id: `artist-${index % 3}`, name: albums[index].artist }],
                coverArt: String(index),
                id: `song-${index}`,
                title: [
                    'A little closer',
                    'California skies',
                    'Dancing in the dark',
                    'Stay with me',
                    'Only you',
                    'Moonlight',
                ][index % 6],
            })),
        },
        scanStatus: { scanning: false },
        searchResult3: { album: albums, artist: [], song: [song] },
        song,
        starred2: { album: [], artist: [], song: [] },
        user: { username: 'test' },
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
        JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...payload } }),
    );
});
const serverReady = new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
app.on('before-quit', () => fixtureServer.close());
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => app.exit(1), 90000);
app.once('browser-window-created', (_event, win) => {
    win.show = () => {};
    win.showInactive = () => {};
    win.setSize(1280, 850);
    win.webContents.setBackgroundThrottling(false);
    win.webContents.on('console-message', (_event, details) => {
        if (details.level === 'error' || details.level === 3)
            console.log('Renderer error', details.message);
    });
    const evaluate = (code) => win.webContents.executeJavaScript(code);
    const refreshHiddenWindow = async () => {
        const [width, height] = win.getSize();
        win.setSize(width + 1, height);
        await delay(50);
        win.setSize(width, height);
        await delay(350);
    };
    win.webContents.once('did-finish-load', async () => {
        try {
            await serverReady;
            const server = {
                credential: 'fixture',
                features: { lyricsMultipleStructured: [1] },
                id: 'test',
                name: 'Music Library',
                type: 'subsonic',
                url: `http://127.0.0.1:${fixtureServer.address().port}`,
                userId: 'test',
                username: 'test',
                version: '1.16.1',
            };
            const storage = {
                store_app: {
                    state: { sidebar: { leftWidth: '309px', rightExpanded: true } },
                    version: 5,
                },
                store_authentication: {
                    state: {
                        currentServer: server,
                        deviceId: 'test',
                        serverList: { test: server },
                    },
                    version: 2,
                },
                store_settings: {
                    state: {
                        autoDJ: { enabled: false },
                        general: {
                            accent: 'rgb(240, 170, 22)',
                            followSystemTheme: false,
                            homeFeature: true,
                            homeItems: [
                                { disabled: false, id: 'recentlyPlayed' },
                                { disabled: false, id: 'playlists' },
                                { disabled: false, id: 'mostPlayed' },
                                { disabled: false, id: 'recentlyAdded' },
                                { disabled: true, id: 'random' },
                                { disabled: true, id: 'recentlyReleased' },
                                { disabled: true, id: 'genres' },
                            ],
                            imageRes: { fullScreenPlayer: 80 },
                            language: 'en',
                            malojaUrl: server.url,
                            playerbarSlider: { type: 'default' },
                            sidebarItems: [
                                { disabled: false, id: 'Home', label: 'Home', route: '/' },
                                { disabled: false, id: 'New', label: 'New', route: '/new' },
                                {
                                    disabled: false,
                                    id: 'Favorites',
                                    label: 'Favorites',
                                    route: '/favorites',
                                },
                                {
                                    disabled: false,
                                    id: 'Albums',
                                    label: 'Albums',
                                    route: '/library/albums',
                                },
                                {
                                    disabled: false,
                                    id: 'Tracks',
                                    label: 'Tracks',
                                    route: '/library/songs',
                                },
                                {
                                    disabled: false,
                                    id: 'Artists-all',
                                    label: 'Artists',
                                    route: '/library/artists',
                                },
                                {
                                    disabled: false,
                                    id: 'Playlists',
                                    label: 'Playlists',
                                    route: '/playlists',
                                },
                                { disabled: false, id: 'Radio', label: 'Radio', route: '/radio' },
                                {
                                    disabled: false,
                                    id: 'Listening History',
                                    label: 'Listening statistics',
                                    route: '/listening-history',
                                },
                            ],
                            sidebarPlaylistMode: 'expanded',
                            sideQueueType: 'sideQueue',
                            theme: 'gruvboxDark',
                        },
                        lyrics: { fetch: false, preferLocalLyrics: true },
                        playback: { type: 'web' },
                    },
                    version: 37,
                },
                version: require('../../../package.json').version,
            };
            await evaluate(
                `Object.entries(${JSON.stringify(storage)}).forEach(([key,value])=>localStorage.setItem(key,JSON.stringify(value)))`,
            );
            session.defaultSession.webRequest.onBeforeRequest(
                { urls: ['http://*/*', 'https://*/*'] },
                (details, callback) => callback({ cancel: !details.url.startsWith(server.url) }),
            );
            await new Promise((resolve) => {
                win.webContents.once('did-finish-load', resolve);
                win.webContents.reload();
            });
            const waitFor = async (expression) => {
                for (let attempt = 0; attempt < 60; attempt++) {
                    if (await evaluate(expression)) return;
                    await delay(200);
                }
                throw new Error(`Timed out waiting for ${expression}`);
            };
            await evaluate(`location.hash='/'`);
            await waitFor(`(() => {
                const home=document.querySelector('[data-music-home]');
                const image=home?.querySelector('img');
                return home?.textContent.includes('Midnight City')
                    && home.querySelectorAll('h3').length===4
                    && image?.complete && image.naturalWidth > 0;
            })()`);
            await delay(500);
            await waitFor(
                `document.querySelectorAll('[data-music-home] section[data-kind] li').length===10`,
            );
            const charts = await evaluate(`(() => {
                return Array.from(document.querySelectorAll('[data-music-home] section[data-kind]')).map(chart=>{
                    const rows=Array.from(chart.querySelectorAll('li'));
                    return {kind:chart.dataset.kind,count:rows.length,height:chart.getBoundingClientRect().height,leader:rows[0].getBoundingClientRect().height,row:rows[1].getBoundingClientRect().height,firstName:rows[0].querySelector('[class*="module-name"]').textContent,playButtons:chart.querySelectorAll('button[aria-label^="Play ·"]').length};
                });
            })()`);
            assert.ok(charts.every((chart) => chart.count === 5 && chart.leader > chart.row));
            assert.ok(
                charts.every((chart) => chart.height <= 260),
                `Five rows fit into a compact chart: ${JSON.stringify(charts)}`,
            );
            assert.equal(
                charts.find((chart) => chart.kind === 'artists').firstName,
                'The Midnight',
            );
            assert.equal(charts.find((chart) => chart.kind === 'tracks').firstName, song.title);
            assert.equal(charts.find((chart) => chart.kind === 'tracks').playButtons, 5);
            await waitFor(
                `!!document.querySelector('#left-sidebar a[href="#/playlists/playlist-39/songs"]')`,
            );
            const sidebarChecks = await evaluate(`(() => {
                const sidebar=document.querySelector('#left-sidebar');
                const search=sidebar.querySelector('#global-search-container button[data-visible]');
                const links=Array.from(sidebar.querySelectorAll('a')).filter(el=>['#/favorites','#/library/albums','#/library/songs'].includes(el.getAttribute('href')));
                const alignment=links.map(el=>{
                    const svg=el.querySelector('svg').getBoundingClientRect();
                    const group=el.querySelector('[class*="Group-root"]');
                    const text=Array.from(group.childNodes).find(node=>node.nodeType===Node.TEXT_NODE && node.textContent.trim());
                    const range=document.createRange();range.selectNode(text);
                    return {iconX:svg.x,iconWidth:svg.width,labelX:range.getBoundingClientRect().x};
                });
                const scroll=sidebar.querySelector('[class*="sidebar-module-scroll-area"]');
                scroll.scrollTop=scroll.scrollHeight;
                const last=Array.from(sidebar.querySelectorAll('a[href^="#/playlists/"]')).at(-1).getBoundingClientRect();
                const viewport=scroll.getBoundingClientRect();
                const actions=sidebar.querySelector('[class*="sidebar-playlist-list-module-header-actions"]');
                const control=actions.closest('[class*="Accordion-control"]');
                return {alignment,headerBackground:getComputedStyle(control).backgroundColor,actionsBackground:getComputedStyle(actions).backgroundColor,searchHeight:search.getBoundingClientRect().height,searchInert:search.inert,searchHidden:search.inert && search.getBoundingClientRect().height<1,logo:!!sidebar.querySelector('button[aria-label="Menu"] img[alt="qMusic"]'),lastVisible:last.top>=viewport.top && last.bottom<=viewport.bottom,scrollHeight:scroll.scrollHeight,viewportHeight:scroll.clientHeight,bottomPadding:parseFloat(getComputedStyle(scroll).paddingBottom)};
            })()`);
            assert.ok(
                sidebarChecks.logo && sidebarChecks.searchHidden,
                JSON.stringify(sidebarChecks),
            );
            assert.ok(sidebarChecks.lastVisible, JSON.stringify(sidebarChecks));
            assert.equal(sidebarChecks.bottomPadding, 0, 'No empty space reserved below playlists');
            assert.equal(
                sidebarChecks.headerBackground,
                sidebarChecks.actionsBackground,
                'Playlist heading and action buttons share one background',
            );
            assert.ok(
                sidebarChecks.viewportHeight < 850 &&
                    sidebarChecks.scrollHeight > sidebarChecks.viewportHeight,
                'A long sidebar scrolls inside the window',
            );
            assert.ok(
                sidebarChecks.alignment.every(
                    (row) =>
                        Math.abs(row.iconX - sidebarChecks.alignment[0].iconX) < 1 &&
                        row.iconWidth === 18 &&
                        Math.abs(row.labelX - sidebarChecks.alignment[0].labelX) < 1,
                ),
                'All sidebar icons and labels align',
            );
            win.webContents.sendInputEvent({ type: 'mouseMove', x: 40, y: 200 });
            await evaluate(
                `document.querySelector('#left-sidebar').dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-80}))`,
            );
            await waitFor(
                `document.querySelector('#global-search-container button[data-visible]').getBoundingClientRect().height>30`,
            );
            const searchAlignment = await evaluate(`(() => {
                const button=document.querySelector('#global-search-container button[data-visible]');
                const svg=button.querySelector('svg').getBoundingClientRect();
                const group=button.querySelector('[class*="Group-root"]');
                const text=Array.from(group.childNodes).find(node=>node.nodeType===Node.TEXT_NODE && node.textContent.trim());
                const range=document.createRange();range.selectNode(text);
                const label=range.getBoundingClientRect();
                return {iconX:svg.x,iconWidth:svg.width,labelX:label.x,iconCenter:svg.y+svg.height/2,labelCenter:label.y+label.height/2};
            })()`);
            assert.ok(
                Math.abs(searchAlignment.iconX - sidebarChecks.alignment[0].iconX) < 1 &&
                    searchAlignment.iconWidth === 18 &&
                    Math.abs(searchAlignment.labelX - sidebarChecks.alignment[0].labelX) < 1 &&
                    Math.abs(searchAlignment.iconCenter - searchAlignment.labelCenter) < 2,
                `Search aligns with the other navigation items: ${JSON.stringify(searchAlignment)}`,
            );
            await evaluate(
                `document.querySelector('#left-sidebar').dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:80}))`,
            );
            await delay(1800);
            assert.equal(
                await evaluate(
                    `document.querySelector('#global-search-container button[data-visible]').inert`,
                ),
                false,
                'Downward wheel bounce does not dismiss the revealed search',
            );
            win.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 130 });
            await delay(500);
            assert.equal(
                await evaluate(
                    `document.querySelector('#global-search-container button[data-visible]').inert`,
                ),
                false,
                'Leaving the sidebar gives time to return and click',
            );
            const searchPoint = await evaluate(`(() => {
                const r=document.querySelector('#global-search-container button[data-visible]').getBoundingClientRect();
                return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
            })()`);
            win.webContents.sendInputEvent({ type: 'mouseMove', ...searchPoint });
            await delay(1700);
            assert.equal(
                await evaluate(
                    `document.querySelector('#global-search-container button[data-visible]').inert`,
                ),
                false,
                'Returning cancels the pending dismissal',
            );
            for (const type of ['mouseDown', 'mouseUp']) {
                win.webContents.sendInputEvent({
                    button: 'left',
                    clickCount: 1,
                    type,
                    ...searchPoint,
                });
            }
            await waitFor(`!!document.querySelector('[role="dialog"] input[data-autofocus]')`);
            win.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyDown' });
            win.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyUp' });
            await waitFor(`!document.querySelector('[role="dialog"]')`);
            await evaluate(`document.activeElement?.blur()`);
            win.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 130 });
            await waitFor(
                `document.querySelector('#global-search-container button[data-visible]').getBoundingClientRect().height<1`,
            );
            await evaluate(
                `document.querySelector('#left-sidebar [class*="sidebar-module-scroll-area"]').scrollTop=0`,
            );
            const geometry = await evaluate(`(() => {
                const rect = (el) => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}; };
                const settings=JSON.parse(localStorage.getItem('store_settings')).state.general;
                return {sidebar:rect(document.querySelector('#left-sidebar')),accent:settings.accent,sections:Array.from(document.querySelectorAll('[data-music-home] h2,[data-music-home] h3')).map(el=>el.textContent)};
            })()`);
            assert.ok(
                Math.abs(geometry.sidebar.width - 184) < 1,
                'Old default sidebar width migrates',
            );
            assert.equal(geometry.accent, 'rgb(250, 45, 72)', 'Old default accent migrates');
            assert.equal(
                await evaluate(
                    `JSON.parse(localStorage.getItem('store_settings')).state.general.sidebarPlaylistMode`,
                ),
                'compact',
                'Old playlist rows adopt the compact layout',
            );
            const copy = require('../../../src/i18n/locales/en.json');
            assert.deepEqual(
                geometry.sections,
                [
                    copy.listeningHistory.weeklyCharts,
                    copy.page.home.recentlyPlayed,
                    copy.page.home.playlists,
                    copy.page.home.mostPlayed,
                    copy.page.home.newlyAdded,
                ],
                "Original sections follow the user's order and disabled items stay hidden",
            );
            assert.equal(
                await evaluate(`!!document.querySelector('#left-sidebar a[href="#/new"]')`),
                false,
                'Remove the added discovery item from existing settings',
            );
            assert.equal(
                await evaluate(
                    `!!document.querySelector('[data-home-spotlight],[data-home-songs]')`,
                ),
                false,
                'Home must not add new recommendations',
            );
            const transportSizes = await evaluate(
                `Array.from(document.querySelectorAll('[data-player-controls] [data-player-action]')).map(button=>({action:button.dataset.playerAction,width:button.querySelector('svg').getBoundingClientRect().width}))`,
            );
            assert.equal(transportSizes.length, 3);
            assert.ok(
                transportSizes.every(
                    (button) => button.width >= (button.action === 'play' ? 28 : 24),
                ),
                'Playback icons are large enough to read',
            );
            for (const action of ['previous', 'next']) {
                const movement = await evaluate(`(async () => {
                    const button=document.querySelector('[data-player-controls] [data-player-action="${action}"]');
                    button.click();
                    const image=button.querySelector('svg');
                    const animation=image.getAnimations()[0];
                    if(!animation)return null;
                    animation.pause();animation.currentTime=50;
                    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                    const transform=new DOMMatrix(getComputedStyle(image).transform);
                    animation.finish();
                    return {x:transform.e,scale:transform.a};
                })()`);
                assert.ok(
                    movement && Math.abs(movement.x) > 0.1 && movement.scale < 1,
                    `${action} visibly moves and springs back`,
                );
            }
            await evaluate(
                `document.querySelector('[data-music-home] [class*="item-card-module-image-container"]').scrollIntoView({block:'center'})`,
            );
            await evaluate(
                `document.querySelector('[data-music-home] [class*="item-card-module-image-container"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`,
            );
            await waitFor(
                `!!document.querySelector('[data-music-home] button[class*="item-card-controls-module-primary"]')`,
            );
            await delay(350);
            const playPoint = await evaluate(
                `(() => {const r=document.querySelector('[data-music-home] button[class*="item-card-controls-module-primary"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`,
            );
            win.webContents.sendInputEvent({ type: 'mouseMove', ...playPoint });
            win.webContents.sendInputEvent({
                button: 'left',
                clickCount: 1,
                type: 'mouseDown',
                ...playPoint,
            });
            win.webContents.sendInputEvent({
                button: 'left',
                clickCount: 1,
                type: 'mouseUp',
                ...playPoint,
            });
            await waitFor(
                `document.querySelector('.media-player').textContent.includes('A little closer')`,
            );
            await waitFor(
                `!!document.querySelector('[data-player-controls] .player-state-playing')`,
            );
            await evaluate(
                `document.querySelector('[data-player-controls] .player-state-playing').click()`,
            );
            await waitFor(
                `!!document.querySelector('[data-player-controls] .player-state-paused')`,
            );
            const playAnimation = await evaluate(`(() => {
                const image=document.querySelector('[data-player-controls] .player-state-paused svg');
                const animation=image.getAnimations().find(item=>item.animationName?.includes('play-icon-enter'));
                return animation?.effect.getTiming().duration;
            })()`);
            assert.equal(playAnimation, 240, 'Play and pause animate when the icon changes');
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Volume"]').click()`,
            );
            await waitFor(
                `!!document.querySelector('[role="region"][aria-label="Volume"] [role="slider"]')`,
            );
            assert.equal(
                await evaluate(`!!document.querySelector('[aria-label="Audio device"]')`),
                false,
                'Volume popover only contains volume controls',
            );
            const volumeRegion = `[role="region"][aria-label="Volume"]`;
            const setVolumeByKeyboard = async (keyCode, level) => {
                await evaluate(`document.querySelector('${volumeRegion} [role="slider"]').focus()`);
                win.webContents.sendInputEvent({ keyCode, type: 'keyDown' });
                win.webContents.sendInputEvent({ keyCode, type: 'keyUp' });
                await waitFor(
                    `document.querySelector('.media-player [data-volume-level]').getAttribute('data-volume-level')==='${level}'`,
                );
                await delay(350);
            };
            await setVolumeByKeyboard('Home', 1);
            await setVolumeByKeyboard('End', 2);
            await evaluate(`document.querySelector('${volumeRegion} button').click()`);
            await waitFor(
                `document.querySelector('.media-player [data-volume-level]').getAttribute('data-volume-level')==='0'`,
            );
            await waitFor(
                `getComputedStyle(document.querySelector('.media-player [data-volume-level] g')).opacity==='0'`,
            );
            assert.equal(
                await evaluate(
                    `getComputedStyle(document.querySelector('.media-player [data-volume-level] g')).opacity`,
                ),
                '0',
                'Mute smoothly hides sound waves',
            );
            await evaluate(`document.querySelector('${volumeRegion} button').click()`);
            await waitFor(
                `document.querySelector('.media-player [data-volume-level]').getAttribute('data-volume-level')==='2'`,
            );
            await refreshHiddenWindow();
            fs.writeFileSync(
                path.join(output, 'volume-popover.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Volume"]').click()`,
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Menu"]').click()`,
            );
            await waitFor(`!!document.querySelector('button[aria-label="Auto DJ"] svg')`);
            await waitFor(
                `getComputedStyle(document.querySelector('button[aria-label="Auto DJ"]').closest('[class*="Popover-dropdown"]')).opacity==='1'`,
            );
            const menuRows = await evaluate(
                `Array.from(document.querySelector('button[aria-label="Auto DJ"]').closest('[class*="Popover-dropdown"]').querySelectorAll('button, [role="radiogroup"]')).map(el=>el.getBoundingClientRect().y+el.getBoundingClientRect().height/2)`,
            );
            assert.ok(
                Math.max(...menuRows) - Math.min(...menuRows) < 2,
                'Every overflow control stays on one row',
            );
            await refreshHiddenWindow();
            fs.writeFileSync(
                path.join(output, 'more-menu.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            assert.equal(
                await evaluate(
                    `document.querySelector('button[aria-label="Auto DJ"]').textContent`,
                ),
                '',
                'Auto DJ uses the infinity icon without a text badge',
            );
            await evaluate(`document.querySelector('button[aria-label="Auto DJ"]').click()`);
            await waitFor(`document.body.textContent.includes('Enable Auto DJ')`);
            await evaluate(`document.querySelector('button[aria-label="Auto DJ"]').click()`);
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Menu"]').click()`,
            );
            const homeWidth = await evaluate(
                `document.querySelector('[data-music-home]').getBoundingClientRect().width`,
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="View queue"]').click()`,
            );
            await waitFor(
                `(() => {const panel=document.querySelector('#popover-play-queue');return panel?.textContent.includes('A little closer') && getComputedStyle(panel).opacity==='0.98' && document.querySelector('.media-player button[aria-label="View queue"]').getAttribute('aria-pressed')==='true';})()`,
            );
            assert.equal(await evaluate(`!!document.querySelector('#sidebar-queue')`), false);
            assert.equal(
                await evaluate(
                    `document.querySelector('[data-music-home]').getBoundingClientRect().width`,
                ),
                homeWidth,
                'The floating queue does not resize the main page',
            );
            await delay(250);
            await refreshHiddenWindow();
            fs.writeFileSync(
                path.join(output, 'queue-floating.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="View queue"]').click()`,
            );
            await waitFor(`!document.querySelector('#popover-play-queue')`);
            for (const width of [1280, 900, 800]) {
                win.setSize(width, 850);
                await delay(350);
                const controls = await evaluate(`(() => {
                    const root=document.querySelector('#player-bar');const bounds=root.getBoundingClientRect();
                    const items=Array.from(root.querySelector('[class*="controls-grid"]').children).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width}}).sort((a,b)=>a.x-b.x);
                    return {items,x:bounds.x,right:bounds.right,height:bounds.height,radius:getComputedStyle(root).borderRadius};
                })()`);
                assert.equal(controls.radius, '28px');
                assert.equal(controls.height, 56);
                const metadataSizes = await evaluate(`(() => {
                    const player=document.querySelector('#player-bar');
                    return Array.from(player.querySelectorAll('.song-artist .mantine-Text-root,.song-album')).map(el=>getComputedStyle(el).fontSize);
                })()`);
                assert.ok(
                    metadataSizes.length >= 2 && metadataSizes.every((size) => size === '13px'),
                    `Artist and album use the same font size: ${JSON.stringify(metadataSizes)}`,
                );
                assert.ok(
                    controls.items.every(
                        (item) => item.x >= controls.x && item.right <= controls.right,
                    ),
                    `Controls fit the dock at ${width}px: ${JSON.stringify(controls)}`,
                );
                assert.ok(
                    controls.items.every(
                        (item, index) => !index || controls.items[index - 1].right <= item.x,
                    ),
                    'Control groups never overlap',
                );
                const progress = await evaluate(`(() => {
                    const root=document.querySelector('#player-bar');
                    const track=root.querySelector('.mantine-Slider-track');
                    const r=track.getBoundingClientRect();const p=root.getBoundingClientRect();
                    return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,dockBottom:p.bottom,
                        labels:Array.from(root.querySelectorAll('.elapsed-time,.total-duration')).some(el=>el.getBoundingClientRect().width>0)};
                })()`);
                assert.equal(progress.height, 3, 'Compact progress track remains thin');
                assert.ok(progress.bottom <= progress.dockBottom, 'Progress fits inside the dock');
                assert.equal(
                    progress.labels,
                    false,
                    'Time labels do not squeeze into the progress row',
                );
                win.webContents.sendInputEvent({
                    type: 'mouseMove',
                    x: Math.round(progress.x + progress.width / 2),
                    y: Math.round(progress.y + progress.height / 2),
                });
                await delay(100);
                const hovered = await evaluate(
                    `(() => {const r=document.querySelector('#player-bar .mantine-Slider-track').getBoundingClientRect();return {x:r.x,width:r.width};})()`,
                );
                assert.equal(
                    hovered.x,
                    progress.x,
                    'Hover never moves the start of the progress track',
                );
                assert.equal(hovered.width, progress.width, 'Hover never changes progress width');
                assert.ok(
                    await evaluate(
                        `(() => {const label=document.querySelector('#player-bar .mantine-Slider-label');return !label || label.getBoundingClientRect().bottom<=document.querySelector('#player-bar').getBoundingClientRect().top;})()`,
                    ),
                    'The time tooltip stays above the dock without covering metadata',
                );
            }
            const seekPoint = await evaluate(
                `(() => {const r=document.querySelector('#player-bar .mantine-Slider-track').getBoundingClientRect();return {x:Math.round(r.x+r.width*0.5),y:Math.round(r.y+r.height/2)}})()`,
            );
            win.webContents.sendInputEvent({
                button: 'left',
                clickCount: 1,
                type: 'mouseDown',
                ...seekPoint,
            });
            win.webContents.sendInputEvent({
                button: 'left',
                clickCount: 1,
                type: 'mouseUp',
                ...seekPoint,
            });
            await waitFor(
                `Math.abs(Number(document.querySelector('#player-bar [role="slider"]').getAttribute('aria-valuenow'))-60)<3`,
            );
            win.setSize(1040, 650);
            await evaluate(`document.querySelector('[data-music-home] h1').scrollIntoView()`);
            await delay(700);
            fs.writeFileSync(
                path.join(output, 'home-light.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            const storedSettings = await evaluate(
                `JSON.parse(localStorage.getItem('store_settings'))`,
            );
            storedSettings.state.general.theme = 'defaultDark';
            storedSettings.version = 38;
            storedSettings.state.general.sidebarItems.splice(1, 0, {
                disabled: false,
                id: 'New',
                label: 'New',
                route: '/new',
            });
            await evaluate(
                `localStorage.setItem('store_settings',${JSON.stringify(JSON.stringify(storedSettings))})`,
            );
            await new Promise((resolve) => {
                win.webContents.once('did-finish-load', resolve);
                win.webContents.reload();
            });
            await waitFor(
                `document.querySelector('[data-music-home]')?.textContent.includes('Midnight City')`,
            );
            assert.equal(
                await evaluate(`!!document.querySelector('#left-sidebar a[href="#/new"]')`),
                false,
                'The installed version 38 also loses discovery on upgrade',
            );
            await delay(2000);
            fs.writeFileSync(
                path.join(output, 'home-dark.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(`(() => {
                const start=document.startViewTransition.bind(document);
                document.startViewTransition=update=>{
                    document.startViewTransition=start;
                    return window.playerOpeningTransition=start(update);
                };
            })()`);
            await evaluate(
                `document.querySelector('.media-player .player-cover-art').closest('[role="button"]').click()`,
            );
            await evaluate(`(async () => {
                await window.playerOpeningTransition.ready;
                document.getAnimations().filter(animation=>animation.effect.pseudoElement?.startsWith('::view-transition')).forEach(animation=>{
                    animation.pause();
                    animation.currentTime=animation.effect.getTiming().duration*0.2;
                });
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            })()`);
            assert.equal(
                await evaluate(
                    `getComputedStyle(document.documentElement,'::view-transition-new(root)').opacity`,
                ),
                '0',
                'Opening preserves the original page behind the expanding player',
            );
            const openingCover = await evaluate(`(() => {
                const image=document.querySelector('img.full-screen-player-image');
                const bounds=image.getBoundingClientRect();
                return {loaded:image.complete,width:image.naturalWidth,needed:Math.max(bounds.width,bounds.height)*devicePixelRatio,oldOpacity:getComputedStyle(document.documentElement,'::view-transition-old(player-cover)').opacity,newOpacity:getComputedStyle(document.documentElement,'::view-transition-new(player-cover)').opacity};
            })()`);
            console.log('Opening artwork:', openingCover);
            assert.ok(
                openingCover.loaded && openingCover.width >= openingCover.needed,
                'Large artwork is decoded before the opening snapshot',
            );
            assert.equal(openingCover.oldOpacity, '0', 'The small cover raster is never enlarged');
            assert.equal(openingCover.newOpacity, '1');
            await delay(100);
            await win.webContents.capturePage();
            fs.writeFileSync(
                path.join(output, 'player-opening.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(`(async () => {
                document.getAnimations().filter(animation=>animation.effect.pseudoElement?.startsWith('::view-transition')).forEach(animation=>animation.finish());
                await window.playerOpeningTransition.finished;
                delete window.playerOpeningTransition;
            })()`);
            await delay(600);
            const windowControls = '[data-fullscreen-player] button[aria-label="Minimize"]';
            assert.equal(
                await evaluate(
                    `document.querySelectorAll('button[aria-label="Minimize"]:not([data-player-cover])').length`,
                ),
                1,
                'Fullscreen uses one set of window controls without the always visible titlebar',
            );
            win.webContents.sendInputEvent({ type: 'mouseMove', x: 500, y: 400 });
            await waitFor(
                `getComputedStyle(document.querySelector('${windowControls}').closest('[class*="full-screen-player-module-window-controls"]')).opacity==='0'`,
            );
            const windowControlPoint = await evaluate(`(() => {
                const r=document.querySelector('${windowControls}').getBoundingClientRect();
                return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
            })()`);
            win.webContents.sendInputEvent({ type: 'mouseMove', ...windowControlPoint });
            await waitFor(
                `getComputedStyle(document.querySelector('${windowControls}').closest('[class*="full-screen-player-module-window-controls"]')).opacity==='1'`,
            );
            win.webContents.sendInputEvent({ type: 'mouseMove', x: 500, y: 400 });
            await waitFor(
                `getComputedStyle(document.querySelector('${windowControls}').closest('[class*="full-screen-player-module-window-controls"]')).opacity==='0'`,
            );
            assert.equal(
                await evaluate(
                    `getComputedStyle(document.querySelector('#player-bar')).borderRadius`,
                ),
                '0px',
            );
            assert.equal(
                await evaluate(
                    `document.querySelectorAll('.media-player [class*="slider-container"]').length`,
                ),
                1,
                'Fullscreen has exactly one progress control',
            );
            const progressColors = await evaluate(`(() => {
                const player=document.querySelector('.media-player');
                return {
                    track:getComputedStyle(player.querySelector('.mantine-Slider-track'),'::before').backgroundColor,
                    bar:getComputedStyle(player.querySelector('.mantine-Slider-bar')).backgroundColor,
                    elapsed:getComputedStyle(player.querySelector('.elapsed-time')).color,
                    duration:getComputedStyle(player.querySelector('.total-duration')).color,
                };
            })()`);
            assert.equal(progressColors.track, 'rgba(255, 255, 255, 0.24)');
            assert.equal(progressColors.bar, 'rgb(255, 255, 255)');
            assert.equal(progressColors.elapsed, 'rgba(255, 255, 255, 0.9)');
            assert.equal(progressColors.duration, progressColors.elapsed);
            assert.equal(
                await evaluate(
                    `document.querySelectorAll('.full-screen-player-controls-container').length`,
                ),
                1,
                'The lyrics panel no longer displays the three tab icons',
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="View queue"]').click()`,
            );
            await waitFor(
                `JSON.parse(localStorage.getItem('store_full_screen_player')).state.activeTab==='queue'`,
            );
            await waitFor(
                `document.querySelector('.full-screen-player-queue-container')?.textContent.includes('A little closer')`,
            );
            assert.equal(await evaluate(`!!document.querySelector('#popover-play-queue')`), false);
            assert.equal(
                await evaluate(
                    `document.querySelector('.media-player button[aria-label="View queue"]').getAttribute('aria-pressed')`,
                ),
                'true',
            );
            await delay(250);
            await refreshHiddenWindow();
            fs.writeFileSync(
                path.join(output, 'fullscreen-queue.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="View queue"]').click()`,
            );
            await waitFor(
                `JSON.parse(localStorage.getItem('store_full_screen_player')).state.activeTab===''`,
            );
            assert.equal(
                await evaluate(
                    `JSON.parse(localStorage.getItem('store_full_screen_player')).state.expanded`,
                ),
                true,
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Lyrics"]').click()`,
            );
            await waitFor(
                `document.querySelectorAll('.full-screen-player-controls-container').length===1`,
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Lyrics"]').click()`,
            );
            await waitFor(
                `document.querySelectorAll('.full-screen-player-controls-container').length===2`,
            );
            await evaluate(
                `document.querySelector('.media-player button[aria-label="Lyrics"]').click()`,
            );
            await waitFor(
                `document.querySelectorAll('.full-screen-player-controls-container').length===1`,
            );
            const sharpCover = `(() => {const image=document.querySelector('img.full-screen-player-image');if(!image?.complete)return false;const r=image.getBoundingClientRect();return image.naturalWidth>=Math.max(r.width,r.height)*devicePixelRatio;})()`;
            await waitFor(
                `document.querySelector('.synchronized-lyrics')?.textContent.includes('The night is quiet')`,
            );
            const lyricActions = await evaluate(`(() => {
                const input=document.querySelector('[aria-label="Lyric offset"]');
                const controls=input.closest('[class*="lyrics-actions-module-root"]');
                return {text:controls.textContent,buttonHeight:controls.querySelector('[aria-label="Decrease lyric offset"]').getBoundingClientRect().height,inputWidth:input.getBoundingClientRect().width};
            })()`);
            assert.ok(
                !/Export|Search/i.test(lyricActions.text),
                'Lyrics no longer expose export or search actions',
            );
            assert.ok(
                lyricActions.buttonHeight <= 24 && lyricActions.inputWidth <= 60,
                'Lyric offset controls stay compact',
            );
            await evaluate(
                `document.querySelector('[aria-label="Increase lyric offset"]').click()`,
            );
            await waitFor(`document.querySelector('[aria-label="Lyric offset"]').value==='50'`);
            await evaluate(
                `document.querySelector('[aria-label="Decrease lyric offset"]').click()`,
            );
            await waitFor(`document.querySelector('[aria-label="Lyric offset"]').value==='0'`);
            await waitFor(sharpCover);
            win.setSize(1280, 850);
            await delay(500);
            await waitFor(sharpCover);
            fs.writeFileSync(
                path.join(output, 'fullscreen-sharp.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(`document.querySelector('.media-player .player-state-paused').click()`);
            await waitFor(`!!document.querySelector('.media-player .player-state-playing')`);
            await delay(300);
            await refreshHiddenWindow();
            fs.writeFileSync(
                path.join(output, 'fullscreen-playing.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(`document.querySelector('.media-player .player-state-playing').click()`);
            await waitFor(`!!document.querySelector('.media-player .player-state-paused')`);
            await delay(300);
            await evaluate(`(() => {
                const start=document.startViewTransition.bind(document);
                document.startViewTransition=update=>{
                    document.startViewTransition=start;
                    return window.playerClosingTransition=start(update);
                };
            })()`);
            await evaluate(
                `document.querySelector('.media-player .player-cover-art').closest('[role="button"]').click()`,
            );
            await evaluate(`(async () => {
                await window.playerClosingTransition.ready.catch(error=>Promise.reject(String(error)));
                document.getAnimations().filter(animation=>animation.effect.pseudoElement?.startsWith('::view-transition')).forEach(animation=>{
                    animation.pause();
                    animation.currentTime=animation.effect.getTiming().duration*0.8;
                });
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            })()`);
            await delay(100);
            await win.webContents.capturePage();
            const closingState = await evaluate(`(() => {
                const oldPage=getComputedStyle(document.documentElement,'::view-transition-old(fullscreen-player)');
                const newPage=getComputedStyle(document.documentElement,'::view-transition-new(fullscreen-player)');
                const pair=getComputedStyle(document.documentElement,'::view-transition-image-pair(fullscreen-player)');
                const metadata=document.querySelector('.media-player [class*="metadata-stack"]');
                return {oldOpacity:oldPage.opacity,newOpacity:newPage.opacity,fit:newPage.objectFit,pairWidth:pair.width,pairHeight:pair.height,radius:pair.borderRadius,metadataTransform:getComputedStyle(metadata).transform};
            })()`);
            console.log('Closing bar:', closingState);
            assert.equal(
                closingState.oldOpacity,
                '0',
                'Fullscreen content fades before the bar returns',
            );
            assert.ok(Number(closingState.newOpacity) > 0.8);
            assert.equal(closingState.fit, 'none', 'Compact metadata keeps its natural size');
            assert.equal(
                closingState.metadataTransform,
                'none',
                'Metadata does not compete with the native bar animation',
            );
            fs.writeFileSync(
                path.join(output, 'player-closing.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await evaluate(`(async () => {
                document.getAnimations().filter(animation=>animation.effect.pseudoElement?.startsWith('::view-transition')).forEach(animation=>animation.finish());
                await window.playerClosingTransition.finished;
                delete window.playerClosingTransition;
            })()`);
            await delay(500);
            fs.writeFileSync(
                path.join(output, 'player-closed.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            await waitFor(
                `getComputedStyle(document.querySelector('#player-bar')).borderRadius==='28px'`,
            );
            await evaluate(`document.querySelector('#left-sidebar a[href="#/"]').click()`);
            await waitFor(`document.querySelector('[data-music-home] h1')?.textContent==='Home'`);
            const originalSettings = await evaluate(
                `JSON.parse(localStorage.getItem('store_settings'))`,
            );
            originalSettings.state.general.imageRes.fullScreenPlayer = 0;
            originalSettings.state.general.sideQueueType = 'sideQueue';
            originalSettings.version = 39;
            await evaluate(
                `localStorage.setItem('store_settings',${JSON.stringify(JSON.stringify(originalSettings))})`,
            );
            await new Promise((resolve) => {
                win.webContents.once('did-finish-load', resolve);
                win.webContents.reload();
            });
            await waitFor(`!!document.querySelector('.media-player .player-cover-art')`);
            assert.equal(
                await evaluate(
                    `JSON.parse(localStorage.getItem('store_settings')).state.general.sideQueueType`,
                ),
                'sideDrawerQueue',
                'The installed version 39 migrates to a floating queue',
            );
            await evaluate(
                `document.querySelector('.media-player .player-cover-art').closest('[role="button"]').click()`,
            );
            await waitFor(
                `document.querySelector('img.full-screen-player-image')?.naturalWidth===1600`,
            );
            await evaluate(
                `document.querySelector('.media-player .player-cover-art').closest('[role="button"]').click()`,
            );
            win.setMinimumSize(480, 400);
            win.setSize(600, 750);
            await waitFor(`!!document.querySelector('#mobile-layout')`);
            const mobile = await evaluate(
                `(() => {const footer=document.querySelector('#player-bar');const r=footer.getBoundingClientRect();return {area:getComputedStyle(footer).gridArea,height:r.height,width:r.width,viewport:innerWidth};})()`,
            );
            assert.equal(mobile.area, 'player', 'Mobile playback stays in its reserved footer');
            assert.equal(mobile.height, 90);
            assert.equal(mobile.width, mobile.viewport);
            console.log(
                'Original home, playback, stable progress, floating queue, fullscreen queue toggle, icon controls, lyrics tab removal, sharp artwork and mobile checks passed.',
            );
            clearTimeout(timeout);
            app.quit();
        } catch (error) {
            fs.writeFileSync(
                path.join(output, 'failure.png'),
                (await win.webContents.capturePage()).toPNG(),
            );
            console.error(error?.stack || String(error));
            clearTimeout(timeout);
            app.exit(1);
        }
    });
});
require(path.resolve('out/main/index.js'));
