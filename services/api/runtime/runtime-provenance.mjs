// An installed V2 API runs without Git or developer paths.
// Packaging owner must stamp runtime-build.json next to this file in the
// signed distribution after source HEAD is frozen; it never proves identity.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function resolveRuntimeSource(config){
  if(config.mode==='installed'){
    let data;
    try{data=JSON.parse(readFileSync(new URL('./runtime-build.json',import.meta.url),'utf8'))}
    catch{throw Error('W47_INSTALLED_BUILD_MANIFEST_REQUIRED')}
    if(!data||typeof data.source_sha!=='string'||!/^[a-f0-9]{40}$/.test(data.source_sha)||
       data.format!==1||data.product!=='YanceV2')
      throw Error('W47_INSTALLED_BUILD_MANIFEST_INVALID');
    return data.source_sha;
  }
  const root=resolve(fileURLToPath(new URL('.',import.meta.url)),'../../..');
  return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
}
