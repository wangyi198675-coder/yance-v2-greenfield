// W47 current-user model preferences; NOT an Agno executor, paid grant, or social Sender.
// Reuses W47 WebPrivate / original W54 AppData and native source-qualification ports.
// Function-level choices stay independent of PRIVATE's existing single model-selection.
import {readFileSync,writeFileSync,renameSync,existsSync,lstatSync,unlinkSync,openSync,closeSync} from 'node:fs';
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
const validChoice=(x,{persisted=false}={})=>{
 if(!x||typeof x!=='object'||Array.isArray(x)||!PROVIDERS.has(x.provider)||
    typeof x.modelId!=='string'||!PATTERN.test(x.modelId))return false;
 const keys=Object.keys(x).sort().join('|');
 if(!persisted)return keys==='modelId|provider';
 if(!Number.isSafeInteger(x.epoch)||x.epoch<1)return false;
 return x.provider==='OPENROUTER_USER_API'?
  keys==='epoch|keyRevision|modelId|provider'&&
   Number.isSafeInteger(x.keyRevision)&&x.keyRevision>0:
  keys==='epoch|modelId|provider';
};
const sanitized=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')==='assignments|revision|version'&&x.version===1&&
 Number.isSafeInteger(x.revision)&&x.revision>=0&&
 x.assignments&&typeof x.assignments==='object'&&!Array.isArray(x.assignments)&&
 Object.keys(x.assignments).every(k=>IDS.has(k)&&validChoice(x.assignments[k],{persisted:true}));
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
  if(!Array.isArray(raw)||raw.length>3500)fail(503,'MODEL_OWNER_CATALOG_INVALID');
  const seen=new Set();
  return raw.map(m=>{
   if(!m||!PROVIDERS.has(m.provider)||typeof m.modelId!=='string'||
    !PATTERN.test(m.modelId)||typeof m.configured!=='boolean'||
    typeof m.available!=='boolean'||(m.available&&!m.configured)||
    seen.has(m.provider+'|'+m.modelId))fail(503,'MODEL_OWNER_CATALOG_INVALID');
   seen.add(m.provider+'|'+m.modelId);
   return {provider:m.provider,modelId:m.modelId,configured:m.configured,
    available:m.available,
    ...(typeof m.name==='string'?{name:m.name.slice(0,140)}:{}),
    ...(m.capabilities&&typeof m.capabilities==='object'?{capabilities:{text:m.capabilities.text===true,
     vision:m.capabilities.vision===true,toolCalling:m.capabilities.toolCalling===true}}:{}),
    ...(Number.isSafeInteger(m.keyRevision)&&m.keyRevision>0?
      {keyRevision:m.keyRevision}:{})};
  });
 };
 const current=async()=>{
  const x=read(),models=await eligible();
  return {ok:true,authoritative:true,scope:'CURRENT_LOCAL_USER',
   revision:x.revision,
   availableModels:models.slice(0,75),
   assignments:FUNCTION_IDS.map(functionId=>{
    const choice=x.assignments[functionId]??null;
    const matched=choice&&models.find(m=>m.provider===choice.provider&&m.modelId===choice.modelId&&
      (choice.provider!=='OPENROUTER_USER_API'||choice.keyRevision===m.keyRevision));
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
  const chosen=models.find(m=>m.provider===provider&&m.modelId===modelId&&m.available);
  if(!chosen)fail(409,'MODEL_NOT_AVAILABLE_FOR_ASSIGNMENT');
  if(functionId==='MEDIA_UNDERSTANDING'&&chosen.capabilities?.vision!==true)
   fail(409,'MODEL_DOES_NOT_SUPPORT_MEDIA_UNDERSTANDING');
  // Atomic OS file create serializes competing W47 processes as well as
  // requests inside one process. A stale lock is fail-closed (never silently
  // replaced); no task, model or credential is granted by this lock.
  const lock=file+'.lock';let fd;
  try{fd=openSync(lock,'wx',0o600)}
  catch(e){fail(e?.code==='EEXIST'?409:503,
   e?.code==='EEXIST'?'MODEL_ROUTING_BUSY':'MODEL_ROUTING_LOCK_UNAVAILABLE')}
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   const before=read();
   if(before.revision!==expectedRevision)fail(409,'MODEL_ROUTING_VERSION_CONFLICT');
   // Recheck original W55 revocation/Key rotation under the lock immediately
   // before write, without running inference or authorizing an external send.
   const nextCatalog=await eligible();
   if(!nextCatalog.some(m=>m.provider===provider&&m.modelId===modelId&&m.available&&
     (provider!=='OPENROUTER_USER_API'||m.keyRevision===chosen.keyRevision)))
    fail(409,'MODEL_SOURCE_REVOKED_DURING_SAVE');
   const updated={version:1,revision:before.revision+1,
    assignments:{...before.assignments,[functionId]:{provider,modelId,epoch:before.revision+1,
     ...(provider==='OPENROUTER_USER_API'?{keyRevision:chosen.keyRevision}:{})}}};
   writeFileSync(tmp,JSON.stringify(updated),{flag:'wx',mode:0o600,encoding:'utf8'});
   if(read().revision!==expectedRevision)fail(409,'MODEL_ROUTING_VERSION_CONFLICT');
   renameSync(tmp,file);
  }catch(e){
   try{unlinkSync(tmp)}catch{}
   if(e?.status)throw e;
   fail(503,'MODEL_ROUTING_WRITE_UNAVAILABLE');
  }finally{
   try{closeSync(fd)}finally{try{unlinkSync(lock)}catch{}}
  }
  return current();
 };
 const catalog=async({query='',offset=0,limit=60}={})=>{
  if(typeof query!=='string'||query.length>96||!Number.isSafeInteger(offset)||offset<0||offset>3500||
   !Number.isSafeInteger(limit)||limit<1||limit>100)fail(422,'MODEL_CATALOG_QUERY_INVALID');
  const all=await eligible(),q=query.trim().toLowerCase();
  const matched=q?all.filter(x=>(x.name||x.modelId).toLowerCase().includes(q)||x.modelId.toLowerCase().includes(q)):all;
  return {ok:true,authoritative:true,scope:'CURRENT_LOCAL_USER',canSend:false,
   total:matched.length,offset,limit,models:matched.slice(offset,offset+limit)};
 };
 // Only original server-private W43/W55 callers may resolve an actual run;
 // this method is never an HTTP write or provider permission.
 const resolve=async functionId=>{
  if(!IDS.has(functionId))fail(422,'FUNCTION_ID_INVALID');
  const choice=read().assignments[functionId];
  if(!choice)return null;
  const entries=await eligible();
  if(!entries.some(m=>m.provider===choice.provider&&m.modelId===choice.modelId&&
    (functionId!=='MEDIA_UNDERSTANDING'||m.capabilities?.vision===true)&&
    m.available&&m.configured&&(choice.provider!=='OPENROUTER_USER_API'||
      m.keyRevision===choice.keyRevision)))
   fail(409,'ASSIGNED_MODEL_SOURCE_UNAVAILABLE');
  return Object.freeze({...choice,functionId});
 };
 const matchCloudLease=async({provider,modelId,selectionEpoch,keyRevision}={})=>{
  if(provider!=='OPENROUTER_USER_API'||!PATTERN.test(modelId)||
    !Number.isSafeInteger(selectionEpoch)||selectionEpoch<1||
    !Number.isSafeInteger(keyRevision)||keyRevision<1)return false;
  // Unwired Translate/Reply/Autopilot preferences may NEVER lease a Key.
  for(const functionId of ['PRIVATE_BRAIN','EXPERT_TASKS']){
   const choice=read().assignments[functionId];
   if(choice?.provider!==provider||choice.modelId!==modelId||
      choice.epoch!==selectionEpoch||choice.keyRevision!==keyRevision)continue;
   try{await resolve(functionId);return true}catch{return false}
  }
  return false;
 };
 return Object.freeze({current,select,catalog,resolve,matchCloudLease});
}