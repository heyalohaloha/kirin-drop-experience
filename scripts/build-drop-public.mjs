import {copyFile,lstat,mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderDropPage} from '../dev/drop-public/page.mjs';
import {renderOsDropDocument} from '../dev/drop-public/embed.mjs';
import {verifyPresentation} from './kirin-presentation-source.mjs';
import {verifyInstruments} from './build-drop-instruments.mjs';
const root = path.resolve(import.meta.dirname,'..');
export const dropRuntimeFiles = Object.freeze([
  ...['preview.css','measure.mjs','wasm-core.mjs','psycho-view.mjs','locale.mjs','playback.mjs','level-core.wasm','psycho-core.wasm'].map(name=>({source:'dev/drop-preview/'+name,target:'assets/drop/'+name})),
  ...['normalStone.css','dropMotion.css','dropPlay.css','host.css','presentation.mjs','dropStyles.mjs','dropRipple.mjs','stoneLight.mjs','stonePointer.mjs','instruments/instruments.css','instruments/instruments.mjs'].map(name=>({source:'dev/drop-preview/kirin-ui/'+name,target:'assets/drop/kirin-ui/'+name})),
  ...['public.mjs','worker.mjs','analyze.mjs','policy.mjs','public.css','embed-host.mjs'].map(name=>({source:'dev/drop-public/'+name,target:'assets/drop/'+name})),
  ...['inter-latin-wght-400-600.woff2','jetbrains-mono-latin-wght-400-600.woff2'].map(name=>({source:'fonts/'+name,target:'fonts/'+name})),
]);
export const dropPublicPaths = Object.freeze([...dropRuntimeFiles.map(f=>f.target),'os/drop.html','ja/os/drop.html','os/experience.html','ja/os/experience.html']);
export const dropAddedPaths = Object.freeze(dropPublicPaths.filter(file=>!file.startsWith('fonts/')));
export const dropCsp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src blob:; worker-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const dropEmbedCsp = dropCsp.replace("frame-ancestors 'none'","frame-ancestors 'self'");
export async function buildDropPublic(outputRoot) {
  await verifyPresentation(); await verifyInstruments();
  const receipt = JSON.parse(await readFile(path.join(root,'dev/drop-preview/core-build.json'),'utf8'));
  if (receipt.recipe !== 'hp-common-core-v2' || receipt.psychoSource?.commit !== '6ba9fe20e681d369c1de08e1c74b1ef2406dc010') throw new Error('Unreviewed Drop core recipe or public source pin');
  const cores = Object.values(receipt.cores);
  const files = [];
  for (const item of dropRuntimeFiles) {
    const source = path.join(root,item.source);
    if (!(await lstat(source)).isFile() || await realpath(source) !== source) throw new Error('Drop runtime requires a regular local file: '+item.source);
    const bytes = await readFile(source);
    if (item.source.endsWith('.wasm')) {
      const expected = cores.find(core=>core.wasm===path.basename(source));
      if (!expected || expected.bytes !== bytes.length || expected.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Drop core hash mismatch: '+item.source);
    }
    const destination = path.join(outputRoot,item.target); await mkdir(path.dirname(destination),{recursive:true});
    if (item.source.startsWith('dev/drop-public/') && item.source.endsWith('.mjs')) {
      await writeFile(destination,bytes.toString().replaceAll("'../drop-preview/","'./"));
    } else await copyFile(source,destination);
    files.push(item.target);
  }
  for (const language of ['ja','en']) {
    const file = (language==='ja'?'ja/':'')+'os/drop.html'; await mkdir(path.dirname(path.join(outputRoot,file)),{recursive:true});
    await writeFile(path.join(outputRoot,file),renderDropPage(language)); files.push(file);
    const embedded=(language==='ja'?'ja/':'')+'os/experience.html';
    await writeFile(path.join(outputRoot,embedded),renderOsDropDocument(language)); files.push(embedded);
  }
  return files;
}
