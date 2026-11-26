/* eslint-disable @typescript-eslint/no-require-imports */
// Run: node node_modules/electron/cli.js scripts/tests/electron/test-karaoke-lyrics.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

app.setPath('userData', fs.mkdtempSync(path.resolve('.scratch/karaoke-profile-')));
const modules = Object.fromEntries(
    [
        'api/enhanced-lrc',
        'api/lyric-glyphs',
        'api/lyrics-rtl',
        'api/lyrics-scroll',
        'api/lyrics-spring-scroll',
        'api/lyrics-utils',
        'api/lyrics-vocals',
        'hooks/lyrics-animation-engine',
        'hooks/use-lyrics-animation-engine',
    ].map((name) => [
        '/@/renderer/features/lyrics/' + name,
        ts.transpileModule(fs.readFileSync(`src/renderer/features/lyrics/${name}.ts`, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
    ]),
);
modules['/@/renderer/utils/sanitize'] = ts.transpileModule(
    fs.readFileSync('src/renderer/utils/sanitize.ts', 'utf8'),
    { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS } },
).outputText;
modules.dompurify = fs.readFileSync(require.resolve('dompurify'), 'utf8');
const css = fs.readFileSync('src/renderer/features/lyrics/styles/karaoke-animation.css', 'utf8');
const lineCss = fs.readFileSync(
    'src/renderer/features/lyrics/styles/synchronized-lyrics-animation.css',
    'utf8',
);
const introCss = fs
    .readFileSync('src/renderer/features/lyrics/lyric-line.module.css', 'utf8')
    .replace(/:global\(([^)]+)\)/g, '$1');

app.whenReady()
    .then(async () => {
        const win = new BrowserWindow({
            show: true,
            webPreferences: { backgroundThrottling: false, offscreen: true },
        });
        await win.loadURL(
            'data:text/html,' +
                encodeURIComponent(
                    `<style>${css}${lineCss}${introCss}</style><div id="sidebar"></div><div id="fullscreen"></div>`,
                ),
        );
        const result = await win.webContents.executeJavaScript(`(async () => {
        const sources = ${JSON.stringify(modules)};
        const cache = { react: { useCallback: fn => fn, useEffect() {}, useRef: current => ({current}) } };
        function load(id) {
            if (cache[id]) return cache[id];
            const module = {exports:{}};
            cache[id] = module.exports;
            new Function('exports', 'require', 'module', sources[id])(module.exports, load, module);
            return cache[id] = module.exports;
        }
        const engine = load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
        let tickContainer;
        const tick = engine.tickLyricsAnimation;
        engine.tickLyricsAnimation = (state, opts) => { tickContainer = opts.scrollContainer; return tick(state, opts); };
        const { useLyricsAnimationEngine } = load('/@/renderer/features/lyrics/hooks/use-lyrics-animation-engine');
        const { parseEnhancedLrc } = load('/@/renderer/features/lyrics/api/enhanced-lrc');
        const lyrics = parseEnhancedLrc([{startMs:1000, text:'<00:01>Hello <00:03>world<00:04>'}]);
        const containers = ['sidebar', 'fullscreen'].map(id => {
            const root = document.getElementById(id);
            root.className = 'synchronized-karaoke-lyrics';
            root.style = '--theme-colors-foreground:white;--lyric-opacity:.2;background:black;font:32px sans-serif;height:150px;overflow:auto';
            root.innerHTML = '<div id="sychronized-lyrics-scroll-container"><div id="karaoke-line-0" class="karaoke-line">' +
                lyrics[0].cueLines[0].words.map(word => '<span class="karaoke-word" data-time="' + word.startMs/1000 + '" data-duration="' + (word.endMs-word.startMs)/1000 + '" style="--karaoke-duration:' + (word.endMs-word.startMs) + 'ms"><span class="karaoke-word-text">' + word.text + '</span><span class="karaoke-word-highlight">' + word.text + '</span></span>').join('') + '</div></div>';
            return root.firstElementChild;
        });
        const hooks = containers.map(container => useLyricsAnimationEngine({
            containerRef: {current:container}, lyrics, lineIdPrefix:'karaoke-line',
            scrollContainerId:'sychronized-lyrics-scroll-container', followRef:{current:false},
        }));
        const data = hooks[1].rebuildLyricsData();
        const ownLines = data.lines.every(line => containers[1].contains(line.element));
        hooks[1].tick(1100, true, {eventCreationTime:Date.now()});
        const ownScroll = tickContainer === containers[1];
        const words = Array.from(containers[1].querySelectorAll('.karaoke-word'));
        const sidebarUntouched = !containers[0].querySelector('.lyrics-word-animating,.sung');
        const firstActive = words[0].classList.contains('lyrics-word-animating');
        const secondWaiting = !words[1].classList.contains('lyrics-word-animating');
        const highlight = words[0].querySelector('.karaoke-word-highlight');
        const amount = () => Number(getComputedStyle(highlight).getPropertyValue('--lyric-transition-amount-start'));
        const before = amount();
        await new Promise(resolve => setTimeout(resolve, 350));
        const after = amount();
        hooks[0].tick(1100, true, {eventCreationTime:Date.now()});
        hooks[0].reset();
        const resetIsolated = words[0].classList.contains('lyrics-word-animating');
        hooks[1].tick(3100, true, {eventCreationTime:Date.now(), forceResync:true});
        const advanced = words[0].classList.contains('sung') && words[1].classList.contains('lyrics-word-animating');
        window.lyricsTest = {load, containers, lyrics};
        return {ownLines, ownScroll, sidebarUntouched, firstActive, secondWaiting, before, after, resetIsolated, advanced};
    })()`);
        console.log(result);
        for (const key of [
            'ownLines',
            'ownScroll',
            'sidebarUntouched',
            'firstActive',
            'secondWaiting',
            'resetIsolated',
            'advanced',
        ]) {
            assert.ok(result[key], key);
        }
        assert.ok(result.after > result.before, 'The word highlight visibly advances in Chromium');
        const clockCorrection = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const root=document.createElement('div');
            root.setAttribute('data-fullscreen-player','');
            root.innerHTML='<div id="lyric-0">Previous</div><div id="lyric-1">Current</div>';
            document.body.append(root);
            const lyricsData=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:'lyric',lyrics:[{startMs:40000,text:'Previous'},{startMs:43400,text:'Current'}]});
            const state=engine.createAnimEngineState();
            const now=Date.now();
            const tick=(time,anchor,forceResync=false)=>{
                engine.tickLyricsAnimation(state,{currentTimeMs:time,eventCreationTime:anchor,isPlaying:true,forceResync,lyricsData,scrollContainer:root,follow:false});
                return root.querySelector('.lyrics-line-active')?.id;
            };
            const result=[tick(42966,now-528),tick(43149,now),tick(43149,now,true)];
            root.remove();
            return result;
        })()`);
        assert.deepEqual(clockCorrection, ['lyric-1', 'lyric-1', 'lyric-0']);
        const {intro, interlude} = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const root=document.createElement('div');
            root.setAttribute('data-fullscreen-player','');
            const gap=(index,start)=>'<div class="lyric-line" data-lyric-gap="'+index+'" data-gap-start="'+start+'"><span class="gap-dots"><span></span><span></span><span></span></span></div>';
            root.innerHTML=gap(0,0)+'<div id="lyric-0"><span>First line</span></div>'+gap(1,7000)+'<div id="lyric-1"><span>Second line</span></div>';
            document.body.append(root);
            const lyricsData=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:'lyric',lyrics:[{startMs:3000,text:'First line'},{startMs:10000,text:'Second line'}]});
            const state=engine.createAnimEngineState();
            const sample=(currentTimeMs,index,isPlaying=false)=>{
                const active=engine.tickLyricsAnimation(state,{currentTimeMs,eventCreationTime:Date.now(),isPlaying,lyricsData,scrollContainer:root,follow:false});
                const row=root.querySelector('[data-lyric-gap="'+index+'"]');
                const dots=Array.from(row.firstElementChild.children, dot=>getComputedStyle(dot));
                const translate=element=>parseFloat(element.translate.split(' ')[1])||0;
                return {active, visible:row.classList.contains('lyrics-line-active'), brightness:dots.map(dot=>Number(dot.opacity)), lift:dots.map(translate), pickup:translate(getComputedStyle(row.nextElementSibling.firstElementChild))};
            };
            return {
                intro:[sample(0,0),sample(500,0),sample(1500,0),sample(2500,0),sample(2990,0,true),sample(3000,0,true),sample(0,0)],
                interlude:[sample(6999,1),sample(7000,1),sample(7500,1),sample(8500,1),sample(9500,1),sample(9990,1,true),sample(10000,1,true),sample(10275,1),sample(10600,1),sample(8500,1)],
            };
        })()`);
        assert.deepEqual(intro.slice(0, 4).map((sample) => sample.brightness), [
            [0.28, 0.28, 0.28],
            [0.874, 0.28, 0.28],
            [1, 0.874, 0.28],
            [1, 1, 0.64],
        ]);
        assert.ok(intro[4].visible && intro[4].brightness[2] > 0.98 && intro[4].active === -1);
        assert.ok(intro[1].lift[0] < 0 && intro[1].lift[0] > intro[2].lift[0]);
        assert.ok(!intro[5].visible && intro[5].brightness[2] === 1 && intro[5].active === 0);
        assert.ok(intro[5].pickup > 5, 'The first lyric lifts even with no scroll travel');
        assert.deepEqual(intro[6], intro[0], 'Seeking to zero resets the intro dots');
        assert.equal(interlude[0].active, 0);
        assert.ok(!interlude[0].visible && interlude[1].visible && interlude[1].active === -1);
        assert.deepEqual(interlude.slice(1, 5).map((sample) => sample.brightness), intro.slice(0, 4).map((sample) => sample.brightness));
        assert.ok(interlude[2].lift[0] < 0 && interlude[2].lift[1] === 0);
        assert.ok(interlude[4].lift.every((offset) => offset < 0));
        assert.ok(interlude[5].visible && interlude[5].brightness[2] > 0.98);
        assert.ok(!interlude[6].visible && interlude[6].brightness[2] === 1 && interlude[6].active === 1);
        assert.ok(interlude[6].pickup > interlude[7].pickup && interlude[7].pickup > interlude[8].pickup);
        assert.deepEqual(interlude[9], interlude[3], 'Seeking back restores the same dot brightness and positions');
        const handoff = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const root=document.createElement('div');
            root.className='synchronized-lyrics';
            root.style='height:500px;overflow:auto;padding-top:70px';
            root.innerHTML='<div data-lyric-gap="0" data-gap-start="0" style="height:88px"></div><div id="lyric-0" class="lyric-line synchronized" style="height:120px">First</div><div style="height:500px"></div>';
            document.getElementById('fullscreen').append(root);
            root.setAttribute('data-fullscreen-player','');
            const lyricsData=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:'lyric',lyrics:[{startMs:3000,text:'First'}]});
            engine.recalculateLinePositions(lyricsData);
            const state=engine.createAnimEngineState();
            const line=root.querySelector('#lyric-0');
            const tick=currentTimeMs=>engine.tickLyricsAnimation(state,{currentTimeMs,eventCreationTime:Date.now(),isPlaying:true,lyricsData,scrollContainer:root});
            tick(2500);
            const before=state.scroll.scrollPos;
            tick(2700);
            const prepared=line.classList.contains('lyrics-line-ready')&&!line.classList.contains('lyrics-line-active');
            const target=state.scroll.scrollPos;
            tick(3000);
            const active=line.classList.contains('lyrics-line-active')&&!line.classList.contains('lyrics-line-ready');
            engine.resetAnimEngine(state);
            root.remove();
            return {before,prepared,target,active};
        })()`);
        assert.deepEqual(handoff, {before:0,prepared:true,target:88,active:true});
        const floating = await win.webContents.executeJavaScript(`(async () => {
            const {load,containers,lyrics}=window.lyricsTest;
            const root=containers[1];
            root.parentElement.setAttribute('data-fullscreen-player','');
            const {useLyricsAnimationEngine}=load('/@/renderer/features/lyrics/hooks/use-lyrics-animation-engine');
            const hook=useLyricsAnimationEngine({containerRef:{current:root},lyrics,lineIdPrefix:'karaoke-line',scrollContainerId:root.id,followRef:{current:false}});
            const words=Array.from(root.querySelectorAll('.karaoke-word'));
            const progress=()=>Number(words[0].style.getPropertyValue('--karaoke-progress'));
            const lift=(index=0)=>-parseFloat(getComputedStyle(words[index]).translate.split(' ')[1])||0;
            hook.tick(1500,false,{eventCreationTime:Date.now(),forceResync:true});
            const paused=progress();
            const pausedLift=lift();
            await new Promise(r=>setTimeout(r,120));
            const held=progress();
            const heldLift=lift();
            hook.tick(1800,true,{eventCreationTime:Date.now()});
            const resumed=progress();
            const halfLift=lift();
            hook.tick(3100,true,{eventCreationTime:Date.now(),forceResync:true});
            const completed=progress();
            const next=Number(words[1].style.getPropertyValue('--karaoke-progress'));
            const settlingLift=lift();
            const nextLift=lift(1);
            hook.tick(3500,true,{eventCreationTime:Date.now()});
            const fullLift=lift();
            hook.tick(1100,false,{eventCreationTime:Date.now(),forceResync:true});
            const sought=progress();
            const soughtLift=lift();

            words[0].dataset.duration='1.5';
            root.insertAdjacentHTML('beforeend','<div data-lyric-gap="1" data-gap-start="4000"></div><div id="karaoke-line-1">Next line</div>');
            const gapHook=useLyricsAnimationEngine({containerRef:{current:root},lyrics:[...lyrics,{startMs:8000,text:'Next line'}],lineIdPrefix:'karaoke-line',scrollContainerId:root.id,followRef:{current:false}});
            gapHook.tick(2800,false,{eventCreationTime:Date.now()});
            const restLift=lift();
            const wordSung=progress();
            gapHook.tick(3990,true,{eventCreationTime:Date.now()});
            const lastHalfLift=lift(1);
            gapHook.tick(4200,true,{eventCreationTime:Date.now()});
            const lastSettlingLift=lift(1);
            gapHook.tick(4480,true,{eventCreationTime:Date.now()});
            const lastFullLift=lift(1);
            return {paused,held,resumed,pausedLift,heldLift,halfLift,settlingLift,nextLift,fullLift,completed,next,sought,soughtLift,restLift,wordSung,lastHalfLift,lastSettlingLift,lastFullLift,sidebarFloating:containers[0].querySelector('.karaoke-word').style.getPropertyValue('--karaoke-progress')};
        })()`);
        console.log('Full-screen Amperfy motion', floating);
        assert.equal(floating.paused, 0.25);
        assert.equal(floating.held, floating.paused, 'Pausing freezes the real word progress');
        assert.ok(Math.abs(floating.resumed - 0.4) < 0.01);
        assert.equal(floating.heldLift, floating.pausedLift, 'Pausing freezes the vertical position');
        assert.equal(floating.halfLift, 1.2);
        assert.equal(floating.restLift, 1.2, 'The word waits at half height until the next cue starts');
        assert.equal(floating.wordSung, 1);
        assert.ok(floating.settlingLift > 1.2 && floating.settlingLift < 2.4);
        assert.ok(floating.nextLift > 0 && floating.nextLift < 1.2);
        assert.equal(floating.fullLift, 2.4);
        assert.equal(floating.lastHalfLift, 1.2);
        assert.ok(floating.lastSettlingLift > 1.2 && floating.lastSettlingLift < 2.4);
        assert.equal(floating.lastFullLift, 2.4, 'The final word settles through the start of an interlude');
        assert.equal(floating.completed, 1);
        assert.ok(Math.abs(floating.next - 0.1) < 0.01);
        assert.ok(Math.abs(floating.sought - 0.05) < 0.01);
        assert.ok(floating.soughtLift > 0 && floating.soughtLift < floating.pausedLift);
        assert.equal(
            floating.sidebarFloating,
            '',
            'Only the full-screen player gets the new motion',
        );
        const wave = await win.webContents.executeJavaScript(`(async () => {
            const {load}=window.lyricsTest;
            const {prepareFloatingLyric}=load('/@/renderer/features/lyrics/api/lyric-glyphs');
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const root=document.createElement('div');
            root.className='synchronized-lyrics';
            root.style='font:40px sans-serif';
            root.innerHTML='<div id="wave-0" class="lyric-line">'+prepareFloatingLyric('从左向右自然浮起')+'</div><div id="wave-1" class="lyric-line">'+prepareFloatingLyric('下一句')+'</div>';
            document.getElementById('fullscreen').append(root);
            const data=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:'wave',lyrics:[{startMs:1000,text:'从左向右自然浮起'},{startMs:4000,text:'下一句'}]});
            const state=engine.createAnimEngineState();
            const tick=(time,playing)=>engine.tickLyricsAnimation(state,{currentTimeMs:time,eventCreationTime:Date.now(),isPlaying:playing,lyricsData:data,scrollContainer:root,follow:false});
            const glyphs=Array.from(root.firstElementChild.querySelectorAll('.lyric-glyph'));
            const lift=()=>glyphs.map(glyph=>parseFloat(getComputedStyle(glyph).translate.split(' ')[1])||0);
            tick(1100,true);
            await new Promise(r=>setTimeout(r,190));
            const rising=lift();
            tick(1290,false);
            await new Promise(requestAnimationFrame);
            const paused=lift();
            await new Promise(r=>setTimeout(r,160));
            const held=lift();
            tick(1290,true);
            await new Promise(r=>setTimeout(r,900));
            const settled=lift();
            tick(4100,true);
            const advanced=!root.firstElementChild.classList.contains('lyrics-line-floating')&&root.lastElementChild.classList.contains('lyrics-line-floating');
            tick(0,false);
            const rewound=!root.querySelector('.lyrics-line-floating');
            tick(4100,true);
            const sample=document.createElement('div');
            sample.innerHTML=prepareFloatingLyric('<b>Hello</b> 👨‍👩‍👧‍👦 é <ruby>漢<rt>かん</rt></ruby> العربية<img src=x onerror=alert(1)>');
            const safe=!sample.querySelector('img,[onerror]');
            const preserved=sample.textContent==='Hello 👨‍👩‍👧‍👦 é 漢かん العربية'&&!!sample.querySelector('b .lyric-glyph')&&!!sample.querySelector('.lyric-glyph > ruby > rt');
            const segments=Array.from(sample.querySelectorAll('.lyric-glyph'),glyph=>glyph.textContent);
            window.lyricsTest.waveRoot=root;
            return {rising,paused,held,settled,advanced,rewound,safe,preserved,segments};
        })()`);
        console.log('Left-to-right line lift', wave);
        assert.ok(
            wave.rising[0] < -0.5 && wave.rising.at(-1) === 0,
            'Left glyphs lift before the right glyphs',
        );
        assert.ok(
            wave.paused.every((value, i) => Math.abs(value - wave.held[i]) < 0.02),
            'Pause freezes the glyph wave without restarting it',
        );
        assert.ok(
            wave.settled.every((value) => Math.abs(value + 4) < 0.05),
            'The whole line settles softly at its lifted position',
        );
        assert.ok(wave.advanced, 'The lift follows the focused line');
        assert.ok(wave.rewound, 'Seeking to the beginning clears the old line lift');
        assert.ok(
            wave.safe && wave.preserved,
            'Sanitization, inline formatting and ruby remain intact',
        );
        assert.ok(
            wave.segments.includes('👨‍👩‍👧‍👦') &&
                wave.segments.includes('é') &&
                wave.segments.includes('العربية'),
            'Graphemes and joined scripts stay together',
        );
        const duets = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const {getVocalSides}=load('/@/renderer/features/lyrics/api/lyrics-vocals');
            const cue=(agent,start,end,text)=>({agentId:agent,index:0,startMs:start,endMs:end,value:text,words:[{startMs:start,endMs:end,text}]});
            const male=cue('male',1000,4000,'男声'), female=cue('female',1200,4000,'女声');
            const againFemale=cue('female',6000,8000,'第二段女声'), againMale=cue('male',6000,8000,'第二段男声');
            const sides=getVocalSides([{startMs:1000,text:'',cueLines:[male,female]},{startMs:6000,text:'',cueLines:[againFemale,againMale]}]);
            const stable=[sides.get(male),sides.get(female),sides.get(againFemale),sides.get(againMale)];
            const solo=cue('male',1000,2000,'独唱'), adjacent=cue('female',2000,3000,'下一句');
            const unison=cue('female',1000,2000,'独唱');
            const sameVoice=cue('male',1100,1800,'延续');
            const ignored=[adjacent,unison,sameVoice].every(other=>getVocalSides([{startMs:1000,text:'',cueLines:[solo,other]}]).size===0);
            const results=[];
            for(const mode of ['line','word','grouped']){
                const root=document.createElement('div');
                root.className=mode==='line'?'synchronized-lyrics':'synchronized-karaoke-lyrics';
                root.style='position:fixed;inset:0;z-index:30;width:600px;height:240px;overflow:auto;font:32px sans-serif';
                const prefix=mode==='line'?'lyric':'karaoke-line';
                const lyrics=mode==='line'?[{startMs:1000,text:'男声'},{startMs:1000,text:'女声'},{startMs:4500,text:'下一句'}]:mode==='word'?[{startMs:1000,text:'男声',cueLines:[male]},{startMs:1200,text:'女声',cueLines:[female]},{startMs:4500,text:'下一句'}]:[{startMs:1000,text:'合唱',cueLines:[male,female]},{startMs:4500,text:'下一句'}];
                const words=cue=>'<span class="karaoke-word" data-time="'+cue.startMs/1000+'" data-duration="'+(cue.endMs-cue.startMs)/1000+'"><span class="karaoke-word-text">'+cue.value+'</span><span class="karaoke-word-highlight">'+cue.value+'</span></span>';
                root.innerHTML='<div style="height:400px"></div>'+lyrics.map((line,i)=>'<div id="'+prefix+'-'+i+'" class="'+(mode==='line'?'lyric-line':'karaoke-line')+'" style="text-align:center;'+(mode==='grouped'&&i===0?'':'height:70px;')+'">'+(line.cueLines?line.cueLines.map((cue,c)=>'<div data-lyric-cue-index="'+c+'" style="height:70px">'+words(cue)+'</div>').join(''):line.text)+'</div>').join('')+'<div style="height:500px"></div>';
                document.getElementById('fullscreen').append(root);
                const data=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:prefix,lyrics});
                engine.recalculateLinePositions(data);
                const state=engine.createAnimEngineState();
                const tick=(time,playing)=>engine.tickLyricsAnimation(state,{currentTimeMs:time,eventCreationTime:Date.now(),isPlaying:playing,forceResync:true,lyricsData:data,scrollContainer:root,smoothScroll:false});
                tick(1500,true);
                const vocals=Array.from(root.querySelectorAll('[data-lyric-side]'));
                const alignment=vocals.map(vocal=>getComputedStyle(vocal).textAlign);
                const rect=root.getBoundingClientRect();
                const visible=vocals.every(vocal=>{const r=vocal.getBoundingClientRect();return r.top>=rect.top&&r.bottom<=rect.bottom});
                const active=mode==='grouped'?data.lines[0].element.classList.contains('lyrics-line-active'):data.lines.slice(0,2).every(line=>line.element.classList.contains('lyrics-line-active'));
                const progress=Array.from(root.querySelectorAll('.karaoke-word'),word=>Number(word.style.getPropertyValue('--karaoke-progress')));
                const x=vocals.map(vocal=>{const range=document.createRange();range.selectNodeContents(vocal.querySelector('.karaoke-word-text')||vocal);return range.getBoundingClientRect().left});
                tick(1500,false);
                const pausedActive=mode==='grouped'?data.lines[0].element.classList.contains('lyrics-line-active'):data.lines.slice(0,2).every(line=>line.element.classList.contains('lyrics-line-active'));
                tick(4600,true);
                const released=data.lines.slice(0,mode==='grouped'?1:2).every(line=>!line.element.classList.contains('lyrics-line-active'));
                engine.resetAnimEngine(state);root.remove();
                results.push({mode,alignment,visible,active,pausedActive,progress,x,released});
            }
            return {stable,ignored,results};
        })()`);
        console.log('Simultaneous duet layout and timing', duets);
        assert.deepEqual(
            duets.stable,
            ['left', 'right', 'right', 'left'],
            'Each singer keeps its side in later duet phrases',
        );
        assert.ok(
            duets.ignored,
            'Solo, adjacent, unison and same-singer phrases retain normal alignment',
        );
        for (const duet of duets.results) {
            assert.deepEqual(
                duet.alignment,
                ['left', 'right'],
                duet.mode + ': separate upper/lower vocal rows align left and right',
            );
            assert.ok(
                duet.visible && duet.active && duet.pausedActive && duet.released,
                duet.mode +
                    ': both singers stay visible and focused during their overlap, including pause',
            );
            assert.ok(
                duet.x[1] - duet.x[0] > 300,
                duet.mode + ': rendered text occupies opposite sides',
            );
            if (duet.mode !== 'line')
                assert.ok(
                    duet.progress[0] > duet.progress[1] && duet.progress[1] > 0,
                    duet.mode + ': each singer follows its own word clock',
                );
        }
        const duetFollow = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const root=document.createElement('div');
            root.setAttribute('data-fullscreen-player','');
            root.className='synchronized-karaoke-lyrics';
            root.style='height:500px;overflow:auto';
            const cues=[[1000,2700,'solo'],[3000,5500,'lead'],[4300,6300,'reply'],[7000,8500,'next']];
            const lyrics=cues.map(([startMs,endMs,text],index)=>({startMs,text,cueLines:[{agentId:text,startMs,endMs,value:text,words:[{startMs,endMs,text}],index}]}));
            root.innerHTML=cues.map(([start,end,text],i)=>'<div id="karaoke-line-'+i+'" class="karaoke-line synchronized" style="height:90px"><span data-lyric-cue-index="0"><span class="karaoke-word" data-time="'+start/1000+'" data-duration="'+(end-start)/1000+'">'+text+'</span></span></div>').join('')+'<div style="height:500px"></div>';
            document.body.append(root);
            const lyricsData=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:'karaoke-line',lyrics});
            engine.recalculateLinePositions(lyricsData);
            const state=engine.createAnimEngineState();
            let clock=10000;
            const now=Date.now;
            Date.now=()=>clock;
            try {
                const tick=(time)=>{
                    clock=10000+time;
                    engine.tickLyricsAnimation(state,{currentTimeMs:time,eventCreationTime:clock,isPlaying:true,lyricsData,scrollContainer:root,smoothScroll:false});
                    return {target:state.scroll.scrollPos,until:state.scroll.programmaticScrollUntil,active:[...root.querySelectorAll('.lyrics-line-active')].map(row=>row.id)};
                };
                tick(1100);
                return {lead:tick(3050), approaching:tick(3850), both:tick(4750), reply:tick(5600), next:tick(6600)};
            } finally { Date.now=now; root.remove(); }
        })()`);
        assert.equal(duetFollow.lead.target, 90);
        for (const stage of [duetFollow.approaching, duetFollow.both, duetFollow.reply]) {
            assert.equal(stage.target, duetFollow.lead.target, 'An overlapping voice shares the scroll position');
            assert.equal(stage.until, duetFollow.lead.until, 'The echo does not restart scrolling');
        }
        assert.deepEqual(duetFollow.both.active, ['karaoke-line-1','karaoke-line-2']);
        assert.deepEqual(duetFollow.reply.active, ['karaoke-line-2']);
        assert.equal(duetFollow.next.target, 270, 'A new phrase can advance after the duet');
        const margins = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const results=[];
            for(const grouped of [false,true]){
                const frame=document.createElement('div');
                frame.setAttribute('data-fullscreen-player','');
                frame.style='position:fixed;inset:0';
                const cover=document.createElement('button');
                cover.dataset.playerCover='expanded';
                cover.style='position:absolute;left:80px;top:0;width:200px;height:200px';
                const root=document.createElement('div');
                root.style='position:absolute;left:50%;width:50%;top:0;height:300px;overflow:auto';
                const prefix=grouped?'karaoke-line':'lyric';
                const cue=text=>({startMs:1000,endMs:3000,index:0,value:text,words:[]});
                const lyrics=grouped?[{startMs:1000,text:'合唱',cueLines:[cue('第一声部'),cue('第二声部')]}]:[{startMs:1000,text:'第一声部'},{startMs:1000,text:'第二声部'}];
                root.innerHTML=grouped?'<div id="karaoke-line-0" style="box-sizing:border-box;width:100%;padding:0 16px"><div data-lyric-cue-index="0" style="width:100%;height:60px">第一声部</div><div data-lyric-cue-index="1" style="width:100%;height:60px">第二声部</div></div>':lyrics.map((line,i)=>'<div id="lyric-'+i+'" style="box-sizing:border-box;width:100%;height:60px;padding:0 16px">'+line.text+'</div>').join('');
                frame.append(cover,root);document.body.append(frame);
                const data=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:prefix,lyrics});
                const right=root.querySelector('[data-lyric-side="right"]'),left=root.querySelector('[data-lyric-side="left"]');
                const leftX=left.getBoundingClientRect().left;
                const normalInset=root.getBoundingClientRect().right-(left.getBoundingClientRect().right-parseFloat(getComputedStyle(left).paddingRight));
                const samples=[];
                for(const inset of [80,120,50]){
                    cover.style.left=inset+'px';
                    for(let i=0;i<3;i++)engine.recalculateLinePositions(data);
                    const bounds=frame.getBoundingClientRect();
                    const rightEdge=right.getBoundingClientRect().right-parseFloat(getComputedStyle(right).paddingRight);
                    samples.push({normalInset,lyric:bounds.right-rightEdge,leftShift:left.getBoundingClientRect().left-leftX});
                }
                results.push({grouped,samples});frame.remove();
            }
            return results;
        })()`);
        console.log('Right-vocal text uses the normal lyric margin', JSON.stringify(margins));
        for (const layout of margins) {
            for (const sample of layout.samples) {
                assert.ok(
                    Math.abs(sample.normalInset - sample.lyric) < 0.6,
                    'Moving the cover adds no inset to a right-side vocal',
                );
                assert.equal(sample.leftShift, 0, 'Left-side lyrics stay in place');
            }
        }
        const scroll = await win.webContents.executeJavaScript(`(async () => {
            const {load}=window.lyricsTest;
            const {animateLyricsSpring}=load('/@/renderer/features/lyrics/api/lyrics-spring-scroll');
            const root=document.createElement('div');
            root.className='synchronized-karaoke-lyrics';
            root.style='height:150px;overflow:auto';
            root.innerHTML=Array.from({length:8},(_,i)=>'<div class="karaoke-line" style="height:80px">Line '+i+'</div>').join('');
            document.getElementById('fullscreen').append(root);
            const rows=Array.from(root.children);
            root.scrollTop=10;
            const cancel=animateLyricsSpring(root,200,rows,0);
            await new Promise(r=>setTimeout(r,100));
            const offsets=rows.map(row=>parseFloat(getComputedStyle(row).translate.split(' ')[1])||0);
            const before=rows[4].getBoundingClientRect().top;
            cancel();
            const stop=animateLyricsSpring(root,300,rows,1);
            const after=rows[4].getBoundingClientRect().top;
            await new Promise(r=>setTimeout(r,80));
            stop();
            return {offsets,retargetJump:Math.abs(after-before),cleared:rows.every(row=>!row.getAnimations().length)};
        })()`);
        console.log('Rendered row glide', scroll);
        assert.ok(
            scroll.offsets[4] > scroll.offsets[1],
            'Visible later rows trail the focused row',
        );
        assert.ok(scroll.retargetJump < 1, 'Retargeting preserves the visible row position');
        assert.ok(scroll.cleared, 'Manual cancellation clears row offsets');
        const flows = await win.webContents.executeJavaScript(`(async () => {
            const {load}=window.lyricsTest;
            const engine=load('/@/renderer/features/lyrics/hooks/lyrics-animation-engine');
            const results=[];
            for(const karaoke of [false,true]){
                const root=document.createElement('div');
                root.className=karaoke?'synchronized-karaoke-lyrics':'synchronized-lyrics';
                root.style='position:fixed;inset:0;z-index:10;height:320px;width:650px;overflow:auto;font:41px sans-serif;--lyric-opacity:.2';
                const prefix=karaoke?'karaoke-line':'lyric';
                const lyrics=Array.from({length:80},(_,i)=>({startMs:i*600,text:'逐行浮动和连续换句 '+i,...(karaoke?{cueLines:[{index:i,startMs:i*600,endMs:i*600+500,value:'Word',words:[{startMs:i*600,endMs:i*600+500,text:'Word'}]}]}:{})}));
                root.innerHTML=lyrics.map((line,i)=>'<div id="'+prefix+'-'+i+'" class="'+(karaoke?'karaoke-line':'lyric-line')+' synchronized" style="height:90px">'+(karaoke?'<span class="karaoke-word" data-time="'+i*.6+'" data-duration=".5"><span class="karaoke-word-text">Word</span><span class="karaoke-word-highlight">Word</span></span>':line.text)+'</div>').join('');
                document.getElementById('fullscreen').append(root);
                const data=engine.buildLyricsDataFromDom({container:root,lineIdPrefix:prefix,lyrics});
                engine.recalculateLinePositions(data);
                const state=engine.createAnimEngineState();
                const rows=Array.from(root.children), gaps=[];
                let last, started, translated=false, staggered=false, frames=0;
                const tick=(time,force=false)=>engine.tickLyricsAnimation(state,{currentTimeMs:time,eventCreationTime:Date.now(),isPlaying:true,forceResync:force,lyricsData:data,scrollContainer:root});
                tick(3200,true);
                await new Promise(resolve=>{
                    const frame=now=>{
                        started??=now;
                        if(last!==undefined)gaps.push(now-last);
                        last=now;
                        tick(3200+(now-started)*4);
                        const offsets=rows.map(row=>parseFloat(getComputedStyle(row).translate.split(' ')[1])||0);
                        translated ||= offsets.some(n=>Math.abs(n)>1);
                        staggered ||= offsets.some((n,i)=>i>0&&Math.abs(n-offsets[i-1])>1);
                        frames++;
                        if(now-started<1100)requestAnimationFrame(frame);else resolve();
                    };requestAnimationFrame(frame);
                });
                const p95=gaps.sort((a,b)=>a-b)[Math.floor(gaps.length*.95)];
                const scale=getComputedStyle(rows[7]).transform;
                engine.resetAnimEngine(state);
                root.remove();
                results.push({mode:karaoke?'word':'line',translated,staggered,frames,p95,scale});
            }
            return results;
        })()`);
        console.log('Full playback flow', flows);
        for (const flow of flows) {
            assert.ok(
                flow.translated && flow.staggered,
                `${flow.mode}: full playback uses staggered floating rows`,
            );
            assert.equal(flow.scale, 'none', 'No competing font scale during scroll');
            assert.ok(flow.p95 < 50, `${flow.mode}: frame p95 ${flow.p95}ms`);
        }
        const phrasing = await win.webContents.executeJavaScript(`(() => {
            const {load}=window.lyricsTest;
            const {animateLyricsSpring}=load('/@/renderer/features/lyrics/api/lyrics-spring-scroll');
            const root=document.createElement('div');
            root.style='position:fixed;inset:0;z-index:20;height:500px;overflow:auto';
            root.innerHTML=Array.from({length:8},(_,i)=>'<div style="height:143px">Row '+i+'</div>').join('');
            document.body.append(root);
            const rows=Array.from(root.children);
            let stop;
            let maximumError=0,rowError=0;
            try {
                stop=animateLyricsSpring(root,143,rows,0);
                const animations=root.getAnimations({subtree:true});
                const reference=[[17,143],[50,133],[84,112],[117,86],[150,65],[184,46],[217,31],[250,21],[284,13],[317,8],[350,5],[384,3],[417,1]];
                const remaining=index=>143-(index*143-(rows[index].getBoundingClientRect().top-root.getBoundingClientRect().top));
                for(const [elapsed,expected] of reference){
                    animations.forEach(animation=>{animation.currentTime=elapsed});
                    maximumError=Math.max(maximumError,Math.abs(remaining(0)-expected));
                    if(elapsed===317)rowError=Math.max(Math.abs(remaining(2)-31),Math.abs(remaining(4)-86));
                }
                return {maximumError,rowError};
            } finally {
                stop?.();root.remove();
            }
        })()`);
        console.log('Recorded pickup, landing and row phrasing', phrasing);
        assert.ok(
            phrasing.maximumError < 2,
            'Rendered pickup and landing follow the reference recording',
        );
        assert.ok(phrasing.rowError < 2, 'Later rows use the same phrase at 50ms intervals');
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
        });
        assert.equal(
            await win.webContents.executeJavaScript(
                `getComputedStyle(document.querySelector('[data-fullscreen-player] .karaoke-word')).translate`,
            ),
            'none',
        );
        assert.equal(
            await win.webContents.executeJavaScript(
                `getComputedStyle(window.lyricsTest.waveRoot.querySelector('.lyrics-line-floating .lyric-glyph')).animationName`,
            ),
            'none',
            'Reduced motion disables the glyph lift',
        );
        win.webContents.debugger.detach();
        win.destroy();
        app.quit();
    })
    .catch((error) => {
        console.error(error);
        app.exit(1);
    });
