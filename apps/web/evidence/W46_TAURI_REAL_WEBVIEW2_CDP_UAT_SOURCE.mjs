// Actual installed Tauri / Microsoft WebView2. No user accounts, paid models,
// native Session mint, real sends, or changes to other installed app processes.
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const exe=process.env.W46_INSTALLED_TAURI_EXE;
if(!exe)throw Error('W46_INSTALLED_TAURI_EXE_REQUIRED');
const port=59653,endpoint='http://127.0.0.1:'+port;
const app=spawn(exe,[],{env:{...process.env,
 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port},
 windowsHide:false,stdio:'ignore'});
const events=[],pending=new Map();let ws,seq=0;
try{
 let target,lastList=[];
 for(let i=0;i<85;i++){
  try{
   const r=await fetch(endpoint+'/json/list',{signal:AbortSignal.timeout(850)});
   const list=await r.json();lastList=list.map(x=>({type:x.type,url:x.url,title:x.title}));
   target=list.find(t=>t.type==='page'&&/^https?:\/\/tauri\.localhost(?:[/:]|$)/.test(t.url));
   if(target)break;
  }catch{}
  await delay(180);
 }
 if(!target)throw Error('ACTUAL_INSTALLED_TAURI_WEBVIEW_CDP_NOT_READY '+JSON.stringify({lastList,exitCode:app.exitCode,pid:app.pid}));
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',reject,{once:true});
 });
 ws.addEventListener('message',ev=>{
  const o=JSON.parse(ev.data);
  if(o.id&&pending.has(o.id)){
   const [yes,no]=pending.get(o.id);pending.delete(o.id);
   (o.error?no:yes)(o.error||o.result);
  }
  if(['Runtime.exceptionThrown','Runtime.consoleAPICalled','Log.entryAdded'].includes(o.method))
   events.push({method:o.method,content:JSON.stringify(o.params||{}).slice(0,1200)});
 });
 const call=(method,params={})=>new Promise((yes,no)=>{
  const id=++seq;pending.set(id,[yes,no]);ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(pending.has(id)){pending.delete(id);no(Error('CDP_TIMEOUT_'+method))}},10000);
 });
 const evalJs=async code=>{
  const r=await call('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('WEBVIEW_EVAL_'+JSON.stringify(r.exceptionDetails).slice(0,500));
  return r.result?.value;
 };
 await call('Runtime.enable');await call('Page.enable');await call('Log.enable');
 await call('Network.enable');
 await call('Page.reload',{ignoreCache:true});await delay(1600);
 const snap=async()=>evalJs("(()=>({title:document.title,url:location.href,appRoot:document.querySelector('#app')?.children.length||0,nativeProduct:document.querySelectorAll('[data-test=\"w46-product-candidate\"]').length,uniqueChat:document.querySelectorAll('[data-test=\"w46-real-chat\"]').length,frozenContacts:document.querySelectorAll('.contact-action').length,nativeProviderControls:document.querySelectorAll('[data-test=\"native-provider-setup\"]').length,trueBrain:document.querySelectorAll('[data-test=\"bc-private-brain\"]').length,brainSendDisabled:document.querySelector('[data-test=\"brain-send\"]')?.disabled??null,currentDisplay:document.body.innerText.slice(0,650)}))()");
 const first=await snap();
 if(first.appRoot<1||first.nativeProduct!==1||first.uniqueChat!==1||first.frozenContacts!==0)
  throw Error('TAURI_GUI_STILL_BLANK_OR_OFFLINE_'+JSON.stringify(first));
 await evalJs("document.querySelector('[data-test=\"workspace-ACCOUNTS\"]')?.click()");
 await delay(350);
 const accounts=await snap();
 if(accounts.nativeProviderControls!==4)throw Error('TAURI_ACCOUNTS_NOT_RENDERED_'+JSON.stringify(accounts));
 const accountScreenshot=(await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
 writeFileSync(new URL('./W46_REAL_INSTALLED_WEBVIEW2_ACCOUNTS.png',import.meta.url),Buffer.from(accountScreenshot,'base64'));
 await evalJs("document.querySelectorAll('[data-test=\"native-provider-setup\"]')[2]?.click()");
 await delay(350);
 const setup=await evalJs("(()=>({feedback:[...document.querySelectorAll('[data-test=\"native-provider-feedback\"]')].map(x=>x.textContent.trim()),qrCount:document.querySelectorAll('[data-test=\"native-provider-qr\"]').length}))()");
 if(setup.qrCount!==0)throw Error('TAURI_UNAUTHORIZED_QR_SHOWN');
 await evalJs("document.querySelector('[data-test=\"workspace-BRAIN\"]')?.click()");
 await delay(330);
 const brain=await snap();
 if(brain.trueBrain!==1||brain.brainSendDisabled!==true)
  throw Error('TAURI_PRIVATE_BRAIN_NOT_SAFE_'+JSON.stringify(brain));
 const brainScreenshot=(await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
 writeFileSync(new URL('./W46_REAL_INSTALLED_WEBVIEW2_BRAIN.png',import.meta.url),Buffer.from(brainScreenshot,'base64'));
 const nativeStatus=await evalJs("(async()=>{if(typeof window.__TAURI__?.core?.invoke!=='function')return 'TAURI_IPC_NOT_AVAILABLE';try{const s=await window.__TAURI__.core.invoke('session_status');return {nativeOsVerified:s.nativeOsVerified,nativeSessionActive:s.nativeSessionActive,serverTrusted:s.serverTrusted,canSend:s.canSend}}catch(e){return 'NATIVE_SESSION_READ_ERROR '+String(e)}})()");
 await evalJs("document.querySelector('[data-test=\"workspace-CHAT\"]')?.click()");
 await delay(250);
 const back=await snap();
 if(back.uniqueChat!==1)throw Error('TAURI_CHAT_SWITCH_FAILED');
 const png=(await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
 writeFileSync(new URL('./W46_REAL_INSTALLED_WEBVIEW2_570_CHROMELESS.png',import.meta.url),Buffer.from(png,'base64'));
 const report={type:'REAL_INSTALLED_TAURI_WEBVIEW2',
  actualInstalledExecutable:exe,spawnedInstalledPid:app.pid,
  entry:target.url,first,accounts,setup,brain,nativeStatus,back,
  jsEvents:events.slice(-16),paidCalls:0,socialSends:0};
 writeFileSync(new URL('./W46_REAL_INSTALLED_WEBVIEW2_UAT.json',import.meta.url),
  JSON.stringify(report,null,2));
 if(events.some(x=>/LOOPBACK_ONLY/.test(x.content)))throw Error('TAURI_NATIVE_WEBVIEW_REPRODUCED_LOOPBACK_ONLY');
 if(events.some(x=>/Connecting to.*ipc\.localhost.*Content Security Policy|Refused to connect.*ipc\.localhost/.test(x.content)))
  throw Error('TAURI_IPC_CSP_STILL_BLOCKED');
 console.log('W46_INSTALLED_TAURI_WEBVIEW2_GUI_PASS root='+first.appRoot+
  ' fourAccounts='+accounts.nativeProviderControls+' brain='+brain.trueBrain+
  ' app='+exe+' session='+JSON.stringify(nativeStatus));
}finally{try{ws?.close()}catch{};try{app.kill()}catch{}}
