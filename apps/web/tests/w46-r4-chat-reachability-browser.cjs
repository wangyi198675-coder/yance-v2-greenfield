// Physical installed Windows Chrome against W46 newest owner compiler + REAL PR#53
// W47 no-provider read-only gate (imported, not reimplemented). Nonproduction ONLY.
// The test adapter opts in productDraft=1 while the PR53 signed gate still awaits
// a W09-approved exact new W46 SHA. No synthetic account or live sends.
'use strict';
const assert=require('node:assert/strict');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const {join,resolve}=require('node:path'),fs=require('node:fs');
const evidence=resolve(__dirname,'../evidence');
const origin='http://127.0.0.1:4174';
const workspaces=['CHAT','BRAIN','AUTOPILOT','ACCOUNTS','PEOPLE','PERSONA','TASKS','MEDIA','SETTINGS'];
(async()=>{
 const browser=await puppeteer.launch({
  headless:true,executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']
 });
 const errors=[],mutation=[],measurements=[],responses=[];
 try{
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(String(e?.message||e)));
  page.on('request',r=>{
   if((r.method()!=='GET'&&r.url().includes('/api/v2/'))||
      (r.method()==='POST'&&r.url().includes('/w46-native-test/')))
     mutation.push({url:r.url(),method:r.method()});
  });
  page.on('response',r=>{
    if(r.url().includes('/api/v2/'))responses.push({status:r.status(),method:r.request().method(),url:r.url()});
  });
  await page.setViewport({width:1360,height:900,deviceScaleFactor:1});
  await page.goto(origin+'/?arm=CHAT-BC-FUSION&productDraft=1',{waitUntil:'networkidle2',timeout:20000});
  await page.waitForSelector('[data-test="w46-product-candidate"]',{timeout:12000});
  await page.waitForFunction(()=>document.querySelector('[data-test="w46-trusted-status"]')?.textContent?.includes('未取得可信授权'),{timeout:12000});
  const backend=await page.evaluate(async()=>{
   const [h,c]=await Promise.all([fetch('/api/v2/runtime/health'),fetch('/api/v2/contacts')]);
   return {health:await h.json(),contacts:await c.json()};
  });
  assert.equal(backend.health.trustedSession,false);
  assert.equal(backend.health.canSend,false);
  assert.equal(backend.contacts.connectedAccountCount,0);
  assert.deepEqual(backend.contacts.contacts,[]);
  const initial=await page.evaluate(()=>{
   const main=document.querySelector('main.workspace');
   const nav=document.querySelector('[data-test="w46-product-candidate"]');
   window.__w46OriginalMain=main;
   main.dataset.w46DraftDomContinuity='synthetic-test-only-no-send';
   return {
     workspace:getComputedStyle(main).display,nav:nav.dataset.activeWorkspace,
     empty:document.querySelector('[data-test="no-active"]')?.textContent||'',
     contacts:document.querySelectorAll('.contact-action').length,
     composerCount:document.querySelectorAll('section.bc-native-composer').length,
     sendEnabled:[...document.querySelectorAll('button')].some(x=>!x.disabled&&x.textContent.trim()==='发送')
   }
  });
  assert.notEqual(initial.workspace,'none','CHAT must really show original main workspace');
  assert.equal(initial.nav,'CHAT');
  assert.match(initial.empty,/尚未连接聊天平台/);
  assert.equal(initial.contacts,0,'W47 must suppress all fake W37 contacts');
  assert.equal(initial.composerCount,0,'no selected K: mounted Composer must be zero, never duplicated');
  assert.equal(initial.sendEnabled,false);
  await page.screenshot({path:join(evidence,'W46_R4_CHAT_P0_CHROME_1360_EMPTY.png')});
  for(const id of workspaces.slice(1)){
   await page.click('[data-test="workspace-'+id+'"]');
   await page.waitForFunction(value=>document.querySelector('[data-test="w46-product-candidate"]')?.dataset.activeWorkspace===value,{},id);
   const view=await page.evaluate(()=>{
     const main=document.querySelector('main.workspace');
     return {
       display:getComputedStyle(main).display,
       connected:main.isConnected,
       same:main===window.__w46OriginalMain,
       marker:main.dataset.w46DraftDomContinuity,
       composerCount:document.querySelectorAll('section.bc-native-composer').length
     };
   });
   assert.equal(view.display,'none','CHAT body hidden on '+id);
   assert.equal(view.connected,true);
   assert.equal(view.same,true,'no remount allowed');
   assert.equal(view.marker,'synthetic-test-only-no-send');
   assert.ok(view.composerCount<=1);
   measurements.push({workspace:id,...view});
  }
  await page.click('[data-test="workspace-CHAT"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="w46-product-candidate"]')?.dataset.activeWorkspace==='CHAT');
  const returned=await page.evaluate(()=>{
   const main=document.querySelector('main.workspace');
   return {display:getComputedStyle(main).display,same:main===window.__w46OriginalMain,
     marker:main.dataset.w46DraftDomContinuity,contacts:document.querySelectorAll('.contact-action').length,
     empty:document.querySelector('[data-test="no-active"]')?.textContent||'',composer:document.querySelectorAll('section.bc-native-composer').length};
  });
  assert.notEqual(returned.display,'none','back to CHAT shows original main, not fallback');
  assert.equal(returned.same,true);
  assert.equal(returned.marker,'synthetic-test-only-no-send');
  assert.equal(returned.contacts,0);
  assert.equal(returned.composer,0);
  assert.match(returned.empty,/尚未连接聊天平台/);
  await page.screenshot({path:join(evidence,'W46_R4_CHAT_P0_CHROME_1360_RETURN.png')});
  for(const width of [320,360,430,720,950,1101,1360]){
    await page.setViewport({width,height:850,deviceScaleFactor:1});
    const result=await page.evaluate(()=>({
      width:innerWidth,scroll:document.documentElement.scrollWidth,
      display:getComputedStyle(document.querySelector('main.workspace')).display,
      composerCount:document.querySelectorAll('.bc-native-composer').length
    }));
    assert.equal(result.scroll,width,'overflow at '+width);
    assert.notEqual(result.display,'none');
    assert.ok(result.composerCount<=1);
    measurements.push({stage:'responsive-CHAT',...result});
    if(width===360)await page.screenshot({path:join(evidence,'W46_R4_CHAT_P0_CHROME_360_EMPTY.png')});
  }
  // A failed permission refresh must not restore fixture contacts or expose a send.
  await page.setRequestInterception(true);
  page.on('request',req=>{
    if(req.url().includes('/api/v2/runtime/health'))
      req.respond({status:503,contentType:'application/json',
        body:JSON.stringify({ok:false,error:'UNAUTHORIZED_TEST_ONLY',canSend:false})});
    else req.continue();
  });
  await page.click('[data-test="w46-refresh"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="w46-trusted-status"]')?.textContent?.includes('无法读取真实服务端'),{timeout:12000});
  const denied=await page.evaluate(()=>({
   mainVisible:getComputedStyle(document.querySelector('main.workspace')).display!=='none',
   count:document.querySelectorAll('.contact-action').length,
   sendEnabled:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='发送'&&!b.disabled)
  }));
  assert.equal(denied.mainVisible,true);
  assert.equal(denied.count,0);
  assert.equal(denied.sendEnabled,false);
  await page.screenshot({path:join(evidence,'W46_R4_CHAT_P0_CHROME_PERMISSION_503.png')});
  assert.deepEqual(mutation,[],'workspace clicks must not POST W24/W44/W25');
  assert.deepEqual(errors,[],'real Chrome Vue no JS exceptions');
  assert.ok(responses.some(r=>r.url.includes('/api/v2/contacts')&&r.status===200));
  const output={source:'REAL_WINDOWS_CHROME_HEADLESS_W47_GATE_ACTUAL_SOURCE',
    upstreamPr53Head:'755f075979471a71f14d135f18809cf9c94f44b7',
    w47GateSource:'W09_R4_OWNER_JOIN_20261025/apps/web/runtime/vite.w47.config.mjs',
    nonprodTestAdapter:'ONLY_BYPASSES_DRAFT_UI_FEATURE_TOGGLE_NOT_AUTHORITY',
    originalChatComposer:'RETAINED_ONE_COMPONENT_BUT_UNMOUNTED_WITH_NO_AUTHORIZED_CONTACT',
    trustedSession:false,realAccountCount:0,realContacts:0,canSend:false,
    recoveredOriginalMain:true,remountedOriginalMain:false,
    syntheticDOMContinuityMarker:true,realAuthorizedDraftRecovery:'HOLD_NO_TRUSTED_SESSION',
    workspaceCount:9,permissionDenied:503,noMutations:mutation.length,
    jsErrors:errors,workspaces:measurements,backendSha:backend.health.runtimeSha,
    screenshots:['W46_R4_CHAT_P0_CHROME_1360_EMPTY.png','W46_R4_CHAT_P0_CHROME_1360_RETURN.png',
      'W46_R4_CHAT_P0_CHROME_360_EMPTY.png','W46_R4_CHAT_P0_CHROME_PERMISSION_503.png']};
  fs.writeFileSync(join(evidence,'W46_R4_CHAT_P0_BROWSER_UAT.json'),JSON.stringify(output,null,2));
  console.log('W46_R4_CHAT_P0_REAL_CHROME_PASS workspaces=9 responsive=7 contacts=0 send=0 permission_503_BLOCKED no_POST');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_R4_CHAT_P0_REAL_CHROME_FAIL',e.stack||e);process.exitCode=1});
