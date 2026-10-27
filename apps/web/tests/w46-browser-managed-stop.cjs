// Real installed Windows Chrome, approved original B+C page, W44 original native
// strict REVOKE_GRANT and single existing synthetic SQLite fixture.
'use strict';
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='http://127.0.0.1:4174';
const backend='http://127.0.0.1:47181';
const evidence=path.resolve(__dirname,'../evidence');
const k=peer=>[peer.tenant,peer.account,peer.channel,peer.peer_id,peer.binding_revision].join('|');
const base={tenant:'SYNTHETIC_TEST_ONLY',account:'fixture-account-1',
 channel:'FB_PERSONAL',peer_id:'fake-peer-001',binding_revision:1};
const A=base,B={...base,peer_id:'fake-peer-005'},C={...base,
  account:'fixture-account-2',channel:'FB_PAGE',peer_id:'fake-peer-002'},P={
  ...base,channel:'WHATSAPP_PERSONAL',peer_id:'fake-peer-003'};
const headers={'X-Yance-Environment':'synthetic-only','Content-Type':'application/json'};
async function read(person,scope){
 const r=await fetch(backend+'/w46-native-test/managed-stop?k='+encodeURIComponent(k(person))+
   '&scope='+scope,{headers});assert.equal(r.status,200);
 return r.json();
}
async function open(page,person){
 await page.goto(origin+'/?arm=CHAT-BC-FUSION&peer='+person.peer_id,
   {waitUntil:'networkidle2',timeout:20000});
 await page.waitForSelector('[data-test="stop-managed-trigger"]');
 await page.click('[data-test="stop-managed-trigger"]');
 await page.waitForSelector('[data-test="managed-stop-controls"]',{visible:true});
 await page.waitForFunction(()=>document.querySelector('[data-test="stop-contact-state"]')
    ?.textContent?.includes('正在托管'),{timeout:15000});
}
const label=(page,selector)=>page.$eval(selector,e=>e.textContent.trim());
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:
  process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const checks=[],errors=[];
 try{
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.setViewport({width:1360,height:900,deviceScaleFactor:1});
  await open(page,A);
  assert.equal((await read(A,'CONTACT')).status,'ACTIVE');
  assert.equal((await read(B,'CONTACT')).status,'ACTIVE');
  assert.equal((await read(C,'CONTACT')).status,'ACTIVE');
  assert.equal(await label(page,'[data-test="stop-contact-state"]'),'正在托管');
  assert.equal(await label(page,'[data-test="stop-account-state"]'),'正在托管');
  await page.click('[data-test="stop-contact"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="stop-contact-state"]')
     ?.textContent?.includes('已停止'),{timeout:15000});
  const outA=await read(A,'CONTACT');
  assert.equal(outA.status,'COMMITTED');
  assert.equal(await page.$eval('.chat-person small',e=>e.textContent.includes('已停止')),true,
    'original B+C chat header must not keep stale AUTO after W44 stop');
  assert.equal(await page.$eval('.contact-action.selected .contact-state',e=>e.textContent.includes('已停止')),true,
    'original B+C contact row must reflect W44 read, not frozen fixture AUTO');
  assert.equal((await read(B,'CONTACT')).status,'ACTIVE','B on same account unaffected');
  assert.equal((await read(C,'CONTACT')).status,'ACTIVE','C on other account unaffected');
  assert.equal(await page.$eval('section.bc-native-composer button[disabled]',x=>x.textContent.includes('发送')),true);
  await page.screenshot({path:path.join(evidence,'W46_STOP_CONTACT_COMMITTED_CHROME.png')});
  checks.push({step:'STOP_CONTACT',A:outA.status,B:(await read(B,'CONTACT')).status,
    C:(await read(C,'CONTACT')).status});
  await page.reload({waitUntil:'networkidle2'});
  await page.click('[data-test="stop-managed-trigger"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="stop-contact-state"]')
    ?.textContent?.includes('已停止'),{timeout:15000});
  checks.push({step:'RELOAD_COMMITTED',status:await label(page,'[data-test="stop-contact-state"]')});
  await open(page,B);
  await page.click('[data-test="stop-account"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="stop-account-state"]')
    ?.textContent?.includes('已停止'),{timeout:15000});
  const gb=await read(B,'GLOBAL'),ga=await read(A,'GLOBAL');
  assert.equal(gb.status,'COMMITTED');assert.equal(ga.status,'COMMITTED');
  assert.equal((await read(C,'GLOBAL')).status,'ACTIVE',
     'Stopping CURRENT account/channel must not revoke other account');
  await page.screenshot({path:path.join(evidence,'W46_STOP_ACCOUNT_COMMITTED_CHROME.png')});
  checks.push({step:'STOP_CURRENT_ACCOUNT',globalAccount1:gb.status,
    otherAccount:(await read(C,'GLOBAL')).status});
  await page.reload({waitUntil:'networkidle2'});
  await page.click('[data-test="stop-managed-trigger"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="stop-account-state"]')
    ?.textContent?.includes('已停止'),{timeout:15000});
  checks.push({step:'RELOAD_GLOBAL',status:await label(page,'[data-test="stop-account-state"]')});
  // Existing W44 original PRE_NETWORK ARM forces managed stop PENDING; no sink.
  const ar=await fetch(backend+'/w46-native-test/managed-stop-arm',{method:'POST',headers,
    body:JSON.stringify({identity:P,intentId:'fake-pending-managed-stop'})});
  assert.equal(ar.status,200,await ar.text().catch(()=>'')); // repair if consumed?
  await open(page,P);
  await page.click('[data-test="stop-contact"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="stop-contact-state"]')
    ?.textContent?.includes('停止中'),{timeout:15000});
  const pending=await read(P,'CONTACT');
  assert.equal(pending.status,'PENDING');
  assert.equal(await page.$eval('.chat-person small',e=>e.textContent.includes('停止中')),true);
  assert.equal(await label(page,'[data-test="stop-contact-state"]'),'停止中');
  assert.equal((await page.evaluate(()=>document.querySelector('[data-test="stop-managed-trigger"]').textContent)).includes('已停止'),false);
  await page.screenshot({path:path.join(evidence,'W46_STOP_PENDING_CHROME.png')});
  await page.reload({waitUntil:'networkidle2'});
  await page.click('[data-test="stop-managed-trigger"]');
  await page.waitForFunction(()=>document.querySelector('[data-test="stop-contact-state"]')
    ?.textContent?.includes('停止中'),{timeout:15000});
  const again=await read(P,'CONTACT');
  assert.equal(again.status,'PENDING');
  assert.equal(again.requestId,pending.requestId,'persistent W44 request ID after refresh');
  checks.push({step:'PRE_NETWORK_ARM_PENDING',status:pending.status,
    persistedRequestId:again.requestId});
  assert.equal(errors.length,0,'no browser JS errors');
  fs.writeFileSync(path.join(evidence,'W46_STOP_REAL_BROWSER_UAT.json'),JSON.stringify({
    source:'REAL_WINDOWS_GOOGLE_CHROME_HEADLESS',userFlow:'ORIGINAL_BC_CONTACT_HEADER',
    backend:'ORIGINAL_W44_NATIVE_STRICT_SQLITE_SYNTHETIC_ONLY',
    w09Source:'1588975118141af0d8b6033310f410a786faf9b0',
    w44Owner:'66a70a15af885274b74c0124d0e914924579bebf',
    productionHttpAuthorizer:'HOLD_NOT_IMPLEMENTED',
    appScope:'W46_APPS_WEB_ONLY',zeroProviderSends:true,errors,checks,
    screenshots:['W46_STOP_CONTACT_COMMITTED_CHROME.png',
       'W46_STOP_ACCOUNT_COMMITTED_CHROME.png','W46_STOP_PENDING_CHROME.png']
  },null,2));
  console.log('W46_REAL_CHROME_STOP_PASS steps='+checks.length+' screenshots=3 A_CONTACT_COMMITTED B_STAYS_AUTO OTHER_ACCOUNT_ACTIVE PENDING_RELOAD');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_REAL_CHROME_STOP_FAIL',e.stack||e);process.exitCode=1});
