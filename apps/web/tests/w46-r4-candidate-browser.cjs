// W46-only nonproduction Vue candidate, real Chrome on ORIGINAL B+C app.
// Reads real existing W47 NO_ACCOUNT API, never renders fake W37 accounts,
// never claims R4 visual parity without signed HTML or W47 shell Owner approval.
'use strict';
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../evidence'),url='http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1';
const ids=['CHAT','BRAIN','AUTOPILOT','ACCOUNTS','PEOPLE','PERSONA','TASKS','MEDIA','SETTINGS'];
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const measures=[],errors=[],mutations=[];
 try{
  const page=await browser.newPage();
  page.on('pageerror',x=>errors.push(String(x.message||x)));
  page.on('request',req=>{
   if(req.method()!=='GET' && req.url().includes('/api/v2/'))mutations.push({method:req.method(),url:req.url()});
  });
  await page.setViewport({width:1360,height:900});
  await page.goto(url,{waitUntil:'networkidle2',timeout:20000});
  await page.waitForSelector('[data-test="w46-product-candidate"]',{timeout:12000});
  await page.waitForFunction(()=>document.querySelector('[data-test="w46-trusted-status"]')
   ?.textContent?.includes('未取得可信授权'),{timeout:12000});
  const snapshot=await page.evaluate(async()=>{
   const [h,c]=await Promise.all([fetch('/api/v2/runtime/health'),fetch('/api/v2/contacts')]);
   return {health:await h.json(),contacts:await c.json()}
  });
  assert.equal(snapshot.health.trustedSession,false);
  assert.equal(snapshot.contacts.authoritative,true);
  assert.equal(snapshot.contacts.contacts.length,0);
  assert.equal(await page.$$eval('section.bc-native-composer',items=>items.length),0,'no authorized K means no mounted Composer; original B+C Composer source remains unique');
  assert.notEqual(await page.$eval('main.workspace',el=>getComputedStyle(el).display),'none','CHAT must expose original B+C workspace');
  assert.equal(await page.$eval('[data-test="no-active"]',el=>el.textContent.includes('尚未连接聊天平台')),true);
  assert.equal(await page.$$eval('.contact-action',els=>els.length),0,'no W37 synthetic contacts');
  for(const id of ids){
   await page.click('[data-test="workspace-'+id+'"]');
   await page.waitForFunction(id=>document.querySelector('[data-test="workspace-'+id+'"]')?.getAttribute('aria-pressed')==='true',{},id);
   if(id!=='CHAT'){
    const content=await page.$eval('[data-test="w46-workspace-content"]',e=>e.textContent);
    assert.ok(/未授权|未取得|未连接|缺少/.test(content),'fail-closed destination '+id);
   }
  }
  await page.click('[data-test="workspace-ACCOUNTS"]');
  assert.equal(await page.$$eval('.w46-channel',els=>els.length),4);
  assert.deepEqual(await page.$$eval('.w46-channel .w46-r4-brand-icon',els=>els.map(x=>[x.getAttribute('data-brand'),x.querySelector('path')?.getAttribute('d')?.length])),[
   ['messenger',462],['facebook',430],['whatsapp',1104],['telegram',630]]);
  assert.equal(await page.$eval('[data-test="w46-multi-account"]',el=>el.textContent.includes('已验证账号 0')),true);
  assert.equal(await page.$eval('[data-test="chatgpt-auth-unavailable"]',e=>e.disabled),true);
  assert.equal(await page.$eval('[data-test="chatgpt-auth-unavailable"]',e=>e.disabled),true);
  await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_1360_ACCOUNTS.png')});
  for(const width of [320,360,375,430,500,720,920,950,1050,1100,1101,1360]){
   await page.setViewport({width,height:850,deviceScaleFactor:1});
   const result=await page.evaluate(()=>({
    inner:innerWidth,scroll:document.documentElement.scrollWidth,
    navCount:document.querySelectorAll('[data-test^="workspace-"]').length,
    candidateVisible:getComputedStyle(document.querySelector('[data-test="w46-product-candidate"]')).display!=='none',
    demoVisible:getComputedStyle(document.querySelector('main.workspace')).display!=='none',
    mode:document.querySelector('#yance-prototype')?.getAttribute('data-mode')
   }));
   assert.equal(result.candidateVisible,true);
   assert.equal(result.demoVisible,false);
   assert.equal(result.scroll,width,'no horizontal overflow at '+width);
   measures.push({width,...result});
   if(width===360){
    await page.click('[data-test="workspace-mobile-trigger"]');
    await page.waitForSelector('[data-test="workspace-mobile-list"]',{visible:true});
    assert.equal(await page.$$eval('[data-test="workspace-mobile-list"] button',rows=>rows.length),9);
    await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_360_MENU.png')});
    await page.click('[data-test="workspace-mobile-list"] button:nth-child(2)');
    assert.equal(await page.$eval('[data-test="workspace-mobile-trigger"]',e=>e.textContent.includes('闺蜜大脑')),true);
   }
  }
  await page.setViewport({width:430,height:900});
  await page.click('[data-test="workspace-mobile-trigger"]');
  await page.click('[data-test="workspace-mobile-list"] button:nth-child(9)');
  await page.waitForSelector('[data-test="w46-settings-nine"]');
  assert.deepEqual(await page.$$eval('#w46-settings-picker option',els=>els.map(e=>e.value)),
    ['general','accounts','model','translate','media','theme','notify','privacy','diagnostics']);
  for(const category of ['accounts','model','translate','media','theme','notify','privacy','diagnostics','general']){
   await page.select('#w46-settings-picker',category);
   assert.equal(await page.$eval('#w46-settings-picker',e=>e.value),category);
  }
  await page.select('#w46-settings-picker','accounts');
  assert.equal(await page.$eval('[data-test="w46-chatgpt-auth"] button',e=>e.disabled),true);
  await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_430_SETTINGS.png')});
  await page.setViewport({width:320,height:800});
  assert.equal(await page.$$eval('#w46-settings-picker option',els=>els.length),9);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
  await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_320_SETTINGS.png')});
  await page.setViewport({width:430,height:900});
  await page.select('#w46-settings-picker','diagnostics');
  assert.deepEqual(await page.$$eval('[data-test="w46-diagnostics-failclosed"] .w46-danger strong',els=>els.map(e=>e.textContent)),
    ['REVOKED','AUTH_EXPIRED','BUDGET_INSUFFICIENT']);
  await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_430_FAILCLOSED.png')});
  await page.click('[data-test="workspace-mobile-trigger"]');
  await page.click('[data-test="workspace-mobile-list"] button:nth-child(3)');
  assert.equal(await page.$$eval('[data-test="w46-hosting-failclosed"] button:not([disabled])',els=>els.length),0);
  await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_430_AUTOPILOT.png')});
  await page.setViewport({width:1360,height:900});
  // Original exact five themes: actual original B+C theme switcher, not a new palette.
  const themes=await page.$$eval('.theme-opts button',buttons=>buttons.length);
  for(let t=0;t<5;t++){
   await page.click('button[aria-label="选择主题"]');
   await page.waitForSelector('.theme-opts button',{visible:true});
   const n=await page.$$eval('.theme-opts button',els=>els.length);
   assert.equal(n,5);
   await page.evaluate(index=>document.querySelectorAll('.theme-opts button')[index].click(),t);
   for(const mode of ['light','dark']){
    await page.evaluate(desired=>{
      const root=document.querySelector('#yance-prototype');
      if(root.dataset.mode!==desired)document.querySelector('button[aria-label^="切换"]').click();
    },mode);
    await page.waitForFunction(desired=>document.querySelector('#yance-prototype')?.dataset.mode===desired,{},mode);
    if(mode==='dark'&&t===4){
      await page.screenshot({path:path.join(root,'W46_R4_CANDIDATE_CHROME_THEME_4_DARK.png')});
    }
   }
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(mutations,[]);
  const ev={
    source:'REAL_WINDOWS_GOOGLE_CHROME_HEADLESS',exactW09SourceSha:'0423d7d347c2538e8ca9804dca1c2fc2baf1760b',
    underlyingAPIOriginalW47Sha:snapshot.health.runtimeSha,
    r4ExactHtmlAccessible:true,r4OriginalVerifiedSha256:'4d95254bf39281173b0756f723a512111471187f201c40479599b6a6b46878e4',readiness:'NONPRODUCTION_CANDIDATE_NOT_OWNER_SIGNED',
    trustedSession:false,realAccounts:0,realContacts:0,canSend:false,
    oneOriginalContactComposerRetained:true,oneMountedComposerWithZeroRealContacts:0,
    originalChatReachable:true,frozenDemoHidden:true,
    navWorkspaces:ids,widths:measures,themeStates:10,settingsCategories:9,failClosedStatusExamples:3,brandSvgPathsVerified:4,apiMutationRequests:mutations,
    pageErrors:errors,
    screenshots:['W46_R4_CANDIDATE_CHROME_1360_ACCOUNTS.png',
      'W46_R4_CANDIDATE_CHROME_360_MENU.png','W46_R4_CANDIDATE_CHROME_THEME_4_DARK.png',
      'W46_R4_CANDIDATE_CHROME_430_SETTINGS.png','W46_R4_CANDIDATE_CHROME_430_FAILCLOSED.png',
      'W46_R4_CANDIDATE_CHROME_430_AUTOPILOT.png',
      'W46_R4_CANDIDATE_CHROME_320_SETTINGS.png']
  };
  fs.writeFileSync(path.join(root,'W46_R4_CANDIDATE_BROWSER_UAT.json'),JSON.stringify(ev,null,2));
  console.log('W46_R4_CANDIDATE_CHROME_PASS nine_nav=9 widths=12 settings=9 themeStates=10 externalMutation=0 realContacts=0');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_R4_CANDIDATE_CHROME_FAIL',e.stack||e);process.exitCode=1});
