import { decodeWav, measureWav } from "./measure.mjs";
import { loadCommonCores, measureCommonLevel, measureCommonPsycho } from "./wasm-core.mjs";
import { analyzeMusic } from "./music.mjs";

export async function analyzeWav(buffer, progress = () => {}, readCoreBytes) {
  progress({ phase: "signal" });
  const result = measureWav(buffer), audio = decodeWav(buffer);
  const errors = [];
  const run = (name, operation, fallback) => {
    progress({ phase: name });
    try { return operation(); } catch (error) { errors.push({ capability: name, message: error.message }); return fallback; }
  };
  result.loudness = { state: "unavailable", integrated: null, lra: null, timeline: [] };
  result.truePeak = { state: "unavailable", db: null, timeline: [] };
  result.psycho = { state: "unavailable", timeline: [] };
  progress({ phase: "engine" });
  try {
    const [level, psycho] = await loadCommonCores(readCoreBytes);
    if (level.error) errors.push({ capability: "loudness", message: level.error });
    else {
      const levels = run("loudness", () => measureCommonLevel(audio, level, progress), null);
      if (levels) Object.assign(result, levels);
    }
    if (psycho.error) errors.push({ capability: "psychoacoustics", message: psycho.error });
    else result.psycho = run("psychoacoustics", () => measureCommonPsycho(audio, psycho, progress), result.psycho);
  } catch (error) { errors.push({ capability: "engine", message: error.message }); }
  const music = run("music", () => analyzeMusic(audio), { rhythm: { state: "unavailable", candidates: [], onsets: [], meter: null, downbeats: [] }, harmony: { state: "unavailable", regions: [] } });
  return { ...result, ...music, errors, recipe: "hp-common-core-v1", productParity: "not-accepted" };
}
