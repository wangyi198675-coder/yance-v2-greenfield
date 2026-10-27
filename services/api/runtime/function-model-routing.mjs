// W47 current-user model preferences; NOT an Agno executor, paid grant, or social Sender.
// Reuses W47 WebPrivate / original W54 AppData and native source-qualification ports.
// Function-level choices stay independent of PRIVATE's existing single model-selection.
import {readFileSync,writeFileSync,renameSync,existsSync,lstatSync,unlinkSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomBytes} from 'node:crypto';

export const FUNCTION_IDS=Object.freeze([
 'PRIVATE_BRAIN','TRANSLATE','REPLY_SUGGESTIONS','RELATIONSHIP_SUMMARY',
 'EXPERT_TASKS','MEDIA_UNDERSTANDING','AUTOPILOT'
]);
const IDS=new Set(FUNCTION_IDS);
const PROVIDERS=new Set(['LLAMACPP_LOCAL_QWEN3_8B_FREE','OPENROUTER_USER_API','CHATGPT_PLAN_SIWC']);
const PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/;
const FILE='function-ai-model-routing.json';
const validChoice=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')==='modelId|provider'&&
 PROVIDERS.has(x.provider)&&typeof x.modelId==='string'&&PATTERN.test(x.modelId);
const sanitized=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')==='assignments|revision|version'&&x.version===1&&
 Number.isSafeInteger(x.revision)&&x.revision>=0&&
 x.assignments&&typeof x.assignments==='object'&&!Array.isArray(x.assignments)&&
 Object.keys(x.assignments).every(k=>IDS.has(k)&&validChoice(x.assignments[k]));
const blank=()=>({version:1,revision:0,assignments:{}});
const fail=(status,code)=>{throw {status,code}};
export function createFunctionModelRoutingStore({appLocalDataRoot,readEligibleModels}={}){
 if(typeof appLocalDataRoot!=='string'||!isAbsolute(appLocalDataRoot)||
    appLocalDataRoot.includes('..')||typeof readEligibleModels!=='function')
  throw Error('NATIVE_APPDATA_AND_MODEL_OWNER_REQUIRED');
 const file=join(appLocalDataRoot,FILE);
 const read=()=>{
  try{
   if(!existsSync(file))return blank();
   if(lstatSync(file).isSymbolicLink())fail(503,'MODEL_ROUTING_SYMLINK_DENIED');
   const x=JSON.parse(readFileSync(file,'utf8'));
   if(!sanitized(x))fail(503,'MODEL_ROUTING_STORE_CORRUPTED');
   return x;
  }catch(e){if(e?.code)throw e;fail(503,'MODEL_ROUTING_READ_UNAVAILABLE')}
 };
 const eligible=async()=>{
  const raw=await readEligibleModels();
  if(!Array.isArray(raw)||raw.length>200)fail(503,'MODEL_OWNER_CATALOG_INVALID');
  const seen=new Set();
  return raw.map(m=>{
   if(!m||!PROVIDERS.has(m.provider)||typeof m.modelId!=='string'||
    !PATTERN.test(m.modelId)||typeof m.configured!=='boolean'||
    typeof m.available!=='boolean'||(m.available&&!m.configured)||
    seen.has(m.provider+'|'+m.modelId))fail(503,'MODEL_OWNER_CATALOG_INVALID');
   seen.add(m.provider+'|'+m.modelId);
   return {provider:m.provider,modelId:m.modelId,configured:m.configured,
    available:m.available};
  });
 };
 const current=async()=>{
  const x=read(),models=await eligible();
  return {ok:true,authoritative:true,scope:'CURRENT_LOCAL_USER',
   revision:x.revision,
   availableModels:models,
   assignments:FUNCTION_IDS.map(functionId=>{
    const choice=x.assignments[functionId]??null;
    const matched=choice&&models.find(m=>m.provider===choice.provider&&m.modelId===choice.modelId);
    return {functionId,choice,eligible:!!matched?.available,
     status:!choice?'NOT_CONFIGURED':matched?.available?'PREFERENCE_SAVED_RUNTIME_NOT_WIRED':'SOURCE_NO_LONGER_ELIGIBLE'};
   }),
   routingExecution:'NOT_WIRED_TO_W43',
   paidCallsTriggered:false,canSend:false};
 };
 const select=async input=>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['functionId','provider','modelId','expectedRevision','confirmPaidCost'].includes(k)))
   fail(422,'FUNCTION_MODEL_SELECTION_INVALID');
  const {functionId,provider,modelId,expectedRevision,confirmPaidCost=false}=input;
  if(!IDS.has(functionId)||!validChoice({provider,modelId})||
   !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
   typeof confirmPaidCost!=='boolean')fail(422,'FUNCTION_MODEL_SELECTION_INVALID');
  // An assignment never triggers inference. Cloud must still have its own
  // actual OS-backed source and explicit one-time cost confirmation.
  if(provider==='OPENROUTER_USER_API'&&!confirmPaidCost)
   fail(403,'OPENROUTER_COST_CONFIRMATION_REQUIRED');
  const models=await eligible();
  if(!models.some(m=>m.provider===provider&&m.modelId===modelId&&m.available))
   fail(409,'MODEL_NOT_AVAILABLE_FOR_ASSIGNMENT');
  const before=read();
  if(before.revision!==expectedRevision)fail(409,'MODEL_ROUTING_VERSION_CONFLICT');
  const updated={version:1,revision:before.revision+1,
   assignments:{...before.assignments,[functionId]:{provider,modelId}}};
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify(updated),{flag:'wx',mode:0o600,encoding:'utf8'});
   // Recheck current revision to avoid a simple concurrent lost update.
   // The owning W47 process serializes requests; native locking remains
   // necessary for cross-process writers before claiming multi-worker safety.
   if(read().revision!==expectedRevision)fail(409,'MODEL_ROUTING_VERSION_CONFLICT');
   renameSync(tmp,file);
  }catch(e){
   try{unlinkSync(tmp)}catch{}
   if(e?.status)throw e;
   fail(503,'MODEL_ROUTING_WRITE_UNAVAILABLE');
  }
  return current();
 };
 return Object.freeze({current,select});
}