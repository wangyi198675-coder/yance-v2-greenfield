// REAL Windows Chrome native zoom via partition.default_zoom_level.x.
// Cross-check W40's 6 failing conditions, not CSS transform/deviceScaleFactor.
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const evidence=path.resolve(__dirname,'../evidence');
const prefs={110:0.5227586988632231,125:1.2239010857415449};
const result=[],url='http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1';
(async()=>{
 for(const z of [110,125]){
  let browser;
  const dir=path.join(os.tmpdir(),'W46_PR53_P0_NATIVE_ZOOM_SCROLL_'+z+'_ONLY');
  try{
   fs.mkdirSync(path.join(dir,'Default'),{recursive:true});
   fs.writeFileSync(path.join(dir,'Default','Preferences'),
     JSON.stringify({partition:{default_zoom_level:{x:prefs[z]}}}));
   browser=await puppeteer.launch({
    headless:false,defaultViewport:null,
    userDataDir:dir,
    executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args:['--no-first-run','--disable-sync','--no-sandbox','--disable-extensions','--window-size=1360,850']
   });
   const page=await browser.newPage();
   const cdp=await page.createCDPSession();
   const {windowId}=await cdp.send('Browser.getWindowForTarget');
   const errors=[],writes=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()!=='GET'&&(r.url().includes('/api/v2/')||r.url().includes('/w46-native-test/')))writes.push(r.url())});
   for(const physical of [1360,950,430]){
    await cdp.send('Browser.setWindowBounds',{windowId,bounds:{width:physical,height:850,windowState:'normal'}});
    await page.goto(url,{waitUntil:'networkidle2',timeout:22000});
    await page.waitForSelector('[data-test="w46-product-candidate"]');
    const mobile=await page.$eval('[data-test="workspace-mobile-trigger"]',el=>!!el.getClientRects().length);
    if(mobile){
     await page.click('[data-test="workspace-mobile-trigger"]');
     const options=await page.$$('[role="menuitem"]');
     let clicked=false;
     for(const option of options){
      if(await option.evaluate(e=>e.textContent.trim())==='渠道账号'){await option.click();clicked=true;break}
     }
     assert.ok(clicked,'mobile account navigation must work');
    }else await page.click('[data-test="workspace-ACCOUNTS"]');
    await page.waitForFunction(()=>document.querySelector('[data-test="w46-product-candidate"]')?.dataset.activeWorkspace==='ACCOUNTS');
    await new Promise(r=>setTimeout(r,200)); // let Vue scroll-reset complete
    const read=()=>page.evaluate(()=>{
     const b=document.querySelector('[data-test="chatgpt-auth-unavailable"]'),
      scroll=document.querySelector('.w46-candidate-content'),
      nav=document.querySelector('.w46-product-top');
     const r=b.getBoundingClientRect(),sr=scroll.getBoundingClientRect(),nr=nav.getBoundingClientRect();
     return {dpr:devicePixelRatio,cssW:innerWidth,cssH:innerHeight,outerW:outerWidth,
       buttonBottom:r.bottom,buttonTop:r.top,disabled:b.disabled,
       scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
       scrollOverflow:getComputedStyle(scroll).overflowY,
       scrollRectBottom:sr.bottom,navTop:nr.top,navBottom:nr.bottom,
       shellOverflow:getComputedStyle(document.querySelector('.shell')).overflowY,
       docScrollW:document.documentElement.scrollWidth,
       contacts:document.querySelectorAll('.contact-action').length,
       actualComposers:document.querySelectorAll('section.bc-native-composer').length};
    });
    const before=await read();
    assert.ok(Math.abs(before.dpr-z/100)<0.015,'native zoom not correctly applied '+z+' at physical '+physical+': '+before.dpr);
    assert.equal(before.shellOverflow,'hidden','no global shell change');
    assert.equal(before.scrollOverflow,'auto','native candidate scroll must be active');
    assert.equal(before.disabled,true);
    assert.equal(before.contacts,0);assert.equal(before.actualComposers,0);
    assert.ok(before.docScrollW<=before.cssW+2,'horizontal width should fit');
    assert.ok(before.scrollRectBottom<=before.cssH+3);
    await page.mouse.move(Math.min(250,before.cssW-35),Math.min(400,before.cssH-50));
    await page.mouse.wheel({deltaY:1500});
    await new Promise(r=>setTimeout(r,370));
    const after=await read();
    assert.ok(before.buttonBottom>before.cssH+3,'must truly exercise W40 below-fold account button');
    assert.ok(after.scrollTop>0,'native wheel must scroll at '+z+'% '+physical);
    assert.ok(after.buttonBottom<=after.cssH+3,
      'native zoom button still inaccessible at '+z+'% '+physical+': '+after.buttonBottom+' > '+after.cssH);
    assert.ok(after.navBottom<=before.navBottom+2,'nav should stay fixed');
    await page.focus('.w46-candidate-content');
    await page.keyboard.press('Home');await new Promise(r=>setTimeout(r,140));
    await page.keyboard.press('End');await new Promise(r=>setTimeout(r,200));
    const keyboard=await read();
    assert.ok(keyboard.buttonBottom<=keyboard.cssH+3,'End should reach account auth button');
    const row={nativeZoom:z,physicalOuterRequested:physical,actualDpr:before.dpr,
      viewW:before.cssW,viewH:before.cssH,buttonBefore:before.buttonBottom,
      buttonAfter:after.buttonBottom,wheelScrollTop:after.scrollTop,
      keyboardScrollTop:keyboard.scrollTop,canReach:true,hadNetworkWrites:writes.length};
    result.push(row);
    console.log('W46_NATIVE_ZOOM_REACHED',JSON.stringify(row));
    if(physical===430||physical===950)
      await page.screenshot({path:path.join(evidence,'W46_R4_VERTICAL_FIX_NATIVE_'+z+'_OUTER_'+physical+'.png')});
   }
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  }finally{if(browser)await browser.close()}
 }
 const json={source:'ACTUAL_WINDOWS_CHROME_156_NATIVE_PARTITION_ZOOM_NOT_CSS',
  originalW09Pr53Sha:'860e99c8e3a69d11e34e721c9b6f746732d42abc',
  exactW40ZoomValues:prefs,passCount:result.length,
  expectedOriginalW40Failures:6,nativeVerticalAllReachable:true,
  noAuthorizedContacts:true,noMutations:true,noRealSends:true,result};
 fs.writeFileSync(path.join(evidence,'W46_R4_VERTICAL_NATIVE_ZOOM_REAL_CHROME.json'),JSON.stringify(json,null,2));
 console.log('W46_R4_NATIVE_ZOOM_VERTICAL_PASS 6/6 real_110_125_DPR wheel_and_keyboard all_account_targets_accessible');
})().catch(e=>{console.error('W46_R4_NATIVE_ZOOM_VERTICAL_FAIL',e.stack||e);process.exitCode=1});
