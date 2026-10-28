// Nonproduction real Chrome screenshot test of sole approved B+C with new stop menu.
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.launch({headless:true,
 executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 args:['--no-first-run','--no-default-browser-check']});
 const measurements=[];
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&peer=fake-peer-001',{waitUntil:'networkidle2'});
  for(const width of [360,430,720,920,950,1050,1100,1101,1360]){
   await page.setViewport({width,height:900});
   await page.waitForSelector('[data-test="stop-managed-trigger"]');
   await page.click('[data-test="stop-managed-trigger"]');
   const res=await page.evaluate(()=>{
     const el=document.querySelector('.bc-stop-menu');
     const bg=getComputedStyle(el).backgroundColor;
     return {screen:innerWidth,scroll:document.documentElement.scrollWidth,
       count:document.querySelectorAll('section.bc-native-composer').length,
       btn:!!document.querySelector('[data-test="stop-managed-trigger"]'),
       overlayBg:bg,rect:el.getBoundingClientRect().toJSON(),
       jsStyle:getComputedStyle(document.querySelector('.topbar')).display};
   });
   assert.equal(res.count,1);
   assert.ok(res.btn);
   assert.notEqual(res.overlayBg,'rgba(0, 0, 0, 0)');
   assert.equal(res.jsStyle,'flex');
   assert.equal(res.scroll,width,'B+C responsive overflow check');
   assert.ok(res.rect.left>=0&&res.rect.right<=width+1,'stop popover inside viewport');
   measurements.push({width,...res});
   if(width===360)await page.screenshot({path:path.resolve(__dirname,'../evidence/W46_STOP_MOBILE_360_CHROME.png')});
   await page.click('[data-test="stop-managed-trigger"]');
  }
  fs.writeFileSync(path.resolve(__dirname,'../evidence/W46_STOP_RESPONSIVE_UAT.json'),
    JSON.stringify({source:'REAL_WINDOWS_GOOGLE_CHROME_HEADLESS',widths:measurements},null,2));
  console.log('W46_STOP_RESPONSIVE_PASS widths='+measurements.length+' popupReadable=true');
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_STOP_RESPONSIVE_FAIL',e.stack||e);process.exitCode=1});
