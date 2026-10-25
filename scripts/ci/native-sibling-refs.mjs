// W30: temporary, read-only actual sibling source worktrees for W24 HTTP contract tests.
// No owner source copy, no providers, no keys, no live account, no secret environment reads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SHA=/^[a-f0-9]{40}$/;
export const nativeSiblings=[
  {envName:'YANCE_PR32_ROOT',remoteRef:'refs/heads/integration/m1-native-source-composition-20261025',required:'services/api/src/domains/grant-custody-budget/native-bridges.mjs',id:'PR32'},
  {envName:'YANCE_W46_ROOT',remoteRef:'refs/heads/w46/bc-native-composer-20261025',required:'apps/web/src/native-takeover-port.mjs',id:'W46'}
];
export function parseRef(raw,ref){
  const lines=String(raw).trim().split(/\r?\n/).filter(Boolean);
  if(lines.length!==1)throw Error('SIBLING_REF_NOT_UNIQUE');
  const parts=lines[0].trim().split(/\s+/);
  if(parts.length!==2||!SHA.test(parts[0])||parts[1]!==ref)throw Error('SIBLING_REF_INVALID');
  return parts[0];
}
const exec=(args,cwd)=>{
  const x=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:120000});
  if(x.status!==0)throw Error('GIT_SIBLING_REF_COMMAND_FAILED '+args[0]+' '+String(x.stderr||'').slice(-220));
  return x.stdout.trim();
};
export function attachActualNativeSiblings(root,env=process.env){
  // Only W24's checked-in *actual* cross-Owner HTTP tests need this interop.
  const testcase=path.join(root,'services/api/src/domains/identity-consent/takeover-http.test.mjs');
  if(!fs.existsSync(testcase))return {sources:[],dispose:()=>{}};
  const owned=[];
  const previous=new Map();
  const sources=[];
  const dispose=()=>{
    for(const dep of owned.reverse()){
      try{exec(['worktree','remove','--force',dep.dir],root)}catch{}
      fs.rmSync(dep.parent,{recursive:true,force:true});
    }
    for(const [key,old] of previous){if(old===undefined)delete env[key];else env[key]=old;}
  };
  try{
    for(const dep of nativeSiblings){
      const existing=env[dep.envName];
      let located,sha;
      if(existing){
        located=path.resolve(existing);
        sha=exec(['rev-parse','HEAD'],located);
        if(!SHA.test(sha))throw Error('SIBLING_LOCAL_SHA_INVALID '+dep.id);
      }else{
        const head=parseRef(exec(['ls-remote','origin',dep.remoteRef],root),dep.remoteRef);
        exec(['fetch','--no-tags','origin',dep.remoteRef],root);
        sha=exec(['rev-parse','FETCH_HEAD'],root);
        if(sha!==head)throw Error('SIBLING_REF_MOVED_RETRY '+dep.id);
        const parent=fs.mkdtempSync(path.join(os.tmpdir(),'w30-native-sibling-'));
        const dir=path.join(parent,'source');
        try{exec(['worktree','add','--detach',dir,sha],root)}
        catch(e){fs.rmSync(parent,{recursive:true,force:true});throw e}
        owned.push({parent,dir});
        previous.set(dep.envName,env[dep.envName]);
        env[dep.envName]=dir;
        located=dir;
      }
      if(!fs.existsSync(path.join(located,dep.required)))throw Error('SIBLING_REQUIRED_SOURCE_MISSING '+dep.id);
      sources.push({id:dep.id,sha,actualSource:'GIT_COMMIT_READ_ONLY',kind:'SYNTHETIC_NATIVE_CONTRACT'});
    }
    return {sources,dispose};
  }catch(e){dispose();throw e}
}
