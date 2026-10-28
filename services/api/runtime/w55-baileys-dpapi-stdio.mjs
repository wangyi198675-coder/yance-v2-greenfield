// W47 -> ORIGINAL W55 Rust DPAPI native-host adapter -> ORIGINAL W28 Baileys.
// No new OAuth, Vault, HTTP, key endpoint, plaintext disk authState, or sender.
// A W54 current Windows user and W24 account/epoch verifier are REQUIRED ports.
import {spawn as nativeSpawn} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {BufferJSON,initAuthCreds,proto} from '../../../connectors/baileys/w55-signal-codec.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const valid=s=>typeof s==='string'&&s.length>0&&s.length<=200&&
  /^[A-Za-z0-9_.:@-]+$/.test(s);
const MAX=8*1024*1024;
function validateScope(s){
 if(!s||['installationRef','principalRef','tenantId','accountId']
  .some(k=>!valid(s[k]))||
  !Number.isSafeInteger(s.bindingRevision)||s.bindingRevision<1||
  !Number.isSafeInteger(s.accountRevocationEpoch)||s.accountRevocationEpoch<0)
  fail('W55_BAILEYS_TRUSTED_BINDING_REQUIRED');
 return Object.freeze({installationRef:s.installationRef,principalRef:s.principalRef,
  tenantId:s.tenantId,accountId:s.accountId,
  bindingRevision:s.bindingRevision,accountRevocationEpoch:s.accountRevocationEpoch});
}
function run(executable,payload,{spawnImpl=nativeSpawn,qaEnv}={}){
 return new Promise((resolve,reject)=>{
  let worker,done=false,out='',err='',timer;
  const complete=(error,result)=>{
   if(done)return;done=true;clearTimeout(timer);
   if(error)reject(error);else resolve(result);
  };
  try{
   worker=spawnImpl(executable,[],{
    windowsHide:true,shell:false,
    stdio:['pipe','pipe','pipe'],
    env:qaEnv?{...process.env,...qaEnv}:process.env,
  });
  }catch{complete(Object.assign(new Error('W55_SIGNAL_NATIVE_START_FAILED'),{code:'W55_SIGNAL_NATIVE_START_FAILED'}));return}
  timer=setTimeout(()=>{worker.kill();complete(Object.assign(
   new Error('W55_SIGNAL_NATIVE_TIMEOUT'),{code:'W55_SIGNAL_NATIVE_TIMEOUT'}))},15_000);
  worker.on('error',()=>complete(Object.assign(new Error('W55_SIGNAL_NATIVE_UNAVAILABLE'),
   {code:'W55_SIGNAL_NATIVE_UNAVAILABLE'})));
  worker.stdout.on('data',buf=>{
   out+=String(buf);
   if(out.length>MAX){worker.kill();complete(Object.assign(new Error('W55_SIGNAL_RESPONSE_TOO_LARGE'),
    {code:'W55_SIGNAL_RESPONSE_TOO_LARGE'}));}
  });
  worker.stderr.on('data',buf=>{err+=String(buf).slice(0,128)});
  worker.on('close',code=>{
   if(done)return;
   if(code!==0){
    const reason=/^W55_[A-Z0-9_]+$/.test(err.trim())?err.trim():'W55_SIGNAL_NATIVE_DENIED';
    complete(Object.assign(new Error(reason),{code:reason}));return;
   }
   try {
    const result=JSON.parse(out);
    if(result?.ok!==true||typeof result.found!=='boolean'||
       typeof result.revoked!=='boolean'||!Number.isSafeInteger(result.revision))
      fail('W55_SIGNAL_RECEIPT_INVALID');
    complete(null,result);
   }catch(e){complete(e?.code?e:Object.assign(new Error('W55_SIGNAL_RECEIPT_INVALID'),
     {code:'W55_SIGNAL_RECEIPT_INVALID'}))}
  });
  const text=JSON.stringify(payload);
  if(text.length>MAX){
   worker.kill();complete(Object.assign(new Error('W55_SIGNAL_REQUEST_TOO_LARGE'),
    {code:'W55_SIGNAL_REQUEST_TOO_LARGE'}));return;
  }
  worker.stdin.on('error',()=>{});
  worker.stdin.end(text);
 });
}
const serialize=v=>JSON.stringify(v,BufferJSON.replacer);
const deserialize=v=>JSON.parse(v,BufferJSON.reviver);
const storageKey=(type,id)=>{
 if(!valid(type)||!valid(id))fail('W55_SIGNAL_KEY_INVALID');
 const k=type+':'+id;
 if(k.length>200)fail('W55_SIGNAL_KEY_TOO_LONG');
 return k;
};
export function createW55BaileysDpapiAuthStore({
 executable,resolveTrustedScope,assertCurrent,spawnImpl=nativeSpawn,qaEnv
}={}){
 if(typeof executable!=='string'||!isAbsolute(executable)||
    typeof resolveTrustedScope!=='function'||typeof assertCurrent!=='function')
  fail('W55_BAILEYS_NATIVE_OWNER_PORTS_REQUIRED');
 const native=(payload)=>run(executable,payload,{spawnImpl,qaEnv});
 const check=async(binding,phase)=>{
  const current=await assertCurrent({binding,phase});
  if(current!==true)fail('W55_SIGNAL_ACCOUNT_REVOKED_OR_STALE');
 };
 return Object.freeze({
  open:async({binding,userAction}={})=>{
   if(userAction!=='PAIR_OWN_ACCOUNT'&&userAction!=='RESUME_EXPLICITLY_APPROVED')
    fail('W55_SIGNAL_EXPLICIT_USER_ACTION_REQUIRED');
   await check(binding,'SIGNAL_OPEN');
   const scope=validateScope(await resolveTrustedScope({binding,operation:'SIGNAL_OPEN'}));
   const initial=await native({op:'read',scope});
   if(initial.revoked)fail('W55_SIGNAL_ACCOUNT_REVOKED');
   if(initial.found&&!initial.creds)fail('W55_SIGNAL_CREDS_CORRUPT');
   if(!initial.found&&userAction==='RESUME_EXPLICITLY_APPROVED')
    fail('W55_SIGNAL_EXISTING_CREDENTIALS_REQUIRED');
   let creds;
   if(initial.found){
    creds=deserialize(initial.creds);
    // A user who closed an UNREGISTERED first QR must be able to click
    // "Connect WhatsApp" again. Never resume a linked/registered account
    // through the new-pairing path, and never resurrect a revoked tombstone.
    if(userAction==='PAIR_OWN_ACCOUNT'&&creds?.registered===true)
     fail('W55_SIGNAL_EXPLICIT_RECONNECT_REQUIRED');
   }else{
    creds=initAuthCreds();
    await check(binding,'SIGNAL_NEW_PAIRING');
    await native({op:'put',scope,creds:serialize(creds)});
   }
   await check(binding,'SIGNAL_OPEN_COMPLETE');
   const latest=validateScope(await resolveTrustedScope({binding,operation:'SIGNAL_OPEN_COMPLETE'}));
   if(JSON.stringify(latest)!==JSON.stringify(scope))fail('W55_SIGNAL_SCOPE_STALE');
   return Object.freeze({
    state:Object.freeze({
     creds,
     keys:Object.freeze({
      get:async(type,ids)=>{
       await check(binding,'SIGNAL_KEY_READ');
       if(!Array.isArray(ids)||ids.length>300)fail('W55_SIGNAL_KEYS_REQUEST_INVALID');
       const doc=await native({op:'read',scope});
       if(!doc.found||doc.revoked||!doc.creds)fail('W55_SIGNAL_SESSION_NOT_AVAILABLE');
       const result={};
       for(const id of ids) {
        const raw=doc.keys?.[storageKey(type,id)];
        let value=raw===undefined?null:deserialize(raw);
        if(type==='app-state-sync-key'&&value)
          value=proto.Message.AppStateSyncKeyData.fromObject(value);
        result[id]=value;
       }
       await check(binding,'SIGNAL_KEY_READ_RETURN');
       return result;
      },
      set:async(data)=>{
       await check(binding,'SIGNAL_KEY_WRITE');
       if(!data||typeof data!=='object'||Array.isArray(data))
        fail('W55_SIGNAL_KEYS_INVALID');
       const entries={};let count=0;
       for(const [type,ids] of Object.entries(data)){
        if(!ids||typeof ids!=='object'||Array.isArray(ids))
          fail('W55_SIGNAL_KEYS_INVALID');
        for(const [id,value] of Object.entries(ids)){
         if(++count>1000)fail('W55_SIGNAL_KEYS_TOO_MANY');
         entries[storageKey(type,id)]=value==null?null:serialize(value);
        }
       }
       await check(binding,'SIGNAL_KEY_WRITE_COMMIT');
       await native({op:'put',scope,entries});
       await check(binding,'SIGNAL_KEY_WRITE_CONFIRM');
      },
     }),
    }),
    saveCreds:async()=>{
     await check(binding,'SIGNAL_CREDS_WRITE');
     await native({op:'put',scope,creds:serialize(creds)});
     await check(binding,'SIGNAL_CREDS_CONFIRM');
    },
   });
  },
  revoke:async({binding}={})=>{
   if(!binding)fail('W55_SIGNAL_REVOKE_BINDING_REQUIRED');
   // Revoke must still work AFTER W24 has revoked the account.
   const scope=validateScope(await resolveTrustedScope({binding,operation:'SIGNAL_REVOKE'}));
   const result=await native({op:'revoke',scope});
   if(!result.revoked)fail('W55_SIGNAL_REVOKE_NOT_CONFIRMED');
   return Object.freeze({revoked:true,revision:result.revision});
  }
 });
}
