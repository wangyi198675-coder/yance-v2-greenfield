// W46 owner real installed Windows Chrome NONPROD candidate; current C API 48184,
// never the official 44751 Web. No fake logged-in session or paid model call.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const evidence=path.resolve(__dirname,'../evidence');
const u='http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1';
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const errors=[],badResponses=[],writes=[],measures=[],resources=new Set();
 try{
  const page=await browser.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',r=>{if(r.method()!=='GET')writes.push({method:r.method(),url:r.url()})});
  page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()})});
  for(const [w,h] of [[320,680],[430,850],[950,620],[1360,900]]){
    await page.setViewport({width:w,height:h,deviceScaleFactor:1});
    await page.goto(u,{waitUntil:'networkidle2',timeout:20000});
    await page.waitForSelector('[data-test="w46-product-candidate"]');
    if(w<=720){
      await page.click('[data-test="workspace-mobile-trigger"]');
      const links=await page.$$('[role="menuitem"]');
      for(const l of links)if(await l.evaluate(el=>el.textContent.trim())==='闺蜜大脑'){await l.click();break}
    }else await page.click('[data-test="workspace-BRAIN"]');
    await page.waitForSelector('[data-test="bc-private-brain"]',{timeout:10000});
    await page.waitForFunction(()=>document.querySelector('[data-test="brain-state"]')?.textContent?.includes('本机可信会话尚未建立'),{timeout:10000});
    const b=await page.evaluate(()=>({
      brainCount:document.querySelectorAll('[data-test="bc-private-brain"]').length,
      pairInputs:document.querySelectorAll('#bc-local-pair-code,[data-test="local-session-one-use-code"]').length,
      legacyConnector:document.querySelectorAll('[data-test="bc-local-session-connector"]').length,
      terminalPairText:document.querySelector('[data-test="bc-private-brain"]').textContent.includes('64位配对码'),
      settings:document.querySelectorAll('[data-test="brain-open-settings"]').length,
      sendDisabled:document.querySelector('[data-test="brain-send"]').disabled,
      history:document.querySelectorAll('[data-test="brain-history"] article').length,
      contacts:document.querySelectorAll('.contact-action').length,
      horizontal:document.documentElement.scrollWidth-innerWidth,
      sessionText:document.querySelector('[data-test="brain-state"]').textContent.trim(),
      visibleComposer:document.querySelectorAll('section.bc-native-composer').length
    }));
    assert.equal(b.brainCount,1);assert.equal(b.pairInputs,0);assert.equal(b.legacyConnector,0);
    assert.equal(b.terminalPairText,false);assert.equal(b.settings,1);
    assert.equal(b.sendDisabled,true);assert.equal(b.history,0);
    assert.equal(b.contacts,0);assert.equal(b.visibleComposer,0);
    assert.ok(b.horizontal<=1);
    await page.click('[data-test="brain-open-settings"]');
    await page.waitForSelector('[data-test="brain-model-settings"]');
    for(const brand of ['OpenRouter','OpenAI API','本地 Qwen3'])
      assert.equal(await page.$eval('[data-test="brain-model-settings"]',(e,text)=>e.textContent.includes(text),brand),true);
    assert.equal(await page.$eval('[data-test="brain-select-model"]',e=>e.disabled),true);
    assert.equal(await page.$$eval('[data-test="brain-key-input"]',rows=>rows.length),0);
    await page.screenshot({path:path.join(evidence,'W46_SINGLE_BRAIN_'+w+'_SAFE_NO_PAIR.png')});
    measures.push({w,h,...b,threeProviderLabels:true,serverSource:'current live 48184 paired:false'});
    // page reload recovers only server status, never a local fake conversation.
    await page.reload({waitUntil:'networkidle2'});
    await page.waitForSelector('[data-test="w46-product-candidate"]');
    if(w<=720){
      await page.click('[data-test="workspace-mobile-trigger"]');
      for(const l of await page.$$('[role="menuitem"]'))
        if(await l.evaluate(el=>el.textContent.trim())==='闺蜜大脑'){await l.click();break}
    }else await page.click('[data-test="workspace-BRAIN"]');
    await page.waitForFunction(()=>document.querySelector('[data-test="brain-state"]')?.textContent?.includes('本机可信会话尚未建立'));
    assert.equal(await page.$$eval('[data-test="brain-history"] article',rows=>rows.length),0);
    if(w<=720){
     await page.click('[data-test="workspace-mobile-trigger"]');
     for(const l of await page.$$('[role="menuitem"]'))
      if(await l.evaluate(el=>el.textContent.trim())==='聊天'){await l.click();break}
    }else await page.click('[data-test="workspace-CHAT"]');
    const chat=await page.evaluate(()=>({
      visible:getComputedStyle(document.querySelector('main.workspace')).display!=='none',
      composer:document.querySelectorAll('section.bc-native-composer').length
    }));
    assert.equal(chat.visible,true);assert.equal(chat.composer,0);
  }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  const bundle=await page.evaluate(()=>[...document.scripts].map(el=>el.src).filter(Boolean));
  const sw=await page.evaluate(async()=>navigator.serviceWorker?.getRegistrations?.().then(rs=>rs.map(r=>r.scope)).catch(()=>[])||[]);
  const data={source:'ACTUAL_WINDOWS_CHROME_VUE_NONPROD_CURRENT_C_API_48184',originalOwnerSha:'f2c9d995499e9974f8771c2832094f8ed6a4a287',
    currentOfficialUrlUntouched:'http://127.0.0.1:44751/',
    currentApiStatus:'paired:false; no signed cloud model catalogue',widthCount:measures.length,
    noTerminalPairForm:true,noFakeSession:true,noMockAnswer:true,
    noActualModelInvocation:true,noMutations:true,apiWrites:writes,errors,
    serverErrors:badResponses,loadedBundleScripts:bundle,serviceWorkers:sw,
    measures};
  fs.writeFileSync(path.join(evidence,'W46_SINGLE_BRAIN_REAL_CHROME_UAT.json'),JSON.stringify(data,null,2));
  console.log('W46_SINGLE_BRAIN_CHROME_PASS 4/4 no_pair=TRUE labels=3 history=0 no_calls=TRUE');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_SINGLE_BRAIN_CHROME_FAIL',e.stack||e);process.exitCode=1});
