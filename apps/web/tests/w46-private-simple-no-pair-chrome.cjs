'use strict';
const puppeteer=require('C:\\Users\\1\\AppData\\Local\\npm-cache\\_npx\\4b4c857f6efdfb61\\node_modules\\puppeteer');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../evidence'),url='http://127.0.0.1:4191/?arm=CHAT-BC-FUSION&productDraft=1';
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const report={kind:'ACTUAL_WINDOWS_CHROME_W46_NORMAL_PRIVATE_UI_W47_SOURCE',base:'e352180cba665b56b35822fa2aff2c7525360016',
  actualW47StagePort:48191,modelCalls:0,userKeyWrites:0,socialSends:0,measurements:[]};
 try{
  for(const [width,height] of [[320,680],[430,850],[950,620],[1360,900]]){
   const page=await browser.newPage();await page.setViewport({width,height,deviceScaleFactor:1});
   const errors=[],api=[],writes=[],noBackend=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()!=='GET')writes.push([r.method(),r.url()]);
    if(r.url().includes('/api/v2'))api.push({method:r.method(),url:r.url()})});
   page.on('response',r=>{if(r.url().includes('/api/v2')&&!r.ok())noBackend.push({status:r.status(),url:r.url()})});
   await page.goto(url,{waitUntil:'networkidle2',timeout:24000});
   await page.waitForSelector('[data-test="w46-product-candidate"]',{timeout:13000});
   const mobile=width<=720;
   const open=async label=>{
    if(mobile){
     await page.click('[data-test="workspace-mobile-trigger"]');
     const rows=await page.$$('[role="menuitem"]');let found=false;
     for(const el of rows){if(await el.evaluate(e=>e.textContent.trim())===label){await el.click();found=true;break}}
     assert.equal(found,true,'mobile nav target '+label);
    }else await page.click('[data-test="workspace-'+(label==='闺蜜大脑'?'BRAIN':label==='聊天'?'CHAT':'SETTINGS')+'"]');
   };
   await open('闺蜜大脑');
   await page.waitForSelector('[data-test="bc-private-brain"]',{timeout:10000});
   await page.waitForFunction(()=>{
    const x=document.querySelector('[data-test="brain-state"]')?.textContent||'';
    return /模型|服务暂时|服务连接/.test(x);
   },{timeout:10000});
   await page.waitForSelector('[data-test="brain-model-settings"]',{timeout:8000});
   const state=await page.evaluate(()=>({
    title:document.querySelector('[data-test="brain-state"]')?.textContent.trim(),
    settings:document.querySelector('[data-test="brain-model-settings"]')?.textContent,
    brainCount:document.querySelectorAll('[data-test="bc-private-brain"]').length,
    nativeHostDiagnostics:document.querySelectorAll('[data-test="w46-native-session"]').length,
    fakeContacts:document.querySelectorAll('.contact-action').length,
    fakeHistory:document.querySelectorAll('[data-test="brain-history"] article').length,
    sendDisabled:document.querySelector('[data-test="brain-send"]')?.disabled,
    pairText:document.querySelector('[data-test="bc-private-brain"]')?.textContent.match(/pair|64位|复制验证码|终端|登录后才能|本机可信会话|Windows 原生会话/ig),
    providerCount:document.querySelectorAll('.bc-provider').length,
    modelSelectedEnabled:!document.querySelector('[data-test="brain-select-model"]')?.disabled,
    widthOverflow:document.documentElement.scrollWidth-innerWidth,
    rawKeyInputs:document.querySelectorAll('[data-test="brain-key-input"],input[type="password"]').length
   }));
   assert.equal(state.brainCount,1);assert.equal(state.nativeHostDiagnostics,0);
   assert.equal(state.pairText,null,'pair/auth UX must be absent at '+width);
   assert.equal(state.fakeContacts,0);assert.equal(state.fakeHistory,0);
   assert.equal(state.sendDisabled,true);assert.equal(state.modelSelectedEnabled,false);
   assert.equal(state.providerCount,3);
   assert.ok(state.settings.includes('OpenRouter'));
   assert.ok(state.settings.includes('OpenAI API'));
   assert.ok(state.settings.includes('本地 Qwen3'));
   assert.ok(state.widthOverflow<=2,JSON.stringify(state));
   assert.equal(state.rawKeyInputs,0);
   await page.screenshot({path:path.join(root,'W46_PRIVATE_SIMPLE_20261026_'+width+'_ACTUAL_CHROME.png')});
   await page.reload({waitUntil:'networkidle2',timeout:24000});
   await open('闺蜜大脑');
   await page.waitForSelector('[data-test="brain-model-settings"]',{timeout:8500});
   assert.equal(await page.$$eval('[data-test="brain-history"] article',r=>r.length),0);
   await open('聊天');await page.waitForSelector('[data-test="w46-real-chat"]');
   assert.deepEqual(writes,[],'no mutation can fire without user model/credentials');
   assert.deepEqual(errors,[],'actual compiled Vue runtime error');
   report.measurements.push({width,height,...state,
    apiReadRequests:api.filter(x=>x.method==='GET').map(x=>x.url),
    deniedReadResponses:noBackend,jsErrors:errors,mutationRequests:writes});
   await page.close();
  }
  fs.writeFileSync(path.join(root,'W46_PRIVATE_SIMPLE_NO_PAIR_REAL_CHROME_UAT.json'),JSON.stringify(report,null,2));
  console.log('W46_PRIVATE_SIMPLE_NO_PAIR_CHROME_PASS 4/4, no pairing, settings=3, blank fake history=0, mutations=0');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_PRIVATE_SIMPLE_NO_PAIR_CHROME_RED',e.stack||e);process.exitCode=1});
