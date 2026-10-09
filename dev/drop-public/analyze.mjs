import { measureWav } from '../drop-preview/measure.mjs';
import { loadCommonCores, measureCommonLevel, measureCommonPsycho } from '../drop-preview/wasm-core.mjs';
import { validatePublicInput } from './policy.mjs';
export async function analyzePublicWav(buffer, progress = () => {}, readBytes) {
  const audio = validatePublicInput(buffer);
  progress({phase: 'signal'});
  const result = measureWav(buffer);
  result.loudness = {state: 'unavailable', integrated: null, lra: null, timeline: []};
  result.truePeak = {state: 'unavailable', db: null, timeline: []};
  result.psycho = {state: 'unavailable', timeline: []};
  result.errors = [];
  const cores = await loadCommonCores(readBytes);
  for (const [index, capability, operation] of [
    [0, 'loudness', () => Object.assign(result, measureCommonLevel(audio, cores[0], progress))],
    [1, 'psychoacoustics', () => {result.psycho = measureCommonPsycho(audio, cores[1], progress);}],
  ]) {
    try { if (cores[index].error) throw new Error('core-unavailable'); operation(); }
    catch {result.errors.push({capability, message: 'core-unavailable'});}
  }
  // No music estimator, fabricated defaults, private engine, or legacy DSP fallback.
  return result;
}
