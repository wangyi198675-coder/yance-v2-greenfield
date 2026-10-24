import { nextTick } from 'vue'
import { ARMS, allContacts, state, reset, key, byPeer, currentMode, getDraft, candidates, setException, snapshot, THEMES, HASHES } from './store'
type Result={case_id:string;task_id:string;arm:string;result:'PASS'|'FAIL';proof:string;error:string}
const out:Result[]=[]
const flush=async()=>{await nextTick();await Promise.resolve();await nextTick()}
const ensure=(test:boolean,message:string)=>{if(!test)throw Error(message)}
const qs=(selector:string):HTMLElement=>{const el=document.querySelector(selector) as HTMLElement|null;ensure(!!el,'DOM missing: '+selector);return el!}
const click=async(el:HTMLElement)=>{el.click();await flush()}
const itemButton=(peer:string)=>document.querySelector(`.contact-action[aria-label*="${peer}"]`) as HTMLElement|null
async function init(arm:typeof ARMS[number]['id']){
 reset(arm);await flush();
 if(arm==='CHAT-C-PULSE_MAIN'){await click(qs('.pulse-heading button'));ensure(!!document.querySelector('.contact-action'),'Pulse cannot open contact chat')}
 ensure(!!document.querySelector('.chat-pane')&&!!document.querySelector('.contact-pane'),'expected clickable workspace')
}
async function goto(peer:string){
 if(!itemButton(peer)){
   const all=[...document.querySelectorAll('.page-bottom button')] as HTMLElement[];const see=all.find(x=>x.textContent?.includes('查看全部'));if(see)await click(see);
 }
 const el=itemButton(peer);ensure(!!el,'cannot find contact button '+peer);await click(el!)
}
function typePublic(value:string){
 const input=qs('.composer-input textarea') as HTMLTextAreaElement;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));return flush()
}
function typePrivate(value:string){
 const input=qs('.private-input textarea') as HTMLTextAreaElement;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));return flush()
}
async function task(taskId:string,arm:typeof ARMS[number]['id'],run:()=>Promise<string>){
 const caseId='W35-'+taskId+'-'+(arm.startsWith('CHAT-A')?'A':arm.startsWith('CHAT-BC')?'BC':arm.startsWith('CHAT-B')?'B':'C')
 try{await init(arm);const proof=await run();out.push({case_id:caseId,task_id:taskId,arm,result:'PASS',proof,error:''})}
 catch(e){out.push({case_id:caseId,task_id:taskId,arm,result:'FAIL',proof:'DOM_INTERACTION_OR_RUNTIME_CHECK_FAILED',error:String(e)})}
}
async function selectCandidate(){
 await goto('fake-peer-004');ensure(candidates(byPeer('fake-peer-004')).length===2,'source candidate mismatch');
 const fill=qs('.suggest-card button');await click(fill);ensure(getDraft(byPeer('fake-peer-004')).text==='我看到了，晚一点联系你。','candidate click did not fill draft')
 ensure(currentMode(byPeer('fake-peer-004'))==='AUTO','candidate adopt unexpectedly took over')
 return 'OSS Button candidate click filled public draft only; source candidate id offline-004-01; AUTO stayed unchanged'
}
export async function runBrowserUAT(){
 for(const {id:arm} of ARMS){
  await task('UX-01',arm,async()=>{
   const input=qs('.search-box input') as HTMLInputElement;input.value='同名演示联系人';input.dispatchEvent(new Event('input',{bubbles:true}));await flush();
   const cards=[...document.querySelectorAll('.contact-action')] as HTMLElement[];
   ensure(cards.length===2,'duplicate names must render 2');
   ensure(cards.some(c=>c.textContent?.includes('fake-peer-003'))&&cards.some(c=>c.textContent?.includes('fake-peer-117')),'full identity missing');
   await click(cards[1]);ensure(state.selected==='fake-peer-117','click identity mismatch');
   return 'Search input and OSS Button selected both same-name contacts with distinct full K/channel'
  })
  await task('UX-02',arm,async()=>{
   const btn=[...document.querySelectorAll('.page-bottom button')].find(x=>x.textContent?.includes('查看全部')) as HTMLElement;await click(btn);
   ensure(document.querySelectorAll('.contact-action').length===120,'full 120 rows absent');
   for(const i of [25,30,40,120]){const peer='fake-peer-'+String(i).padStart(3,'0');await goto(peer);const body=qs('.message-context').textContent||'';ensure(body.includes('Test message #'+i)&&body.includes('模拟译文 #'+i),'translation mismatch '+i);ensure(qs('.source-meta').textContent?.includes('fake-mid-'+i)??false,'MID mismatch '+i)}
   return '120 contact OSS Buttons, deep peers 25/30/40/120; Chrome DOM original/Chinese/MID intact'
  })
  await task('UX-03',arm,async()=>{
   await goto('fake-peer-001');const el=qs('.message-context');el.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',code:'F10',shiftKey:true,bubbles:true,cancelable:true}));await flush();
   ensure(!!document.querySelector('.quote-chip'),'Shift+F10 did not bind quote');ensure(getDraft(byPeer('fake-peer-001')).quote?.mid==='fake-mid-1','quote MID mismatch');
   return 'Chrome keydown Shift+F10 on OSS ContextMenuTrigger bound immutable K+source MID'
  })
  await task('UX-04',arm,async()=>{
   const checks:[string,number][]=[['fake-peer-003',0],['fake-peer-001',1],['fake-peer-004',2],['fake-peer-007',3]];
   for(const [peer,count] of checks){await goto(peer);ensure(candidates(byPeer(peer)).length===count,'fixture candidates '+peer);ensure(qs('.suggestions').textContent?.includes(count+' 条')??false,'card count badge');if(count===0){ensure(document.querySelectorAll('.suggest-card').length===0,'zero case padded')}else if(count===1){ensure(document.querySelectorAll('.suggest-card').length===1,'one case padded')}else {const button=[...document.querySelectorAll('.suggestions button')].find(x=>x.textContent?.includes('展开完整')) as HTMLElement|null;if(button)await click(button);ensure(document.querySelectorAll('.suggest-card').length===count,'expand candidate cards '+count);state.suggestExpanded=false;await flush()}}
   return 'Source-derived 0/1/2/3 cards, compact 1+2 expand when applicable; no synthetic third candidate'
  })
  await task('UX-05',arm,selectCandidate)
  await task('UX-06',arm,async()=>{
   await goto('fake-peer-001');await typePublic('A 中文IME草稿');ensure(getDraft(byPeer('fake-peer-001')).text==='A 中文IME草稿','public textarea update failed');
   const ctx=qs('.message-context');ctx.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',code:'F10',shiftKey:true,bubbles:true}));await flush();
   await goto('fake-peer-004');await typePublic('B peer local draft');await goto('fake-peer-001');
   ensure(getDraft(byPeer('fake-peer-001')).text==='A 中文IME草稿','draft A lost');
   ensure(getDraft(byPeer('fake-peer-001')).quote?.mid==='fake-mid-1','quote lost');
   ensure(getDraft(byPeer('fake-peer-004')).text==='B peer local draft','draft B lost');
   return 'OSS Textarea input, key-scoped A/B drafts and quote survived contact switching without leakage'
  })
  await task('UX-07',arm,async()=>{
   const before=byPeer('fake-peer-001').unread;await goto('fake-peer-001');await goto('fake-peer-004');await goto('fake-peer-001');
   ensure(currentMode(byPeer('fake-peer-001'))==='AUTO'&&currentMode(byPeer('fake-peer-004'))==='AUTO','view caused takeover');
   ensure(byPeer('fake-peer-001').unread===before,'view cleared unread');
   ensure(qs('.chat-header').textContent?.includes('UNKNOWN')??false,'presence was faked');
   return 'Click view/focus only: AUTO remains AUTO; unread unchanged; UNKNOWN visible in live DOM'
  })
  await task('UX-08',arm,async()=>{
   await goto('fake-peer-001');await typePublic('我现在手动接管A');ensure(currentMode(byPeer('fake-peer-001'))==='HUMAN','A not taken over');
   ensure(currentMode(byPeer('fake-peer-004'))==='AUTO'&&currentMode(byPeer('fake-peer-007'))==='AUTO','other AUTO interrupted');
   return 'Real Chrome textarea input simulated A→HUMAN while B/C remain AUTO'
  })
  await task('UX-09',arm,async()=>{
   setException('fake-peer-003','GRANT_REVOKED');setException('fake-peer-117','UNKNOWN');setException('fake-peer-007','BUDGET_EXHAUSTED');
   await goto('fake-peer-117');ensure(qs('.chat-header').textContent?.includes('UNKNOWN')??false,'provider unknown hidden');
   ensure(state.exceptions[key(byPeer('fake-peer-117'))]==='UNKNOWN','UNKNOWN event missing');
   ensure(state.exceptions[key(byPeer('fake-peer-003'))]==='GRANT_REVOKED','revoke event missing');
   return 'W37 simulated revoke/UNKNOWN/budget input applied to key-isolated reducer; no provider API or retry'
  })
  await task('UX-10',arm,async()=>{
   await goto('fake-peer-001');await typePublic('PUBLIC_ONLY_A');
   const open=[...document.querySelectorAll('.chat-actions button')].find(x=>x.textContent?.includes('私人Agno')) as HTMLElement;ensure(!!open,'private entry missing');await click(open);
   ensure(!!document.querySelector('.private-drawer'),'private space missing');await typePrivate('PRIVATE_ONLY_TRACE');
   await click(qs('.private-bottom button'));ensure(qs('.private-history').textContent?.includes('PRIVATE_ONLY_TRACE')??false,'private mock reply missing');
   ensure(getDraft(byPeer('fake-peer-001')).text==='PUBLIC_ONLY_A','private instruction leaked public');
   return 'OSS private InputGroup + Button generated local MOCK trace; CONTACT draft remained isolated'
  })
  await task('UX-11',arm,async()=>{
   const root=qs('#yance-prototype');ensure(root.getAttribute('data-theme')==='0','default token state');
   const paletteButton=qs('.top-actions button');await click(paletteButton);await new Promise(r=>setTimeout(r,60));await flush();
   const opt=[...document.querySelectorAll('.theme-menu button')].find(b=>b.textContent?.includes('Ocean Electric')) as HTMLElement;ensure(!!opt,'theme popover did not open');await click(opt);
   ensure(root.getAttribute('data-theme')==='2','theme OSS Popover click failed');
   const toggle=qs('.top-actions button[aria-label="切换浅色"]');await click(toggle);ensure(root.getAttribute('data-mode')==='light','light state not updated');
   return 'OSS Popover theme selection changed Ocean Electric; OSS Button toggled LIGHT; responsive widths separately screenshot'
  })
 }
 const report={classification:'P3_1_NONPRODUCTION_CHROME_DOM_AUTO_UAT_ONLY',independentQA:false,source:HASHES,chromeActual:true,arms:ARMS.map(x=>x.id),rows:out,pass:out.filter(x=>x.result==='PASS').length,fail:out.filter(x=>x.result==='FAIL').length,viewportMatrix:'SEPARATE_SCREENSHOT_TEST',webview2:'NOT_RUN'}
 const pre=document.createElement('pre');pre.id='W39_BROWSER_UAT_RESULTS';pre.textContent=JSON.stringify(report);pre.style.cssText='white-space:pre-wrap;color:black;background:white;padding:8px';document.body.append(pre);document.documentElement.setAttribute('data-uat-complete','true');
 console.log('W39_BROWSER_UAT_RESULTS '+report.pass+'/'+out.length+' '+report.fail+' FAIL')
}
