// W09 Web-first: local-only original W43 llama.cpp model selection.
// No cloud key, synthetic model, provider send, new agent or sender.
// Exactly the pre-existing 127.0.0.1:11605 auth model "qwen3:8b".
import {readFileSync,writeFileSync,existsSync,renameSync,lstatSync,unlinkSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomBytes} from 'node:crypto';
const CHOICE='web-private-local-qwen.json';
const PROVIDER='LLAMACPP_LOCAL_QWEN3_8B_FREE';
const MODEL='qwen3:8b';
const ROUTE='http://127.0.0.1:11605/v1/models';
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')==='epoch|modelId'&&
 Number.isSafeInteger(x.epoch)&&x.epoch>=1&&x.epoch<=1000000&&x.modelId===MODEL;
export function createWebPrivateLocalQwen({appLocalDataRoot,localKeyFile}={}){
 if(typeof appLocalDataRoot!=='string'||!isAbsolute(appLocalDataRoot)||
    typeof localKeyFile!=='string'||!isAbsolute(localKeyFile))
  throw Error('EXISTING_LOCAL_QWEN_KEY_AND_LOCAL_ROOT_REQUIRED');
 const file=join(appLocalDataRoot,CHOICE);
 const read=()=>{
  if(!existsSync(file))return null;
  try{if(lstatSync(file).isSymbolicLink())return null;
   const v=JSON.parse(readFileSync(file,'utf8'));return valid(v)?v:null}
  catch{return null}
 };
 async function modelReady(){
  try{
   if(!existsSync(localKeyFile)||lstatSync(localKeyFile).isSymbolicLink())return false;
   const key=readFileSync(localKeyFile,'utf8').trim();
   if(key.length<16||key.length>200||/\s/.test(key))return false;
   const r=await fetch(ROUTE,{headers:{authorization:'Bearer '+key},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!r.ok||!r.headers.get('content-type')?.includes('json'))return false;
   const data=await r.json();
   return Array.isArray(data?.data)&&data.data.some(x=>x?.id===MODEL);
  }catch{return false}
 }
 const source=async()=>{
  const ready=await modelReady(),selected=read();
  return {ready,choice:selected,models:[{
    provider:PROVIDER,modelId:MODEL,configured:ready,
    available:ready,keyRequired:false,
    billingNotice:'本机现有 Qwen3 8B，免费本地推理，不使用云端 API'
   }]};
 };
 const principalModel=()=>{
  const x=read();
  return x?{modelBackend:'llamacpp',modelId:MODEL,
   modelSelectionEpoch:x.epoch,modelUserSelected:true,
   extraChargeApproved:false,protectedCredentialAttested:false}:
   {modelBackend:'unconfigured',modelId:'',
    modelSelectionEpoch:0,modelUserSelected:false,
    extraChargeApproved:false,protectedCredentialAttested:false};
 };
 const select=async(selection)=>{
  if(selection?.provider!==PROVIDER||selection?.modelId!==MODEL)
   return {error:'ONLY_EXISTING_LOCAL_QWEN_SUPPORTED',status:422};
  if(!await modelReady())return {error:'EXISTING_LOCAL_QWEN_UNAVAILABLE',status:409};
  const epoch=(read()?.epoch||0)+1;
  const v={modelId:MODEL,epoch};
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{writeFileSync(tmp,JSON.stringify(v),{encoding:'utf8',flag:'wx',mode:0o600});
   renameSync(tmp,file);return {ok:true,selection:v}}
  catch{return {error:'LOCAL_MODEL_CHOICE_NOT_SAVED',status:503}}
 };
 const clearSelection=()=>{if(read()){try{unlinkSync(file)}catch{}}};
 return Object.freeze({source,select,principalModel,clearSelection});
}
