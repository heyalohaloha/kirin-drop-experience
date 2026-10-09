import {text as t} from './locale.mjs';
const $ = (id) => document.getElementById(id);
const number = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
const node = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const svgNode = (tag, attrs) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value); return n; };
const label = (band) => `${(band * 1.2).toFixed(1)}–${((band + 1) * 1.2).toFixed(1)}`;
let result, seconds = 0, selectedBand = 0, seek;
export function createPsychoAuditionButton(position, seekTo) {
  const button = node("button", t(`${position.toFixed(1)}秒を聴き直す`, `Listen again at ${position.toFixed(1)} s`));
  button.type = "button"; button.className = "time-button";
  button.addEventListener("click", () => seekTo(position));
  return button;
}
function observation() {
  if ($("bark-position").value === "mean" || !result?.psycho.timeline.length) return result?.psycho;
  // No future observation before its source-time endpoint; the initial interval is missing.
  return result.psycho.timeline.findLast((row) => row.time <= seconds);
}
function drawBark() {
  if (!result) return;
  const current = observation(), values = current?.specific ?? Array(20).fill(null);
  const maximum = Math.max(.01, ...result.psycho.specific, ...values.filter(Number.isFinite));
  const svg = svgNode("svg", { viewBox: "0 0 680 154", "aria-hidden": "true" });
  values.forEach((value, band) => {
    const height = Number.isFinite(value) ? value / maximum * 110 : 0;
    svg.append(svgNode("rect", { x: band * 34 + 5, y: 122 - height, width: 24, height, rx: 2, fill: band === selectedBand ? "#526f78" : "#806b3b" }));
  });
  for (const [x, text] of [[5, "0"], [165, "6"], [335, "12"], [505, "18"], [660, "24"]]) {
    const t = svgNode("text", { x, y: 144, fill: "#625b50", "font-size": 10 }); t.textContent = text; svg.append(t);
  }
  $("bark-plot").replaceChildren(svg);
  $("bark-current").textContent = `${$("bark-position").value === "mean" ? t("全曲の平均","Whole-track mean") : t("再生位置までの最新値","Latest observation at playback position")} · ${label(selectedBand)} Bark · ${number(values[selectedBand])} sone/Bark · PSB ${number(current?.psb?.[selectedBand])}`;
  $("bark-values").replaceChildren(...values.map((value, band) => {
    const row = node("tr"); row.append(node("th", label(band)), node("td", number(value)), node("td", number(current?.psb?.[band]))); return row;
  }));
}
function drawCurve() {
  const key = $("psycho-metric").value, rows = result.psycho.timeline;
  const values = rows.map((row) => row[key]).filter(Number.isFinite), max = Math.max(.01, ...values);
  const svg = svgNode("svg", { viewBox: "0 0 840 132", preserveAspectRatio: "none", "aria-hidden": "true" });
  svg.append(svgNode("path", { d: "M36 12V116H838", fill: "none", stroke: "#d1c9ba" }));
  for (const [value, y] of [[max, 16], [max / 2, 66], [0, 116]]) {
    const text = svgNode("text", { x: 1, y, fill: "#625b50", "font-size": 9 }); text.textContent = value.toFixed(1); svg.append(text);
  }
  let path = "", connected = false;
  for (const row of rows) {
    if (!Number.isFinite(row[key])) { connected = false; continue; }
    path += `${connected ? "L" : "M"}${(36 + row.time / result.duration * 802).toFixed(2)} ${(116 - row[key] / max * 104).toFixed(2)} `; connected = true;
  }
  svg.append(svgNode("path", { d: path, fill: "none", stroke: "#526f78", "stroke-width": 1.5 }));
  svg.append(svgNode("path", { id: "psycho-cursor", d: "M0 0V132", stroke: "#302d28", "stroke-width": 1 }));
  $("psycho-plot").replaceChildren(svg);
  $("psycho-plot").setAttribute("aria-label", key === "sharpness" ? t("Sharpnessの時間変化、単位acum","Sharpness over time in acum") : t("Zwicker Loudnessの時間変化、単位sone","Zwicker Loudness over time in sone"));
  psychoPosition(seconds);
}
export function resetPsycho() {
  result = undefined; seconds = 0; selectedBand = 0;
  $("psycho-results").hidden = true;
  for (const id of ["bark-plot", "psycho-plot", "bark-values", "psycho-jumps"]) $(id).replaceChildren();
  for (const id of ["psycho-state", "bark-current", "psycho-current", "sone", "sharpness"]) $(id).textContent = "—";
  $("bark-position").value = "mean"; $("bark-band").value = "0"; $("psycho-metric").value = "sharpness";
}
export function psychoPosition(position) {
  seconds = position;
  if (!result?.psycho.timeline.length) return;
  $("psycho-cursor")?.setAttribute("transform", `translate(${36 + position / result.duration * 802} 0)`);
  const row = result.psycho.timeline.findLast((row) => row.time <= position);
  $("psycho-current").textContent = `${t("再生位置","Playback position")} ${position.toFixed(1)} s · ${row ? t("観測時刻","Observation at") + " " + row.time.toFixed(3) + " s" : t("観測前","Before first observation")} · ${number(row?.loudness)} sone / ${number(row?.sharpness)} acum`;
  if ($("bark-position").value === "position") drawBark();
}
export function renderPsycho(measurement) {
  result = measurement;
  $("psycho-results").hidden = false;
  if (result.psycho.state !== "measured") { $("psycho-state").textContent = t("心理音響の計算を完了できませんでした。波形や他の結果は引き続き確認できます。","Psychoacoustic measurements could not complete. Waveform and other results remain available."); return; }
  const p = result.psycho;
  $("sone").textContent = number(p.loudness); $("sharpness").textContent = number(p.sharpness);
  $("psycho-state").textContent = `${t("Hypha公開コア","Hypha public core")} · ${result.sampleRate / 1000} kHz → 48 kHz · ${t("左右を別々に測って平均","Independent channel measurements, averaged")} · ${t("仮定","Assumption")} 0 dBFS ≈ ${p.assumedFullScaleSPL.toFixed(2)} dB SPL · ${t("自由音場","Free field")}`;
  // Three measured local changes as audition entry points, never a quality ranking.
  const changes = p.timeline.slice(1).map((row, i) => ({ row, change: Math.abs(row.sharpness - p.timeline[i].sharpness) })).sort((a, b) => b.change - a.change);
  const positions = [];
  for (const change of changes) if (change.change > .01 && positions.every((t) => Math.abs(t - change.row.time) > .5)) { positions.push(change.row.time); if (positions.length === 3) break; }
  $("psycho-jumps").replaceChildren(...positions.sort((a, b) => a - b).map(position => createPsychoAuditionButton(position, seek)));
  drawCurve(); drawBark();
}
export function initialisePsycho(seekTo) {
  seek = seekTo;
  $("psycho-metric").addEventListener("change", () => { if (result?.psycho.state === "measured") drawCurve(); });
  $("bark-position").addEventListener("change", () => { if (result?.psycho.state === "measured") drawBark(); });
  $("bark-band").addEventListener("change", (event) => { selectedBand = Number(event.target.value); if (result?.psycho.state === "measured") drawBark(); });
  $("bark-band").replaceChildren(...Array.from({ length: 20 }, (_, band) => { const option = node("option", label(band) + " Bark"); option.value = band; return option; }));
}
