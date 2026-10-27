// W47 single-user Web PRIVATE cloud model configuration. The ONLY credential
// custody is W55's existing WinCred/DPAPI native host; no Node key persistence.
// This module stores ONLY provider/model/revision/explicit fee-consent metadata
// under the existing W47 WebPrivate current-user AppData. No new Agent or DB.
import {readFileSync,writeFileSync,renameSync,existsSync,lstatSync,unlinkSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomBytes} from 'node:crypto';
const FILE='web-private-cloud-selection.json';
const IDS=Object.freeze({
 OPENROUTER_USER_API:'OPENROUTER',
 OPENAI_USER_API:'OPENAI_API'
});
const BACKENDS=Object.freeze({
 OPENROUTER_USER_API:'openrouter',
 OPENAI_USER_API:'openai'
});
const validModel=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/.test(x);
const validSelection=x=>x&&typeof x==='object'&&
 Object.keys(x).sort().join('|')==='epoch|keyRevision|modelId|provider'&&
 Object.hasOwn(IDS,x.provider)&&validModel(x.modelId)&&
 Number.isSafeInteger(x.epoch)&&x.epoch>0&&
 Number.isSafeInteger(x.keyRevision)&&x.keyRevision>0;
export function createWebPrivateCloudByok({appLocalDataRoot,nativeKeyPort,resolveScopedSelection=null}={}){
 if(typeof appLocalDataRoot!=='string'||!isAbsolute(appLocalDataRoot)||appLocalDataRoot.includes('..')||
  !nativeKeyPort||['status','store','revoke','withSecret'].some(x=>typeof nativeKeyPort[x]!=='function'))
  throw Error('W55_CURRENT_WINDOWS_USER_NATIVE_PORT_REQUIRED');
 if(resolveScopedSelection!==null&&typeof resolveScopedSelection!=='function')
  throw Error('W47_SCOPED_MODEL_SELECTION_OWNER_PORT_INVALID');
 const file=join(appLocalDataRoot,FILE);
 const read=()=>{
  try{if(!existsSync(file)||lstatSync(file).isSymbolicLink())return null;
   const x=JSON.parse(readFileSync(file,'utf8'));return validSelection(x)?x:null}
  catch{return null}
 };
 const status=async provider=>{
  if(!Object.hasOwn(IDS,provider))throw {status:422,code:'CLOUD_PROVIDER_INVALID'};
  let data;try{data=await nativeKeyPort.status({provider:IDS[provider]})}
  catch{throw {status:503,code:'W55_NATIVE_WIN_CRED_UNAVAILABLE'}}
  if(!data||typeof data.configured!=='boolean'||typeof data.revoked!=='boolean'||
   !Number.isSafeInteger(data.revision)||data.revision<0)
   throw {status:503,code:'W55_NATIVE_WIN_CRED_STATUS_INVALID'};
  return {provider,configured:data.configured&&!data.revoked,
   revoked:data.revoked,revision:data.revision,
   status:data.revoked?'KEY_REVOKED':data.configured?'KEY_CONFIGURED':'KEY_SETUP_REQUIRED'};
 };
 const statuses=async()=>Promise.all(Object.keys(IDS).map(status));
 const save=async({provider,apiKey,expectedRevision})=>{
  if(!Object.hasOwn(IDS,provider)||typeof apiKey!=='string'||
   apiKey.length<16||apiKey.length>512||!apiKey.startsWith('sk-')||
   (provider==='OPENROUTER_USER_API'&&!apiKey.startsWith('sk-or-'))||
   /\s/.test(apiKey)||
   (expectedRevision!==undefined&&
    (!Number.isSafeInteger(expectedRevision)||expectedRevision<1)))
   throw {status:422,code:'CLOUD_KEY_INPUT_INVALID'};
  // A mismatched user-supplied revision is a real 409, before the native
  // atomic CAS; concurrent native conflicts remain a truthful 503.
  if(expectedRevision!==undefined){
   const before=await status(provider);
   if(before.revision!==expectedRevision)
    throw {status:409,code:'CLOUD_KEY_REVISION_CONFLICT'};
  }
  let result;
  try{result=await nativeKeyPort.store({
   provider:IDS[provider],secret:apiKey,
   expectedRevision:expectedRevision??null
  })}
  catch(e){throw {status:e?.code==='STALE'?409:503,
   code:e?.code==='STALE'?'CLOUD_KEY_REVISION_CONFLICT':'W55_NATIVE_KEY_STORE_UNAVAILABLE'}}
  if(!result||result.configured!==true||result.revoked!==false||
   !Number.isSafeInteger(result.revision)||result.revision<1)
   throw {status:503,code:'W55_NATIVE_KEY_STORE_UNVERIFIED'};
  // Rotating the Key invalidates old explicit paid model consent.
  const selected=read();
  if(selected?.provider===provider){try{unlinkSync(file)}catch{}}
  return {provider,configured:true,revoked:false,revision:result.revision};
 };
 const revoke=async({provider,expectedRevision})=>{
  if(!Object.hasOwn(IDS,provider)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   throw {status:422,code:'CLOUD_KEY_REVOCATION_INVALID'};
  const before=await status(provider);
  if(before.revision!==expectedRevision)
   throw {status:409,code:'CLOUD_KEY_REVISION_CONFLICT'};
  let result;
  try{result=await nativeKeyPort.revoke({
   provider:IDS[provider],expectedRevision
  })}
  catch(e){throw {status:e?.code==='STALE'?409:503,
   code:e?.code==='STALE'?'CLOUD_KEY_REVISION_CONFLICT':'W55_NATIVE_KEY_REVOKE_UNAVAILABLE'}}
  if(!result||result.revoked!==true||result.configured!==false||
   !Number.isSafeInteger(result.revision)||result.revision<=expectedRevision)
   throw {status:503,code:'W55_NATIVE_KEY_REVOCATION_UNVERIFIED'};
  if(read()?.provider===provider){try{unlinkSync(file)}catch{}}
  return {provider,configured:false,revoked:true,revision:result.revision};
 };
 const select=async({provider,modelId,confirmPaidCost})=>{
  if(!Object.hasOwn(IDS,provider)||!validModel(modelId)||confirmPaidCost!==true)
   throw {status:422,code:'CLOUD_MODEL_COST_CONSENT_REQUIRED'};
  const s=await status(provider);
  if(!s.configured)throw {status:409,code:'CLOUD_KEY_SETUP_REQUIRED'};
  const v={provider,modelId,keyRevision:s.revision,epoch:(read()?.epoch??0)+1};
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify(v),{flag:'wx',mode:0o600,encoding:'utf8'});
   renameSync(tmp,file);
  }catch{try{unlinkSync(tmp)}catch{};throw {status:503,code:'CLOUD_SELECTION_NOT_SAVED'}}
  return {...v,confirmPaidCost:true};
 };
 const current=async()=>{
  const x=read();
  if(!x)return null;
  const s=await status(x.provider);
  return s.configured&&s.revision===x.keyRevision?x:null;
 };
 const principalModel=async()=>{
  const x=await current();
  return x?{
   modelBackend:BACKENDS[x.provider],modelId:x.modelId,
   modelSelectionEpoch:x.epoch,modelUserSelected:true,
   extraChargeApproved:true,protectedCredentialAttested:true,
   cloudCredentialSource:'W55_NATIVE_WIN_CRED'
  }:null;
 };
 const withSecret=async({profile,provider,modelId,selectionEpoch},consume)=>{
  const x=await current();
  let authorizedRevision=null;
  if(x&&IDS[x.provider]===provider&&x.modelId===modelId&&
    x.epoch===selectionEpoch&&profile?.modelSelectionEpoch===selectionEpoch)
   authorizedRevision=x.keyRevision;
  else if(resolveScopedSelection&&provider==='OPENROUTER'&&
      profile?.modelSelectionEpoch===selectionEpoch){
   const state=await status('OPENROUTER_USER_API');
   if(state.configured&&!state.revoked&&await resolveScopedSelection({
     provider:'OPENROUTER_USER_API',modelId,selectionEpoch,keyRevision:state.revision}))
    authorizedRevision=state.revision;
  }
  if(!authorizedRevision)throw {status:409,code:'CLOUD_SELECTION_OR_KEY_REVISION_CHANGED'};
  // W55 native adapter is responsible for current OS-user binding and never
  // returns a key to a browser; only the W43 executor's private callback sees it.
  return nativeKeyPort.withSecret({provider,modelId,
   expectedRevision:authorizedRevision,selectionEpoch},consume);
 };
 const clearSelection=()=>{if(read()){try{unlinkSync(file)}catch{}}};
 return Object.freeze({status,statuses,save,revoke,select,current,
  clearSelection,principalModel,withSecret});
}