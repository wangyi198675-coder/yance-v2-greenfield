// Actual installed Tauri WebView2 W54 status → explicit user logout → status.
// Isolated app ID com.yance.v2.w46-host-uat-r3; no real account or server trust.
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const exe=process.env.W46_INSTALLED_TAURI_EXE;
if(!exe||!exe.endsWith('YanceV2_W46_InstalledHost_R3_UAT\\yance-v2-native-session-lab.exe'))
 throw Error('ONLY_ISOLATED_W46_R3_INSTALLED_EXE_ALLOWED');
const port=59655;
const app=spawn(exe,[],{env:{...process.env,
 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port},
 windowsHide:false,stdio:'ignore'});
let ws,seq=0;
const pending=new Map(),events=[];
try{
 let target;
 for(let i=0;i<70;i++){
  try{
   const r=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(850)});
   target=(await r.json()).find(x=>x.type==='page'&&/^http:\/\/tauri\.localhost\//.test(x.url));
   if(target)break;
  }catch{}
  await delay(180);
 }
 if(!target)throw Error('ISOLATED_NATIVE_CDPTARGET_NOT_READY');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});
 });
 ws.addEventListener('message',ev=>{
  const obj=JSON.parse(ev.data);
  if(obj.id&&pending.has(obj.id)){
   const [resolve,reject]=pending.get(obj.id);pending.delete(obj.id);
   (obj.error?reject:resolve)(obj.error||obj.result);
  }
  if(obj.method==='Runtime.exceptionThrown'||obj.method==='Log.entryAdded')
   events.push(JSON.stringify(obj.params||{}).slice(0,900));
 });
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;pending.set(id,[resolve,reject]);ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP_TIMEOUT'))}},10000);
 });
 const run=async expression=>{
  const obj=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(obj.exceptionDetails)throw Error('NATIVE_IPC_EXCEPTION_'+JSON.stringify(obj.exceptionDetails));
  return obj.result?.value;
 };
 await call('Runtime.enable');await call('Log.enable');
 await delay(650);
 const before=await run("(async()=>await window.__TAURI__.core.invoke('session_status'))()");
 if(before?.nativeOsVerified!==true||before?.nativeSessionActive!==true||
    before?.serverTrusted!==false||before?.canSend!==false)
  throw Error('ISOLATED_NATIVE_UNEXPECTED_PRE_LOGOUT_STATUS '+JSON.stringify(before));
 await run("document.querySelector('[data-test=\"workspace-BRAIN\"]')?.click()");
 await delay(350);
 const button=await run("!!document.querySelector('[data-test=\"w46-native-session-logout\"]')");
 if(!button)throw Error('NATIVE_LOGOUT_UI_MISSING');
 await run("document.querySelector('[data-test=\"w46-native-session-logout\"]').click()");
 await delay(600);
 const after=await run("(async()=>await window.__TAURI__.core.invoke('session_status'))()");
 const visible=await run("document.querySelector('[data-test=\"w46-native-session-state\"]')?.textContent?.trim()");
 if(after?.nativeSessionActive!==false||after?.serverTrusted!==false||after?.canSend!==false)
  throw Error('REAL_NATIVE_LOGOUT_DID_NOT_REVOKE '+JSON.stringify(after));
 if(events.some(x=>/LOOPBACK_ONLY|ipc\.localhost.*Content Security Policy|Refused to connect.*ipc\.localhost/.test(x)))
  throw Error('NATIVE_LOGOUT_CSP_ERROR '+JSON.stringify(events));
 const report={type:'REAL_ISOLATED_INSTALLED_W54_NATIVE_LOGOUT_UI_PASS',
  exe,host:target.url,installedPid:app.pid,before,after,visible,
  events,paidModelCalls:0,socialMessagesSent:0,realAccountAuth:false};
 writeFileSync(new URL('./W46_REAL_INSTALLED_WEBVIEW2_LOGOUT_UAT.json',import.meta.url),
   JSON.stringify(report,null,2));
 console.log('W46_INSTALLED_TAURI_NATIVE_LOGOUT_PASS beforeActive=true afterActive=false serverTrusted=false canSend=false');
}finally{try{ws?.close()}catch{};try{app.kill()}catch{}}
