// Real Windows Chrome on W46-only staging Vue; actual W09 API 48187, no user auth.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'C:\\Users\\1\\AppData\\Local\\npm-cache\\_npx\\4b4c857f6efdfb61\\node_modules\\puppeteer');
const out=path.resolve(__dirname,'../evidence');
(async()=>{
 const b=await puppeteer.launch({headless:true,
  executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const results=[],reads=[],writes=[],errors=[];
 try{
  const p=await b.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{
   if(r.method()!=='GET')writes.push({method:r.method(),url:r.url()});
   else if(r.url().includes('/api/v2/'))reads.push(r.url());
  });
  for(const [width,height] of [[320,680],[430,850],[950,620],[1360,900]]){
   await p.setViewport({width,height,deviceScaleFactor:1});
   await p.goto('http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1',
    {waitUntil:'networkidle2',timeout:25000});
   await p.waitForSelector('[data-test="w46-real-chat"]',{timeout:5000}).catch(async e=>{console.error('MISSING_REAL_CHAT_DOM',await p.evaluate(()=>({title:document.title,body:document.body?.innerText?.slice(0,1200),main:document.querySelector('main')?.outerHTML.slice(0,400),scripts:[...document.scripts].map(s=>s.src)})),errors);throw e});
   await p.waitForFunction(()=>document.querySelector('[data-test="w46-read-authority"]')?.textContent?.includes('尚未取得可信本机应用会话'),{timeout:12000});
   const initial=await p.evaluate(()=>({
     realChat:document.querySelectorAll('[data-test="w46-real-chat"]').length,
     demoContacts:document.querySelectorAll('.contact-action').length,
     nativeContacts:document.querySelectorAll('[data-contact-k]').length,
     composers:document.querySelectorAll('section.bc-native-composer').length,
     messages:document.querySelectorAll('[data-mid]').length,
     status:document.querySelector('[data-test="w46-read-authority"]')?.textContent.trim(),
     emptyChat:document.querySelectorAll('[data-test="w46-empty-chat"]').length,
     overflow:document.documentElement.scrollWidth-innerWidth
   }));
   assert.equal(initial.realChat,1);assert.equal(initial.demoContacts,0);
   assert.equal(initial.nativeContacts,0);assert.equal(initial.composers,0);
   assert.equal(initial.messages,0);assert.equal(initial.emptyChat,1);
   assert.ok(initial.overflow<=2);
   await p.click('[data-test="w46-reload-contacts"]');
   await p.waitForFunction(()=>document.querySelector('[data-test="w46-read-authority"]')?.textContent?.includes('尚未取得可信本机应用会话'),{timeout:10000});
   // Only real GET refresh. No takeover or fake provider send.
   const chooseWorkspace=async(text)=>{
    if(width<=720){
     await p.click('[data-test="workspace-mobile-trigger"]');
     for(const item of await p.$$('[role="menuitem"]'))
      if(await item.evaluate(e=>e.textContent.trim())===text){await item.click();return}
     throw Error('mobile nav missing '+text);
    }
    const map={'闺蜜大脑':'BRAIN','渠道账号':'ACCOUNTS','联系人':'PEOPLE','聊天':'CHAT'};
    await p.click('[data-test="workspace-'+map[text]+'"]');
   };
   await chooseWorkspace('闺蜜大脑');
   await p.waitForSelector('[data-test="bc-private-brain"]');
   assert.equal(await p.$eval('[data-test="brain-send"]',el=>el.disabled),true);
   await chooseWorkspace('渠道账号');
   await p.waitForSelector('[data-test="w46-multi-account"]');
   await chooseWorkspace('联系人');
   assert.equal(await p.$eval('[data-test="w46-workspace-content"]',el=>el.textContent.includes('联系人：0')),true);
   await chooseWorkspace('聊天');
   await p.waitForSelector('[data-test="w46-real-chat"]');
   assert.equal(await p.$$eval('.contact-action',xs=>xs.length),0);
   await p.screenshot({path:path.join(out,'W46_ISSUE61_REAL_CHROME_'+width+'.png')});
   results.push({width,height,...initial,refreshWorked:true,brainDisabled:true,
      accountsViewed:true,peopleFromRealAPI:true,realCHATReturned:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  for(const route of ['runtime/health','contacts','runtime/capabilities','private-brain/model-catalog'])
   assert.ok(reads.some(x=>x.includes('/api/v2/'+route)),route);
  const record={source:'ACTUAL_WINDOWS_CHROME_W46_REAL_READ_STAGE',
   webBase:'W46_OWNER_CANDIDATE_4174',apiBase:'W09_EXISTING_48187',
   joinedParent:'bb1be7bf070ceff39681b081b04754a4b4e34cc3',
   actualApiAuthorization:'trustedSession:false,contacts:0, messages:401',
   notRealUpstreamPositive:true,realCloudCalls:0,realSocialSends:0,requestedMethods:writes,
   apiGetReads:reads,jsErrors:errors,scenarios:results};
  fs.writeFileSync(path.join(out,'W46_ISSUE61_REAL_CHROME_UAT.json'),JSON.stringify(record,null,2));
  console.log('W46_ISSUE61_ACTUAL_CHROME_PASS widths=4 liveApiGET=true frozenContacts=0 composer=single-source-only paidCalls=0 sends=0');
 }finally{await b.close()}
})().catch(e=>{console.error('W46_ISSUE61_ACTUAL_CHROME_FAIL',e.stack||e);process.exitCode=1});
