// Thin connection adapter for OpenAI's official @siwc/local SDK.
// No custom OAuth, token exchange, provider registry or model implementation.
// Windows CurrentUser DPAPI protects SDK-owned connection data at rest.
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';

const safeJson=(res,status,data)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'});
 res.end(JSON.stringify(data));
};
const csrfOk=(req,session)=>{
 const a=session?.record?.csrf,b=req.headers['x-yance-csrf'];
 return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&
 /^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
};
async function readObject(req,max=2000){
 if(req.headers['content-type']!=='application/json')throw Error('JSON_REQUIRED');
 let s='';for await(const chunk of req){s+=chunk;if(s.length>max)throw Error('REQUEST_TOO_LARGE')}
 const obj=JSON.parse(s);if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('OBJECT_REQUIRED');
 return obj;
}
const osScript=mode=>[
 '$ErrorActionPreference="Stop"',
 'Add-Type -AssemblyName System.Security',
 '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
 '$ent=[Text.Encoding]::UTF8.GetBytes("YanceV2-ChatGPT-OfficialSDK-v1")',
 '$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser',
 mode==='encrypt'?'$r=[Security.Cryptography.ProtectedData]::Protect($b,$ent,$scope)':'$r=[Security.Cryptography.ProtectedData]::Unprotect($b,$ent,$scope)',
 '[Console]::Out.Write([Convert]::ToBase64String($r))'
].join(';');
export function currentUserDpapi(mode,bytes){
 if(process.platform!=='win32')return Promise.reject(Error('WINDOWS_DPAPI_REQUIRED'));
 return new Promise((resolve,reject)=>{
  const payload=Buffer.from(bytes).toString('base64');
  const script=Buffer.from(osScript(mode),'utf16le').toString('base64');
  const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',script],{
   windowsHide:true,stdio:['pipe','pipe','ignore'],shell:false
  });
  let out='',total=0,done=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('DPAPI_TIMEOUT'))},15000);
  function finish(error,result){
   if(done)return;done=true;clearTimeout(timer);
   if(error)reject(error);else resolve(result);
  }
  child.stdout.on('data',c=>{total+=c.length;if(total>150000){child.kill();finish(Error('DPAPI_TOO_LARGE'))}else out+=c.toString('utf8')});
  child.on('error',e=>finish(e));
  child.on('close',code=>{
   if(done)return;
   if(code!==0)return finish(Error('DPAPI_UNAVAILABLE'));
   try{finish(null,new Uint8Array(Buffer.from(out.trim(),'base64')))}catch{finish(Error('DPAPI_INVALID_RESPONSE'))}
  });
  child.stdin.end(payload);
 });
}
function openOfficialBrowser(url){
 const target=new URL(url);
 if(target.origin!=='https://auth.openai.com')throw Error('UNEXPECTED_SIWC_LOGIN_HOST');
 return new Promise((resolve,reject)=>{
  const script=Buffer.from(
   '$ErrorActionPreference="Stop";$u=[Console]::In.ReadToEnd().Trim();'+
   '$p=[Diagnostics.ProcessStartInfo]::new($u);$p.UseShellExecute=$true;'+
   '[Diagnostics.Process]::Start($p)|Out-Null','utf16le').toString('base64');
  const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',script],{
   windowsHide:true,stdio:['pipe','ignore','ignore'],shell:false});
  p.on('error',reject);
  p.on('close',code=>code===0?resolve():reject(Error('SIWC_BROWSER_OPEN_FAILED')));
  p.stdin.end(target.href);
 });
}
const publicError=e=>({code:String(e?.code||'SIWC_CONNECT_FAILED').slice(0,80),
 message:String(e?.message||'Official ChatGPT connection failed').slice(0,220)});

export function createOfficialSiwcHttp({sessionAuthority,webOrigin}={}){
 if(typeof sessionAuthority?.sessionFor!=='function')throw Error('LOCAL_SESSION_REQUIRED');
 const defaultSdk=join(homedir(),'Documents','YanceV2','ThirdParty','openai-sign-in-with-chatgpt-devkit','packages','local','dist','index.js');
 const sdkEntry=process.env.YANCE_W47_SIWC_SDK_ENTRY||defaultSdk;
 const storageDir=join(process.env.LOCALAPPDATA||homedir(),'YanceV2','OfficialChatGPT');
 let clientPromise=null,connecting=false,lastError=null;
 const client=()=>clientPromise??=(async()=>{
  if(process.platform!=='win32'||!existsSync(sdkEntry))throw Error('OFFICIAL_SIWC_SDK_NOT_INSTALLED');
  const lib=await import(pathToFileURL(sdkEntry).href);
  if(typeof lib.createChatGPT!=='function')throw Error('OFFICIAL_SIWC_SDK_INVALID');
  return lib.createChatGPT({appName:'Yance',appId:'yance-v2-personal',
   redirectPort:0,storageDir,
   credentialEncryption:{
    id:'win-dpapi-current-user-v1',isAvailable:()=>process.platform==='win32',
    encrypt:data=>currentUserDpapi('encrypt',data),
    // Official @siwc/local CredentialEncryption.decrypt MUST return UTF-8 text,
    // not a Uint8Array. Returning bytes made every valid saved credential fail.
    decrypt:async data=>new TextDecoder('utf-8',{fatal:true}).decode(
     await currentUserDpapi('decrypt',data))
   },
   openBrowser:openOfficialBrowser});
 })();
 const handler=async(req,res,url)=>{
  const route=url.pathname;
  if(!route.startsWith('/api/v2/chatgpt/'))return false;
  const s=sessionAuthority.sessionFor(req);
  if(!s||!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(s.record.kind)){
   safeJson(res,401,{ok:false,error:'LOCAL_SESSION_REQUIRED'});return true;
  }
  const action=route.slice('/api/v2/chatgpt/'.length);
  if(req.method==='GET'&&!['status','models'].includes(action)){
   safeJson(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});return true;
  }
  if(req.method==='POST'){
   if(req.headers.origin!==webOrigin||!csrfOk(req,s)){
    safeJson(res,403,{ok:false,error:'CURRENT_LOCAL_SESSION_OR_CSRF_REQUIRED'});return true;
   }
  }
  try{
   const c=await client();
   if(action==='status'&&req.method==='GET'){
    const state=await c.getSession();
    safeJson(res,200,{ok:true,source:'OPENAI_OFFICIAL_SIWC_LOCAL',
     ...state,connecting,lastError,canSend:false});return true;
   }
   if(action==='sign-in'&&req.method==='POST'){
    const data=await readObject(req);
    if(Object.keys(data).length){safeJson(res,422,{ok:false,error:'EMPTY_BODY_REQUIRED'});return true}
    if(connecting){safeJson(res,409,{ok:false,error:'SIWC_SIGNIN_ALREADY_RUNNING'});return true}
    connecting=true;lastError=null;
    // Official SDK starts OAuth in the user's default browser, then verifies the
    // callback, saves OS-encrypted credentials and reports actual grant/scopes.
    void c.signIn().catch(e=>{lastError=publicError(e)})
     .finally(()=>{connecting=false});
    safeJson(res,202,{ok:true,status:'CONNECTING',source:'OPENAI_OFFICIAL_SIWC_LOCAL'});
    return true;
   }
   if(action==='models'&&req.method==='GET'){
    const state=await c.getSession();
    if(state.status!=='connected'||!state.sharing){
     safeJson(res,409,{ok:false,error:'SIWC_ACCOUNT_OR_SHARING_REQUIRED'});return true;
    }
    const models=await c.listModels();
    safeJson(res,200,{ok:true,source:'OPENAI_OFFICIAL_SIWC_LOCAL',
      models:models.map(m=>({modelId:m.slug,name:m.displayName})),canSend:false});
    return true;
   }
   if(action==='disconnect'&&req.method==='POST'){
    const data=await readObject(req);
    if(Object.keys(data).length){safeJson(res,422,{ok:false,error:'EMPTY_BODY_REQUIRED'});return true}
    c.cancelSignIn();await c.disconnect();
    lastError=null;connecting=false;
    safeJson(res,200,{ok:true,status:'disconnected'});return true;
   }
   if(action==='test-turn'&&req.method==='POST'){
    const data=await readObject(req,5000);
    if(Object.keys(data).sort().join('|')!=='model|text'||
      typeof data.model!=='string'||!/^[A-Za-z0-9._:-]{2,80}$/.test(data.model)||
      typeof data.text!=='string'||!data.text.trim()||data.text.length>2000){
      safeJson(res,422,{ok:false,error:'TEST_TURN_INPUT_INVALID'});return true;
    }
    const current=await c.getSession();
    if(current.status!=='connected'||current.sharing!==true){
      safeJson(res,409,{ok:false,error:'SIWC_SHARING_NOT_ENABLED'});return true;
    }
    const models=await c.listModels();
    if(!models.some(m=>m.slug===data.model)){
      safeJson(res,409,{ok:false,error:'SIWC_MODEL_NOT_AVAILABLE'});return true;
    }
    const answer=await c.streamResponse({model:data.model,input:data.text,
      instructions:'Respond to the user directly; this is a manual one-turn test of the official ChatGPT connection.'});
    safeJson(res,200,{ok:true,source:'OPENAI_OFFICIAL_SIWC_LOCAL',
      text:String(answer.text||'').slice(0,20000),model:data.model,
      verifiedProviderResponse:true,agnoHistoryRecorded:false,canSend:false});return true;
   }
   safeJson(res,404,{ok:false,error:'SIWC_ROUTE_NOT_FOUND'});return true;
  }catch(e){
   const err=publicError(e);
   safeJson(res,503,{ok:false,error:err.code,message:err.message,canSend:false});return true;
  }
 };
 // Internal-only SDK adapter. The same official client owns authentication,
 // model discovery and inference. Agno owns its own Run and ChatHistory.
 const modelPort=Object.freeze({
  async profile(){
   const state=await (await client()).getSession();
   return state.status==='connected'&&state.sharing===true?
    String(state.profileId||''):'';
  },
  async list(){
   const sdk=await client();
   const session=await sdk.getSession();
   if(session.status!=='connected'||session.sharing!==true)return [];
   const models=await sdk.listModels();
   return models.filter(m=>typeof m.slug==='string'&&
     /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/.test(m.slug))
     .map(m=>({modelId:m.slug,name:String(m.displayName||m.slug)}));
  },
  async invoke({modelId,messages,profileRef}){
   if(typeof modelId!=='string'||!Array.isArray(messages)||
      messages.length>24||JSON.stringify(messages).length>32000||
      !messages.every(m=>m&&['developer','user','assistant'].includes(m.role)&&
       typeof m.content==='string'&&m.content.length<=16000))
    throw Error('SIWC_NATIVE_TEXT_REQUEST_INVALID');
   const sdk=await client();
   const session=await sdk.getSession();
   if(session.status!=='connected'||session.sharing!==true||
      !profileRef||session.profileId!==profileRef)
    throw Error('SIWC_CURRENT_PROFILE_NOT_SELECTED');
   const models=await sdk.listModels();
   if(!models.some(m=>m.slug===modelId))
    throw Error('SIWC_SELECTED_MODEL_UNAVAILABLE');
   const answer=await sdk.streamResponse({model:modelId,input:messages});
   const after=await sdk.getSession();
   if(after.status!=='connected'||after.sharing!==true||
      after.profileId!==profileRef)
    throw Error('SIWC_PROFILE_CHANGED_DURING_INFERENCE');
   if(typeof answer?.text!=='string'||!answer.text.trim())
    throw Error('SIWC_PROVIDER_TEXT_REQUIRED');
   return answer.text.slice(0,18000);
  }
 });
 return Object.assign(handler,{modelPort});
}
