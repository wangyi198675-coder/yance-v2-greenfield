// Reuse the W47 WebPrivate model-selection file; no new model history,
// credential store, second Agent or external API. The official SIWC SDK is
// the authority for the current connection and offered model slugs.
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,lstatSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomBytes} from 'node:crypto';
const PROVIDER='CHATGPT_PLAN_SIWC';
const FILE='web-private-cloud-selection.json'; // Existing W47 model config.
const allowed=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/.test(x);
const selectedRecord=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 x.provider===PROVIDER&&allowed(x.modelId)&&
 typeof x.profileRef==='string'&&x.profileRef.length>=8&&x.profileRef.length<=128&&
 Number.isSafeInteger(x.epoch)&&x.epoch>0&&x.keyRevision===0&&
 Object.keys(x).sort().join('|')==='epoch|keyRevision|modelId|profileRef|provider';
export function createWebPrivateSiwcChoice({appLocalDataRoot,officialPort}={}){
 if(typeof appLocalDataRoot!=='string'||!isAbsolute(appLocalDataRoot)||
    typeof officialPort?.list!=='function'||typeof officialPort?.invoke!=='function'||
    typeof officialPort?.profile!=='function')
   throw Error('W47_SIWC_OWNER_PORT_REQUIRED');
 const path=join(appLocalDataRoot,FILE);
 const readRaw=()=>{
  try{
   if(!existsSync(path)||lstatSync(path).isSymbolicLink())return null;
   const v=JSON.parse(readFileSync(path,'utf8'));
   return v&&typeof v==='object'&&!Array.isArray(v)?v:null;
  }catch{return null}
 };
 const read=()=>{const v=readRaw();return selectedRecord(v)?v:null};
 const status=async()=>{
  const models=await officialPort.list();
  const profileRef=await officialPort.profile();
  const choice=read();
  const matched=choice&&profileRef===choice.profileRef&&
    models.some(m=>m.modelId===choice.modelId);
  return {models,choice,ready:!!matched};
 };
 const current=async()=>{
  const s=await status();
  return s.ready?s.choice:null;
 };
 const principalModel=async()=>{
  const v=read();
  if(!v)return null;
  const s=await status();
  return s.ready?{
    modelBackend:'siwc',modelId:v.modelId,modelSelectionEpoch:v.epoch,
    siwcProfileRef:v.profileRef,
    modelUserSelected:true,extraChargeApproved:false,protectedCredentialAttested:false
   }:{
    modelBackend:'unconfigured',modelId:'',modelSelectionEpoch:v.epoch,
    modelUserSelected:false,extraChargeApproved:false,protectedCredentialAttested:false
   };
 };
 const select=async({provider,modelId})=>{
  if(provider!==PROVIDER||!allowed(modelId))
    throw {status:422,code:'SIWC_MODEL_SELECTION_INVALID'};
  const models=await officialPort.list();
  if(!models.some(m=>m.modelId===modelId))
    throw {status:409,code:'SIWC_CURRENT_GRANT_OR_MODEL_MISSING'};
  const profileRef=await officialPort.profile();
  if(!profileRef)throw {status:409,code:'SIWC_CURRENT_PROFILE_NOT_CONNECTED'};
  const old=readRaw();
  const epoch=Number.isSafeInteger(old?.epoch)&&old.epoch>=0?
    old.epoch+1:1;
  const entry={provider:PROVIDER,modelId,epoch,keyRevision:0,profileRef};
  const tmp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify(entry),{flag:'wx',mode:0o600});
   renameSync(tmp,path);
   return entry;
  }catch{
   try{unlinkSync(tmp)}catch{}
   throw {status:503,code:'SIWC_MODEL_SELECTION_NOT_SAVED'};
  }
 };
 const clearSelection=()=>{
  if(read()){try{unlinkSync(path)}catch{}}
 };
 return Object.freeze({status,current,principalModel,select,clearSelection,
  hasSelection:()=>!!read()});
}
