import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const exe=process.env.W54_BC_INSTALLED_EXE;
if(!exe) throw Error('W54_BC_INSTALLED_EXE_REQUIRED');
const port=59641;
const app=spawn(exe,[],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`},windowsHide:false,stdio:'ignore'});
let ws;const pending=new Map(),events=[];let seq=0;
try{
 let target;
 for(let attempt=0;attempt<70;attempt++){
  try{
   const r=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(800)});
   const targets=await r.json();
   target=targets.find(t=>t.type==='page'&&/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/\?productDraft=1$/.test(t.url));
   if(target)break;
  }catch{}
  await delay(150);
 }
 if(!target)throw Error('TAURI_WEBVIEW_CDP_TARGET_NOT_READY');
 // Ordinary localhost HTTP access is intentionally NOT a native host:
 // it cannot mint the W47 HttpOnly first-party session or set a Cookie.
 const forged=await fetch(new URL('/api/v2/local-session/first-party',target.url),{
  method:'POST',headers:{'content-type':'application/json',origin:new URL(target.url).origin},body:'{}'
 });
 const fakeBody=(await forged.text()).slice(0,2000);
 const ordinaryIssuer=fakeBody.includes('"paired":true')||fakeBody.includes('"trustedSession":true');
 if(forged.headers.get('set-cookie')||ordinaryIssuer)
  throw Error('UNTRUSTED_LOCALHOST_MINTED_SESSION');
 const ordinaryLocalhost={status:forged.status,sessionMinted:false,setCookie:false};
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 ws.addEventListener('message',ev=>{
   const msg=JSON.parse(ev.data);
   if(msg.id&&pending.has(msg.id)){let [ok,bad]=pending.get(msg.id);pending.delete(msg.id);(msg.error?bad:ok)(msg.error||msg.result)}
   if(['Runtime.exceptionThrown','Log.entryAdded','Runtime.consoleAPICalled'].includes(msg.method)){
    const x=JSON.stringify(msg.params||{});
    events.push({method:msg.method,data:x.slice(0,1300)});
   }
 });
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;pending.set(id,[resolve,reject]);
  ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP_TIMEOUT_'+method))}},7000);
 });
 await call('Runtime.enable');await call('Page.enable');await call('Log.enable');
 await call('Page.reload',{ignoreCache:true});await delay(2200);
 const expr=`(()=>{const r=document.querySelector('#app');return JSON.stringify({title:document.title,url:location.href,ready:document.readyState,rootExists:!!r,rootChildren:r?.children?.length||0,rootHtml:r?.outerHTML?.slice(0,700),bodyText:document.body.innerText.slice(0,350),loadedJs:[...document.scripts].map(s=>s.src),resourceCount:performance.getEntriesByType('resource').length})})()`;
 const evaluated=await call('Runtime.evaluate',{expression:expr,returnByValue:true});
 const value=evaluated.result?.value;
 const nativeStatus=await call('Runtime.evaluate',{
  expression:"(async()=>{try{return JSON.stringify(await window.__TAURI_INTERNALS__.invoke('session_status'))}catch(e){return 'ERROR:'+String(e)}})()",
  awaitPromise:true,returnByValue:true
 });
 const nativeRaw=nativeStatus.result?.value||'';
 if(nativeRaw.startsWith('ERROR:'))throw Error('NATIVE_STATUS_IPC_FAILED: '+nativeRaw);
 const nativeResult=JSON.parse(nativeRaw);
 if(nativeResult.nativeOsVerified!==true||nativeResult.nativeSessionActive!==true||
    nativeResult.serverTrusted!==false||nativeResult.canSend!==false){
  throw Error('NATIVE_STATUS_NOT_VERIFIED_OR_FALSE_PRIVILEGE: '+nativeRaw)
 }
 const nav=[];
 for(const [label,expected] of [['渠道账号','ACCOUNTS'],['闺蜜大脑','BRAIN'],['设置诊断','SETTINGS'],['聊天','CHAT']]){
  const input=JSON.stringify(label);
  const clicked=await call('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('[data-test=\"w46-product-candidate\"] button')].find(x=>x.textContent.trim()===${input});if(!b||b.disabled)return false;b.click();return true})()`,returnByValue:true});
  await delay(320);
  const state=await call('Runtime.evaluate',{expression:`document.querySelector('[data-test="w46-product-candidate"]')?.getAttribute('data-active-workspace')||''`,returnByValue:true});
  const matched=clicked.result?.value===true && state.result?.value===expected;
  nav.push({label,expected,actual:state.result?.value,clicked:clicked.result?.value,pass:matched});
 }
 if(nav.some(x=>!x.pass))throw Error('INSTALLED_BC_NAV_CLICK_FAIL: '+JSON.stringify(nav));
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 const logout=await call('Runtime.evaluate',{
  expression:"(async()=>{try{await window.__TAURI_INTERNALS__.invoke('logout_session');return JSON.stringify(await window.__TAURI_INTERNALS__.invoke('session_status'))}catch(e){return 'ERROR:'+String(e)}})()",
  awaitPromise:true,returnByValue:true
 });
 const logoutRaw=logout.result?.value||'';
 if(logoutRaw.startsWith('ERROR:'))throw Error('NATIVE_LOGOUT_IPC_FAILED: '+logoutRaw);
 const loggedOut=JSON.parse(logoutRaw);
 if(loggedOut.nativeOsVerified!==true||loggedOut.nativeSessionActive!==false||
    loggedOut.serverTrusted!==false||loggedOut.canSend!==false){
  throw Error('NATIVE_LOGOUT_REVOCATION_FAILED: '+logoutRaw)
 }
 writeFileSync(new URL('./w54_bc_actual_webview_cdp.png',import.meta.url),Buffer.from(shot.data,'base64'));
 const dom=JSON.parse(value);
 if(dom.rootChildren===0||events.some(e=>e.data.includes('LOOPBACK_ONLY')))throw Error('BC_WEBVIEW_RENDER_FAIL: '+JSON.stringify({dom,events}));
 console.log(JSON.stringify({status:'REAL_INSTALLED_TAURI_WEBVIEW_CDP',pid:app.pid,viewTarget:target.url,dom:JSON.parse(value),jsEvents:events.slice(-12),nativeSessionStatus:nativeResult,afterNativeLogout:loggedOut,ordinaryLocalhost,navChecks:nav,webviewScreenshot:'w54_bc_actual_webview_cdp.png'},null,2));
}finally{try{ws?.close()}catch{};try{app.kill()}catch{}}
