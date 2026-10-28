// W47 server-owned subprocess stdio bridge into the ORIGINAL W43 Python port.
// No HTTP or browser can directly open the bridge. OFF by default until W54
// verified current-user profile and W43 source paths are independently signed.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {isAbsolute,resolve} from 'node:path';

const childScript=fileURLToPath(new URL('./w47-w43-private-child.py',import.meta.url));
const MAX_LINE=200000;
function acceptable(c){
 return c&&typeof c==='object'&&typeof c.principalRef==='string'&&
 typeof c.installationRef==='string'&&typeof c.sessionRef==='string'&&
 Number.isSafeInteger(c.sessionRevision)&&Number.isSafeInteger(c.revocationGeneration)&&
 Number.isSafeInteger(c.expiresAtMs)&&c.expiresAtMs>Date.now()&&
 typeof c.appLocalDataRoot==='string'&&isAbsolute(c.appLocalDataRoot);
}
/**
 * Python executable and W43 module root are installed app-owned paths.
 * No-model History or W55 native callback requires a plaintext key file.
 * Optional local llama.cpp key stays in native configuration, never HTTP.
 */
export function createW43PythonPrivatePort({
 pythonExecutable,w43ModuleRoot,protectedKeyFile,
 resolveNativeCloudSecret=null,nativeCloudKeyPort=null,officialSiwcPort=null,timeoutMs=190000
}={}){
 if(!pythonExecutable||!w43ModuleRoot||
    !isAbsolute(pythonExecutable)||!isAbsolute(w43ModuleRoot)||
    (protectedKeyFile!==undefined&&protectedKeyFile!==null&&
      (typeof protectedKeyFile!=='string'||!isAbsolute(protectedKeyFile))))
  throw Error('W43_OWNER_SIGNED_PYTHON_PATHS_REQUIRED');
 if(resolveNativeCloudSecret!==null&&typeof resolveNativeCloudSecret!=='function')
  throw Error('W55_NATIVE_CLOUD_CREDENTIAL_CALLBACK_REQUIRED');
  if(nativeCloudKeyPort!==null&&typeof nativeCloudKeyPort?.withSecret!=='function')
  throw Error('W55_NATIVE_SECRET_PORT_INVALID');
 if(officialSiwcPort!==null&&typeof officialSiwcPort?.invoke!=='function')
  throw Error('SIWC_OFFICIAL_SDK_OWNER_PORT_REQUIRED');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)
  throw Error('W43_PYTHON_BRIDGE_TIMEOUT_INVALID');
 async function invoke(method,ctx,threadId,text,requestId,receipt,modelSelection,inspection={}){
  if(!ctx?.checkCurrent||typeof ctx.checkCurrent!=='function')
   throw {httpStatus:503,code:'W47_VERIFIED_CONTEXT_REQUIRED'};
  return new Promise((done,fail)=>{
   const proc=spawn(pythonExecutable,['-B',childScript,resolve(w43ModuleRoot)],{
    windowsHide:true,stdio:['pipe','pipe','ignore'],shell:false,
    env:{...process.env,AGNO_TELEMETRY:'false',
      // Windows default console encoding can reject Chinese PRIVATE prompts.
      // Original W43 Agno IPC is UTF-8 end-to-end, never change user text.
      PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',
      OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',OLLAMA_API_KEY:'',
      YANCE_W43_LOCAL_KEY_FILE:protectedKeyFile??''}});
   let finished=false,seen=0,responding=false,verifiedClaim=null;
   const clean=()=>{
    clearTimeout(timer);
    stream.close();proc.stdin.destroy();
    if(proc.exitCode===null)proc.kill();
   };
   const finish=(e,value)=>{
    if(finished)return;
    finished=true;
    if(e){clean();fail(e);return}
    // Allow original W43 Python process and native Agno SQLite handles to
    // exit cleanly before confirming an IPC result (especially on Windows).
    clearTimeout(timer);stream.close();proc.stdin.end();
    if(proc.exitCode!==null){proc.exitCode===0?done(value):fail({httpStatus:503,code:'W43_PYTHON_EXIT_NONZERO'});return}
    proc.once('exit',code=>code===0?done(value):fail({httpStatus:503,code:'W43_PYTHON_EXIT_NONZERO'}));
   };
   const timer=setTimeout(()=>finish({httpStatus:503,code:'W43_PYTHON_BRIDGE_TIMEOUT'}),timeoutMs);
   const stream=createInterface({input:proc.stdout,crlfDelay:Infinity});
   proc.on('error',()=>finish({httpStatus:503,code:'W43_PYTHON_BRIDGE_START_FAILED'}));
   proc.on('exit',()=>{if(!finished)finish({httpStatus:503,code:'W43_PYTHON_BRIDGE_CLOSED'})});
   const send=v=>{if(!finished&&proc.stdin.writable)proc.stdin.write(JSON.stringify(v)+'\n')};
   stream.on('line',async line=>{
    seen+=line.length;
    if(seen>MAX_LINE||line.length>MAX_LINE){
     finish({httpStatus:503,code:'W43_PYTHON_TRANSPORT_TOO_LARGE'});return;
    }
    let msg;try{msg=JSON.parse(line)}catch{
     finish({httpStatus:503,code:'W43_PYTHON_TRANSPORT_INVALID'});return
    }
    if(msg.kind==='VERIFY'){
     // The ORIGINAL W43 expert_turn invokes Agno PRIVATE_TURN, then reads
     // its persisted Run/Tool/Trace via PRIVATE_HISTORY in the SAME scope.
     // Re-verify the current trusted W54/W55 Principal at every challenge;
     // do not broaden any other method's one-operation protocol.
     const permittedOperations=method==='expertTurn'
      ?['PRIVATE_TURN','PRIVATE_HISTORY']
      :method==='history'||method.startsWith('native')||method==='expertDirectory'
       ?['PRIVATE_HISTORY']:['PRIVATE_TURN'];
     if(responding||!permittedOperations.includes(msg.operation)){
      finish({httpStatus:503,code:'W43_PYTHON_VERIFIER_PROTOCOL_INVALID'});return
     }
     responding=true;
     try{
      const claim=await ctx.checkCurrent();
      if(!acceptable(claim)){
       send({kind:'DENIED'});finish({httpStatus:503,code:'W54_CURRENT_USER_PROFILE_NOT_VERIFIED'});return;
      }
      verifiedClaim=claim;
      send({kind:'CLAIM',...claim});
     }catch(e){
      send({kind:'DENIED'});
      finish({httpStatus:e?.httpStatus===409?409:e?.httpStatus===401?401:503,
       code:'W47_CURRENT_SESSION_RECHECK_FAILED'});return;
     }finally{responding=false}
    }else if(msg.kind==='CLOUD_KEY_REQUEST'){
     // The original W43 SDK consumes this transient key only in the Python
     // executor. It NEVER becomes an HTTP DTO, logfile, environment value,
     // persisted file, or an Agno model selected by the browser.
     if(responding||resolveNativeCloudSecret===null||method==='history'||
        !['openrouter','openai'].includes(msg.backend)||
        typeof msg.modelId!=='string'||msg.modelId.length>128){
       finish({httpStatus:503,code:'W55_NATIVE_CREDENTIAL_UNAVAILABLE'});return
     }
     responding=true;
     try{
      const claim=await ctx.checkCurrent();
      if(!acceptable(claim)||claim.modelBackend!==msg.backend||
         claim.modelId!==msg.modelId||claim.cloudSecretMode!=='W55_NATIVE_CALLBACK'||
         claim.modelUserSelected!==true||claim.extraChargeApproved!==true||
         claim.protectedCredentialAttested!==true)
       throw Error('W55_CREDENTIAL_CURRENT_SELECTION_NOT_VERIFIED');
      const secret=await resolveNativeCloudSecret({verifiedClaim:claim,
       provider:msg.backend,modelId:msg.modelId});
      if(typeof secret!=='string'||secret.length<16||secret.length>400||/\\s/.test(secret))
       throw Error('W55_NATIVE_CREDENTIAL_INVALID');
      const again=await ctx.checkCurrent();
      if(!acceptable(again)||again.sessionRef!==claim.sessionRef||
         again.sessionRevision!==claim.sessionRevision||
         again.revocationGeneration!==claim.revocationGeneration||
         again.modelSelectionEpoch!==claim.modelSelectionEpoch||
         again.modelBackend!==claim.modelBackend||again.modelId!==claim.modelId)
       throw Error('W55_NATIVE_SELECTION_REVOKED');
      send({kind:'CLOUD_KEY_SECRET',secret});
     }catch{
      send({kind:'DENIED'});
      finish({httpStatus:503,code:'W55_NATIVE_CREDENTIAL_UNAVAILABLE'});return;
     }finally{responding=false}
    }else if(msg.kind==='CLOUD_SECRET_REQUEST'){
     // Only the original W43 child can request the chosen provider while
     // preparing the Agno SDK model. No browser/HTTP Key endpoint exists.
     if(method!=='turn'||responding||!verifiedClaim||!modelSelection||
        !['OPENROUTER_USER_API','OPENAI_USER_API'].includes(modelSelection.provider)||
        msg.provider!==modelSelection.provider||msg.modelId!==modelSelection.modelId||
        !nativeCloudKeyPort){
      finish({httpStatus:503,code:'W55_NATIVE_CLOUD_SECRET_PORT_UNAVAILABLE'});return;
     }
     responding=true;
     try{
      const fresh=await ctx.checkCurrent();
      const exact=['principalRef','installationRef','sessionRef','sessionRevision',
        'revocationGeneration','modelSelectionEpoch','modelBackend','modelId','cloudCredentialSource'];
      if(!acceptable(fresh)||exact.some(k=>fresh[k]!==verifiedClaim[k])||
         fresh.cloudCredentialSource!=='W55_NATIVE_WIN_CRED'||
         fresh.modelUserSelected!==true||fresh.extraChargeApproved!==true||
         fresh.protectedCredentialAttested!==true||
         fresh.modelBackend!==(modelSelection.provider==='OPENAI_USER_API'?'openai':'openrouter')||
         fresh.modelId!==modelSelection.modelId)
        throw Error('NATIVE_SELECTION_OR_CURRENT_USER_STALE');
      // The ONLY native port contract is callback-based: W55 keeps custody,
      // checks live OS-user + revocation/revision, and supplies a transient
      // key for this existing private stdin pipe, never for HTTP/renderer.
      let handed=false;
      await nativeCloudKeyPort.withSecret({
       profile:fresh,
       provider:modelSelection.provider==='OPENAI_USER_API'?'OPENAI_API':'OPENROUTER',
       modelId:modelSelection.modelId,
       selectionEpoch:fresh.modelSelectionEpoch
      },async secret=>{
       if(handed||typeof secret!=='string'||secret.length<16||
          secret.length>400||/\s/.test(secret))throw Error('W55_SECRET_INVALID');
       handed=true;
       send({kind:'CLOUD_SECRET',value:secret});
      });
      if(!handed)throw Error('W55_NATIVE_SECRET_NOT_DELIVERED');
     }catch{
      // A Key revoked during the W54/W55 callback never becomes an
      // unapproved model call. Never surface the secret/error to HTTP.
      send({kind:'CLOUD_SECRET_DENIED'});
     }finally{responding=false}
    }else if(msg.kind==='SIWC_MODEL_REQUEST'){
      if(responding||method!=='turn'||!officialSiwcPort||!verifiedClaim||
         modelSelection?.provider!=='CHATGPT_PLAN_SIWC'||
         modelSelection.modelId!==msg.modelId||!Array.isArray(msg.messages)||
         msg.messages.length>24||JSON.stringify(msg.messages).length>32000){
        finish({httpStatus:503,code:'SIWC_NATIVE_REQUEST_INVALID'});return;
      }
      responding=true;
      try{
        const before=await ctx.checkCurrent();
        const fields=['principalRef','installationRef','sessionRef','sessionRevision',
          'revocationGeneration','modelSelectionEpoch','modelBackend','modelId',
          'siwcProfileRef'];
        if(!acceptable(before)||fields.some(k=>before[k]!==verifiedClaim[k])||
           before.modelBackend!=='siwc'||before.modelUserSelected!==true)
          throw Error('SIWC_CURRENT_SELECTION_CHANGED');
        const answer=await officialSiwcPort.invoke({
          modelId:msg.modelId,messages:msg.messages,
          profileRef:before.siwcProfileRef
        });
        const after=await ctx.checkCurrent();
        if(!acceptable(after)||fields.some(k=>after[k]!==before[k]))
          throw Error('SIWC_SESSION_REVOKED');
        if(typeof answer!=='string'||!answer.trim())
          throw Error('SIWC_EMPTY_PROVIDER_REPLY');
        send({kind:'SIWC_MODEL_RESULT',text:answer.slice(0,18000)});
      }catch{
        send({kind:'SIWC_MODEL_DENIED'});
        finish({httpStatus:503,code:'SIWC_OFFICIAL_PROVIDER_UNAVAILABLE'});return;
      }finally{responding=false}
    }else if(msg.kind==='RESULT'){
     if(!msg.result||typeof msg.result!=='object'){
      finish({httpStatus:503,code:'W43_PYTHON_RESULT_INVALID'});return
     }
     finish(null,msg.result);
    }else if(msg.kind==='W43_ERROR'){
     finish({httpStatus:[401,403,404,409,422,503].includes(msg.httpStatus)?msg.httpStatus:503,
      code:'W43_NATIVE_PRIVATE_'+String(msg.error||'UNKNOWN').slice(0,100)});
    }else finish({httpStatus:503,code:'W43_PYTHON_TRANSPORT_INVALID'});
   });
   send({method,threadId,...(method==='history'?{}:{text,requestId}),
    ...(method==='finish'?{receipt}:{}),
    ...(['turn','expertTurn'].includes(method)&&modelSelection?{modelSelection}:{}),...inspection});
  });
 }
 return Object.freeze({
  // Capability support is NOT model readiness or billable authorization.
  // W54/W55 native credential/consent and W43 live SDK verify separately.
  supportsSelection:async s=>!!s&&typeof s==='object'&&
   ['OPENROUTER_USER_API','OPENAI_USER_API','LLAMACPP_LOCAL_QWEN3_8B_FREE','CHATGPT_PLAN_SIWC'].includes(s.provider)&&
   typeof s.modelId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/.test(s.modelId)&&
   (s.provider!=='LLAMACPP_LOCAL_QWEN3_8B_FREE'||s.modelId==='qwen3:8b'),
  turn:(ctx,thread_id,text,request_id,modelSelection)=>
   invoke('turn',ctx,thread_id,text,request_id,undefined,modelSelection),
  history:(ctx,thread_id)=>invoke('history',ctx,thread_id),
  expertDirectory:ctx=>invoke('expertDirectory',ctx,'personal'),
  expertSetEnabled:(ctx,expertId,enabled)=>invoke('expertSetEnabled',ctx,'personal',undefined,undefined,undefined,undefined,{expertId,enabled}),
  expertTurn:(ctx,threadId,requestId,expertId,stableId,usageScope,modelSelection)=>
   invoke('expertTurn',ctx,threadId,undefined,requestId,undefined,modelSelection,
    {expertId,stableId,usageScope}),
  nativeTools:ctx=>invoke('nativeTools',ctx,'personal'),
  nativeRuns:(ctx,thread_id,limit=25)=>invoke('nativeRuns',ctx,thread_id,undefined,undefined,undefined,undefined,{limit}),
  nativeRun:(ctx,thread_id,runId)=>invoke('nativeRun',ctx,thread_id,undefined,undefined,undefined,undefined,{runId}),
  nativeTrace:(ctx,thread_id,runId)=>invoke('nativeTrace',ctx,thread_id,undefined,undefined,undefined,undefined,{runId}),
  claim:(ctx,thread_id,request_id,text)=>invoke('claim',ctx,thread_id,text,request_id),
  finish:(ctx,thread_id,request_id,text,receipt)=>invoke('finish',ctx,thread_id,text,request_id,receipt),
  markUnknown:(ctx,thread_id,request_id,text)=>invoke('markUnknown',ctx,thread_id,text,request_id),
  reconcile:(ctx,thread_id,request_id,text)=>invoke('reconcile',ctx,thread_id,text,request_id)
 });
}
