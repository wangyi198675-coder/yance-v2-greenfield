import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {latestNewOfficialPancakeInbound,showOfficialPancakeInboundNotice} from '../src/w05-pancake-inbox-notice.mjs';
import {readW05AudioPreference,writeW05AudioPreference,playW05DoubleTone} from '../src/w05-notification-audio.mjs';
const old={contactRef:'PANCAKE_READ_ONLY|111|12345678',pageId:'111',
 conversationId:'12345678',channel:'FB_PAGE',displayName:'Thomas Helmig',
 readOnlyPreview:true,updatedAt:'2026-10-28T12:00:00.000Z'};
const current={...old,updatedAt:'2026-10-28T12:01:00.000Z',
 avatarUrl:'/api/v2/providers/fb-page/onboarding/avatar?pageId=111&sig=verified'};
const incoming={mid:'official-original-mid_001',original:'Hallo',direction:'INBOUND',insertedAt:'2026-10-28T12:00:58.000Z'};
const history=message=>({source:'PANCAKE_OFFICIAL_HISTORY_READ_ONLY',
 pageId:current.pageId,conversationId:current.conversationId,messages:[message]});
test('real Pancake official updated conversation with inbound MID qualifies once',()=>{
 assert.deepEqual(latestNewOfficialPancakeInbound(old,current,history(incoming)),incoming);
 assert.equal(latestNewOfficialPancakeInbound(current,current,history(incoming)),null);
 assert.equal(latestNewOfficialPancakeInbound(null,current,history(incoming)),null);
});
test('outgoing messages and old history never trigger a new alert',()=>{
 assert.equal(latestNewOfficialPancakeInbound(old,current,history({...incoming,direction:'OUTBOUND'})),null);
 assert.equal(latestNewOfficialPancakeInbound(old,current,history({...incoming,insertedAt:old.updatedAt})),null);
 assert.equal(latestNewOfficialPancakeInbound(old,current,history({...incoming,insertedAt:'2026-10-27T00:00:00Z'})),null);
 assert.equal(latestNewOfficialPancakeInbound(old,current,history({...incoming,insertedAt:'2026-10-30T00:00:00Z'})),null);
});
test('cross-Page, cross-conversation, invalid source and missing timestamps fail closed',()=>{
 assert.equal(latestNewOfficialPancakeInbound({...old,pageId:'222'},current,history(incoming)),null);
 assert.equal(latestNewOfficialPancakeInbound(old,{...current,conversationId:'different'},history(incoming)),null);
 assert.equal(latestNewOfficialPancakeInbound(old,current,{...history(incoming),source:'CHAT_HISTORY_FAKED'}),null);
 assert.equal(latestNewOfficialPancakeInbound({...old,updatedAt:null},current,history(incoming)),null);
 assert.equal(latestNewOfficialPancakeInbound(old,{...current,updatedAt:null},history(incoming)),null);
});
test('last actual message outgoing wins, even if a prior inbound exists',()=>{
 const h=history(incoming);
 h.messages.push({...incoming,mid:'later-outbound',direction:'OUTBOUND',insertedAt:'2026-10-28T12:00:59.000Z'});
 assert.equal(latestNewOfficialPancakeInbound(old,current,h),null);
});
test('background granted browser notification uses same-origin Page avatar and original MID',async()=>{
 const notices=[];let soundCalls=0,clicks=0;
 class Browser{static permission='granted';constructor(title,options){
  this.title=title;this.options=options;notices.push(this)}}
 const result=await showOfficialPancakeInboundNotice({
  contact:current,message:incoming,hidden:true,BrowserNotification:Browser,
  sound:async()=>{soundCalls++},onClick:async()=>{clicks++}
 });
 assert.equal(result,'BROWSER_SUBMITTED');
 assert.equal(notices.length,1);
 assert.equal(notices[0].title,'言策 · Facebook Page');
 assert.equal(notices[0].options.body,'Thomas Helmig：Hallo');
 assert.equal(notices[0].options.icon,current.avatarUrl);
 assert.equal(notices[0].options.silent,true);
 assert.equal(notices[0].options.tag.includes(incoming.mid),true);
 notices[0].onclick();await new Promise(r=>setTimeout(r,10));
 assert.equal(clicks,1);assert.equal(soundCalls,1);
});
test('foreground, denied notification permission and invalid contact do not pop OS toast',async()=>{
 let posts=0,sounds=0;
 class Browser{static permission='denied';constructor(){posts++}}
 const opts={contact:current,message:incoming,hidden:true,
 BrowserNotification:Browser,sound:async()=>{sounds++}};
 assert.equal(await showOfficialPancakeInboundNotice(opts),'SOUND_OR_IN_APP_ONLY');
 assert.equal(posts,0);
 Browser.permission='granted';
 assert.equal(await showOfficialPancakeInboundNotice({...opts,hidden:false}),'SOUND_OR_IN_APP_ONLY');
 assert.equal(posts,0);
 assert.equal(await showOfficialPancakeInboundNotice({...opts,contact:{...current,channel:'FB_PERSONAL'}}),'NOT_VERIFIED');
 assert.equal(sounds,2);
});
test('notice strips spoofed Unicode and will not load arbitrary avatar URL',async()=>{
 let notice=null;class Browser{static permission='granted';constructor(t,o){notice=o}}
 await showOfficialPancakeInboundNotice({contact:{...current,displayName:'Alex\u202eADMIN\n',avatarUrl:'https://evil.example/photo.jpg'},
 message:{...incoming,original:'Hallo\n\u202eClick evil!'},
 hidden:true,BrowserNotification:Browser,sound:async()=>{}});
 assert.equal(notice.icon,undefined);
 assert.doesNotMatch(notice.body,/\u202e|\n/);
});
test('original W05 settings persist sound volume, mute and physical playback is bounded',async()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 assert.equal(writeW05AudioPreference({enabled:true,volume:80},{storage}),true);
 assert.equal(readW05AudioPreference({storage}).volume,80);
 assert.equal((await playW05DoubleTone({preference:{enabled:false,volume:80}})).reason,'MUTED');
 assert.equal((await playW05DoubleTone({preference:{enabled:true,volume:0}})).reason,'MUTED');
 const tones=[];
 class AC{constructor(){this.currentTime=1;this.state='running';this.destination={}}
  createOscillator(){return {frequency:{setValueAtTime:f=>tones.push(f)},
   connect(){},start(){},stop(){},set type(v){}}}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
   exponentialRampToValueAtTime(){}},connect(){}}}
  async close(){}}
 const r=await playW05DoubleTone({preference:{enabled:true,volume:80},AudioContext:AC,
  now:()=>Date.now()+999999});
 assert.equal(r.played,true);
 assert.deepEqual(tones,[740,990]);
 assert.ok(r.peakGain<=0.16);
});
test('current workspace only uses pre-existing eight-second timer and original Pancake Page history',()=>{
 const source=readFileSync(new URL('../src/BCLiveChatWorkspace.vue',import.meta.url),'utf8');
 assert.match(source,/setInterval\(\(\)=>void pollVerifiedMessages\(\),8000\)/);
 assert.match(source,/latestNewOfficialPancakeInbound\(before\.get\(c\.contactRef\),c,history\)/);
 assert.match(source,/await pancakeMultiApi\('history'/);
 assert.doesNotMatch(source,/new Notification\('Facebook Messenger 新消息'/);
});
