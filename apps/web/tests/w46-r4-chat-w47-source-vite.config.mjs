// W46 P0 isolated nonproduction UAT composition. Never deployed and never edits W47.
// Use the ACTUAL W47 original read-only gate from the PR #53 worktree, but locally
// opt in to rendering the owner W46 candidate for Chrome proof. This bypasses ONLY
// W47's R4 feature-toggle suppression, not its empty-account authority gate.
// PR #53's pinned W46 SHA will require W09-2 authorization for the new W46 commit.
import {pathToFileURL} from 'node:url';
import owner from '../vite.w46.config.mjs';
const input=process.env.YANCE_W47_PR53_CONFIG;
if(!input)throw Error('W47_PR53_OWNER_PATH_REQUIRED');
if(process.env.W47_R4_ISOLATED_PREVIEW==='1')throw Error('W47_SIGNED_PRODUCTION_GATE_MUST_NOT_BE_BYPASSED');
const w47=(await import(pathToFileURL(input).href)).default;
const source=w47.plugins.find(p=>p.name==='w47-runtime-truth-gate');
if(!source||typeof source.transform!=='function')throw Error('W47_REAL_GATE_MISSING');
const nativeApiPort=['48184','48185'].includes(process.env.W46_REAL_API_PORT)?process.env.W46_REAL_API_PORT:'47182';
const nativeApiOrigin='http://127.0.0.1:'+nativeApiPort;
const original='const w46WorkspaceEnabled=false';
const opted="const w46WorkspaceEnabled=new URLSearchParams(window.location.search).get('productDraft')==='1'";
const wrapper={
 ...source,
 name:'w46-test-only-w47-no-provider-gate',
 transform(code,id){
  let output=source.transform(code,id);
  if(id.replaceAll('\\','/').endsWith('/approved-clickable-abc-bc/src/App.vue')){
    if(typeof output!=='string'||!output.includes(original))
      throw Error('W47_SOURCE_GATE_OR_CANDIDATE_DRIFT');
    output=output.replace(original,opted);
  }
  return output;
 }
};
export default {
 ...owner,plugins:[...owner.plugins,wrapper],
 build:{...owner.build,outDir:owner.build.outDir+'-p0-w47-uat'},
 preview:{...owner.preview,port:4174,strictPort:true,
  proxy:{'/api/v2':{target:nativeApiOrigin,changeOrigin:true},
    '/w46-native-test':{target:nativeApiOrigin,changeOrigin:true}}}
};
