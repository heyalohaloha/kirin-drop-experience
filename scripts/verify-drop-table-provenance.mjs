// Inspect the official source archive as data. Never import/execute upstream Python.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
export const mosqitoArchiveSha256 = '50c0ebdc5102c67cfe4362178ce07d7e6b3211d7cb3e6051082e503ff019f16f';
export const mosqitoSourceFiles = Object.freeze([
  'LICENSE', 'PKG-INFO',
  ...['_third_octave_levels.py', '_nonlinear_decay.py', '_temporal_weighting.py', '_square_and_smooth.py'].map(f => 'mosqito/sq_metrics/loudness/loudness_zwtv/' + f),
  ...['_main_loudness.py', '_calc_slopes.py'].map(f => 'mosqito/sq_metrics/loudness/loudness_zwst/' + f),
  'mosqito/sq_metrics/sharpness/sharpness_din/sharpness_din_from_loudness.py',
]);
export const tableMappings = Object.freeze([
  ['FILTER_REF', 'third_octave_filter_ref', 18, 2],
  ['FILTER_DIFF', 'third_octave_filter', 504, 2],
  ['FILTER_GAIN', 'filter_gain', 28, 2],
  ['BAND_CENTER_FREQS', 'freq', 28, 2],
  ...[['RAP',8],['DLL',88],['LTQ',20],['A0',20],['DDF',20],['DCB',20]].map(([n,c]) => [n,n.toLowerCase(),c,6]),
  ...[['ZUP',21],['RNS',18],['USL',144]].map(([n,c]) => [n,n.toLowerCase(),c,7]),
]);
function numbers(text) {
  const clean = text.replace(/\/\/[^\n]*|#[^\n]*/g, '');
  assert.match(clean, /^[\s\d.,eE+\-\[\]()]*$/);
  return [...clean.matchAll(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g)].map(m => Number(m[0]));
}
function arrayBody(text, start) {
  const begin = text.indexOf('[', start); assert.ok(begin >= 0);
  let depth = 0;
  for (let i = begin; i < text.length; i++) {
    if (text[i] === '[') depth++;
    if (text[i] === ']' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error('Unclosed literal array');
}
export async function verifyTableProvenance(archive) {
  const bytes = await readFile(archive);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), mosqitoArchiveSha256);
  const entries = execFileSync('tar', ['-tzf', archive], {encoding:'utf8'}).trim().split('\n');
  assert.ok(entries.every(f => f.startsWith('mosqito-1.2.1/') && !f.split('/').includes('..') && !f.includes('\\')));
  assert.equal(entries.some(f => /(?:^|\/)NOTICE(?:\.[^/]*)?$/.test(f)), false, 'Review upstream NOTICE before distribution');
  const sources = mosqitoSourceFiles.map(f => execFileSync('tar', ['-xOzf', archive, 'mosqito-1.2.1/' + f], {encoding:'utf8'}));
  assert.match(sources[0], /Apache License[\s\S]*Version 2\.0/);
  assert.match(sources[1], /Version: 1\.2\.1/); assert.match(sources[1], /Author: MoSQITo Developers/);
  const rust = await readFile(path.join(root,'dev/psycho-core/vendor/phase_d/tables.rs'),'utf8');
  const tables = tableMappings.map(([name, variable, count, index]) => {
    const r = rust.indexOf('pub const ' + name + ':'); assert.ok(r >= 0);
    const p = sources[index].search(new RegExp('\\b' + variable + '\\s*=')); assert.ok(p >= 0, variable);
    const a = numbers(arrayBody(rust, rust.indexOf('=',r)));
    const b = numbers(arrayBody(sources[index], p));
    assert.equal(a.length, count, name); assert.equal(b.length,count,variable); assert.deepEqual(a,b,name);
    return {rust:name, upstream:variable, values:count, equal:true};
  });
  return {name:'MoSQITo',version:'1.2.1',archiveSha256:mosqitoArchiveSha256,license:'Apache-2.0',noticeFile:'none-in-official-sdist',tables,files:mosqitoSourceFiles.map((f,i)=>({path:f,sha256:createHash('sha256').update(sources[i]).digest('hex')}))};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyTableProvenance(process.argv[2]),null,2));
