// An ephemeral rehearsal document, NOT a Kirin OS artifact or a saved Song.
const text = (value, limit) => String(value ?? "").slice(0, limit);
export function createDraft(result, sourceName) {
  return {
    sourceName: text(sourceName, 200), title: "コード譜の下書き", recipe: result.recipe,
    bpm: null, meter: null, persisted: false, shared: false,
    rows: result.harmony.regions.map((region) => ({ start: region.start, end: region.end, candidates: region.candidates.map((candidate) => candidate.symbol), choice: null, lyric: "" })),
  };
}
export function updateDraftRow(draft, index, { choice, lyric } = {}) {
  const row = draft.rows[index];
  if (!row) throw new Error("この音源には指定した区間がありません。");
  if (choice !== undefined) row.choice = choice === null || choice === "" ? null : text(choice, 40).trim() || null;
  if (lyric !== undefined) row.lyric = text(lyric, 240);
  return row;
}
export function chooseTempo(draft, result, index) {
  const candidate = result.rhythm.candidates[index];
  if (!candidate) throw new Error("拍候補を選び直してください。");
  draft.bpm = candidate.bpm; // explicit user choice, still not a verified tempo
  draft.meter = null; // no implied 4/4 or downbeat
}
export function draftSummary(draft) {
  return { rows: draft.rows.length, selected: draft.rows.filter((row) => row.choice !== null).length, withLyrics: draft.rows.filter((row) => row.lyric.trim()).length, bpm: draft.bpm, meter: draft.meter, persisted: draft.persisted, shared: draft.shared };
}
