'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('C:\\Users\\1\\AppData\\Local\\npm-cache\\_npx\\4b4c857f6efdfb61\\node_modules\\puppeteer');
(async()=>{
const browser=await puppeteer.launch({headless:true,
 executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 args:['--no-first-run','--no-default-browser-check']});
const evidence=[];
try{
 for(const [width,height] of [[320,680],[430,850],[950,620],[1360,900]]){
  const page=await browser.newPage();await page.setViewport({width,height,deviceScaleFactor:1});
  const errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()!=='GET')posts.push(r.method()+' '+r.url())});
  await page.goto('http://127.0.0.1:4194/?arm=CHAT-BC-FUSION&productDraft=1',
   {waitUntil:'networkidle2',timeout:25000});
  await page.waitForSelector('[data-test="w46-product-candidate"]');
  if(width<=720){
   await page.click('[data-test="workspace-mobile-trigger"]');
   const menus=await page.$$('[role=menuitem]');let found=false;
   for(const item of menus){if((await item.evaluate(x=>x.textContent.trim()))==='闺蜜大脑'){
     await item.click();found=true;break}}
   assert.equal(found,true);
  }else await page.click('[data-test="workspace-BRAIN"]');
  await page.waitForSelector('[data-test="brain-model-settings"]');
  await page.waitForSelector('[data-test="cloud-key-native"]');
  const state=await page.evaluate(()=>({
   brain:document.querySelectorAll('[data-test="bc-private-brain"]').length,
   w55Key:document.querySelectorAll('[data-test="cloud-key-native"]').length,
   noPlaintextInBrowser:document.querySelectorAll('[data-test="cloud-secret-input"]').length===0,
   normalOnlyMessage:document.querySelector('[data-test="cloud-key-native"]')?.textContent.includes('当前不是言策安装版'),
   status:document.querySelector('[data-test="brain-state"]')?.textContent.trim(),
   sendDisabled:document.querySelector('[data-test="brain-send"]')?.disabled,
   body:document.body.innerText,
   overX:document.documentElement.scrollWidth-innerWidth
  }));
  assert.equal(state.brain,1);assert.equal(state.w55Key,1);
  assert.equal(state.noPlaintextInBrowser,true);assert.equal(state.normalOnlyMessage,true);
  assert.equal(state.sendDisabled,true);assert.ok(state.overX<=2);
  assert.doesNotMatch(state.body,/终端\s*pair|64位配对|每5分钟重新登录/);
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
  const name='W46_W55_INTEGRATED_'+width+'_CHROME.png';
  await page.screenshot({path:path.join(__dirname,'../evidence',name)});
  evidence.push({width,height,brain:state.brain,keyPanel:state.w55Key,
   noPlaintextInBrowser:state.noPlaintextInBrowser,
   sendDisabled:state.sendDisabled,overX:state.overX,posts,errors});
  await page.close();
 }
 fs.writeFileSync(path.join(__dirname,'../evidence/W46_W55_SIMPLE_KEY_INTEGRATION_CHROME_UAT.json'),
  JSON.stringify({integrationSha:'24b959f533270b7d565bb2d30bac528c79439a66',
    qa:'REAL_WINDOWS_CHROME_NATIVE_W55_KEY_UI_NO_BROWSER_SECRET',
    notInstalledWebView2:true,noActualCloudApiKeyEntered:true,noPaidModelCalls:true,
    examples:evidence},null,2));
 console.log('W46_W55_SIMPLE_PRIVATE_CHROME_PASS 4/4 keyPanelMounted=4 browserSecrets=0 paidPOST=0');
}finally{await browser.close()}
})().catch(e=>{console.error('W46_W55_INTEGRATION_QA_RED',e.stack||e);process.exitCode=1});
