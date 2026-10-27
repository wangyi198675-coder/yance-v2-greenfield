// W46 model catalog/source join, real Windows Chrome, stage 48185 via W46-only
// nonproduction Vite; no fake principal, fake API key, paid model, or POST.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const evidence=path.resolve(__dirname,'../evidence');
const url='http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1';
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const writes=[],errors=[],reads=[],samples=[];
 try{
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()!=='GET')writes.push({method:r.method(),url:r.url()});else if(r.url().includes('/api/v2/'))reads.push(r.url())});
  for(const [width,height] of [[320,680],[430,850],[950,620],[1360,900]]){
   await page.setViewport({width,height,deviceScaleFactor:1});
   await page.goto(url,{waitUntil:'networkidle2',timeout:20000});
   await page.waitForSelector('[data-test="w46-product-candidate"]',{timeout:12000});
   if(width<=720){
    await page.click('[data-test="workspace-mobile-trigger"]');
    let clicked=false;
    for(const item of await page.$$('[role="menuitem"]'))
     if(await item.evaluate(el=>el.textContent.trim())==='闺蜜大脑'){await item.click();clicked=true;break}
    assert.ok(clicked);
   }else await page.click('[data-test="workspace-BRAIN"]');
   await page.waitForSelector('[data-test="bc-private-brain"]');
   await page.waitForFunction(()=>document.querySelector('[data-test="brain-state"]')?.textContent?.includes('本机可信会话尚未建立'),{timeout:12000});
   await page.click('[data-test="brain-open-settings"]');
   await page.waitForSelector('[data-test="brain-model-settings"]');
   const actual=await page.evaluate(()=>({
    brain:document.querySelectorAll('[data-test="bc-private-brain"]').length,
    legacyPair:document.querySelectorAll('#bc-local-pair-code,[data-test="local-session-one-use-code"]').length,
    credentials:document.querySelectorAll('input[type="password"],[data-test="brain-save-key"],[data-test="brain-key-input"]').length,
    providerLabels:['OpenRouter','OpenAI API','本地 Qwen3'].map(x=>document.querySelector('[data-test="brain-model-settings"]').textContent.includes(x)),
    hasNativeNotice:!!document.querySelector('[data-test="brain-native-key-hold"]'),
    modelSelectionDisabled:document.querySelector('[data-test="brain-select-model"]').disabled,
    sendDisabled:document.querySelector('[data-test="brain-send"]').disabled,
    modelRadioCount:document.querySelectorAll('input[name="private-model"]').length,
    historicalMessages:document.querySelectorAll('[data-test="brain-history"] article').length,
    actualContacts:document.querySelectorAll('.contact-action').length,
    widthOverflow:document.documentElement.scrollWidth-innerWidth,
    state:document.querySelector('[data-test="brain-state"]').textContent.trim()
   }));
   assert.equal(actual.brain,1);
   assert.equal(actual.legacyPair,0);assert.equal(actual.credentials,0);
   assert.deepEqual(actual.providerLabels,[true,true,true]);
   assert.equal(actual.hasNativeNotice,true);
   assert.equal(actual.modelSelectionDisabled,true);assert.equal(actual.sendDisabled,true);
   assert.equal(actual.historicalMessages,0);assert.equal(actual.actualContacts,0);
   assert.equal(actual.modelRadioCount,0,'public catalog must not fabricate configured model IDs');
   assert.ok(actual.widthOverflow<=1);
   await page.screenshot({path:path.join(evidence,'W46_W47_MODEL_DTO_'+width+'_CHROME.png')});
   samples.push({width,height,...actual});
   await page.reload({waitUntil:'networkidle2'});
   await page.waitForSelector('[data-test="w46-product-candidate"]');
   if(width<=720){
    await page.click('[data-test="workspace-mobile-trigger"]');
    for(const item of await page.$$('[role="menuitem"]'))
     if(await item.evaluate(el=>el.textContent.trim())==='闺蜜大脑'){await item.click();break}
   }else await page.click('[data-test="workspace-BRAIN"]');
   await page.waitForFunction(()=>document.querySelector('[data-test="brain-state"]')?.textContent?.includes('本机可信会话尚未建立'));
   assert.equal(await page.$$eval('[data-test="brain-history"] article',xs=>xs.length),0);
   if(width<=720){
    await page.click('[data-test="workspace-mobile-trigger"]');
    for(const item of await page.$$('[role="menuitem"]'))
     if(await item.evaluate(el=>el.textContent.trim())==='聊天'){await item.click();break}
   }else await page.click('[data-test="workspace-CHAT"]');
   assert.equal(await page.$eval('main.workspace',e=>getComputedStyle(e).display!=='none'),true);
  }
  assert.ok(reads.some(u=>u.includes('/api/v2/private-brain/model-catalog')));
  assert.ok(reads.some(u=>u.includes('/api/v2/local-session/status')));
  assert.equal(reads.some(u=>u.includes('/api/v2/private-brain/models')),false);
  assert.equal(reads.some(u=>u.includes('/api/v2/private-brain/credentials')),false);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  const sw=await page.evaluate(async()=>navigator.serviceWorker?.getRegistrations?.().then(rs=>rs.map(x=>x.scope)).catch(()=>[])||[]);
  const resources=await page.evaluate(()=>[...document.scripts].map(s=>s.src).filter(Boolean));
  const data={test:'W46_REAL_CHROME_W47_41C9_DTO_STAGE',jointBaseline:'24d74be3309df81122acd82affd9099c853661da',
    w47OwnerSha:'41c9a09bdb6c4124ffc979fac3a250d1079570c1',
    nativeW47StageApi:'http://127.0.0.1:48185',preview:'W46_ONLY_NONPROD_4174',
    authorized:false,realCloudInvocations:0,socialSends:0,
    currentSignedModelConfig:'401 because no native W54 verified first-party session',
    sourceCatalogIsOnlyMetadata:true,widths:4,reads,writes,jsErrors:errors,resources,
    serviceWorkerRegistrations:sw,samples};
  fs.writeFileSync(path.join(evidence,'W46_W47_MODEL_DTO_REAL_CHROME_UAT.json'),JSON.stringify(data,null,2));
  console.log('W46_W47_MODEL_DTO_REAL_CHROME_PASS 4/4 current48185 publicCatalog=TRUE modelConfig_AUTH_HOLD keys=0 replies=0 sends=0');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_W47_MODEL_DTO_REAL_CHROME_FAIL',e.stack||e);process.exitCode=1});
