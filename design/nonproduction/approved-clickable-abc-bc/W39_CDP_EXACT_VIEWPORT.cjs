const fs=require('node:fs'),p=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=__dirname,CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe',folder=p.join(root,'evidence','chrome'),profile=fs.mkdtempSync(p.join(os.tmpdir(),'yance-w39-cdp-'));fs.mkdirSync(folder,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sleep=n=>new Promise(r=>setTimeout(r,n));
class CDP {
 constructor(ws){this.ws=ws;this.i=0;this.pending=new Map;this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&this.pending.has(m.id)){const v=this.pending.get(m.id);this.pending.delete(m.id);if(m.error)v.reject(Error(JSON.stringify(m.error)));else v.resolve(m.result)}})}
 call(method,params={}){return new Promise((resolve,reject)=>{const id=++this.i;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));})}
}
async function main(){
 const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--no-service-autorun','--password-store=basic','--user-data-dir='+profile,'--remote-allow-origins=*','--remote-debugging-port=0','--window-size=1360,900','about:blank'],{stdio:'ignore'});
 let cdp;try{
  let port=0;for(let i=0;i<100;i++){await sleep(100);const f=p.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split(/\r?\n/)[0]);break}if(chrome.exitCode!==null)throw Error('Chrome exited early: '+chrome.exitCode)}
  if(!port)throw Error('Chrome DevToolsActivePort missing');
  let pages;for(let i=0;i<50;i++){try{pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();break}catch{await sleep(100)}}
  const page=pages.find(x=>x.type==='page');if(!page)throw Error('no isolated browser tab');
  const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  cdp=new CDP(ws);await cdp.call('Page.enable');await cdp.call('Runtime.enable');
  const armIds=['CHAT-A-V25_VISUAL_NORMALIZED','CHAT-B-ADAPTIVE_INBOX','CHAT-C-PULSE_MAIN','CHAT-BC-FUSION'],themeNames=['Obsidian Lime','Cosmic Sunset','Ocean Electric','Amber Ember','Opal Prism'];
  const caseList=[];for(let i=0;i<armIds.length;i++)caseList.push({kind:'ARM',file:'arm-'+['A','B','C','BC'][i]+'-1360.png',width:1360,height:900,params:{arm:armIds[i],pulse:armIds[i]==='CHAT-BC-FUSION'?'1':'0'}});
  for(let i=0;i<themeNames.length;i++)for(const mode of ['dark','light'])caseList.push({kind:'THEME',file:'theme-'+(i+1)+'-'+mode+'-950.png',width:950,height:620,params:{arm:armIds[1],theme:themeNames[i],mode}});
  for(const width of [360,430,720,920,950,1050,1100,1101,1360])caseList.push({kind:'RESPONSIVE',file:'viewport-BC-'+width+'.png',width,height:width<=430?850:width<900?780:850,params:{arm:armIds[3],pulse:'1'}});
  const items=[];
  for(const [i,t] of caseList.entries()){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:t.width,height:t.height,deviceScaleFactor:1,mobile:false,screenWidth:t.width,screenHeight:t.height});
    const url='http://127.0.0.1:4174/?'+new URLSearchParams(t.params);
    await cdp.call('Page.navigate',{url});let values=null;
    for(let j=0;j<80;j++){await sleep(100);const e=await cdp.call('Runtime.evaluate',{expression:`(() => { const x=document.querySelector('#yance-prototype'); if(!x) return null;const nav=[...document.querySelectorAll('.arm-switch button')].map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent,left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom)}});return {actualInnerWidth:innerWidth,actualHeight:innerHeight,deviceScaleFactor:devicePixelRatio,viewportWidth:document.documentElement.clientWidth,bodyScrollWidth:document.body.scrollWidth,nav,arm:x.getAttribute('data-arm'),theme:x.getAttribute('data-theme'),mode:x.getAttribute('data-mode'),pulseMain:!!x.querySelector('.pulse-main')};})()`,returnByValue:true});
      values=e.result.value;if(values&&values.actualInnerWidth===t.width&&values.arm===t.params.arm&&(!(t.params.theme)||values.theme===String(themeNames.indexOf(t.params.theme))))break;values=null;
    }
    if(!values)throw Error('responsive readiness failed: '+t.file);
    if(values.nav.length!==4)throw Error('not four arm nav controls '+t.file);
    if(t.kind==='RESPONSIVE'&&values.nav.some(n=>n.left<0||n.right>t.width+1))throw Error('horizontal nav clipping '+t.file+' '+JSON.stringify(values.nav));
    const screen=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});const data=Buffer.from(screen.data,'base64');const outfile=p.join(folder,t.file);fs.writeFileSync(outfile,data);
    if(data.readUInt32BE(16)!==t.width||data.readUInt32BE(20)!==t.height)throw Error('png pixel dimensions not exact '+t.file+' '+data.readUInt32BE(16)+'x'+data.readUInt32BE(20));
    items.push({file:'evidence/chrome/'+t.file,url,kind:t.kind,requestedCSSWidth:t.width,actualCSSWidth:values.actualInnerWidth,actualCSSHeight:values.actualHeight,actualDPR:values.deviceScaleFactor,pngRealWidth:data.readUInt32BE(16),pngRealHeight:data.readUInt32BE(20),nav:values.nav,bodyScrollWidth:values.bodyScrollWidth,cssOverflow:values.bodyScrollWidth>t.width,sha256:sha(data),bytes:data.length,chromeStatus:'CDP_EMULATION_EXACT_CSS_VIEWPORT_AND_SCREENSHOT_CAPTURED_NOT_INDEPENDENT_QA'});
    console.log((i+1)+'/'+caseList.length+' EXACT_CSS_WIDTH='+t.width+' PNG='+data.length+' '+t.file);
  }
  const out={device:'DESKTOP-029FH47',browser:'Chrome Headless CDP native device metrics override',localOnly:true,source:'127.0.0.1:4174',screenshots:items,caution:'Headless Chrome/Chrome CDP is W39 owner test only; independent W40 QA and real Windows WebView2 remain NOT_RUN'};
  fs.writeFileSync(p.join(root,'evidence','CHROME_SCREENSHOT_MATRIX.json'),JSON.stringify(out,null,2));console.log('CDP_SCREENSHOTS='+items.length);
 }finally{
   try{await cdp?.call('Browser.close')}catch{};chrome.kill('SIGTERM');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
