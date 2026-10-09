// Native vs Wasm comparison of the same pinned public calculations.
// NOT a comparison with shipping OS/Hypha binaries, certification or a browser test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadCommonCores, measureCommonLevel, measureCommonPsycho } from "../dev/drop-preview/wasm-core.mjs";
const root = path.resolve(import.meta.dirname, "..");
const [level, psycho] = await loadCommonCores((name) => readFile(path.join(root, "dev/drop-preview", name)));
const near = (actual, expected, label, tolerance = 1e-8) => {
  if (actual === null || expected === null) assert.equal(actual, expected, label);
  else assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
};
const rows = [];
for (const rate of [8000, 44100, 48000, 96000, 192000]) for (const channels of [1, 2]) {
  const frames = Math.round(rate * 3.2), input = Buffer.alloc(frames * channels * 8);
  const audio = { sampleRate: rate, channels, frames, duration: 3.2, readSample: (ch, i) => .1 * Math.sin(2 * Math.PI * 997 * i / rate) * (ch ? -1 : 1) };
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < channels; ch++) input.writeDoubleLE(audio.readSample(ch, i), (i * channels + ch) * 8);
  const native = (directory) => {
    const result = spawnSync(path.join(root, "dev", directory, "target/release/reference"), [String(rate), String(channels)], { input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
  };
  const l = measureCommonLevel(audio, level), n = native("measurement-core");
  near(l.loudness.integrated, n.integrated, "integrated"); near(l.loudness.lra, n.lra, "LRA");
  n.channelPeak.forEach((peak, channel) => near(l.truePeak.channelLinear[channel], peak, "channel TP"));
  l.loudness.timeline.forEach((row, i) => {
    if (row.momentary !== null) near(row.momentary, n.rows[i][0], "M");
    if (row.shortTerm !== null) near(row.shortTerm, n.rows[i][1], "S");
    near(l.truePeak.timeline[i].db, n.rows[i][2] > 0 ? 20 * Math.log10(n.rows[i][2]) : null, "block TP");
  });
  const p = measureCommonPsycho(audio, psycho), pn = native("psycho-core");
  const means = [p.loudness, p.sharpness, ...p.specific, ...p.psb];
  means.forEach((value, i) => near(value, pn.means[i], `psycho ${i}`)); assert.equal(p.frames, pn.frames);
  rows.push({ rate, channels, integratedDifferenceLU: Math.abs(l.loudness.integrated - n.integrated), theoretical997HzDifferenceLU: Math.abs(l.loudness.integrated - (-23.01 + (channels === 2 ? 10 * Math.log10(2) : 0))), maxPsychoDifference: Math.max(...means.map((value, i) => Math.abs(value - pn.means[i]))) });
}
console.log(JSON.stringify({ state: "same-public-core-native-wasm-fixture-pass", fixtures: rows.length, worstIntegratedDifferenceLU: Math.max(...rows.map((r) => r.integratedDifferenceLU)), worstPsychoDifference: Math.max(...rows.map((r) => r.maxPsychoDifference)), theoretical192kHzTightGate: "not-met-.02-LU", productBinaryParity: "not-tested", browserVerification: "not-run", rows }, null, 2));
