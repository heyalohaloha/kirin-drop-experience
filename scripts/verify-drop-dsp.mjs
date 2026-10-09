// Local reference gate. Default retains the historical independent-JS diagnostic;
// --common checks the current public Wasm level core with the same tolerances.
// Uses only in-memory synthetic WAVs; no network,
// user media, OS engine, hardware or saved fixtures. Does not install FFmpeg.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createDemoWav, decodeWav } from "../dev/drop-preview/measure.mjs";
import { measureLoudness, measureTruePeak } from "../dev/drop-preview/loudness.mjs";
import { loadCommonCores, measureCommonLevel } from "../dev/drop-preview/wasm-core.mjs";
const common = process.argv.includes("--common");
const [commonCore] = common ? await loadCommonCores((name) => readFile(new URL("../dev/drop-preview/" + name, import.meta.url))) : [];
const measure = (audio) => common ? measureCommonLevel(audio, commonCore) : { loudness: measureLoudness(audio), truePeak: measureTruePeak(audio) };
const version = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
if (version.status !== 0) { console.error("Reference check NOT RUN: ffmpeg is unavailable."); process.exit(2); }

function wav(rate, seconds, channels, sample) {
  const frames = Math.round(rate * seconds), align = channels * 8, buffer = new ArrayBuffer(44 + frames * align), view = new DataView(buffer);
  const tag = (at, text) => [...text].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * align, true); view.setUint16(32, align, true); view.setUint16(34, 64, true); tag(36, "data"); view.setUint32(40, frames * align, true);
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < channels; ch++) view.setFloat64(44 + i * align + ch * 8, sample(ch, i, frames), true);
  return buffer;
}
function reference(buffer) {
  const output = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-af", "ebur128=peak=true:metadata=1,ametadata=print:file=-", "-f", "null", "-"], { input: Buffer.from(buffer), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(output.status, 0, output.stderr);
  const records = [], lines = output.stdout.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("frame:")) records.push({});
    const match = line.match(/^lavfi\.r128\.(M|S|I|true_peak)=(-?[0-9.]+)$/);
    if (match && records.length) records.at(-1)[match[1]] = Number(match[2]);
  }
  assert.ok(records.length, "No FFmpeg measurement metadata");
  return records;
}
const fixtures = [];
for (const rate of [8000, 32000, 44100, 48000, 96000]) for (const channels of [1, 2]) fixtures.push({ name: `997Hz-${rate}-${channels}ch-tapered`, buffer: wav(rate, 3.2, channels, (ch, i, frames) => .1 * Math.sin(2 * Math.PI * 997 * i / rate) * (ch ? -1 : 1) * Math.min(1, i / (rate * .01), (frames - i - 1) / (rate * .01))) });
if (common) for (const channels of [1, 2]) fixtures.push({ name: `997Hz-192000-${channels}ch-tapered`, buffer: wav(192000, 3.2, channels, (ch, i, frames) => .1 * Math.sin(2 * Math.PI * 997 * i / 192000) * (ch ? -1 : 1) * Math.min(1, i / 1920, (frames - i - 1) / 1920)) });
fixtures.push({ name: "relative-gate", buffer: wav(48000, 8, 1, (_, i) => (i < 48000 * 4 ? .1 : .001) * Math.sin(2 * Math.PI * 997 * i / 48000)) });
for (const fraction of [.25, .4, .45]) fixtures.push({ name: `intersample-${fraction}fs`, buffer: wav(48000, 1, 1, (_, i, frames) => .9 * Math.sin(2 * Math.PI * fraction * i + Math.PI / 4) * Math.min(1, i / 480, (frames - i - 1) / 480)) });
fixtures.push({ name: "synthetic-chord-demo", buffer: createDemoWav() });

const rows = [];
for (const fixture of fixtures) {
  const audio = decodeWav(fixture.buffer), measurement = measure(audio), loudness = measurement.loudness, peak = measurement.truePeak, ref = reference(fixture.buffer), last = ref.at(-1);
  const integratedDifference = Math.abs(loudness.integrated - last.I), truePeakDifference = Math.abs(peak.db - 20 * Math.log10(last.true_peak));
  const mDifferences = loudness.timeline.map((row, i) => row.momentary === null ? null : Math.abs(row.momentary - ref[i].M)).filter(Number.isFinite);
  const sDifferences = loudness.timeline.map((row, i) => row.shortTerm === null ? null : Math.abs(row.shortTerm - ref[i].S)).filter(Number.isFinite);
  const row = { name: fixture.name, integrated: loudness.integrated, referenceIntegrated: last.I, integratedDifference, truePeak: peak.db, referenceTruePeak: 20 * Math.log10(last.true_peak), truePeakDifference, maxMomentaryDifference: Math.max(0, ...mDifferences), maxShortTermDifference: Math.max(0, ...sDifferences) };
  rows.push(row);
  // FFmpeg metadata is quantized to .001 LU and .001 linear amplitude. Tests
  // cover these fixtures, not certification, real music, or Kirin OS parity.
  assert.ok(integratedDifference <= .1, JSON.stringify(row));
  assert.ok(truePeakDifference <= .2, JSON.stringify(row));
  assert.ok(row.maxMomentaryDifference <= .1 && row.maxShortTermDifference <= .1, JSON.stringify(row));
}
// Keep a known edge diagnostic; do not erase a mismatch by replacing a fixture
// with a tapered one. Offline centered/zero-padded FIR and a streaming reference
// have different terminal behaviour. Product parity remains UNACCEPTED.
const edge = wav(8000, 3.2, 1, (_, i) => .1 * Math.sin(2 * Math.PI * 997 * i / 8000));
const edgePeak = measure(decodeWav(edge)).truePeak.db, edgeReference = 20 * Math.log10(reference(edge).at(-1).true_peak);
const boundaryDiagnostic = { name: "untapered-terminal-997Hz-8000", truePeak: edgePeak, referenceTruePeak: edgeReference, differenceDB: Math.abs(edgePeak - edgeReference), state: "needs-product-parity-review" };
console.log(JSON.stringify({ state: "limited-fixture-pass", engine: common ? "ebur128-0.1.10-Wasm" : "historical-independent-JS", reference: version.stdout.split("\n")[0], fixtureCount: rows.length, worstIntegratedDifferenceLU: Math.max(...rows.map((row) => row.integratedDifference)), worstMomentaryDifferenceLU: Math.max(...rows.map((row) => row.maxMomentaryDifference)), worstShortTermDifferenceLU: Math.max(...rows.map((row) => row.maxShortTermDifference)), worstTruePeakDifferenceDB: Math.max(...rows.map((row) => row.truePeakDifference)), boundaryDiagnostic, productParity: "not-accepted", browserVerification: "not-run", rows }, null, 2));
