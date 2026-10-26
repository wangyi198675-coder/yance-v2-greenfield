// Genuine installed Windows Chrome: reproduce exact Tauri asset Host, but do not
// mistake Chrome host emulation for installed WebView2/secure native Session.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||
 'C:\\Users\\1\\AppData\\Local\\npm-cache\\_npx\\4b4c857f6efdfb61\\node_modules\\puppeteer');
const root=path.resolve(__dirname,'../evidence');
const scenarios=[
 {width:1360,height:900,url:'http://tauri.localhost:4189/'},
 {width:950,height:620,url:'http://tauri.localhost:4189/'},
 {width:430,height:850,url:'http://tauri.localhost:4189/'},
 {width:320,height:680,url:'http://tauri.localhost:4189/'},
 {width:1360,height:900,url:'http://127.0.0.1:4189/?arm=CHAT-BC-FUSION&productDraft=1'}
];
const title=(x)=>x.url.includes('tauri.localhost')?'TAURI_HOST_'+x.width:'LOOPBACK_PRODUCT_'+x.width;
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-default-browser-check','--no-first-run',
        '--host-resolver-rules=MAP tauri.localhost 127.0.0.1','--no-proxy-server']});
 const log=[];
 try{
  for(const sc of scenarios){
   const page=await browser.newPage();
   await page.setViewport({width:sc.width,height:sc.height,deviceScaleFactor:1});
   const errors=[],writes=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()!=='GET')writes.push([r.method(),r.url()]);
      else if(r.url().includes('/api/v2')||r.url().includes('/w46-native-test/'))requests.push(r.url())});
   const resp=await page.goto(sc.url,{waitUntil:'networkidle2',timeout:25000});
   await page.waitForSelector('[data-test="w46-product-candidate"]',{timeout:18000});
   await page.waitForSelector('[data-test="w46-real-chat"]',{timeout:18000});
   await page.waitForFunction(()=>document.querySelector('[data-test="w46-read-authority"]')?.textContent?.includes('尚未取得可信本机应用会话'),{timeout:12000});
   const before=await page.evaluate(()=>({
    hostname:location.hostname,protocol:location.protocol,
    rootChildren:document.querySelector('#app')?.children.length||0,
    product:document.querySelectorAll('[data-test="w46-product-candidate"]').length,
    realChat:document.querySelectorAll('[data-test="w46-real-chat"]').length,
    frozenContacts:document.querySelectorAll('.contact-action').length,
    modelInputKeys:document.querySelectorAll('input[type=password]').length,
    canSend:document.querySelectorAll('[data-test="composer-send"]:not([disabled])').length,
    widthOverflow:document.documentElement.scrollWidth-innerWidth
   }));
   assert.ok([200,304].includes(resp.status()),JSON.stringify({status:resp.status(),url:resp.url(),before}));
   assert.ok(before.rootChildren>0,'root must mount for Tauri asset host');
   assert.equal(before.product,1);assert.equal(before.realChat,1);assert.equal(before.frozenContacts,0);
   assert.equal(before.modelInputKeys,0);assert.equal(before.canSend,0);
   assert.ok(before.widthOverflow<=2);
   const mobile=sc.width<=720;
   async function openWorkspace(label,id){
    if(mobile){
     await page.click('[data-test="workspace-mobile-trigger"]');
     const menus=await page.$$('[role="menuitem"]');
     let match=false;
     for(const node of menus)if(await node.evaluate(e=>e.textContent.trim())===label){
      await node.click();match=true;break}
     assert.ok(match,'mobile workspace '+label);
    }else await page.click('[data-test="workspace-'+id+'"]');
   }
   await openWorkspace('渠道账号','ACCOUNTS');
   await page.waitForSelector('[data-test="w46-native-provider"]');
   assert.equal(await page.$$eval('[data-test="w46-native-provider"]',x=>x.length),4);
   const official=await page.$$('[data-test="native-provider-setup"]');
   assert.equal(official.length,4);
   // Clicking the actual platform control reaches the W47 gateway. Currently
   // 404 is real (not fabricated QR or CONNECTED), and not a user's authorization.
   await official[2].click();
   await page.waitForFunction(()=>
    [...document.querySelectorAll('[data-test="native-provider-feedback"]')]
      .some(x=>x.textContent.includes('尚未连接该平台')), {timeout:10000});
   assert.equal(await page.$$eval('[data-test="native-provider-qr"]',x=>x.length),0);
   await openWorkspace('闺蜜大脑','BRAIN');
   await page.waitForSelector('[data-test="w46-native-session"]');
   await page.waitForSelector('[data-test="bc-private-brain"]');
   const trusted=await page.$eval('[data-test="w46-native-session-state"]',x=>x.textContent.trim());
   const disabled=await page.$eval('[data-test="brain-send"]',x=>x.disabled);
   assert.equal(disabled,true);
   await openWorkspace('聊天','CHAT');
   await page.waitForSelector('[data-test="w46-real-chat"]');
   await page.screenshot({path:path.join(root,'W46_'+title(sc)+'_CHROME.png')});
   assert.deepEqual(writes,[],'no POST, send, session grant or signup');
   assert.deepEqual(errors,[],'no LOOPBACK_ONLY or runtime JS errors');
   assert.equal(requests.some(s=>s.includes('/w46-native-test/')),false,'no synthetic bridge calls');
   log.push({...sc,host:before.hostname,
     rootChildren:before.rootChildren,product:before.product,
     frozenContacts:before.frozenContacts,tooWide:before.widthOverflow,
     nativeAccountButtons:official.length,qrDisplayed:0,brainSendDisabled:true,
     w54TrustState:trusted,errors,postRequests:writes,readRequests:requests});
   await page.close();
  }
  fs.writeFileSync(path.join(root,'W46_TAURI_LOOPBACK_ASSET_CHROME_UAT.json'),
   JSON.stringify({source:'894c25643cdde8af2307c8d8396dad96c39471eb',
     type:'REAL_WINDOWS_CHROME_TAURI_ASSET_HOST_SIMULATION_NOT_WEBVIEW2',
     browserOnly:true,installedTauriProof:false,canSend:false,
     cloudCalls:0,socialSends:0,scenarios:log},null,2));
  console.log('W46_TAURI_ASSET_HOST_CHROME_PASS '+log.length+'/'+scenarios.length+
              ' rootMount=PASS fakeContacts=0 syntheticCalls=0 postRequests=0');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_TAURI_ASSET_HOST_CHROME_FAIL',e.stack||e);process.exitCode=1});
