#!/usr/bin/env node
// Real Chromium B+C smoke in clean GitHub runner. Never use W39 stale test-output.
import {chromium} from 'playwright';import {spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),app=path.join(root,'design/nonproduction/approved-clickable-abc-bc'),screens=path.join(root,'ci-artifacts','browser');
fs.mkdirSync(screens,{recursive:true});
const port=4178,url='http://127.0.0.1:'+port;
const proc=spawn('npm',['run','preview','--','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:app,stdio:'pipe'});
let log='';proc.stdout.on('data',d=>log+=d.toString());proc.stderr.on('data',d=>log+=d.toString());
const report={sha:(await import('node:child_process')).spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),browser:'chromium',cases:[],fail:0,source:'CI real new headless Chromium; NOT independent native Windows or human UX'};
const record=(label,pass,error)=>{report.cases.push({label,status:pass?'PASS':'FAIL',error:error?String(error).slice(0,400):undefined});if(!pass)report.fail++};
const wait=async()=>{for(let i=0;i<60;i++){if(proc.exitCode!==null)throw Error('vite-preview-exited: '+log.slice(-1000));try{const r=await fetch(url);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,800));}throw Error('vite-preview-did-not-start '+log.slice(-600))};
let browser;
try{
 await wait();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [360,430,720,920,950,1050,1100,1101,1360]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  const errors=[];const outbound=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{const u=req.url();if(/^https?:|^wss?:/.test(u)&&!u.startsWith(url))outbound.push(u.slice(0,80))});
  try{
   await page.goto(url+'/?arm=CHAT-BC-FUSION',{waitUntil:'domcontentloaded',timeout:20000});
   const composer=page.locator('[data-test="composer"]');await composer.waitFor({state:'visible',timeout:10000});
   const bbox=await composer.boundingBox();if(!bbox||bbox.y<0||bbox.y+bbox.height>901)throw Error('composer-outside-viewport: '+JSON.stringify(bbox));
   if(outbound.length)throw Error('external-provider-request: '+JSON.stringify(outbound));
   if(errors.length)throw Error('browser-js-errors:'+errors.join(' | '));
   await page.screenshot({path:path.join(screens,'BC-'+width+'.png'),fullPage:false});
   record('BC_COMPOSER_VISIBLE_NO_EXTERNAL_'+width,true);
   const button=page.locator('.chat-actions button[aria-expanded]').first();
   if(await button.count()){await button.click();const pane=page.locator('[data-test="autopilot-center"]');if(!(await pane.isVisible()))throw Error('autopilot-drawer-unavailable');record('BC_AUTOPILOT_DRAWER_'+width,true)}
   else throw Error('autopilot-toggle-unavailable');
  }catch(e){record('BC_WIDTH_AND_DRAWER_'+width,false,e.message)}
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1360,height:900}});
 try{await page.goto(url,{waitUntil:'domcontentloaded'});const composer=page.locator('[data-test="composer"]');await composer.waitFor({state:'visible',timeout:10000});record('DEFAULT_CHAT_FIRST_BC',true)}catch(e){record('DEFAULT_CHAT_FIRST_BC',false,e.message)}
 try{const field=page.locator('.composer-box textarea').first();await field.fill('synthetic A draft only');const v=await field.inputValue();if(!v.includes('synthetic'))throw Error('composer not updated');record('COMPOSER_SYNTHETIC_DRAFT_ONLY',true)}catch(e){record('COMPOSER_SYNTHETIC_DRAFT_ONLY',false,e.message)}
 try{await page.locator('.global-private-entry').click();const all=await page.locator('body').innerText();if(!/Agno/i.test(all)||!/模拟|MOCK|离线/i.test(all))throw Error('private mock label missing');record('PRIVATE_AGNO_MOCK_LABELED',true)}catch(e){record('PRIVATE_AGNO_MOCK_LABELED',false,e.message)}
 await page.close();
} catch(e){record('BROWSER_STARTUP',false,e.message)}
finally{if(browser)await browser.close();proc.kill();fs.writeFileSync(path.join(root,'ci-artifacts','browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.fail)process.exitCode=1}
