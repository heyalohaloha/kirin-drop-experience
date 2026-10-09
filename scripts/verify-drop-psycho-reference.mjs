// Independent, public MoSQITo golden values, not a second build of this wrapper.
// Synthetic signals only. No product/hardware build, user audio or upload.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadCommonCores, measureCommonPsycho } from "../dev/drop-preview/wasm-core.mjs";
const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, "dev/reference-data");
const pin = "6ba9fe20e681d369c1de08e1c74b1ef2406dc010";
const files = ["mosqito_phase_d_1_2_1.json", "mosqito_perceptual_delta_1_2_1.json"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const importAt = process.argv.indexOf("--import-public-fixtures");
if (importAt !== -1) {
  const checkout = path.resolve(process.argv[importAt + 1]);
  const manifest = [];
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    const original = "crates/kirin_measure/tests/fixtures/" + file;
    const bytes = execFileSync("git", ["show", `${pin}:${original}`], { cwd: checkout });
    await writeFile(path.join(directory, file), bytes); // Byte-for-byte public fixture vendoring.
    manifest.push({ file, original, sha256: hash(bytes), url: `https://github.com/heyalohaloha/kirin_hypha/blob/${pin}/${original}` });
  }
  await writeFile(path.join(directory, "source.json"), JSON.stringify({ schema: 1, commit: pin, repository: "https://github.com/heyalohaloha/kirin_hypha", license: "GPL-3.0-only", reference: "MoSQITo 1.2.1 / Apache-2.0", files: manifest }, null, 2) + "\n");
}
const manifest = JSON.parse(await readFile(path.join(directory, "source.json"), "utf8"));
assert.equal(manifest.commit, pin);
for (const file of manifest.files) assert.equal(hash(await readFile(path.join(directory, file.file))), file.sha256);
const fixture = JSON.parse(await readFile(path.join(directory, files[1]), "utf8"));
const phase = JSON.parse(await readFile(path.join(directory, files[0]), "utf8"));
assert.equal(fixture.reference.library, "MoSQITo"); assert.equal(fixture.reference.version, "1.2.1"); assert.equal(fixture.reference.sample_rate_hz, 48000); assert.equal(fixture.reference.aperture_samples, 4800);
const [, core] = await loadCommonCores((name) => readFile(path.join(root, "dev/drop-preview", name)));
const rate = 48000, amplitude = .00002 * 10 ** (94 / 20) * Math.SQRT2;
const signal = (seconds, sample) => ({ sampleRate: rate, channels: 1, frames: Math.round(seconds * rate), duration: seconds, readSample: (_, i) => sample(i) });
const step = signal(3, (i) => i >= rate / 2 && i < rate * 2 ? amplitude * Math.sin(2 * Math.PI * 1000 * i / rate) : 0);
const silent = signal(3, () => 1e-20);
const result = measureCommonPsycho(step, core), baseline = measureCommonPsycho(silent, core);
assert.equal(result.timeline.length, fixture.post_minus_pre.length);
const differences = result.timeline.map((row, i) => {
  const actual = row.sharpness - baseline.timeline[i].sharpness, expected = fixture.post_minus_pre[i];
  const difference = Math.abs(actual - expected);
  assert.ok(difference <= fixture.tolerance_acum, `Endpoint ${row.end}: ${actual} != ${expected} ±${fixture.tolerance_acum} acum`);
  assert.equal(row.time, Math.round(row.end * 2000 - 1) / 2000);
  return { time: row.time, actual, expected, difference };
});
const silentReference = phase.signals.find((row) => row.id === "silence");
assert.equal(baseline.loudness, silentReference.n_mean); assert.equal(baseline.sharpness, silentReference.s_mean);
const stepReference = phase.signals.find((row) => row.id === "step_1khz_94db");
assert.equal(stepReference.statistics_from_frame, 0);
const loudnessDifference = Math.abs(result.loudness - stepReference.n_mean), loudnessTolerance = Math.max(phase.tolerance.loudness_absolute_sone, Math.abs(stepReference.n_mean) * phase.tolerance.loudness_relative);
const sharpnessMeanDifference = Math.abs(result.sharpness - stepReference.s_mean);
// HP averages all 2 kHz frames; the saved reference averages its 500 Hz output.
// Keep that sampling distinction and the inherited tolerance explicit.
assert.ok(loudnessDifference <= loudnessTolerance, `Step N mean differs by ${loudnessDifference} sone`);
assert.ok(sharpnessMeanDifference <= phase.tolerance.sharpness_absolute_acum, `Step S mean differs by ${sharpnessMeanDifference} acum`);
console.log(JSON.stringify({ state: "limited-public-reference-pass", reference: "MoSQITo 1.2.1 saved public golden (not regenerated in this run)", publicFixtureCommit: pin, sharpnessEndpoints: differences.length, toleranceAcum: fixture.tolerance_acum, worstDifferenceAcum: Math.max(...differences.map((row) => row.difference)), stepMean: { loudness: result.loudness, referenceLoudness: stepReference.n_mean, loudnessDifferenceSone: loudnessDifference, loudnessToleranceSone: loudnessTolerance, sharpness: result.sharpness, referenceSharpness: stepReference.s_mean, sharpnessDifferenceAcum: sharpnessMeanDifference, sampling: "HP 2000 Hz / saved reference 500 Hz" }, silence: { loudness: baseline.loudness, sharpness: baseline.sharpness }, sourceTimestamp: "2 kHz endpoint: (frameCount-1)/2000", productBinaryParity: "not-tested", isoCertification: "not-claimed", rows: differences }, null, 2));
