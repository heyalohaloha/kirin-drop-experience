import {createDemoWav} from '../drop-preview/measure.mjs';
import {PUBLIC_LIMITS} from './policy.mjs';
import {text as t} from '../drop-preview/locale.mjs';
import {initialisePresentation, installFileDrop} from '../drop-preview/kirin-ui/presentation.mjs';
import {createPlaybackTicker} from '../drop-preview/playback.mjs';
import {initialisePsycho, renderPsycho, resetPsycho, psychoPosition} from '../drop-preview/psycho-view.mjs';
const $ = id => document.getElementById(id);
const presentation = initialisePresentation({formatLight: light => t(
  `${light.term[0]} · ${light.night > .5 ? '月明かり' : '太陽の光'}`,
  `${light.term[2]} · ${light.night > .5 ? 'Moonlight' : 'Sunlight'}`)});
const player = new Audio(); player.preload = 'metadata';
const ticker = createPlaybackTicker(updatePosition);
let worker, objectUrl, result, instruments, generation = 0, pendingSeek;
const db = v => v === null ? '−∞' : Number.isFinite(v) ? v.toFixed(1) : '—';
const number = v => Number.isFinite(v) ? v.toFixed(1) : '—';
const time = v => `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4,'0')}`;
const instrumentNote = $('instrument-note').textContent;
function state(value) {
  $('desk').dataset.inputState = value;
  $('input-state').textContent = {idle:'WAITING',measuring:'MEASURING',ready:'READY',error:'CHECK INPUT'}[value];
  $('read-area').setAttribute('aria-busy',String(value === 'measuring'));
}
function stop() {
  ticker.stop(); worker?.terminate(); worker = undefined;
  instruments?.dispose(); instruments = undefined;
  player.pause(); player.removeAttribute('src'); player.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined; result = undefined; pendingSeek = undefined;
  resetPsycho(); $('plot').replaceChildren(); $('loudness-plot').replaceChildren();
  for (const id of ['lufs','true-peak','peak','rms','sample-rate','bits','lra']) $(id).textContent = '—';
  for (const id of ['metadata','channel-values','duration-label','loudness-current','capability-errors']) $(id).textContent = '';
  $('lra-note').textContent = 'LU'; $('instrument-note').textContent = instrumentNote;
  $('seek').value = 0; $('position').textContent = '0:00.0'; $('play').textContent = '▶'; $('play').setAttribute('aria-label',t('再生','Play'));
}
function clear() {
  generation++; stop(); fileDrop.reset(); presentation.reset(); state('idle');
  $('audio-file').value = ''; $('results').hidden = true; $('empty').hidden = false;
  $('file-name').textContent = 'NO FILE'; $('status').textContent = t('音源を待っています。','Waiting for audio.'); $('clear').disabled = true;
  for (const input of document.querySelectorAll('.example-sheet input')) input.value = '';
}
const svgNode = (tag,attrs) => {const n = document.createElementNS('http://www.w3.org/2000/svg',tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); return n;};
function waveform(r) {
  const svg = svgNode('svg',{viewBox:'0 0 840 180',preserveAspectRatio:'none','aria-hidden':'true'});
  const clip = v => Math.max(-1,Math.min(1,v));
  r.wave.forEach((wave,ch) => {
    const center = r.channels === 1 ? 90 : 45 + ch * 90, scale = r.channels === 1 ? 73 : 35;
    svg.append(svgNode('path',{d:`M0 ${center} H840`,stroke:'var(--wave-axis)'}));
    svg.append(svgNode('path',{d:wave.map(([a,b],i) => `M${(i*840/wave.length).toFixed(2)} ${(center-clip(b)*scale).toFixed(2)} v${((clip(b)-clip(a))*scale).toFixed(2)}`).join(' '),stroke:ch ? 'var(--wave-right)' : 'var(--wave-left)','stroke-width':1.2}));
  });
  svg.append(svgNode('path',{id:'cursor',d:'M0 0V180',stroke:'var(--wave-cursor)','stroke-width':1.2}));
  $('plot').replaceChildren(svg);
}
function loudness(r) {
  const rows = r.loudness.timeline, values = rows.flatMap(row => [row.momentary,row.shortTerm]).filter(Number.isFinite);
  if (!values.length) {const p = document.createElement('p'); p.className = 'plot-empty'; p.textContent = t('十分な長さ・音量のLUFSデータがありません。','Not enough duration or level for loudness observations.'); $('loudness-plot').replaceChildren(p); return;}
  const lo = Math.min(-60,...values), hi = Math.max(-6,...values), y = v => 12 + (hi-v)/(hi-lo)*104;
  const svg = svgNode('svg',{viewBox:'0 0 840 132',preserveAspectRatio:'none','aria-hidden':'true'});
  for (const v of [hi,(hi+lo)/2,lo]) {
    svg.append(svgNode('path',{d:`M36 ${y(v)} H840`,stroke:'#d1c9ba'}));
    const label = svgNode('text',{x:2,y:y(v)+3,fill:'#625b50','font-size':9}); label.textContent = v.toFixed(0); svg.append(label);
  }
  for (const [key,color] of [['momentary','#806b3b'],['shortTerm','#526f78']]) {
    let d = '', connected = false;
    for (const row of rows) {if (!Number.isFinite(row[key])) {connected = false; continue;} d += `${connected?'L':'M'}${(36+row.end/r.duration*804).toFixed(2)} ${y(row[key]).toFixed(2)} `; connected = true;}
    svg.append(svgNode('path',{d,fill:'none',stroke:color,'stroke-width':1.6}));
  }
  svg.append(svgNode('path',{id:'lufs-cursor',d:'M0 0V132',stroke:'#302d28','stroke-width':1}));
  $('loudness-plot').replaceChildren(svg);
}
const errors = {
  'public-size': () => t('32 MiB以下のWAVを選んでください。','Choose a WAV no larger than 32 MiB.'),
  'public-rate': () => t('この体験版は44.1／48／96 kHzのWAVに対応しています。','This experience supports 44.1, 48, and 96 kHz WAV files.'),
  'public-duration': () => t('90秒以内のWAVを選んでください。','Choose a WAV no longer than 90 seconds.'),
  'invalid-wav': () => t('対応するPCM／IEEE float WAVを読み込めませんでした。形式と条件を確認してください。','Could not read a supported PCM or IEEE float WAV. Check the format and limits.'),
};
async function load(file,demo = false) {
  const token = ++generation; stop(); fileDrop.reset(); $('audio-file').value = '';
  $('results').hidden = true; $('empty').hidden = false; $('clear').disabled = false;
  $('file-name').textContent = demo ? t('DEMO · 合成音源','DEMO · Synthetic audio') : file.name;
  if (file.size > PUBLIC_LIMITS.bytes) {state('error'); $('status').textContent = errors['public-size'](); return;}
  state('measuring'); $('status').textContent = t('端末内で音源を測定しています。','Measuring audio on your device.');
  try {
    const buffer = await file.arrayBuffer(); if (token !== generation) return;
    worker = new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage = ({data}) => {
      if (token !== generation) return;
      if (data.progress) {
        const phase = {signal:t('波形・信号','Waveform'),loudness:'LUFS / True Peak',psychoacoustics:t('心理音響','Psychoacoustics')}[data.progress.phase] ?? t('公開コア','Public cores');
        $('status').textContent = `${phase} · ${Number.isFinite(data.progress.fraction) ? Math.round(data.progress.fraction*100)+'% · ' : ''}${t('クリアで中止できます。','Clear to cancel.')}`; return;
      }
      worker?.terminate(); worker = undefined;
      if (data.error) {state('error'); $('status').textContent = (errors[data.error] ?? errors['invalid-wav'])(); return;}
      const r = result = data.result; objectUrl = URL.createObjectURL(file); player.src = objectUrl;
      for (const [id,value] of [['peak',db(r.peakDb)],['rms',db(r.rmsDb)],['sample-rate',r.sampleRate/1000],['bits',r.bits],['lufs',number(r.loudness.integrated)],['true-peak',r.truePeak.state==='unavailable'?'—':db(r.truePeak.db)],['lra',number(r.loudness.lra)]]) $(id).textContent = value;
      $('lra-note').textContent = r.loudness.lraState === 'provisional' ? t('LU · 60秒未満の暫定値','LU · Provisional below 60 s') : Number.isFinite(r.loudness.lra) ? 'LU' : t('LU · 欠測','LU · Unavailable');
      $('seek').max = r.duration; $('duration-label').textContent = time(r.duration);
      $('metadata').textContent = `${r.channels===1?t('モノラル','Mono'):t('ステレオ','Stereo')} / ${r.encoding} / ${r.frames.toLocaleString()} sample frames / ${r.duration.toFixed(3)} s. ${t('再生用の変換を行わず、元WAVを測定しています。','Measurements use the original WAV, without playback conversion.')}`;
      $('channel-values').textContent = r.channelPeakDb.map((peak,i) => `${r.channels===1?'Mono':i===0?'L':'R'} · Sample Peak ${db(peak)} dBFS / RMS ${db(r.channelRmsDb[i])} dBFS / True Peak ${r.truePeak.channelDb?db(r.truePeak.channelDb[i]):'—'} dBTP`).join(' / ');
      $('capability-errors').textContent = r.errors.length ? t('一部の公開コアを実行できませんでした。欠測項目は—で表示しています。','Some public cores could not run. Missing measurements are shown as —.') : '';
      waveform(r); loudness(r); renderPsycho(r); $('empty').hidden = true; $('results').hidden = false;
      import('../drop-preview/kirin-ui/instruments/instruments.mjs').then(({mountInstruments}) => {
        if (token === generation && result === r) instruments = mountInstruments($('instruments'),r,seekTo);
      }).catch(() => {if(token===generation) $('instrument-note').textContent=t('計器を読み込めませんでした。他の測定結果は確認できます。','The instruments could not load. Other measurements remain available.');});
      updatePosition(); state('ready');
      $('status').textContent = demo ? t('12秒の合成デモを測定しました。再生を押して聴けます。','Measured the 12-second synthetic demo. Press Play to listen.') : t('測定が終わりました。音源を外部へ送信していません。','Measurement complete. No audio was uploaded.');
    };
    worker.onerror = () => {if(token===generation) {worker?.terminate(); worker=undefined; state('error'); $('status').textContent=t('測定を開始できませんでした。ページを再読み込みして試してください。','Could not start measurement. Reload the page to try again.');}};
    worker.postMessage(buffer,[buffer]);
  } catch {if(token===generation){state('error');$('status').textContent=errors['invalid-wav']();}}
}
function updatePosition() {
  if (!result) return;
  const seconds = player.currentTime; $('seek').value = seconds; $('position').textContent = time(seconds);
  $('cursor')?.setAttribute('transform',`translate(${seconds/result.duration*840} 0)`);
  $('lufs-cursor')?.setAttribute('transform',`translate(${36+seconds/result.duration*804} 0)`);
  const row = result.loudness.timeline[Math.min(result.loudness.timeline.length-1,Math.floor((seconds+1e-7)*10)-1)];
  $('loudness-current').textContent = `${time(seconds)} · M ${number(row?.momentary)} LUFS / S ${number(row?.shortTerm)} LUFS`;
  psychoPosition(seconds); instruments?.update(seconds);
}
function seekTo(seconds) {
  if(!result) return; const position = Math.max(0,Math.min(result.duration,seconds));
  if (player.readyState === 0) pendingSeek = position;
  else try {player.currentTime = position;} catch {pendingSeek = position;}
  $('seek').value = position; $('position').textContent = time(position);
  $('cursor')?.setAttribute('transform',`translate(${position/result.duration*840} 0)`);
  $('lufs-cursor')?.setAttribute('transform',`translate(${36+position/result.duration*804} 0)`);
  const row = result.loudness.timeline[Math.min(result.loudness.timeline.length-1,Math.floor((position+1e-7)*10)-1)];
  $('loudness-current').textContent = `${time(position)} · M ${number(row?.momentary)} LUFS / S ${number(row?.shortTerm)} LUFS`;
  psychoPosition(position); instruments?.update(position);
}
$('choose-files').addEventListener('click',()=>$('audio-file').click());
$('audio-file').addEventListener('change',event=>{if(event.target.files[0]) load(event.target.files[0]);});
$('demo').addEventListener('click',()=>load(new File([createDemoWav()],'Kirin-Drop-synthetic-demo.wav',{type:'audio/wav'}),true));
$('clear').addEventListener('click',clear);
const fileDrop = installFileDrop({area:$('drop-area'),documentTarget:document,windowTarget:window,presentation,onFile:load,onInvalid:()=>{$('status').textContent=t('一度に1つのWAVを選んでください。','Choose one WAV at a time.');}});
$('play').addEventListener('click',async()=>{
  if(!result) return; if(!player.paused){player.pause();return;} if(player.ended)player.currentTime=0;
  try {await player.play();}catch{$('status').textContent=t('このブラウザでは再生できません。測定結果は確認できます。','This browser cannot play the audio. Measurements remain available.');}
});
player.addEventListener('play',()=>{ticker.start();$('play').textContent='Ⅱ';$('play').setAttribute('aria-label',t('一時停止','Pause'));});
player.addEventListener('pause',()=>{ticker.stop();$('play').textContent='▶';$('play').setAttribute('aria-label',t('再生','Play'));});
player.addEventListener('timeupdate',updatePosition);
player.addEventListener('loadedmetadata',()=>{if(pendingSeek!==undefined){const position=pendingSeek;pendingSeek=undefined;seekTo(position);}});
player.addEventListener('error',()=>{if(result)$('status').textContent=t('このWAVを再生できません。測定結果は確認できます。','This WAV cannot be played. Measurements remain available.');});
$('seek').addEventListener('input',event=>seekTo(Number(event.target.value)));
$('motion-off').addEventListener('change',event=>{document.body.dataset.motion=event.target.checked?'still':'normal';if(event.target.checked)presentation.suspend();else presentation.resume();});
initialisePsycho(seekTo);
window.addEventListener('pagehide',event=>{clear();presentation.suspend();if(!event.persisted){fileDrop.dispose();presentation.dispose();}});
window.addEventListener('pageshow',event=>{if(event.persisted&&!$('motion-off').checked)presentation.resume();});
