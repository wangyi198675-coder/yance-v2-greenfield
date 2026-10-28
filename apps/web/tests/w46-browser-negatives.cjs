// Real Chrome + actual W24 HTTP service negative interactions (synthetic-only).
// HTTP 409/422 pass through W24's actual HTTP Handler after a test-only one-shot
// malformed/stale request. PENDING is a clearly labeled gateway fixture:
// this test NEVER calls W43's real Agno approval tooling.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const base='http://127.0.0.1:4174';
const native='http://127.0.0.1:47181';
const evidence=path.resolve(__dirname,'../evidence');
const contacts=[
 {tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-2',channel:'FB_PAGE',peer_id:'fake-peer-002',binding_revision:1,scenario:'HTTP_409'},
 {tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',channel:'WHATSAPP_PERSONAL',peer_id:'fake-peer-003',binding_revision:1,scenario:'HTTP_422'},
 {tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-2',channel:'TELEGRAM_PERSONAL',peer_id:'fake-peer-004',binding_revision:1,scenario:'PENDING'}
];
const fullK=c=>[c.tenant,c.account,c.channel,c.peer_id,c.binding_revision].join('|');
const headers={'X-Yance-Environment':'synthetic-only','Content-Type':'application/json'};
const owner=async c=>{
 const r=await fetch(native+'/api/v2/identity-consent/takeover-state?k='+encodeURIComponent(fullK(c)),{headers});
 assert.equal(r.status,200);return r.json()};
(async()=>{
 const browser=await puppeteer.launch({headless:true,
    executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const results=[];
 try{
  for(const c of contacts){
   const page=await browser.newPage(),errors=[],takeoverPosts=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v2/identity-consent/takeover'))takeoverPosts.push(r.url())});
   await page.setViewport({width:950,height:750,deviceScaleFactor:1});
   await page.goto(base+'/?arm=CHAT-BC-FUSION&peer='+encodeURIComponent(c.peer_id),{waitUntil:'networkidle2',timeout:20000});
   await page.waitForSelector('section.bc-native-composer');
   await page.waitForFunction(k=>document.querySelector('section.bc-native-composer')?.textContent?.includes(k),{},fullK(c));
   await page.waitForFunction(()=>document.querySelector('section.bc-native-composer')?.textContent?.includes('READ_ONLY_AUTO'));
   assert.equal(takeoverPosts.length,0,'view/focus must not issue POST');
   assert.equal((await owner(c)).mode,'AUTO','precondition AUTO');
   const r=await fetch(native+'/w46-native-test/negative-once',{
     method:'POST',headers,body:JSON.stringify({identity:c,scenario:c.scenario})});
   assert.equal(r.status,200,await r.text().catch(()=>'')); // follows test env route only
   const input='textarea[aria-label="当前 CONTACT 私有草稿"]';
   await page.click(input);
   assert.equal(takeoverPosts.length,0,'focus must not take over');
   await page.type(input,'x');
   await page.waitForFunction(()=>document.querySelector('section.bc-native-composer')?.textContent?.includes('BLOCKED'),{timeout:15000});
   const ui=await page.$eval('section.bc-native-composer',e=>e.textContent);
   assert.ok(!ui.includes('READY_HUMAN'));
   if(c.scenario==='HTTP_409')assert.match(ui,/NATIVE_HTTP_409/);
   if(c.scenario==='HTTP_422')assert.match(ui,/NATIVE_HTTP_422/);
   if(c.scenario==='PENDING')assert.match(ui,/TAKEOVER_POST_NOT_CONFIRMED/);
   assert.equal(takeoverPosts.length,1,'real action must POST once');
   const after=await owner(c);
   assert.equal(after.mode,'AUTO');assert.equal(after.epoch,0);
   assert.equal(await page.$eval('section.bc-native-composer button[disabled]',el=>el.textContent.includes('发送')),true);
   assert.equal((await page.evaluate(()=>getComputedStyle(document.querySelector('.topbar')).display)),'flex');
   assert.deepEqual(errors,[]);
   const png='W46_BC_REAL_CHROME_NEGATIVE_'+c.scenario+'.png';
   await page.screenshot({path:path.join(evidence,png),fullPage:false});
   results.push({scenario:c.scenario,peer:c.peer_id,postCount:takeoverPosts.length,
     state:'BLOCKED',postState:after.mode,postEpoch:after.epoch,
     proof:c.scenario==='PENDING'?'SYNTHETIC_GATEWAY_APPROVAL_FIXTURE_NOT_W43_RUN':'ACTUAL_W24_HTTP_HANDLER',
     screenshot:png});
   await page.close();
  }
  const result={source:'REAL_WINDOWS_CHROME_HEADLESS',w09SourceSha:'b1b30e839a33b3bab20b805d7babcdb359086831',
    w24OwnerSha:'e10f9e17988fa19c4dc71ce927e5d9eaa01dbdc9',
    uiPositiveSuiteSha:'dc93ced824c808fb0d8f2b032d99535fc6b1d905',
    syntheticOnly:true,noRealSends:true,results};
  fs.writeFileSync(path.join(evidence,'W46_BC_REAL_BROWSER_NEGATIVE_UAT.json'),JSON.stringify(result,null,2));
  console.log('W46_NEGATIVE_CHROME_UAT_PASS cases='+results.length+' W24_HTTP409/422_REAL_GATEWAY_PENDING_FIXTURE');
 }finally{await browser.close()}
})().catch(err=>{console.error('W46_NEGATIVE_CHROME_UAT_FAIL',err.stack||err);process.exitCode=1});
