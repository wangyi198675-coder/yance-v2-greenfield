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
 * sourceRoot/pythonExecutable/protectedKeyFile are *server install configuration*,
 * checked by W09 + W43 Owner. NEVER request fields. A missing source/key seals.
 */
export function createW43PythonPrivatePort({
 pythonExecutable,w43ModuleRoot,protectedKeyFile,timeoutMs=190000
}={}){
 if(!pythonExecutable||!w43ModuleRoot||!protectedKeyFile||
    !isAbsolute(pythonExecutable)||!isAbsolute(w43ModuleRoot)||!isAbsolute(protectedKeyFile))
  throw Error('W43_OWNER_SIGNED_PYTHON_PATHS_REQUIRED');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)
  throw Error('W43_PYTHON_BRIDGE_TIMEOUT_INVALID');
 async function invoke(method,ctx,threadId,text,requestId){
  if(!ctx?.checkCurrent||typeof ctx.checkCurrent!=='function')
   throw {httpStatus:503,code:'W47_VERIFIED_CONTEXT_REQUIRED'};
  return new Promise((done,fail)=>{
   const proc=spawn(pythonExecutable,['-B',childScript,resolve(w43ModuleRoot)],{
    windowsHide:true,stdio:['pipe','pipe','ignore'],shell:false,
    env:{...process.env,AGNO_TELEMETRY:'false',
      OPENAI_API_KEY:'',OLLAMA_API_KEY:'',YANCE_W43_LOCAL_KEY_FILE:protectedKeyFile}});
   let finished=false,seen=0,responding=false;
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
     if(responding||!['PRIVATE_TURN','PRIVATE_HISTORY'].includes(msg.operation)||
        msg.operation!==(method==='turn'?'PRIVATE_TURN':'PRIVATE_HISTORY')){
      finish({httpStatus:503,code:'W43_PYTHON_VERIFIER_PROTOCOL_INVALID'});return
     }
     responding=true;
     try{
      const claim=await ctx.checkCurrent();
      if(!acceptable(claim)){
       send({kind:'DENIED'});finish({httpStatus:503,code:'W54_CURRENT_USER_PROFILE_NOT_VERIFIED'});return;
      }
      send({kind:'CLAIM',...claim});
     }catch(e){
      send({kind:'DENIED'});
      finish({httpStatus:e?.httpStatus===409?409:e?.httpStatus===401?401:503,
       code:'W47_CURRENT_SESSION_RECHECK_FAILED'});return;
     }finally{responding=false}
    }else if(msg.kind==='RESULT'){
     if(!msg.result||typeof msg.result!=='object'){
      finish({httpStatus:503,code:'W43_PYTHON_RESULT_INVALID'});return
     }
     finish(null,msg.result);
    }else if(msg.kind==='W43_ERROR'){
     finish({httpStatus:[401,409,422,503].includes(msg.httpStatus)?msg.httpStatus:503,
      code:'W43_NATIVE_PRIVATE_'+String(msg.error||'UNKNOWN').slice(0,100)});
    }else finish({httpStatus:503,code:'W43_PYTHON_TRANSPORT_INVALID'});
   });
   send({method,threadId,...(method==='turn'?{text,requestId}:{})});
  });
 }
 return Object.freeze({
  turn:(ctx,thread_id,text,request_id)=>invoke('turn',ctx,thread_id,text,request_id),
  history:(ctx,thread_id)=>invoke('history',ctx,thread_id)
 });
}
