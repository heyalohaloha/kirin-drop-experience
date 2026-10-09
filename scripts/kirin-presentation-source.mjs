// Approved presentation-only boundary (Daisuke, 2026-10-09).
// Read a pinned OS commit; never traverse its imports or execute product code.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const sourceCommit = "716a3a0be91703ba3aee945089514c173d5f28b1";
export const sourcePaths = Object.freeze([
  "src/styles/normalStone.css", "src/styles/kirinPlay.css", "src/styles/kirinInstruments.css",
  "src/components/common/dropRipple.js", "src/components/biophilic/stoneLight.js", "src/screens/DropScreen.jsx", "src/hooks/useStonePointerPlay.js",
]);
export const styleNames = Object.freeze([
  "dropTopFrame", "dropTopZone", "dropTopRipples", "dropTopChooseFiles", "dropTopBrand",
  "dropTopText", "dropTopHint", "dropTopRouteRow", "dropTopRoutePill", "dropTopRouteRead",
]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(import.meta.dirname, "../dev/drop-preview/kirin-ui");
const snapshotFiles = Object.freeze(["normalStone.css", "dropRipple.mjs", "stoneLight.mjs", "stonePointer.mjs", "dropStyles.mjs", "dropMotion.css", "dropPlay.css"]);

export function validatePresentationManifest(manifest) {
  if (manifest?.schema !== 1 || manifest.sourceCommit !== sourceCommit || manifest.scope !== "presentation-only" || manifest.approvedBy !== "Daisuke" || manifest.approvedOn !== "2026-10-09" || manifest.measurementEngineIncluded !== false || manifest.engineModelsIncluded !== false) throw new Error("Invalid presentation boundary");
  for (const [entries, expected, sizes] of [[manifest.sources, sourcePaths, false], [manifest.files, snapshotFiles, true]]) {
    if (!Array.isArray(entries) || entries.length !== expected.length || new Set(entries.map(entry => entry?.path)).size !== expected.length) throw new Error("Invalid presentation allowlist");
    for (const entry of entries) {
      if (!expected.includes(entry?.path) || !/^[a-f0-9]{64}$/.test(entry.sha256) || (sizes && (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0))) throw new Error("Invalid presentation allowlist");
    }
  }
}

export function extractDropStyles(source) {
  const result = {};
  for (const name of styleNames) {
    const body = source.match(new RegExp(`^  ${name}: \\{([\\s\\S]*?)^  \\},`, "m"))?.[1];
    if (!body) throw new Error(`Missing reviewed style: ${name}`);
    const values = {};
    for (const line of body.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//"))) {
      const property = line.match(/^(\w+): ('.*'|-?\d+(?:\.\d+)?),$/);
      if (!property) throw new Error(`Nonliteral style refused: ${name}`);
      const value = property[2];
      if (value.startsWith("'")) {
        const text = value.slice(1, -1);
        if (/[\\\r\n]/.test(text)) throw new Error(`Escaped style requires review: ${name}`);
        values[property[1]] = text;
      } else values[property[1]] = Number(value);
    }
    result[name] = values;
  }
  return result;
}

export function presentationFiles(sources) {
  const instruments = sources["src/styles/kirinInstruments.css"];
  const start = instruments.indexOf("/* ── 受け口の波紋");
  const end = instruments.indexOf("/* ── 全画面を静止", start);
  const play = sources["src/styles/kirinPlay.css"];
  const playEnd = play.indexOf("/* ── Drop：最近の行");
  if (start < 0 || end < 0 || playEnd < 0) throw new Error("Presentation section boundaries changed; review first");
  const styles = extractDropStyles(sources["src/screens/DropScreen.jsx"]);
  const pointer = sources["src/hooks/useStonePointerPlay.js"];
  if (!pointer.startsWith("import { useEffect } from 'react'\n") || !pointer.endsWith("  }, [enabled])\n}\n")) throw new Error("Pointer adapter boundary changed");
  const pointerAdapter = pointer.replace("import { useEffect } from 'react'\n", "")
    .replace("export default function useStonePointerPlay(enabled) {\n  useEffect(() => {", "export function installStonePointerPlay(enabled = true) {")
    .replace("  }, [enabled])\n}\n", "}\n");
  const files = {
    "normalStone.css": sources["src/styles/normalStone.css"],
    "dropRipple.mjs": sources["src/components/common/dropRipple.js"],
    "stoneLight.mjs": sources["src/components/biophilic/stoneLight.js"],
    "stonePointer.mjs": pointerAdapter,
    "dropStyles.mjs": `// Literal presentation styles extracted from the pinned DropScreen; no product imports.\nexport const dropStyles = Object.freeze(${JSON.stringify(styles, null, 2)});\n`,
    "dropMotion.css": instruments.slice(start, end) + `\n[data-drop-ripple="ring"] { animation: kirin-drop-ring 1.9s cubic-bezier(.16, .62, .25, 1) both !important; }\n[data-drop-ripple="dimple"] { animation: kirin-drop-dimple 1.1s ease-out both !important; }\n@media (prefers-reduced-motion: reduce) {\n  [data-drop-ripple] { display: none !important; animation: none !important; }\n  [data-kirin-stone="true"] [data-stone-basin] { transition: none !important; }\n}\n`,
    "dropPlay.css": play.slice(0, playEnd) + `\n@media (prefers-reduced-motion: reduce) {\n  [data-kirin-glint], [data-drop-chip], [data-kirin-stone="true"] [data-drop-brand]::after { transition: none !important; }\n  [data-kirin-stone="true"] [data-kirin-tilt] { transform: none !important; transition: none !important; }\n  [data-kirin-stone="true"] button { transition: none !important; }\n}\n`,
  };
  for (const [file, text] of Object.entries(files)) {
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|require|localStorage|indexedDB)\b|\b(?:native|electron|IPC|ONNX|onnxruntime)\b/.test(text)) throw new Error(`Runtime boundary rejected: ${file}`);
    if (/^\s*import\s/m.test(text)) throw new Error(`Unreviewed dependency: ${file}`);
  }
  const receipt = {
    schema: 1, sourceCommit, approvedBy: "Daisuke", approvedOn: "2026-10-09",
    scope: "presentation-only", measurementEngineIncluded: false, engineModelsIncluded: false,
    integration: "OS is the source of truth; HP consumes pinned presentation assets. OS refactor not performed.",
    sources: sourcePaths.map((file) => ({ path: file, sha256: hash(sources[file]) })),
    files: Object.entries(files).map(([file, text]) => ({ path: file, sha256: hash(text), bytes: Buffer.byteLength(text) })),
    adaptations: ["Drop literal style objects extracted without executable JSX", "React effect wrapper removed; identical pointer effect and cleanup retained", "Only Drop sections selected from motion/play CSS", "Reduced-motion rules limited to selected components", "HP input supports one WAV, not OS HTML/packages or product storage"],
  };
  files["source.json"] = JSON.stringify(receipt, null, 2) + "\n";
  return files;
}

export function readPinnedPresentation(sourceRepository) {
  return Object.fromEntries(sourcePaths.map((file) => [file, execFileSync("git", ["show", `${sourceCommit}:${file}`], { cwd: sourceRepository, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 })]));
}

export async function verifyPresentation(sourceRepository) {
  const manifest = JSON.parse(await readFile(path.join(root, "source.json"), "utf8"));
  validatePresentationManifest(manifest);
  for (const file of manifest.files) {
    if (!(await lstat(path.join(root, file.path))).isFile()) throw new Error(`Nonregular presentation snapshot: ${file.path}`);
    const bytes = await readFile(path.join(root, file.path));
    if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Presentation snapshot changed: ${file.path}`);
  }
  if (sourceRepository) {
    const expected = presentationFiles(readPinnedPresentation(sourceRepository));
    for (const [file, text] of Object.entries(expected)) if (await readFile(path.join(root, file), "utf8") !== text) throw new Error(`OS presentation mismatch: ${file}`);
  }
  return { sourceCommit, files: manifest.files.length, scope: manifest.scope, sourceCompared: !!sourceRepository };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const at = process.argv.indexOf("--source");
  console.log(JSON.stringify(await verifyPresentation(at < 0 ? undefined : process.argv[at + 1]), null, 2));
}
