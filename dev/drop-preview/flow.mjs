import { createDraft, updateDraftRow, chooseTempo, draftSummary } from "./draft.mjs";
const $ = (id) => document.getElementById(id);
const PAGE = 16;
let result, draft, seek, beatPage = 0, chordPage = 0, draftPage = 0;
const time = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
const number = (value) => Number.isFinite(value) ? value.toFixed(1) : "—";
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const svgElement = (tag, attributes) => { const node = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); return node; };

export function lraDisplay(loudness) {
  if (!Number.isFinite(loudness.lra)) return { value: "—", note: loudness.lraState === "too-short" ? "LU · 3秒未満" : loudness.lraState === "below-gate" ? "LU · ゲート以下" : "LU · 計算できませんでした" };
  return { value: number(loudness.lra), note: loudness.lraState === "provisional" ? "LU · 60秒未満の暫定値" : "LU · 全曲" };
}

export function resetExtended() {
  result = undefined; draft = undefined; beatPage = 0; chordPage = 0; draftPage = 0;
  for (const id of ["music-results", "draft-entry", "draft-section"]) $(id).hidden = true;
  for (const id of ["loudness-plot", "beat-plot", "beat-list", "chord-list", "draft-rows", "sheet-lines"]) $(id).replaceChildren();
  $("capability-errors").textContent = "";
  delete $("draft-entry").dataset.sourceName;
  $("sheet-title").value = "コード譜の下書き";
  for (const id of ["sheet-meta", "draft-summary", "rhythm-summary", "harmony-summary"]) $(id).textContent = "";
  $("sheet-preview-title").textContent = "コード譜の下書き";
}
function drawLoudness() {
  const rows = result.loudness.timeline, values = rows.flatMap((row) => [row.momentary, row.shortTerm]).filter(Number.isFinite);
  if (!values.length) { $("loudness-plot").replaceChildren(element("p", "plot-empty", "十分な長さ・音量のLUFSデータがありません。")); return; }
  const lower = Math.min(-60, ...values), upper = Math.max(-6, ...values), y = (value) => 12 + (upper - value) / (upper - lower) * 104;
  const svg = svgElement("svg", { viewBox: "0 0 840 132", preserveAspectRatio: "none", "aria-hidden": "true" });
  for (const value of [upper, (upper + lower) / 2, lower]) {
    svg.append(svgElement("path", { d: `M36 ${y(value)} H840`, stroke: "#d1c9ba" }));
    const label = svgElement("text", { x: 2, y: y(value) + 3, fill: "#625b50", "font-size": 9 }); label.textContent = value.toFixed(0); svg.append(label);
  }
  for (const [key, color] of [["momentary", "#806b3b"], ["shortTerm", "#526f78"]]) {
    let path = "", connected = false;
    for (const row of rows) {
      if (!Number.isFinite(row[key])) { connected = false; continue; }
      path += `${connected ? "L" : "M"}${(36 + row.end / result.duration * 804).toFixed(2)} ${y(row[key]).toFixed(2)} `; connected = true;
    }
    svg.append(svgElement("path", { d: path, fill: "none", stroke: color, "stroke-width": 1.6 }));
  }
  svg.append(svgElement("path", { id: "lufs-cursor", d: "M0 0V132", stroke: "#302d28", "stroke-width": 1 }));
  $("loudness-plot").replaceChildren(svg);
}
export function extendedPosition(seconds) {
  if (!result) return;
  $("lufs-cursor")?.setAttribute("transform", `translate(${36 + seconds / result.duration * 804} 0)`);
  const row = result.loudness.timeline[Math.min(result.loudness.timeline.length - 1, Math.floor((seconds + 1e-7) * 10) - 1)];
  $("loudness-current").textContent = `${time(seconds)} · M ${number(row?.momentary)} LUFS / S ${number(row?.shortTerm)} LUFS · 直前100 msの観測値`;
}
function pager(prefix, page, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  $(prefix + "-prev").disabled = page === 0; $(prefix + "-next").disabled = page + 1 >= pages;
  $(prefix + "-page").textContent = total ? `${page * PAGE + 1}〜${Math.min(total, (page + 1) * PAGE)} / ${total}` : "候補なし";
}
function beatCandidate() { const choice = $("tempo-choice").value; return result?.rhythm.candidates[choice === "" ? 0 : Number(choice)]; }
function renderBeats() {
  const candidate = beatCandidate(), beats = candidate?.beats ?? [];
  const svg = svgElement("svg", { viewBox: "0 0 800 36", preserveAspectRatio: "none", "aria-hidden": "true" });
  svg.append(svgElement("path", { d: beats.map((position) => `M${(position / result.duration * 800).toFixed(2)} 5v26`).join(" "), stroke: "#806b3b", "stroke-width": 1.2 }));
  $("beat-plot").replaceChildren(svg);
  $("beat-plot").setAttribute("aria-label", `${candidate ? candidate.bpm.toFixed(1) + " BPMの" : ""}拍候補${beats.length}個。下書きへの選択とは別の表示です。`);
  const buttons = beats.slice(beatPage * PAGE, (beatPage + 1) * PAGE).map((position, i) => {
    const button = element("button", "time-button", `${beatPage * PAGE + i + 1} · ${time(position)}`); button.type = "button";
    button.setAttribute("aria-label", `拍候補${beatPage * PAGE + i + 1}、${time(position)}へ移動`); button.addEventListener("click", () => seek(position)); return button;
  });
  $("beat-list").replaceChildren(...buttons); pager("beat", beatPage, beats.length);
}
function renderChords() {
  const regions = result.harmony.regions;
  $("chord-list").replaceChildren(...regions.slice(chordPage * PAGE, (chordPage + 1) * PAGE).map((region) => {
    const button = element("button", "chord-button"); button.type = "button";
    button.append(element("span", "chord-time", `${time(region.start)} — ${time(region.end)}`), element("strong", "chord-symbol", region.symbol ? `${region.symbol} 候補` : "不明"), element("span", "chord-alternatives", region.candidates.slice(1).map((candidate) => candidate.symbol).join(" / ")));
    button.addEventListener("click", () => seek(region.start)); return button;
  }));
  pager("chord", chordPage, regions.length);
}
function renderSheet() {
  if (!draft) return;
  $("sheet-preview-title").textContent = draft.title;
  $("sheet-meta").textContent = `${draft.sourceName} · テンポ ${draft.bpm === null ? "未選択" : draft.bpm.toFixed(1) + " BPM（選んだ候補）"} · 拍子／小節頭 未判定`;
  $("sheet-lines").replaceChildren(...draft.rows.slice(draftPage * PAGE, (draftPage + 1) * PAGE).map((row) => {
    const line = element("div", "sheet-line"); line.append(element("span", "chord-time", time(row.start)), element("strong", "", row.choice ?? "未選択"), element("span", "sheet-lyric", row.lyric)); return line;
  }));
  const summary = draftSummary(draft);
  $("draft-summary").textContent = `全${summary.rows}区間中、${summary.selected}区間を選択 · 歌詞／メモ${summary.withLyrics}区間 · この端末内の下書き。未保存・未共有。`;
}
function renderDraft() {
  if (!draft) return;
  $("draft-rows").replaceChildren(...draft.rows.slice(draftPage * PAGE, (draftPage + 1) * PAGE).map((row, localIndex) => {
    const index = draftPage * PAGE + localIndex, wrap = element("div", "draft-row"), controls = element("div", "draft-controls");
    const jump = element("button", "time-button", `${time(row.start)} — ${time(row.end)}`); jump.type = "button"; jump.addEventListener("click", () => seek(row.start));
    const label = element("label", "control-label", "コード候補"), select = element("select"); select.id = `draft-choice-${index}`; label.htmlFor = select.id;
    for (const [value, display] of [["", "未選択"], ...row.candidates.map((value) => [value, value + " 候補"]), ["不明", "不明のまま使う"], ["manual", "自分で書く"]]) { const option = element("option", "", display); option.value = value; select.append(option); }
    const manual = element("input"); manual.maxLength = 40; manual.placeholder = "例：C / Am7 / G/B"; manual.setAttribute("aria-label", `${time(row.start)}のコードを自分で書く`);
    const known = row.choice === null || row.choice === "不明" || row.candidates.includes(row.choice);
    select.value = known ? row.choice ?? "" : "manual"; manual.hidden = select.value !== "manual"; if (!known) manual.value = row.choice;
    select.addEventListener("change", () => { manual.hidden = select.value !== "manual"; updateDraftRow(draft, index, { choice: select.value === "manual" ? manual.value : select.value }); renderSheet(); });
    manual.addEventListener("input", () => { updateDraftRow(draft, index, { choice: manual.value }); renderSheet(); });
    const lyricLabel = element("label", "control-label", "歌詞／メモ"), lyric = element("input"); lyric.id = `draft-lyric-${index}`; lyricLabel.htmlFor = lyric.id; lyric.maxLength = 240; lyric.value = row.lyric; lyric.placeholder = "この区間で歌う言葉、演奏のメモ";
    lyric.addEventListener("input", () => { updateDraftRow(draft, index, { lyric: lyric.value }); renderSheet(); });
    controls.append(label, select, manual, lyricLabel, lyric); wrap.append(jump, controls); return wrap;
  }));
  pager("draft", draftPage, draft.rows.length); renderSheet();
}
export function renderExtended(measurement, sourceName) {
  result = measurement;
  $("lufs").textContent = number(result.loudness.integrated);
  $("true-peak").textContent = result.truePeak.state === "unavailable" ? "—" : result.truePeak.db === null ? "−∞" : number(result.truePeak.db);
  const lra = lraDisplay(result.loudness);
  $("lra").textContent = lra.value; $("lra-note").textContent = lra.note;
  const state = result.loudness.state;
  $("loudness-method").textContent = `LUFSはK-weighting、400 ms窓／100 ms間隔、絶対−70 LUFS／相対−10 LUのゲート。Mは400 ms、Sは3秒の完全な窓だけを表示します。今回：${state === "too-short" ? "音源が400 ms未満" : state === "below-gate" ? "無音またはゲート以下" : state === "unavailable" ? "計算できませんでした" : "LUFS-I " + number(result.loudness.integrated)}。`;
  $("true-peak-method").textContent = result.truePeak.state === "unavailable" ? "True Peakは計算できませんでした。" : `True Peakは本体も採用する公開ライブラリebur128 0.1.10。${result.truePeak.factor}倍の補間と100 msごとの連続処理で、元の音源だけを入力します。全曲の最大値と左右の値を表示。規格適合認証・製品バイナリとの数値一致は未完了です。`;
  $("capability-errors").textContent = result.errors.map((error) => `${error.capability}: ${error.message}`).join(" / ");
  const rhythm = result.rhythm, harmony = result.harmony;
  $("rhythm-summary").textContent = rhythm.candidates.length ? `第一候補 ${rhythm.candidates[0].bpm.toFixed(1)} BPM · ${rhythm.candidates[0].beats.length}個の拍位置。倍・半分の候補も確認できます。` : rhythm.reason ?? "拍候補を計算できませんでした。";
  $("tempo-choice").replaceChildren(element("option", "", "未選択（表示は第一候補）")); $("tempo-choice").firstChild.value = "";
  rhythm.candidates.forEach((candidate, i) => { const option = element("option", "", `${candidate.bpm.toFixed(1)} BPM · 拍${candidate.beats.length}個`); option.value = i; $("tempo-choice").append(option); });
  $("tempo-choice").disabled = !rhythm.candidates.length;
  $("harmony-summary").textContent = harmony.regions.length ? `${harmony.regions.length}区間を表示。候補を押して聴き直し、別の候補も確認します。` : "コード候補を計算できませんでした。";
  $("music-results").hidden = false; $("draft-entry").hidden = false; $("make-draft").disabled = !harmony.regions.length;
  $("draft-entry").dataset.sourceName = sourceName;
  drawLoudness(); renderBeats(); renderChords(); extendedPosition(0);
}
export function initializeFlow(seekTo) {
  seek = seekTo;
  $("tempo-choice").addEventListener("change", () => { beatPage = 0; renderBeats(); if (draft) { if ($("tempo-choice").value === "") draft.bpm = null; else chooseTempo(draft, result, Number($("tempo-choice").value)); renderSheet(); } });
  for (const direction of ["prev", "next"]) {
    $("beat-" + direction).addEventListener("click", () => { beatPage += direction === "prev" ? -1 : 1; renderBeats(); });
    $("chord-" + direction).addEventListener("click", () => { chordPage += direction === "prev" ? -1 : 1; renderChords(); });
    $("draft-" + direction).addEventListener("click", () => { draftPage += direction === "prev" ? -1 : 1; renderDraft(); });
  }
  $("make-draft").addEventListener("click", () => {
    if (!result) return;
    if (!draft) { draft = createDraft(result, $("draft-entry").dataset.sourceName); draftPage = 0; $("sheet-title").value = draft.title; if ($("tempo-choice").value !== "") chooseTempo(draft, result, Number($("tempo-choice").value)); }
    renderDraft(); $("draft-section").hidden = false; $("sheet-title").focus({ preventScroll: true });
    $("draft-section").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  $("sheet-title").addEventListener("input", (event) => { if (draft) { draft.title = event.target.value || "コード譜の下書き"; renderSheet(); } });
}
