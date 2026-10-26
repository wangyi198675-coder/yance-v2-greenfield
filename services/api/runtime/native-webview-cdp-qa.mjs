// Only actual Windows installed W54 QA app; no renderer auth or native
// Session is minted here. The QA executable's isolated ID has NO privileged
// Tauri IPC rights for the external W47 test origin.
import {spawn} from 'node:child_process';
import {createServer as tcpServer} from 'node:net';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const allocate=async()=>{
 const server=tcpServer();
 const port=await new Promise((ok,fail)=>{
  server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>ok(server.address().port));
 });
 await new Promise(ok=>server.close(ok));
 return port;
};
export async function verifyRealInstalledW54OnW47Origin({
 executable,origin,expectedApiSha,shotPath
}={}){
 if(typeof executable!=='string'||!executable||
    !/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(origin)||
    !/^[a-f0-9]{40}$/.test(expectedApiSha))
  throw Error('ISOLATED_W54_W47_QA_ARGUMENTS_REQUIRED');
 const port=await allocate();
 const app=spawn(executable,[],{shell:false,windowsHide:false,stdio:'ignore',env:{
  ...process.env,YANCE_W54_QA_W47_ORIGIN:origin,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port
 }});
 let ws=null;const pending=new Map();let id=0;
 try{
  let target=null;
  for(let count=0;count<85;count++){
   if(app.exitCode!==null)throw Error('W54_REAL_INSTALLED_EXE_EXITED_'+app.exitCode);
   try{
    const resp=await fetch('http://127.0.0.1:'+port+'/json/list',{
     signal:AbortSignal.timeout(850)});
    const list=await resp.json();
    target=list.find(t=>t.type==='page'&&
     t.url===origin+'/?productDraft=1');
    if(target)break;
   }catch{}
   await delay(180);
  }
  if(!target)throw Error('W54_INSTALLED_WEBVIEW_W47_ORIGIN_NOT_LOADED');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
   ws.addEventListener('open',ok,{once:true});
   ws.addEventListener('error',fail,{once:true});
  });
  ws.addEventListener('message',msg=>{
   const raw=JSON.parse(msg.data);
   if(!raw.id||!pending.has(raw.id))return;
   const [ok,fail]=pending.get(raw.id);
   pending.delete(raw.id);(raw.error?fail:ok)(raw.error||raw.result);
  });
  const call=(method,params={})=>new Promise((ok,fail)=>{
   const next=++id;pending.set(next,[ok,fail]);
   ws.send(JSON.stringify({id:next,method,params}));
   // No dangling wait when WebView2/CDP is closed by the host.
   setTimeout(()=>{if(!pending.has(next))return;
    pending.delete(next);fail(Error('W54_WEBVIEW_CDP_TIMEOUT_'+method))},8500);
  });
  await call('Runtime.enable');await call('Page.enable');
  await delay(1400);
  const domResult=await call('Runtime.evaluate',{returnByValue:true,
   expression:`(()=>{let root=document.querySelector('#app');return {
    rootChildren:root?.children.length||0,title:document.title,
    productPresent:!!document.querySelector('[data-test="w46-product-candidate"]'),
    hasJsonParseError:document.body.innerText.includes("Unexpected token '<'")
   }})()`});
  const dom=domResult.result?.value;
  if(!dom||dom.rootChildren<1||dom.productPresent!==true||
     dom.hasJsonParseError!==false)
    throw Error('W54_ACTUAL_WEBVIEW_BC_ORIGIN_JSON_RED_'+JSON.stringify(dom));
  const hr=await call('Runtime.evaluate',{returnByValue:true,awaitPromise:true,
   expression:`fetch('/api/v2/runtime/health').then(async r=>({
    status:r.status,type:r.headers.get('content-type'),json:await r.json()
   }))`});
  const health=hr.result?.value;
  if(health?.status!==200||
     !String(health.type).includes('application/json')||
     health.json?.runtimeSha!==expectedApiSha||
     health.json?.trustedSession!==false||
     health.json?.nativeWebSameOrigin!==true||
     health.json?.canSend!==false)
    throw Error('W54_ACTUAL_WEBVIEW_W47_API_NOT_VERIFIED_'+JSON.stringify(health));
  const noModelResponse=await call('Runtime.evaluate',{
   returnByValue:true,awaitPromise:true,
   expression:`fetch('/api/v2/private-brain/model-config').then(async r=>({
    status:r.status,body:await r.json()
   }))`
  });
  const noModel=noModelResponse.result?.value;
  if(noModel?.status!==200||noModel.body?.status!=='OPEN_LOCAL_MODEL_SETTINGS'||
     noModel.body?.authoritative!==false||
     noModel.body?.requiresTerminalPair!==false||
     noModel.body?.providers?.length!==3||
     noModel.body?.credentialsExposed!==false||
     noModel.body?.canSend!==false)
    throw Error('REAL_WEBVIEW2_NO_PAIR_MODEL_SETTINGS_UNAVAILABLE');
  const nav=[];
  for(const [label,code] of [
   ['渠道账号','ACCOUNTS'],['闺蜜大脑','BRAIN'],
   ['设置诊断','SETTINGS'],['聊天','CHAT']
  ]){
   const clicked=await call('Runtime.evaluate',{returnByValue:true,
    expression:`(()=>{const b=[...document.querySelectorAll('[data-test="w46-product-candidate"] button')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true})()`});
   await delay(250);
   const state=await call('Runtime.evaluate',{returnByValue:true,
    expression:`document.querySelector('[data-test="w46-product-candidate"]')?.getAttribute('data-active-workspace')||''`});
   const pass=clicked.result?.value===true&&state.result?.value===code;
   nav.push({label,pass});
  }
  if(nav.some(n=>!n.pass))throw Error('W54_REAL_BC_API_NAV_RED_'+JSON.stringify(nav));
  if(shotPath){
   const shot=await call('Page.captureScreenshot',{format:'png'});
   writeFileSync(shotPath,Buffer.from(shot.data,'base64'));
  }
  return Object.freeze({installedExePid:app.pid,webviewTarget:target.url,
   nativeWebView:true,domRendered:true,apiJson:true,apiSha:expectedApiSha,
   trustedSession:false,canSend:false,noPairModelSetupApi:true,
   nav,shotPath:shotPath||null});
 }finally{
  try{ws?.close()}catch{}
  try{app.kill()}catch{}
 }
}
