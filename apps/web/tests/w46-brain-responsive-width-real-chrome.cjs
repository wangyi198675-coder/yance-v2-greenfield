'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const puppeteer=require('C:\\Users\\1\\AppData\\Local\\npm-cache\\_npx\\4b4c857f6efdfb61\\node_modules\\puppeteer');
(async()=>{
 const browser=await puppeteer.launch({headless:true,
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check']});
 const data=[];
 try{
  for(const [width,height] of [[320,680],[430,850],[950,620],[1360,900]]){
   const page=await browser.newPage();
   await page.setViewport({width,height,deviceScaleFactor:1});
   const errors=[],posts=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()!=='GET')posts.push(r.url())});
   const response=await page.goto('http://127.0.0.1:4195/?arm=CHAT-BC-FUSION&productDraft=1',
    {waitUntil:'networkidle2',timeout:24000});
   assert.ok([200,304].includes(response.status()));
   await page.waitForSelector('[data-test="w46-product-candidate"]');
   if(width<=720){
    await page.click('[data-test="workspace-mobile-trigger"]');
    const menus=await page.$$('[role=menuitem]');
    let found=false;
    for(const element of menus){
     if((await element.evaluate(e=>e.textContent.trim()))==='闺蜜大脑'){
      await element.click();found=true;break;
     }
    }
    assert.ok(found,'mobile Brain navigation');
   }else await page.click('[data-test="workspace-BRAIN"]');
   await page.waitForSelector('[data-test="bc-private-brain"]');
   await page.waitForSelector('[data-test="cloud-key-native"]');
   const actual=await page.evaluate(()=>{
    const outer=document.querySelector('[data-test="w46-brain-one"]');
    const inner=document.querySelector('[data-test="bc-private-brain"]');
    const parent=outer.getBoundingClientRect();
    const card=inner.getBoundingClientRect();
    const content=document.querySelector('.w46-candidate-content').getBoundingClientRect();
    return {viewport:innerWidth,parentWidth:parent.width,cardWidth:card.width,
      contentWidth:content.width,unused:parent.right-card.right,
      ratio:card.width/parent.width,
      cssMaxWidth:getComputedStyle(inner).maxWidth,
      overflowX:document.documentElement.scrollWidth-innerWidth,
      uniqueBrain:document.querySelectorAll('[data-test="bc-private-brain"]').length,
      uniqueKey:document.querySelectorAll('[data-test="cloud-key-native"]').length,
      canSend:!document.querySelector('[data-test="brain-send"]').disabled};
   });
   assert.equal(actual.uniqueBrain,1);
   assert.equal(actual.uniqueKey,1);
   assert.ok(actual.ratio>=0.98,'card should fill parent, got '+JSON.stringify(actual));
   assert.ok(actual.unused<=2,'right side must not be empty');
   assert.ok(actual.overflowX<=2,'must not overflow horizontally');
   assert.equal(actual.canSend,false,'no genuine selected model');
   assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
   const file='W46_BRAIN_FLUID_'+width+'_REAL_CHROME.png';
   await page.screenshot({path:path.resolve(__dirname,'../evidence',file)});
   data.push({width,height,...actual,photo:file,errors,posts});
   await page.close();
  }
  fs.writeFileSync(path.resolve(__dirname,'../evidence/W46_BRAIN_FLUID_LAYOUT_REAL_CHROME_UAT.json'),
   JSON.stringify({source:'W46+W55 layout regression under exact source',
    screenshotOrigin:'REAL_WINDOWS_CHROME',scenarios:data},null,2));
  console.log('W46_BRAIN_FLUID_WIDTH_REAL_CHROME_PASS 4/4 '+data.map(x=>x.width+':'+
   Math.round(x.cardWidth)+'/'+Math.round(x.parentWidth)+'='+x.ratio.toFixed(3)).join(' '));
 }finally{await browser.close()}
})().catch(e=>{console.error('W46_BRAIN_FLUID_WIDTH_FAIL',e.stack||e);process.exitCode=1});
