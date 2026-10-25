// W46 P0 independent scoped scroll proof, actual installed Windows Chrome.
// Exact W40 failure matrix (5 viewports x 3 non-CHAT pages).
// Uses actual W47 GET-only API/empty principal; no synthetic authorized K.
const puppeteer=require(process.env.YANCE_PUPPETEER_PACKAGE||'puppeteer');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../evidence');
const origin='http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1';
const pages=[
 {id:'ACCOUNTS',label:'渠道账号',selector:'[data-test="chatgpt-auth-unavailable"]'},
 {id:'AUTOPILOT',label:'托管中心',selector:'[data-test="w46-hosting-failclosed"]'},
 {id:'SETTINGS',label:'设置诊断',selector:'[data-test="w46-settings-nine"]'}
];
const widths=[[1360,850],[950,620],[430,850],[360,740],[320,680]];
async function navigate(page,p,w){
 if(w<=720){
  await page.click('[data-test="workspace-mobile-trigger"]');
  const links=await page.$$('[role="menuitem"]');
  let did=false;
  for(const link of links){
    if(await link.evaluate(el=>el.textContent.trim())===p.label){await link.click();did=true;break}
  }
  assert.equal(did,true,'workspace mobile menu link');
 }else await page.click('[data-test="workspace-'+p.id+'"]');
 await page.waitForFunction(id=>document.querySelector('[data-test="w46-product-candidate"]')?.dataset.activeWorkspace===id,{},p.id);
}
async function read(page,selector){
 return page.evaluate(sel=>{
  const e=document.querySelector(sel),content=document.querySelector('.w46-candidate-content');
  const root=document.querySelector('.w46-product-candidate');
  const nav=root.querySelector('.w46-product-top');
  const r=e?.getBoundingClientRect(),cr=content?.getBoundingClientRect(),nr=nav?.getBoundingClientRect();
  return {target:r?{top:r.top,bottom:r.bottom}:null,
    scroller:content?{top:content.scrollTop,scrollHeight:content.scrollHeight,
      clientHeight:content.clientHeight,overflowY:getComputedStyle(content).overflowY,rect:{top:cr.top,bottom:cr.bottom}}:null,
    nav:nr?{top:nr.top,bottom:nr.bottom}:null,
    shellOverflow:getComputedStyle(document.querySelector('.shell')).overflowY,
    docWidth:document.documentElement.scrollWidth,viewW:innerWidth,viewH:innerHeight,
    singleComposerSourceNodes:document.querySelectorAll('section.bc-native-composer').length,
    mainVisible:getComputedStyle(document.querySelector('main.workspace')).display!=='none',
    authCount:document.querySelectorAll('.contact-action').length};
 },selector);
}
(async()=>{
 const b=await puppeteer.launch({headless:true,
   executablePath:process.env.YANCE_CHROME_EXE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   args:['--no-first-run','--no-default-browser-check','--disable-extensions']});
 const result=[],errors=[],writes=[];
 try{
  const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(r.method()!=='GET'&&(r.url().includes('/api/v2/')||r.url().includes('/w46-native-test/')))writes.push(r.url())});
  for(const [w,h] of widths){
   await p.setViewport({width:w,height:h,deviceScaleFactor:1});
   await p.goto(origin,{waitUntil:'networkidle2',timeout:20000});
   await p.waitForFunction(()=>document.querySelector('[data-test="w46-trusted-status"]')?.textContent?.includes('未取得可信授权'),{timeout:14000});
   await p.evaluate(()=>window.__originalChatMain=document.querySelector('main.workspace'));
   for(const ws of pages){
    await navigate(p,ws,w);
    await new Promise(r=>setTimeout(r,160)); // wait for Vue workspace watcher/scroll reset
    const original=await read(p,ws.selector);
    assert.equal(original.authCount,0);
    assert.equal(original.singleComposerSourceNodes,0);
    assert.equal(original.mainVisible,false,'non-CHAT must hide original main');
    assert.equal(original.shellOverflow,'hidden','W46 must NOT change legacy shell clipping');
    assert.equal(original.scroller.overflowY,'auto','new region must own native scrolling');
    assert.ok(original.scroller.clientHeight>0,'scroll region must have bounded positive height');
    assert.ok(original.scroller.rect.bottom<=h+2,'region does not overflow screen');
    assert.ok(original.docWidth<=w+1,'no horizontal overflow');
    await p.mouse.move(Math.min(200,w-35),Math.min(h-40,500));
    await p.mouse.wheel({deltaY:1457});
    await new Promise(r=>setTimeout(r,350));
    const after=await read(p,ws.selector);
    assert.ok(after.nav.top>=original.nav.top-2&&after.nav.bottom<=original.nav.bottom+2,'top navigation remains stationary');
    const needed=original.target.bottom>h+4;
    if(needed)assert.ok(after.scroller.top>0,'scroll wheel must move content: '+w+' '+ws.id);
    console.log('AFTER_WHEEL',w,h,ws.id,JSON.stringify({target:after.target,top:after.scroller.top,client:after.scroller.clientHeight,total:after.scroller.scrollHeight,region:after.scroller.rect,nav:after.nav}));
    const finalVisible=after.target.bottom<=h+3;
    assert.ok(finalVisible,'W40 target must become reachable after wheel: '+w+' '+ws.id+' bottom='+after.target.bottom);
    // A browser user can Tab to scroll region and End-scroll, no script-written scrollTop.
    await p.focus('.w46-candidate-content');
    await p.keyboard.press('Home');await new Promise(r=>setTimeout(r,150));
    await p.keyboard.press('End');await new Promise(r=>setTimeout(r,250));
    const keyboard=await read(p,ws.selector);
    console.log('SCROLL_CASE',w,h,ws.id,JSON.stringify({before:original.target,after:after.target,keyboard:keyboard.target,top:keyboard.scroller.top,max:keyboard.scroller.scrollHeight-keyboard.scroller.clientHeight}));
    if(original.scroller.scrollHeight>original.scroller.clientHeight+2){
      assert.ok(keyboard.scroller.top>0,'keyboard End must move accessible scroll region');
      assert.ok(keyboard.target.bottom<=h+3,'keyboard End must reach target');
    }
    result.push({w,h,workspace:ws.id,before:original,after,keyboard,scrollNeeded:needed,
      wheelReached:finalVisible,keyboardReached:keyboard.target.bottom<=h+3});
    if(w===320&&ws.id==='ACCOUNTS')await p.screenshot({path:path.join(out,'W46_R4_VERTICAL_FIX_ACCOUNTS_320_BOTTOM.png')});
    if(w===360&&ws.id==='AUTOPILOT')await p.screenshot({path:path.join(out,'W46_R4_VERTICAL_FIX_AUTOPILOT_360_BOTTOM.png')});
    if(w===950&&ws.id==='ACCOUNTS')await p.screenshot({path:path.join(out,'W46_R4_VERTICAL_FIX_ACCOUNTS_950_BOTTOM.png')});
   }
   if(w<=720){
    await p.click('[data-test="workspace-mobile-trigger"]');
    const links=await p.$$('[role="menuitem"]');
    for(const x of links)if(await x.evaluate(e=>e.textContent.trim())==='聊天'){await x.click();break}
   }else await p.click('[data-test="workspace-CHAT"]');
   const main=await p.evaluate(()=>{
     const main=document.querySelector('main.workspace');
     return {same:main===window.__originalChatMain,visible:getComputedStyle(main).display!=='none',
       contacts:document.querySelectorAll('.contact-action').length,
       title:document.querySelector('[data-test="no-active"]')?.textContent};
   });
   assert.equal(main.same,true);assert.equal(main.visible,true);
   assert.equal(main.contacts,0);assert.match(main.title,/尚未连接聊天平台/);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  const obj={source:'WINDOWS_CHROME_REAL_WHEEL_AND_KEYBOARD',upstreamW09Pr53Sha:'860e99c8e3a69d11e34e721c9b6f746732d42abc',
    w46Scope:'BCProductWorkspaceCandidate.vue ONLY',oldShellOverflow:'hidden',passes:result.length,
    previouslyFailedW40Scenarios:7,allBottomTargetsReachable:true,
    noSession:true,noContacts:true,noSends:true,noMutatingRequests:true,errors,writes,result};
  fs.writeFileSync(path.join(out,'W46_R4_VERTICAL_SCROLL_REAL_CHROME.json'),JSON.stringify(obj,null,2));
  console.log('W46_R4_VERTICAL_CHROME_PASS 15/15 WHEEL_AND_KEYBOARD all_w40_targets_accessible CHAT_preserved=true');
 }finally{await b.close()}
})().catch(e=>{console.error('W46_R4_VERTICAL_CHROME_FAIL',e.stack||e);process.exitCode=1});
