// W46 P0 real Windows Chrome negative UAT. This DOES NOT pair a person.
// Uses actual W47 loopback 47182 (currently 404) and synthetic malicious
// responses ONLY to verify fail-closed UI, never to claim real signed auth.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const root=path.resolve(__dirname,'../evidence'),url='http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1';
const bad=[
 {name:'missing-csrf',body:{ok:true,paired:true,expiresAt:Date.now()+200000,canSend:false,providerAuthorized:false}},
 {name:'expired',body:{ok:true,paired:true,expiresAt:Date.now()-1000,csrfToken:'a'.repeat(64),canSend:false,providerAuthorized:false}},
 {name:'can-send',body:{ok:true,paired:true,expiresAt:Date.now()+200000,csrfToken:'a'.repeat(64),canSend:true,providerAuthorized:false}},
 {name:'provider-forged',body:{ok:true,paired:true,expiresAt:Date.now()+200000,csrfToken:'a'.repeat(64),canSend:false,providerAuthorized:true}}
];
(async()=>{
 const b=await puppeteer.launch({headless:true,
  executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const results=[],errors=[],posts=[],urls=[];
 try{
 const p=await b.newPage();
 p.on('pageerror',e=>errors.push(String(e.message||e)));
 p.on('request',req=>{urls.push(req.url());if(req.method()==='POST')posts.push(req.url())});
 for(const [width,height] of [[950,620],[430,850],[320,680]]){
  await p.setViewport({width,height,deviceScaleFactor:1});
  await p.goto(url,{waitUntil:'networkidle2',timeout:20000});
  if(width<=720){
   await p.click('[data-test="workspace-mobile-trigger"]');
   for(const item of await p.$$('[role="menuitem"]')){
    if(await item.evaluate(e=>e.textContent.trim())==='闺蜜大脑'){await item.click();break}
   }
  }else await p.click('[data-test="workspace-BRAIN"]');
  await p.waitForSelector('[data-test="bc-local-session-connector"]',{timeout:12000});
  await p.waitForFunction(()=>document.querySelector('[data-test="local-session-verified-state"]')?.textContent?.includes('接口未接通'),{timeout:12000});
  const val=await p.evaluate(()=>({
   body:document.querySelector('[data-test="local-session-verified-state"]').textContent.trim(),
   redeem:document.querySelectorAll('[data-test="local-session-redeem"]').length,
   logout:document.querySelectorAll('[data-test="local-session-logout"]').length,
   brainCount:document.querySelectorAll('[data-test="bc-local-session-connector"]').length,
   composerCount:document.querySelectorAll('section.bc-native-composer').length,
   mainShown:getComputedStyle(document.querySelector('main.workspace')).display!=='none',
   accounts:document.querySelectorAll('.contact-action').length,
   width:document.documentElement.scrollWidth
  }));
  assert.equal(val.redeem,0);assert.equal(val.logout,0);
  assert.equal(val.brainCount,1);assert.equal(val.composerCount,0);
  assert.equal(val.accounts,0);assert.equal(val.mainShown,false);
  assert.ok(val.width<=width+1,'no horizontal overflow');
  await p.screenshot({path:path.join(root,'W46_PAIRING_OWNER_CHROME_'+width+'_REAL_404.png')});
  results.push({width,height,mode:'actual W47 47182 route absent 404',...val});
 }
 // Negative-only synthetic network interception: malformed "paired" responses
 // never claim a real user or backend auth.
 await p.setRequestInterception(true);
 let injected=undefined;
 p.on('request',req=>{
  if(req.url().endsWith('/api/v2/local-session/status')&&injected){
   void req.respond({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},
    body:JSON.stringify(injected)});
  }else if(req.url().endsWith('/api/v2/local-session/redeem')){
   void req.respond({status:401,contentType:'application/json',
    body:JSON.stringify({ok:false,error:'PAIRING_NOT_APPROVED',canSend:false})});
  }else void req.continue();
 });
 for(const item of bad){
  injected=item.body;
  await p.click('[data-test="local-session-refresh"]');
  await p.waitForFunction(()=>document.querySelector('[data-test="local-session-verified-state"]')?.textContent?.includes('接口未接通'),{timeout:8000});
  const result=await p.evaluate(()=>({
    status:document.querySelector('[data-test="local-session-verified-state"]').textContent.trim(),
    error:document.querySelector('[data-test="local-session-error"]')?.textContent||'',
    logout:document.querySelectorAll('[data-test="local-session-logout"]').length,
    redeem:document.querySelectorAll('[data-test="local-session-redeem"]').length
  }));
  assert.equal(result.logout,0);
  assert.equal(result.redeem,0);
  assert.match(result.error,/本机会话尚不可用/);
  results.push({negative:item.name,...result});
 }
 // A synthetic UNPAIRED status exposes code form, but a rejected POST cannot
 // result in an optimistic paired flag. A fake password never enters a URL/log.
 injected={ok:true,paired:false,canSend:false,providerAuthorized:false};
 await p.click('[data-test="local-session-refresh"]');
 await p.waitForSelector('[data-test="local-session-one-use-code"]',{visible:true});
 const secret='d'.repeat(64);
 await p.type('[data-test="local-session-one-use-code"]',secret);
 await p.click('[data-test="local-session-redeem"]');
 await p.waitForFunction(()=>document.querySelector('[data-test="local-session-verified-state"]')
   ?.textContent?.includes('本机会话未配对'),{timeout:8000});
 const declined=await p.evaluate(()=>({
  entered:document.querySelector('[data-test="local-session-one-use-code"]')?.value,
  logout:document.querySelectorAll('[data-test="local-session-logout"]').length,
  pageText:document.querySelector('[data-test="bc-local-session-connector"]').textContent,
  storage:JSON.stringify({l:localStorage.length,s:sessionStorage.length}),
  cookies:document.cookie
 }));
 assert.equal(declined.entered,'');assert.equal(declined.logout,0);
 assert.ok(!declined.pageText.includes(secret));
 assert.ok(!declined.cookies.includes('yance_local_session'));
 assert.ok(!urls.some(u=>u.includes(secret)||u.includes('pairingCode=')));
 assert.ok(posts.every(u=>u.endsWith('/api/v2/local-session/redeem')));
 results.push({negative:'synthetic_rejected_redeem',codeCleared:true,logout:0,storage:declined.storage});
 await p.screenshot({path:path.join(root,'W46_PAIRING_OWNER_CHROME_320_REDEEM_DENIED.png')});
 // Returning to CHAT is passive: no W24 takeover, no agent/sends.
 await p.click('[data-test="workspace-mobile-trigger"]');
 for(const item of await p.$$('[role="menuitem"]'))
  if(await item.evaluate(e=>e.textContent.trim())==='聊天'){await item.click();break}
 const chat=await p.evaluate(()=>({
  chatShown:getComputedStyle(document.querySelector('main.workspace')).display!=='none',
  mountedComposer:document.querySelectorAll('section.bc-native-composer').length
 }));
 assert.equal(chat.chatShown,true);assert.equal(chat.mountedComposer,0);
 assert.deepEqual(errors,[]);
 assert.ok(posts.length===1,'only negative deliberate redeem POST; no unrelated POST');
 const report={source:'REAL_WINDOWS_CHROME_W46_P0_NEGATIVE_ONLY',
  baselineQAHead:'4a7ca3e34e1e724bb0a9b992d85f603de03ed2fc',
  realW47StatusRoute:'HTTP 404',truthfulAuth:'NO_AUTHORIZED_HUMAN_PAIRING',
  passedRealWindowsWidths:[950,430,320],negativeCases:bad.map(x=>x.name),
  explicitSyntheticRejectedRedeem:true,realPairingAttempt:false,
  originalCHATPassiveAndVisible:true,noSignedPrivateBrainApi:true,
  javascriptErrors:errors,requestPosts:posts,results};
 fs.writeFileSync(path.join(root,'W46_PAIRING_OWNER_CHROME_NEGATIVE_UAT.json'),JSON.stringify(report,null,2));
 console.log('W46_PAIRING_OWNER_CHROME_NEGATIVE_PASS real404=3 forgedStatus=4 rejectedCode=1 CHAT=PASS');
 }finally{await b.close()}
})().catch(e=>{console.error('W46_PAIRING_OWNER_CHROME_NEGATIVE_FAIL',e.stack||e);process.exitCode=1});
