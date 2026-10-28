// Real Chromium physical page UAT against original B+C App via W46-only Vite integration.
// Explicitly NONPRODUCTION: runs with W46 synthetic W24/W44/W45 source server at loopback.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const root=path.resolve(__dirname,'..');
const evidence=path.join(root,'evidence');
fs.mkdirSync(evidence,{recursive:true});
const origin='http://127.0.0.1:4174/';
const API='http://127.0.0.1:47181/api/v2/identity-consent/takeover-state?k=';
const k=peer=>[
 peer.tenant,peer.account,peer.channel,peer.peer_id,peer.binding_revision].join('|');
const A={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',channel:'FB_PERSONAL',
peer_id:'fake-peer-001',binding_revision:1};
const B={...A,account:'fixture-account-2',channel:'FB_PAGE',peer_id:'fake-peer-002'};
const C={...A,channel:'WHATSAPP_PERSONAL',peer_id:'fake-peer-003'};
const headers={'X-Yance-Environment':'synthetic-only'};
const native=async(peer)=>{
 const resp=await fetch(API+encodeURIComponent(k(peer)),{headers});
 if(resp.status!==200)throw Error('W24_STATE_HTTP_'+resp.status+':'+await resp.text());return resp.json()};
const check=async(page)=>{
 const info=await page.evaluate(()=>{
  const c=document.querySelector('[data-test="composer"]');
  const width=document.documentElement.scrollWidth,
    viewport=document.documentElement.clientWidth;
  const active=document.querySelector('section.bc-native-composer');
  return {count:document.querySelectorAll('[data-test="composer"]').length,
    nativeCount:document.querySelectorAll('section.bc-native-composer').length,
    active:!!active,documentWidth:width,viewport,
    text:c?.textContent?.slice(0,200)||'',theme:document.querySelector('#yance-prototype')?.getAttribute('data-theme'),
    mode:document.querySelector('#yance-prototype')?.getAttribute('data-mode')};
 });
 assert.equal(info.count,1,'one CONTACT Composer');
 assert.equal(info.nativeCount,1,'native Composer replaces rather than adds');
 assert.ok(info.active);
 // Existing B+C shell may expose intentional horizontal scroll in small viewport.
 // Keep actual dimensions rather than invent perfect responsiveness.
 return info;
};
(async()=>{
 const browser=await puppeteer.launch({headless:true,
   executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   args:['--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking']});
 const measurements=[],events=[],errors=[];
 try {
   const page=await browser.newPage();
   page.on('pageerror',e=>errors.push(String(e.message||e)));
   page.on('response',r=>{if(r.url().includes('/api/v2/')&&r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
   page.on('requestfailed',r=>errors.push('FAILED '+r.url()+' '+r.failure()?.errorText));
   page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/v2/identity-consent/takeover'))events.push('POST')});
   await page.setViewport({width:1360,height:900,deviceScaleFactor:1});
   await page.goto(origin+'?arm=CHAT-BC-FUSION',{waitUntil:'networkidle2',timeout:20000});
   await page.waitForSelector('section.bc-native-composer',{timeout:15000});
   await page.waitForFunction(()=>document.querySelector('section.bc-native-composer')?.textContent?.includes('READ_ONLY_AUTO'),{timeout:15000});
   const before=await native(A);assert.equal(before.mode,'AUTO');
   assert.equal(events.length,0,'focus / viewing do not POST');
   const starting=await check(page);measurements.push({stage:'view-only',...starting});
   const styling=await page.evaluate(()=>({display:getComputedStyle(document.querySelector('.topbar')).display,
     bodyFont:getComputedStyle(document.body).fontFamily}));
   assert.equal(styling.display,'flex','original B+C stylesheet must load: unstyled browser is NOT a UI PASS');
   const source=await page.$eval('[data-test="native-message"]',el=>el.textContent);
   assert.ok(source.includes('fake-mid-1'));
   assert.ok(source.includes('Test message #1'));
   assert.equal(await page.$eval('.bc-replies',el=>el.textContent.includes('0 条有来源建议')),true);
   const input='textarea[aria-label="当前 CONTACT 私有草稿"]';
   await page.click(input);
   assert.equal(events.length,0,'focus cannot take over');
   await page.type(input,'My manual note',{delay:14});
   await page.waitForFunction(()=>document.querySelector('section.bc-native-composer')?.textContent?.includes('READY_HUMAN'),{timeout:15000});
   assert.equal((await native(A)).mode,'HUMAN','real W24+W44 HTTP A became HUMAN');
   assert.equal((await native(A)).epoch,1);
   assert.equal((await native(B)).mode,'AUTO','B remains AUTO');
   assert.equal((await native(C)).mode,'AUTO','C remains AUTO');
   assert.equal(events.length,1,'same-K type coalesced, real W24 POST once');
   assert.equal((await page.$('section.bc-native-composer button:not([disabled])'))===null,true,'no active send');
   measurements.push({stage:'real-input',postRequests:events.length,state:'HUMAN-A,AUTO-B-C'});
   // Switch contact and verify no POST triggered by click.
   const postsBefore=events.length;
   await page.evaluate(()=>{const b=[...document.querySelectorAll('button.contact-action')].find(
       e=>e.getAttribute('aria-label')?.includes('fake-peer-002'));if(!b)throw Error('B_NOT_IN_LIST');b.click()});
   await page.waitForFunction(()=>document.querySelector('section.bc-native-composer')?.textContent?.includes('fake-peer-002'),{timeout:15000});
   assert.equal(events.length,postsBefore,'switching must not POST');
   assert.equal((await native(B)).mode,'AUTO');
   const afterSwitch=await check(page);measurements.push({stage:'switch-b',...afterSwitch});
   // Real B+C page size coverage; keep actual overflow widths as evidence.
   for(const width of [360,430,720,920,950,1050,1100,1101,1360]){
     await page.setViewport({width,height:900,deviceScaleFactor:1});
     await new Promise(r=>setTimeout(r,70));
     const m=await check(page);measurements.push({stage:'viewport',width,...m});
     if([360,950,1360].includes(width)){
       const theme=width===950?'dark':'light';
       await page.evaluate(desired=>{
         const root=document.querySelector('#yance-prototype');
         if(root?.dataset.mode!==desired){
           const btn=document.querySelector('.top-actions button[aria-label^="切换"]');
           if(!btn)throw Error('ACTUAL_THEME_TOGGLE_NOT_FOUND');
           btn.click()
         }
       },theme);
       await page.waitForFunction(desired=>document.querySelector('#yance-prototype')?.dataset.mode===desired,{},theme);
       await page.screenshot({path:path.join(evidence,'W46_ORIGINAL_BC_'+width+'_'+theme+'_CHROME.png'),fullPage:false});
     }
   }
   // Actual original B+C UI theme clicks (five approved themes x light/dark).
   for(let theme=0;theme<5;theme++){
     await page.click('button[aria-label="选择主题"]');
     await page.waitForSelector('.theme-opts button',{visible:true});
     await page.evaluate(i=>{
       const buttons=Array.from(document.querySelectorAll('.theme-opts button'));
       if(!buttons[i])throw Error('MISSING_THEME_'+i);
       buttons[i].click()
     },theme);
     await page.waitForFunction(i=>document.querySelector('#yance-prototype')?.dataset.theme===String(i),{},theme);
     for(const mode of ['light','dark']){
       await page.evaluate(desired=>{
         const current=document.querySelector('#yance-prototype')?.dataset.mode;
         if(current!==desired){
           const btn=document.querySelector('button[aria-label="'+(desired==='dark'?'切换深色':'切换浅色')+'"]');
           if(!btn)throw Error('THEME_SWITCH_MISSING');
           btn.click()
         }
       },mode);
       await page.waitForFunction(desired=>document.querySelector('#yance-prototype')?.dataset.mode===desired,{},mode);
       const m=await check(page);measurements.push({stage:'theme-ui-click',theme,mode,...m});
       if(mode==='dark')await page.screenshot({path:path.join(evidence,'W46_BC_THEME_'+theme+'_DARK.png'),fullPage:false});
     }
   }
   assert.equal(errors.length,0,'browser JS should not throw');
   const json={source:'REAL_WINDOWS_CHROME_HEADLESS',origin,syntheticOnly:true,
      w24Sha:'e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9',
      w45Sha:'ab059fc29584bcfee60dd793758beef2b2a3c643',
      requestCount:events.length,pageErrors:errors,
      measurements,shotNames:fs.readdirSync(evidence).filter(x=>x.endsWith('.png'))};
   fs.writeFileSync(path.join(evidence,'W46_BC_REAL_BROWSER_UAT.json'),JSON.stringify(json,null,2));
   console.log('W46_REAL_CHROME_UAT_PASS screenshots='+json.shotNames.length+' widths=9 themeStates=10 postCount='+events.length);
   console.log('WIDTHS',JSON.stringify(measurements.filter(x=>x.stage==='viewport').map(x=>[x.width,x.documentWidth,x.viewport])));
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_REAL_CHROME_UAT_FAIL',e.stack||e);process.exitCode=1});
