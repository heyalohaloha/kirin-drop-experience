import { createDemoWav, LIMITS } from "./measure.mjs";
import { initializeFlow, renderExtended, resetExtended, extendedPosition } from "./flow.mjs";
import { initialisePsycho, renderPsycho, resetPsycho, psychoPosition } from "./psycho-view.mjs";
import { initialisePresentation, installFileDrop } from "./kirin-ui/presentation.mjs";
import { createPlaybackTicker } from './playback.mjs';
const presentation = initialisePresentation();
const $ = (id) => document.getElementById(id);
const player = new Audio(); player.preload = "metadata";
let worker, objectUrl, measurement, generation = 0, pendingSeek, instruments;
const playbackTicker = createPlaybackTicker(updatePosition);
function inputState(state) {
  $("desk").dataset.inputState = state;
  $("input-state").textContent = { idle: "WAITING", measuring: "MEASURING", ready: "READY", error: "CHECK INPUT" }[state];
  $("read-area").setAttribute("aria-busy", String(state === "measuring"));
}
const dbLabel = (value) => value === null ? "−∞" : value.toFixed(1);
const clip = (value) => Math.max(-1, Math.min(1, value));
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

function stop() {
  playbackTicker.stop();
  instruments?.dispose(); instruments = undefined;
  $("instrument-note").textContent = "目の外周は全曲のLUFS-M、瞳はLRA、花輪と色はBarkの平均から描きます。再生位置の光と瞳の大きさだけが動き、星を押すとLUFS-Mが最大の時刻へ移動します。色は音質の良し悪しを表しません。";
  worker?.terminate(); worker = undefined;
  player.pause(); player.removeAttribute("src"); player.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined; measurement = undefined; pendingSeek = undefined; resetExtended(); resetPsycho();
  $("plot").replaceChildren();
  for (const id of ["metadata", "channel-values", "duration-label", "loudness-method", "true-peak-method", "loudness-current"]) $(id).textContent = "";
  for (const id of ["peak", "rms", "sample-rate", "bits", "lufs", "true-peak", "lra"]) $(id).textContent = "—";
  $("lra-note").textContent = "LU · 全曲";
  $("seek").value = 0; $("position").textContent = "0:00.0";
  $("play").textContent = "▶"; $("play").setAttribute("aria-label", "再生");
}

function reset() {
  generation++; stop();
  fileDrop.reset();
  inputState("idle"); presentation.reset();
  $("audio-file").value = ""; $("results").hidden = true; $("empty").hidden = false;
  $("file-name").textContent = "NO FILE"; $("status").textContent = "音源を待っています。"; $("clear").disabled = true;
  $("plot").replaceChildren();
}

function draw(result) {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 840 180"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true");
  result.wave.forEach((wave, channel) => {
    const center = result.channels === 1 ? 90 : 45 + channel * 90, scale = result.channels === 1 ? 73 : 35;
    const axis = document.createElementNS(ns, "path"); axis.setAttribute("d", `M0 ${center} H840`); axis.setAttribute("stroke", "var(--wave-axis)"); svg.append(axis);
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", wave.map(([min, max], i) => `M${(i * 840 / wave.length).toFixed(2)} ${(center - clip(max) * scale).toFixed(2)} v${((clip(max)-clip(min)) * scale).toFixed(2)}`).join(" "));
    path.setAttribute("stroke", channel === 0 ? "var(--wave-left)" : "var(--wave-right)"); path.setAttribute("stroke-width", "1.2"); svg.append(path);
  });
  const cursor = document.createElementNS(ns, "path"); cursor.id = "cursor"; cursor.setAttribute("d", "M0 0V180"); cursor.setAttribute("stroke", "var(--wave-cursor)"); cursor.setAttribute("stroke-width", "1.2"); svg.append(cursor);
  $("plot").replaceChildren(svg);
}

async function load(file, demo = false) {
  const token = ++generation; stop();
  fileDrop.reset();
  $("audio-file").value = "";
  $("results").hidden = true; $("empty").hidden = false; $("clear").disabled = false;
  $("file-name").textContent = demo ? "DEMO · 合成音源" : file.name;
  if (file.size > LIMITS.bytes) { inputState("error"); $("status").textContent = "64 MiB以下の音源を選んでください。"; return; }
  inputState("measuring");
  $("status").textContent = "端末内で音源を測定しています。";
  try {
    const buffer = await file.arrayBuffer();
    if (token !== generation) return;
    worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (token !== generation) return;
      if (data.progress) {
        const phases = { signal: "波形・信号", engine: "共通エンジン", loudness: "LUFS・True Peak", psychoacoustics: "心理音響", music: "拍・コード候補" };
        const fraction = Number.isFinite(data.progress.fraction) ? ` ${Math.round(data.progress.fraction * 100)}%` : "";
        $("status").textContent = `${phases[data.progress.phase] ?? "音源"}を端末内で解析しています${fraction}。クリアで中止できます。`;
        return;
      }
      worker?.terminate(); worker = undefined;
      if (data.error) { inputState("error"); $("status").textContent = data.error; return; }
      measurement = data.result;
      const r = measurement;
      objectUrl = URL.createObjectURL(file); player.src = objectUrl;
      $("peak").textContent = dbLabel(r.peakDb); $("rms").textContent = dbLabel(r.rmsDb);
      $("sample-rate").textContent = (r.sampleRate / 1000).toString(); $("bits").textContent = r.bits.toString();
      $("duration-label").textContent = timeLabel(r.duration); $("seek").max = r.duration; $("seek").value = 0; $("position").textContent = "0:00.0";
      $("metadata").textContent = `${r.channels === 1 ? "モノラル" : "ステレオ"} / ${r.encoding} / ${r.frames.toLocaleString("ja-JP")} sample frames / ${r.duration.toFixed(3)}秒。再生用の変換を行わず、元WAVを測定しています。`;
      $("channel-values").textContent = r.channelPeakDb.map((peak, i) => `${r.channels === 1 ? "Mono" : i === 0 ? "L" : "R"} · Sample Peak ${dbLabel(peak)} dBFS / RMS ${dbLabel(r.channelRmsDb[i])} dBFS / True Peak ${r.truePeak.channelDb ? dbLabel(r.truePeak.channelDb[i]) + " dBTP" : "計算できませんでした"}`).join("。 ");
      draw(r); renderExtended(r, $("file-name").textContent); renderPsycho(r); $("empty").hidden = true; $("results").hidden = false;
      import('./kirin-ui/instruments/instruments.mjs').then(({ mountInstruments }) => {
        if (token === generation && measurement === r) instruments = mountInstruments($("instruments"), r, seekTo);
      }).catch(() => {
        if (token === generation) $("instrument-note").textContent = "計器の表示を読み込めませんでした。他の測定結果は確認できます。";
      });
      inputState("ready");
      $("status").textContent = demo ? "合成デモを解析しました。120 BPM・C → Am → F → Gを耳でも確認できます。" : "測定と候補の解析が終わりました。音源を外部へ送信していません。";
    };
    worker.onerror = () => { if (token === generation) { worker?.terminate(); worker = undefined; inputState("error"); $("status").textContent = "測定を開始できませんでした。ページを再読み込みして試してください。"; } };
    worker.postMessage(buffer, [buffer]);
  } catch { if (token === generation) { inputState("error"); $("status").textContent = "ファイルを読み込めませんでした。別の音源を選んでください。"; } }
}

$("choose-files").addEventListener("click", () => $("audio-file").click());
$("audio-file").addEventListener("change", (event) => { if (event.target.files[0]) load(event.target.files[0]); });
$("demo").addEventListener("click", () => load(new File([createDemoWav()], "Kirin-Drop-synthetic-demo.wav", { type: "audio/wav" }), true));
$("clear").addEventListener("click", reset);
const fileDrop = installFileDrop({
  area: $("drop-area"), documentTarget: document, windowTarget: window, presentation,
  onFile: load,
  onInvalid() { $("status").textContent = "一度に1つのWAVを選んでください。"; },
});
$("play").addEventListener("click", async () => {
  if (!measurement) return;
  if (!player.paused) { player.pause(); return; }
  if (player.ended) player.currentTime = 0;
  try { await player.play(); } catch { $("status").textContent = "このブラウザでは音源を再生できません。測定結果は確認できます。"; }
});
player.addEventListener("play", () => { playbackTicker.start(); $("play").textContent = "Ⅱ"; $("play").setAttribute("aria-label", "一時停止"); });
player.addEventListener("pause", () => { playbackTicker.stop(); $("play").textContent = "▶"; $("play").setAttribute("aria-label", "再生"); });
function updatePosition() {
  if (!measurement) return;
  $("seek").value = player.currentTime; $("position").textContent = timeLabel(player.currentTime);
  $("cursor")?.setAttribute("transform", `translate(${player.currentTime / measurement.duration * 840} 0)`);
  extendedPosition(player.currentTime);
  psychoPosition(player.currentTime);
  instruments?.update(player.currentTime);
}
player.addEventListener("timeupdate", updatePosition);
function seekTo(seconds) {
  if (!measurement) return;
  const time = Math.max(0, Math.min(measurement.duration, seconds));
  if (player.readyState === 0) pendingSeek = time;
  else { try { player.currentTime = time; } catch { pendingSeek = time; } }
  $("seek").value = time; $("position").textContent = timeLabel(time);
  $("cursor")?.setAttribute("transform", `translate(${time / measurement.duration * 840} 0)`); extendedPosition(time); psychoPosition(time); instruments?.update(time);
}
player.addEventListener("loadedmetadata", () => { if (pendingSeek !== undefined) { const time = pendingSeek; pendingSeek = undefined; seekTo(time); } });
player.addEventListener("error", () => { if (measurement) $("status").textContent = "このWAVをブラウザで再生できません。解析結果は確認できます。"; });
$("seek").addEventListener("input", (event) => seekTo(Number(event.target.value)));
initializeFlow(seekTo);
initialisePsycho(seekTo);
window.addEventListener("pagehide", (event) => {
  reset(); presentation.suspend();
  if (!event.persisted) { fileDrop.dispose(); presentation.dispose(); }
});
window.addEventListener("pageshow", (event) => { if (event.persisted) presentation.resume(); });
