// Local build generation only. Never builds/changes either shipping product or deploys.
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (args, flags) => execFileSync("cargo", args, { cwd: root, stdio: "inherit", env: { ...process.env, RUSTFLAGS: flags } });
function reproducibleFlags(manifest) {
  if (process.env.RUSTFLAGS) throw new Error('Review existing RUSTFLAGS before a reproducible build; do not override them silently');
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--offline', '--locked', '--format-version', '1', '--manifest-path', manifest], {cwd: root, encoding: 'utf8'}));
  const mappings = [`--remap-path-prefix=${root}=/kirin-drop`];
  for (const pkg of metadata.packages.filter(pkg => pkg.source)) {
    if (pkg.source !== 'registry+https://github.com/rust-lang/crates.io-index') throw new Error('Unreviewed compiler source');
    mappings.push(`--remap-path-prefix=${path.dirname(pkg.manifest_path)}=/kirin-drop-dependencies/${pkg.name}-${pkg.version}`);
  }
  return mappings.join(' ');
}
const importAt = process.argv.indexOf("--import-hypha");
if (importAt !== -1) {
  const source = path.resolve(process.argv[importAt + 1]);
  const pin = "6ba9fe20e681d369c1de08e1c74b1ef2406dc010";
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
  if (head !== pin) throw new Error("Hypha source is not the audited pin. Do not silently import a different engine.");
  const phaseFiles = ["calc_slopes.rs", "core_loudness.rs", "display.rs", "filter_bank.rs", "nonlinear_decay.rs", "sharpness.rs", "spectral_balance.rs", "stft.rs", "stream.rs", "tables.rs", "tables/tables_psb.rs", "temporal_weighting.rs"];
  const files = [...phaseFiles.map((file) => ["crates/kirin_measure/src/phase_d/" + file, "phase_d/" + file]), ["crates/kirin_measure/src/resampler.rs", "resampler.rs"], ["LICENSE", "LICENSE"]];
  const manifest = [];
  for (const [original, destination] of files) {
    const committed = execFileSync("git", ["show", `${pin}:${original}`], { cwd: source, maxBuffer: 4 * 1024 * 1024 });
    const bytes = await readFile(path.join(source, original));
    if (!committed.equals(bytes)) throw new Error(`Dirty source is not authorised for import: ${original}`);
    const target = path.join(root, "dev/psycho-core/vendor", destination);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes); // Mechanical byte-for-byte vendoring, never private OS source.
    manifest.push({ original, destination, sha256: digest(bytes) });
  }
  await writeFile(path.join(root, "dev/psycho-core/vendor/source.json"), JSON.stringify({ product: "Kirin Hypha", commit: pin, license: "GPL-3.0-only", modifiedCalculations: false, files: manifest }, null, 2) + "\n");
}
const provenance = JSON.parse(await readFile(path.join(root, "dev/psycho-core/vendor/source.json"), "utf8"));
for (const file of provenance.files) {
  if (digest(await readFile(path.join(root, "dev/psycho-core/vendor", file.destination))) !== file.sha256) throw new Error(`Vendored calculation changed: ${file.destination}`);
}
const receipt = { schema: 1, recipe: "hp-common-core-v2", sourcePaths: "crate and pinned registry dependency paths remapped; private paths excluded", rustc: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(), publicDeployment: "not-approved", productBinaryParity: "not-tested", cores: {} };
const sourceCandidate = await readFile(path.join(root, 'source-manifest.json'), 'utf8').then(JSON.parse, error => {if (error.code === 'ENOENT') return null; throw error;});
if (sourceCandidate && (sourceCandidate.originalBinaryReceipt?.recipe !== receipt.recipe || sourceCandidate.originalBinaryReceipt?.rustc !== receipt.rustc)) throw new Error('Candidate compiler/recipe does not match its original binary receipt');
for (const [directory, crate, output, license] of [["measurement-core", "kirin_web_level_core", "level-core.wasm", "MIT dependency"], ["psycho-core", "kirin_web_psycho_core", "psycho-core.wasm", "GPL-3.0-only"]]) {
  const manifest = `dev/${directory}/Cargo.toml`;
  const hasLock = await readFile(path.join(root, `dev/${directory}/Cargo.lock`)).then(() => true, () => false);
  if (!hasLock) throw new Error('Pinned Cargo.lock required before building');
  const flags = reproducibleFlags(manifest);
  run(["build", "--offline", "--locked", "--manifest-path", manifest, "--target", "wasm32-unknown-unknown", "--lib", "--release"], flags);
  run(["build", "--offline", "--locked", "--manifest-path", manifest, "--bin", "reference", "--release"], flags);
  const source = path.join(root, `dev/${directory}/target/wasm32-unknown-unknown/release/${crate}.wasm`);
  const bytes = await readFile(source);
  if (sourceCandidate) {
    const original = sourceCandidate.originalBinaryReceipt.cores[directory];
    if (original?.sha256 !== digest(bytes) || original.bytes !== bytes.length) throw new Error('Rebuilt core does not match original candidate: ' + directory);
  }
  await copyFile(source, path.join(root, "dev/drop-preview", output));
  receipt.cores[directory] = { wasm: output, sha256: digest(bytes), bytes: bytes.length, license, cargoLockSha256: digest(await readFile(path.join(root, `dev/${directory}/Cargo.lock`))) };
}
receipt.psychoSource = { commit: provenance.commit, manifestSha256: digest(await readFile(path.join(root, "dev/psycho-core/vendor/source.json"))) };
await writeFile(path.join(root, "dev/drop-preview/core-build.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log("Built two local-only cores; shipping products and public payload are unchanged.");
if (sourceCandidate) console.log('Both candidate WASM binaries reproduced byte-for-byte.');
