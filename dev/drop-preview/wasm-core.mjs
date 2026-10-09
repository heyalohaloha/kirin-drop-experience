// Only these two static resources are fetched. Never transmit input/filenames/results.
const finite = (value) => Number.isFinite(value) ? value : null;
const db = (value) => value > 0 && Number.isFinite(value) ? 20 * Math.log10(value) : null;
const filenames = ["level-core.wasm", "psycho-core.wasm"];
export async function loadCommonCores(readBytes = async (name) => {
  const response = await fetch(new URL(name, import.meta.url), { credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`計算エンジンを読み込めませんでした（${response.status}）。`);
  return response.arrayBuffer();
}) {
  const outcomes = await Promise.allSettled(filenames.map(async (name) => {
    const bytes = await readBytes(name);
    if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("計算エンジンのサイズが上限を超えています。");
    const module = await WebAssembly.compile(bytes);
    if (WebAssembly.Module.imports(module).length) throw new Error("外部機能を要求する計算エンジンは実行できません。");
    const core = (await WebAssembly.instantiate(module)).exports;
    if (core.core_version() !== 1) throw new Error("計算エンジンの版が一致しません。");
    return core;
  }));
  return outcomes.map((outcome) => outcome.status === "fulfilled" ? outcome.value : { error: outcome.reason?.message ?? "計算エンジンを読み込めませんでした。" });
}
function initialise(core, audio) {
  if (core.core_init(audio.sampleRate, audio.channels) !== 0) throw new Error("計算エンジンを初期化できませんでした。");
}
function push(core, audio, start, end) {
  const length = (end - start) * audio.channels;
  if (length > core.core_input_capacity()) throw new Error("測定区間の長さが上限を超えています。");
  // Recreate the view after any Wasm memory growth; do not retain detached buffers.
  const input = new Float64Array(core.memory.buffer, core.core_input_ptr(), length);
  for (let frame = start, i = 0; frame < end; frame++) for (let channel = 0; channel < audio.channels; channel++) input[i++] = audio.readSample(channel, frame);
  if (core.core_push(length) !== 0) throw new Error("音源の値を計算できませんでした。");
}
export function measureCommonLevel(audio, core, progress = () => {}) {
  initialise(core, audio);
  const step = Math.floor(audio.sampleRate / 10), timeline = [], peakTimeline = [];
  try {
    for (let offset = 0; offset < audio.frames; offset += step) {
      const end = Math.min(audio.frames, offset + step);
      push(core, audio, offset, end);
      timeline.push({ start: offset / audio.sampleRate, end: end / audio.sampleRate, momentary: end >= .4 * audio.sampleRate ? finite(core.core_read(1, 0)) : null, shortTerm: end >= 3 * audio.sampleRate ? finite(core.core_read(2, 0)) : null });
      const channelDb = Array.from({ length: audio.channels }, (_, channel) => db(core.core_read(5, channel)));
      peakTimeline.push({ start: offset / audio.sampleRate, end: end / audio.sampleRate, db: channelDb.every((v) => v === null) ? null : Math.max(...channelDb.filter(Number.isFinite)), channelDb });
      if (timeline.length % 10 === 0) progress({ phase: "loudness", fraction: end / audio.frames });
    }
    const integrated = audio.duration >= .4 ? finite(core.core_read(0, 0)) : null;
    const channelLinear = Array.from({ length: audio.channels }, (_, channel) => core.core_read(4, channel));
    const lra = audio.duration >= 3 && integrated !== null ? finite(core.core_read(3, 0)) : null;
    return {
      loudness: { state: audio.duration < .4 ? "too-short" : integrated === null ? "below-gate" : "measured", integrated, timeline, lra, lraState: audio.duration < 3 ? "too-short" : integrated === null ? "below-gate" : lra === null ? "unavailable" : audio.duration < 60 ? "provisional" : "measured", relativeGate: finite(core.core_read(6, 0)), engine: "ebur128-0.1.10", channelPolicy: "EBU-independent-channel-power", tail: "original-samples-only-no-flush" },
      truePeak: { state: channelLinear.every((v) => v === 0) ? "silence" : "measured", db: db(Math.max(...channelLinear)), channelDb: channelLinear.map(db), channelLinear, timeline: peakTimeline, factor: audio.sampleRate < 96000 ? 4 : audio.sampleRate < 192000 ? 2 : 1, engine: "ebur128-0.1.10", tail: "original-samples-only-no-flush" },
    };
  } finally { core.core_drop(); }
}
export function measureCommonPsycho(audio, core, progress = () => {}) {
  initialise(core, audio);
  const step = Math.floor(audio.sampleRate / 10), timeline = [];
  let lastFrame = 0;
  const capture = () => {
    const frames = core.core_read(42, 0);
    if (frames <= lastFrame) return;
    const end = Math.min(audio.duration, core.core_read(43, 0));
    timeline.push({ start: lastFrame / 2000, end, time: Math.max(0, (frames - 1) / 2000), loudness: finite(core.core_read(0, 0)), sharpness: finite(core.core_read(1, 0)), specific: Array.from({ length: 20 }, (_, b) => finite(core.core_read(b + 2, 0))), psb: Array.from({ length: 20 }, (_, b) => finite(core.core_read(b + 22, 0))) });
    lastFrame = frames;
  };
  try {
    for (let offset = 0; offset < audio.frames; offset += step) {
      const end = Math.min(audio.frames, offset + step);
      push(core, audio, offset, end); capture();
      if (offset % (step * 10) === 0) progress({ phase: "psychoacoustics", fraction: end / audio.frames });
    }
    if (core.core_finish() !== 0) throw new Error("心理音響の終端を計算できませんでした。");
    capture();
    const means = Array.from({ length: 42 }, (_, field) => finite(core.core_read(field, 1)));
    if (means.some((v) => v === null || v < 0)) throw new Error("心理音響の結果を計算できませんでした。");
    return { state: "measured", loudness: means[0], sharpness: means[1], specific: means.slice(2, 22), psb: means.slice(22), timeline, frames: lastFrame, engine: "Hypha-PhaseD-6ba9fe20", channelPolicy: "independent-channel-arithmetic-mean", sampleRate: 48000, sourceSampleRate: audio.sampleRate, soundField: "free", assumedFullScalePa: 1, assumedFullScaleSPL: 20 * Math.log10(1 / .00002), internalHz: 2000, slotFrames: 4800, aggregation: "all-2kHz-frames-mean", groupBarkWidth: 1.2, productParity: "not-accepted" };
  } finally { core.core_drop(); }
}
