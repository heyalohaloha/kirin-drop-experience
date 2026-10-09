// Owner-approved presentation only. Never resolve imports inside the private OS repository.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourceCommit } from './kirin-presentation-source.mjs';
export const instrumentSources = Object.freeze([
  'src/components/common/KirinEye.jsx', 'src/components/common/kirinEyeModel.js',
  'src/components/common/KirinVuPair.jsx', 'src/components/common/kirinVuModel.js',
  'src/styles/kirinInstruments.css',
]);
const directory = path.resolve(import.meta.dirname, '../dev/drop-preview/kirin-ui/instruments');
const hostFiles = ['entry.jsx', 'host-hooks.mjs', 'reading.mjs', 'package.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function replaceExact(text, from, to) {
  if (!text.includes(from)) throw new Error('Pinned component boundary changed; review required');
  return text.replace(from, to);
}
export function instrumentFiles(sources) {
  let eye = sources[instrumentSources[0]];
  eye = replaceExact(eye, "'../../hooks/useStoneLight.js'", "'./host-hooks.mjs'");
  let model = sources[instrumentSources[1]];
  model = replaceExact(model, "import { observationBarkMeans } from '../../services/workObservationModel.js'\n", '');
  const modelEnd = model.indexOf('\nfunction reading(');
  if (modelEnd < 0) throw new Error('Eye model boundary changed');
  // Keep the exact display mapping only. Product artifacts/terrain readers are not imported.
  model = model.slice(0, modelEnd) + '\n';
  let vu = sources[instrumentSources[2]];
  vu = replaceExact(vu, "import { useTranslation } from 'react-i18next'", "import { useTranslation } from './host-hooks.mjs'");
  vu = replaceExact(vu, "import useJungleMode from '../../hooks/useJungleMode.js'\n", '');
  vu = replaceExact(vu, "import KirinJungleVuWindow from './KirinJungleVuWindow.jsx'\n", '');
  vu = replaceExact(vu, '// ジャングルでは、Hypha の VU と同じ構図の暗いガラスの窓（KirinJungleVuWindow）に替える。感度のつまみは共通。\n', '// HP体験は通常モードのみ。\n');
  vu = replaceExact(vu, "const STORAGE_KEY = 'kirin.vu.reference'\n", '');
  const storeStart = vu.indexOf('function storedReference() {');
  const storeEnd = vu.indexOf('// 感度のつまみ。', storeStart);
  if (storeStart < 0 || storeEnd < 0) throw new Error('VU preference boundary changed');
  vu = vu.slice(0, storeStart) + vu.slice(storeEnd);
  vu = replaceExact(vu, '  const jungle = useJungleMode()\n', '');
  vu = replaceExact(vu, 'useState(storedReference)', 'useState(-18)');
  vu = replaceExact(vu, "    try { window.localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* 保存できない時は、この画面の間だけ */ }\n", '');
  vu = replaceExact(vu, '{jungle ? <KirinJungleVuWindow level={level} reference={reference} label={label} /> : <span', '<span');
  vu = replaceExact(vu, '    </span>}\n', '    </span>\n');
  vu = replaceExact(vu, ' caption={jungle ? `0 VU = ${referenceLabel} dBFS` : null}', '');
  const css = sources[instrumentSources[4]];
  const cssEnd = css.indexOf('/* ── ジャングルの VU');
  if (cssEnd < 0) throw new Error('Instrument CSS boundary changed');
  let selectedCss = css.slice(0, cssEnd)
    .replace(' filter: drop-shadow(0 0 12px rgb(233 203 147 / .14));', '')
    .replace(/^button\[data-kirin-eye-frame\]:hover.*\n/m, '');
  // Retain the exact OS purpose-specific motion exceptions, without other product selectors.
  const motion = css.split('\n').filter(line => line.includes('!important') && /^\[data-kirin-(?:eye|vu)/.test(line) && !line.includes('jungle'));
  selectedCss += '\n' + motion.join('\n') + '\n@media (prefers-reduced-motion: reduce) {\n  [data-kirin-eye] *, [data-kirin-eye-open="true"] [data-kirin-eye-spark] { animation: none !important; transition: none !important; }\n  [data-kirin-vu-needle], [data-kirin-vu-needle-shadow] { transition: transform .12s linear !important; }\n  [data-kirin-vu-knob] i, [data-kirin-vu-lamp] { transition: none !important; }\n}\n';
  // The OS transition line also includes jungle selectors; choose the identical normal-mode rule.
  selectedCss += '[data-kirin-vu-needle], [data-kirin-vu-needle-shadow] { transition: transform .3s cubic-bezier(.3, .85, .35, 1.06) !important; }\n@media (prefers-reduced-motion: reduce) { [data-kirin-vu-needle], [data-kirin-vu-needle-shadow] { transition: transform .12s linear !important; } }\n';
  const files = { 'KirinEye.jsx': eye, 'kirinEyeModel.js': model, 'KirinVuPair.jsx': vu, 'kirinVuModel.js': sources[instrumentSources[3]], 'instruments.css': selectedCss };
  for (const [name, text] of Object.entries(files)) if (/\b(?:localStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|observationBarkMeans|useJungleMode|KirinJungleVuWindow)\b/.test(text)) throw new Error('Unreviewed dependency: ' + name);
  return files;
}
export async function verifyInstruments(repository) {
  const receipt = JSON.parse(await readFile(path.join(directory, 'source.json'), 'utf8'));
  const expectedNames = ['KirinEye.jsx', 'kirinEyeModel.js', 'KirinVuPair.jsx', 'kirinVuModel.js', 'instruments.css'];
  if (receipt.sourceCommit !== sourceCommit || receipt.scope !== 'presentation-only' || receipt.measurementEngineIncluded !== false || receipt.approvedOn !== '2026-10-09' || receipt.approvedBy !== 'Daisuke' || receipt.files.length !== 6 || receipt.sources.length !== instrumentSources.length || new Set(receipt.files.map(f => f.path)).size !== 6 || new Set(receipt.sources.map(f => f.path)).size !== instrumentSources.length) throw new Error('Invalid instrument receipt');
  if (!Array.isArray(receipt.hostFiles) || receipt.hostFiles.length !== hostFiles.length || new Set(receipt.hostFiles.map(file => file.path)).size !== hostFiles.length) throw new Error('Invalid host adapter receipt');
  for (const item of receipt.hostFiles) {
    if (!hostFiles.includes(item.path)) throw new Error('Invalid host adapter allowlist');
    if (!(await lstat(path.join(directory, item.path))).isFile()) throw new Error('Nonregular host adapter');
    const bytes = await readFile(path.join(directory, item.path));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error('Host adapter hash mismatch: ' + item.path);
  }
  for (const item of receipt.sources) if (!instrumentSources.includes(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid source allowlist');
  for (const item of receipt.files) {
    if (![...expectedNames, 'instruments.mjs'].includes(item.path)) throw new Error('Invalid output allowlist');
    if (!(await lstat(path.join(directory, item.path))).isFile()) throw new Error('Nonregular instrument snapshot');
    const bytes = await readFile(path.join(directory, item.path));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error('Instrument hash mismatch: ' + item.path);
  }
  if (repository) {
    const sources = readSources(repository), files = instrumentFiles(sources);
    for (const item of receipt.sources) if (hash(sources[item.path]) !== item.sha256) throw new Error('OS source mismatch');
    for (const [name, text] of Object.entries(files)) if (await readFile(path.join(directory, name), 'utf8') !== text) throw new Error('OS instrument mismatch: ' + name);
  }
  return { sourceCommit, presentationFiles: 6, measurementEngineIncluded: false, sourceCompared: !!repository };
}
function readSources(repository) {
  return Object.fromEntries(instrumentSources.map(file => [file, execFileSync('git', ['show', `${sourceCommit}:${file}`], { cwd: repository, encoding: 'utf8' })]));
}
export async function buildInstruments(repository, dependencyRoot) {
  const sources = readSources(repository), files = instrumentFiles(sources);
  await mkdir(directory, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(directory, name), text);
  const { output, dependencies } = await compileBundle(dependencyRoot);
  const hostReceipt = await Promise.all(hostFiles.map(async name => {const bytes = await readFile(path.join(directory, name)); return {path:name, bytes:bytes.length, sha256:hash(bytes)};}));
  await writeFile(path.join(directory, 'instruments.mjs'), output);
  const receipt = { schema: 1, sourceCommit, approvedBy: 'Daisuke', approvedOn: '2026-10-09', scope: 'presentation-only', measurementEngineIncluded: false, sources: instrumentSources.map(file => ({ path: file, sha256: hash(sources[file]) })), hostFiles:hostReceipt, files: [...Object.entries(files).map(([name, text]) => ({ path: name, bytes: Buffer.byteLength(text), sha256: hash(text) })), { path: 'instruments.mjs', bytes: output.length, sha256: hash(output) }], dependencies, adaptations: ['Product artifact/terrain adapters excluded; exact Eye series/tone mapping retained', 'HP stone-light and translation adapters only', 'Normal-mode VU only; session preference, no persistent storage', 'SVG glow filters removed to meet HP dynamic-filter standard', 'Exact JSX/SVG, scale, sensitivity, needle and pupil motion retained; reduced-motion exceptions retained'] };
  await writeFile(path.join(directory, 'source.json'), JSON.stringify(receipt, null, 2) + '\n');
  return verifyInstruments(repository);
}
async function compileBundle(dependencyRoot) {
  dependencyRoot = path.resolve(dependencyRoot);
  const require = createRequire(path.join(dependencyRoot, 'package.json'));
  const esbuild = require('esbuild');
  const dependencies = ['react', 'react-dom', 'scheduler', 'esbuild'].map(name => ({ name, version: require(name + '/package.json').version }));
  if (dependencies.map(d => `${d.name}@${d.version}`).join(',') !== 'react@18.3.1,react-dom@18.3.1,scheduler@0.23.2,esbuild@0.21.5') throw new Error('Dependency version changed; review first');
  const dependencyBase = await realpath(path.join(dependencyRoot, 'node_modules'));
  const build = await esbuild.build({ entryPoints: [path.join(directory, 'entry.jsx')], bundle: true, format: 'esm', platform: 'browser', target: ['es2020'], minify: true, write: false, metafile: true, legalComments: 'eof', nodePaths: [dependencyBase], define: { 'process.env.NODE_ENV': '"production"' } });
  for (const input of Object.keys(build.metafile.inputs)) {
    const absolute = await realpath(path.resolve(input));
    if (!absolute.startsWith(directory + path.sep) && !['react', 'react-dom', 'scheduler'].some(name => absolute.startsWith(path.join(dependencyBase, name) + path.sep))) throw new Error('Unexpected bundle input: ' + input);
  }
  const output = build.outputFiles[0].contents;
  return { output, dependencies };
}
export async function rebuildInstruments(dependencyRoot) {
  await verifyInstruments();
  const receipt = JSON.parse(await readFile(path.join(directory, 'source.json'), 'utf8'));
  const { output, dependencies } = await compileBundle(dependencyRoot);
  const original = receipt.files.find(file => file.path === 'instruments.mjs');
  if (hash(output) !== original.sha256 || output.length !== original.bytes || JSON.stringify(dependencies) !== JSON.stringify(receipt.dependencies)) throw new Error('Offline instrument rebuild does not reproduce the candidate');
  return { reproduced: true, bytes: output.length, sha256: hash(output), privateCheckoutRequired: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const sourceAt = process.argv.indexOf('--source'), depsAt = process.argv.indexOf('--dependency-root');
  const repository = sourceAt < 0 ? undefined : process.argv[sourceAt + 1];
  console.log(JSON.stringify(process.argv.includes('--build') ? await buildInstruments(repository, process.argv[depsAt + 1]) : process.argv.includes('--rebuild') ? await rebuildInstruments(process.argv[depsAt + 1]) : await verifyInstruments(repository), null, 2));
}
