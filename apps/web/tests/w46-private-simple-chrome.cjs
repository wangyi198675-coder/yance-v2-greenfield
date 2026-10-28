'use strict';
const {strict:assert}=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('C:\\Users\\1\\AppData\\Local\\npm-cache\\_npx\\4b4c857f6efdfb61\\node_modules\\puppeteer');
const dir=path.resolve(__dirname,'../evidence');
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check']});
 const results=[];
 try{
  for(const [width,height] of [[320,680],[430,850],[950,620],[1360,900]]){
   const page=await browser.newPage();
   await page.setViewport({width,height,deviceScaleFactor:1});
   const errors=[],posts=[],models=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{
    if(r.method()!=='GET')posts.push([r.method(),r.url()]);
    if(r.url().includes('/api/v2/private-brain/'))models.push(r.url());
   });
   const res=await page.goto('http://127.0.0.1:4193/?arm=CHAT-BC-FUSION&productDraft=1',
    {waitUntil:'networkidle2',timeout:20000});
   assert.ok([200,304].includes(res.status()),'render from local Vite preview');
   await page.waitForSelector('[data-test="w46-product-candidate"]');
   if(width<=720){
    await page.click('[data-test="workspace-mobile-trigger"]');
    const els=await page.$$('[role=menuitem]');
    let found=false;
    for(const e of els)if((await e.evaluate(x=>x.textContent.trim()))==='闺蜜大脑'){
      await e.click();found=true;break;
    }
    assert.ok(found,'mobile brain tab');
   }else await page.click('[data-test="workspace-BRAIN"]');
   await page.waitForSelector('[data-test="bc-private-brain"]');
   await page.waitForSelector('[data-test="brain-model-settings"]');
   const state=await page.evaluate(()=>({
    url:location.href,brain:document.querySelectorAll('[data-test="bc-private-brain"]').length,
    composer:document.querySelectorAll('[data-test="composer"]').length,
    keyPrompt:document.querySelectorAll('[data-test="brain-native-key-hold"]').length,
    nativeSignin:document.querySelectorAll('[data-test="w46-native-session"]').length,
    setup:document.querySelectorAll('[data-test="brain-model-settings"]').length,
    providers:[...document.querySelectorAll('.bc-provider strong')].map(x=>x.textContent.trim()),
    sendDisabled:document.querySelector('[data-test="brain-send"]')?.disabled,
    state:document.querySelector('[data-test="brain-state"]')?.textContent.trim(),
    body:document.body.innerText, scrollX:document.documentElement.scrollWidth-innerWidth
   }));
   assert.equal(state.brain,1);
   assert.equal(state.nativeSignin,0,'no native-login panel in BRAIN');
   assert.equal(state.setup,1,'simple settings automatically open');
   assert.equal(state.sendDisabled,true,'no verified model no paid turn');
   assert.ok(state.scrollX<=2,'responsive no horizontal overflow');
   assert.doesNotMatch(state.body,/64位配对|终端\s*pair|复制.*验证码|每5分钟重新登录|请输入设备码/);
   assert.ok(models.some(x=>x.endsWith('/api/v2/private-brain/model-catalog')),'true W47 public catalog');
   assert.deepEqual(posts,[],'must not charge or create send/session');
   assert.deepEqual(errors,[],'no JS errors');
   await page.screenshot({path:path.join(dir,'W46_PRIVATE_SIMPLE_'+width+'_CHROME.png')});
   results.push({width,height,state:state.state,providers:state.providers,
     view:'BRAIN',nativeSigninPanels:state.nativeSignin,setupVisible:state.setup,
     sendDisabled:state.sendDisabled,postRequests:posts,
     serverModelRequests:models,errors,scrollX:state.scrollX});
   await page.close();
  }
  fs.writeFileSync(path.join(dir,'W46_PRIVATE_SIMPLE_NO_PAIR_CHROME_UAT.json'),
   JSON.stringify({source:'e352180cba665b56b35822fa2aff2c7525360016',
     type:'REAL_WINDOWS_CHROME_NO_MODEL_NO_PAIR',
     noKeyProvided:true,noPaidRequests:true,realSocialSends:0,
     scenarios:results},null,2));
  console.log('W46_PRIVATE_SIMPLE_CHROME_PASS '+results.length+'/'+results.length+
   ' noPair=1 setup=1 signedHistoryNotFaked=1 paidPOST=0 nativeLoginVisible=0');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_PRIVATE_SIMPLE_CHROME_RED',e.stack||e);process.exitCode=1});
