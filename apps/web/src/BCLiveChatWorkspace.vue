<script setup>
import {ref,watch,computed,onMounted,onBeforeUnmount} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {ScrollArea} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/scroll-area';
import {Bubble,BubbleContent} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/bubble';
import {Message} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/message';
import BCNativeComposer from './BCNativeComposer.vue';
import {createTrustedTakeoverPort} from './native-takeover-port.mjs';
import {readLiveContacts,readLiveTimeline,explainNativeFailure} from './live-chat-source.mjs';
import {pancakeMultiApi} from './pancake-multi-browser.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null},mediaAuthorityPort:{type:Object,default:null}});
const emit=defineEmits(['navigate']);
const searchBox=ref(null),composerRef=ref(null);
const mobileChat=ref(false),plusOpen=ref(false),filterOpen=ref(false),pinnedExpanded=ref(true),unreadOnly=ref(false);
const unreadAuthoritative=computed(()=>contacts.value.some(c=>c.unreadAuthorized===true));
const api=computed(()=>props.fetchImpl||globalThis.fetch);
const state=ref('checking'),error=ref(''),contacts=ref([]),accounts=ref(0),chosen=ref(null);
const timeline=ref([]),timelineState=ref('none'),timelineError=ref('');
const messengerManual=ref({roomId:'',ready:false});
// A verified Pancake inbox contact may use the original Composer. The
// actual POST is authorized again by W55/Page/PSID + W24/W44/W25 before send;
// never confuse a UI hint with network-send authority.
const pageManualTarget=computed(()=>{
 const c=selected.value;
 return c?.readOnlyPreview===true&&
  /^[0-9]{1,40}$/.test(c.pageId||'')&&
  /^(?:[0-9]{1,40}|[A-Za-z0-9._:-]{8,160})$/.test(c.conversationId||'')?
  'PAGE|'+c.pageId+'|'+c.conversationId:'';
});
const manualPageSendPort=Object.freeze({
 async send(target,text,businessMessageId){
  const match=/^PAGE\|([0-9]{1,40})\|([a-zA-Z0-9._:-]{8,160})$/.exec(target);
  if(!match)throw Error('当前主页联系人未通过官方身份核验');
  const fetcher=api.value;
  const local=await fetcher('/api/v2/local-session/status',{credentials:'same-origin',cache:'no-store'});
  const session=await local.json();
  if(!local.ok||session.authorized!==true||typeof session.csrfToken!=='string')throw Error('当前本机会话不可用');
  const response=await fetcher('/api/v2/providers/fb-page/manual-send',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'content-type':'application/json','x-yance-csrf-token':session.csrfToken},
   body:JSON.stringify({pageId:match[1],conversationId:match[2],text,businessMessageId})
  });
  const reply=await response.json();
  if(!response.ok||reply.ok!==true){
   const code=typeof reply.detailCode==='string'?reply.detailCode:
    typeof reply.error==='string'?reply.error:'UNVERIFIED';
   const descriptions={
    PAGE_ACCOUNT_BINDING_PENDING:'Page 账号授权登记未完成',
    PAGE_ACCOUNT_BINDING_REVOKED:'Page 账号授权已撤销或版本已变化',
    PAGE_PEER_BINDING_PENDING:'当前联系人授权绑定未完成',
    PAGE_SEND_CONSENT_PENDING:'本次人工发送尚未获得有效授权',
    PAGE_HUMAN_TAKEOVER_PENDING:'当前联系人仍在托管接管状态',
    PAGE_CURRENT_W24_W44_DENIED:'当前联系人发送授权校验未通过',
    PAGE_PEER_OR_TOKEN_CHANGED:'Page 或收件人已变更，请刷新会话',
    PAGE_CREDENTIAL_REVOKED:'Page Token 已被撤销',
    CURRENT_PAGE_PEER_OR_W24_W44_SEND_NOT_READY:'Page 账号或联系人发送资格未就绪',
    INVALID_PAGE_CONVERSATION:'页面或会话参数无效',
    USER_CLICK_CSRF_REQUIRED:'当前本机会话已失效，请刷新',
    PANCAKE_PAGE_AUTH_REJECTED:'Pancake 拒绝当前 Page Token'
   };
   throw Error('发送未成功：'+(descriptions[code]||'官方授权或发送链路未通过')+
    '（'+code+'，HTTP '+response.status+'）。消息保留在草稿中。');
  }
  return reply;
 }
});
const manualMessengerSendPort=Object.freeze({
 async send(roomId,text,businessMessageId){
  const fetcher=api.value;
  const local=await fetcher('/api/v2/local-session/status',{
   credentials:'same-origin',cache:'no-store'});
  const identity=await local.json();
  if(!local.ok||identity.authorized!==true||
    !['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(identity.sessionKind)||
    typeof identity.csrfToken!=='string')throw Error('当前本机会话不可用');
  const response=await fetcher('/api/v2/providers/fb-personal/manual-send',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'content-type':'application/json','x-yance-csrf-token':identity.csrfToken},
   body:JSON.stringify({roomId,text,businessMessageId})
  });
  const data=await response.json();
  if(!response.ok||data.ok!==true)throw Error('Messenger 暂时未接受发送，请检查连接');
  return data;
 }
});
async function onManualMessengerSent(){
 const c=selected.value;if(c&&(c.roomId||c.readOnlyPreview))await chooseContact(c);
}
const incomingNotice=ref('');
let refreshTimer=null,pollBusy=false;
const search=ref(''),channel=ref('ALL'),account=ref('ALL');
const channelStatusMessage=ref('');
let channelStatusRevision=0;
let currentRevision=0,sourceRevision=0,mounted=true;
const selected=computed(()=>filtered.value.find(c=>c.contactRef===chosen.value?.contactRef)||null);
const channels=Object.freeze([
 {id:'ALL',label:'全部渠道'},
 {id:'FB_PERSONAL',label:'Facebook 个人'},
 {id:'FB_PAGE',label:'Facebook Page'},
 {id:'WHATSAPP_PERSONAL',label:'WhatsApp'},
 {id:'TELEGRAM_PERSONAL',label:'Telegram'}
]);
const filtered=computed(()=>{
 const q=search.value.trim().toLowerCase();
 return contacts.value.filter(c=>(!unreadOnly.value||(unreadAuthoritative.value&&c.unreadAuthorized===true&&c.unread>0))&&
  (channel.value==='ALL'||c.channel===channel.value)&&
  (account.value==='ALL'||c.accountRef===account.value)&&
  (!q||[c.displayName,c.accountRef,c.peerRef].some(s=>String(s).toLowerCase().includes(q))));
});
const accountIds=computed(()=>['ALL',...new Set(contacts.value.filter(c=>channel.value==='ALL'||c.channel===channel.value).map(c=>c.accountRef))]);
const filterActive=computed(()=>channel.value!=='ALL'||account.value!=='ALL'||search.value.trim()!=='');
const platformName=c=>channels.find(x=>x.id===c)?.label||c;
function reconcileFilter(){
 if(chosen.value&&!filtered.value.some(c=>c.contactRef===chosen.value.contactRef)){
  chosen.value=null;timeline.value=[];timelineState.value='none';timelineError.value='';mobileChat.value=false;
 }
}
async function readSelectedChannelStatus(){
 const selectedChannel=channel.value,revision=++channelStatusRevision;
 channelStatusMessage.value='';
 if(!['WHATSAPP_PERSONAL','TELEGRAM_PERSONAL'].includes(selectedChannel))return;
 channelStatusMessage.value=selectedChannel==='WHATSAPP_PERSONAL'?
  '正在核对 WhatsApp 连接状态…':'正在核对 Telegram 原生授权…';
 const endpoint=selectedChannel==='WHATSAPP_PERSONAL'?
  '/api/v2/providers/whatsapp-personal/native/status':
  '/api/v2/providers/telegram-personal/status';
 try{
  const response=await globalThis.fetch(endpoint,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
  const result=await response.json();
  if(!mounted||revision!==channelStatusRevision||channel.value!==selectedChannel)return;
  if(selectedChannel==='WHATSAPP_PERSONAL'){
   channelStatusMessage.value=response.ok&&result.source==='BAILEYS_NATIVE_SDK'&&result.connected===false?
    'WhatsApp 尚未连接，请在账号管理中由本人扫码授权。':
    response.ok&&result.source==='BAILEYS_NATIVE_SDK'&&result.connected===true?
    'WhatsApp 已连接，但尚未从可信联系人源读到会话。':
    'WhatsApp 联系状态未核实，请在账号管理检查。';
  }else{
   channelStatusMessage.value=response.status===401?
    'Telegram 当前未获得安装版会话授权，请在桌面版完成账号登录。':
    response.ok&&result.authorized===true?
    'Telegram 已授权，但尚未从可信联系人源读到会话。':
    'Telegram 连接状态尚未核实，请在账号管理检查。';
  }
 }catch{
  if(mounted&&revision===channelStatusRevision&&channel.value===selectedChannel)
   channelStatusMessage.value=selectedChannel==='WHATSAPP_PERSONAL'?
    'WhatsApp 连接状态暂时无法读取。':'Telegram 连接状态暂时无法读取。';
 }
}
function onChannelFilterChange(){
 if(account.value!=='ALL'&&!accountIds.value.includes(account.value))account.value='ALL';
 reconcileFilter();filterOpen.value=false;
}
function onAccountFilterChange(){reconcileFilter();filterOpen.value=false}
function clearContactFilter(){channel.value='ALL';account.value='ALL';filterOpen.value=false;reconcileFilter()}
watch(channel,()=>{void readSelectedChannelStatus()});
const pinned=computed(()=>filtered.value.filter(c=>c.pinnedAuthorized===true&&c.pinned===true));
const regular=computed(()=>filtered.value.filter(c=>c.pinnedAuthorized!==true||c.pinned!==true));
const availableUnread=computed(()=>unreadAuthoritative.value?
  contacts.value.filter(c=>c.unreadAuthorized===true&&c.unread>0).length:null);
function focusSearch(){mobileChat.value=false;searchBox.value?.focus()}
function onKeyDown(e){
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
  e.preventDefault();focusSearch();
 }
 if(e.key==='Escape'){plusOpen.value=false;filterOpen.value=false}
}
function navigate(section){plusOpen.value=false;filterOpen.value=false;emit('navigate',section)}
function backToContacts(){mobileChat.value=false}
function sourceQuote(m){
 if(!selected.value?.identityKey||!selected.value.identity||!m?.mid)return;
 composerRef.value?.sourceQuote({
   identityKey:selected.value.identityKey,mid:m.mid,original:m.original,zh:m.zh||''
 });
}
const canShowData=computed(()=>state.value==='ready'&&accounts.value>0);
async function readPancakeContacts(){
 const inventory=await pancakeMultiApi('pages',{fetchImpl:api.value});
 const pages=inventory.pages.filter(p=>p.tokenConfigured===true).slice(0,4);
 if(!pages.length)throw Error('PANCAKE_NO_CONFIGURED_PAGE');
 const rows=[];let verifiedPages=0;
 for(const page of pages){
  let inbox;
  try{inbox=await pancakeMultiApi('inbox',{fetchImpl:api.value,pageId:page.pageId})}
  catch{continue}
  if(inbox?.source!=='PANCAKE_OFFICIAL_INBOX_READ_ONLY'||
    inbox.pageId!==page.pageId||!Array.isArray(inbox.conversations))continue;
  verifiedPages++;
  for(const c of inbox.conversations){
   if(typeof c.conversationId!=='string'||!/^(?:[0-9]{1,40}|[A-Za-z0-9._:-]{8,160})$/.test(c.conversationId)||
      typeof c.displayName!=='string')continue;
   rows.push(Object.freeze({
    contactRef:'PANCAKE_READ_ONLY|'+page.pageId+'|'+c.conversationId,
    accountRef:page.name||page.pageId,channel:'FB_PAGE',peerRef:c.conversationId,
    displayName:c.displayName,lastMessage:c.snippet||'',pageId:page.pageId,
    avatarUrl:typeof c.avatarUrl==='string'&&c.avatarUrl.startsWith('/api/v2/providers/fb-page/onboarding/avatar?')?c.avatarUrl:null,
    conversationId:c.conversationId,readOnly:true,readOnlyPreview:true,
    identity:null,identityKey:null,canSend:false,unread:null
   }));
  }
 }
 if(!verifiedPages)throw Error('PANCAKE_INBOX_UPSTREAM_UNAVAILABLE');
 return {contacts:rows,connectedAccountCount:verifiedPages,trustedSession:true};
}
async function refresh(){
 const rev=++currentRevision;sourceRevision++;
 const selectedRef=chosen.value?.contactRef;
 state.value='checking';error.value=''; // Keep scroll, current draft, selection until verified new identity snapshot.
 try{
  let native=null,pancake=null,readError=null;
  try{native=await readLiveContacts({fetchImpl:api.value})}catch(e){readError=e}
  try{pancake=await readPancakeContacts()}catch(e){if(!native)readError=e}
  if(!native&&!pancake)throw readError||Error('NO_CURRENT_PROVIDER_SOURCE');
  const nativeContacts=native?.contacts||[];
  const other=pancake?.contacts||[];
  const existing=new Set(nativeContacts.map(c=>c.contactRef));
  const snap={contacts:[...nativeContacts,...other.filter(c=>!existing.has(c.contactRef))],
   connectedAccountCount:(native?.connectedAccountCount||0)+(pancake?.connectedAccountCount||0),
   trustedSession:native?.trustedSession===true||pancake?.trustedSession===true};
  if(!mounted||rev!==currentRevision)return;
  contacts.value=snap.contacts;
  accounts.value=snap.connectedAccountCount;
  chosen.value=selectedRef?snap.contacts.find(c=>c.contactRef===selectedRef)||null:null;
  if(!chosen.value){timeline.value=[];timelineState.value='none';mobileChat.value=false}
  state.value=snap.trustedSession?
   (snap.connectedAccountCount?'ready':'waiting-auth'):'waiting-session';
 }catch(e){
  if(!mounted||rev!==currentRevision)return;
  state.value=String(e?.message||e).includes('NATIVE_HTTP_401')?'waiting-session':'unavailable';error.value=explainNativeFailure(e);
  contacts.value=[];accounts.value=0;chosen.value=null;timeline.value=[];mobileChat.value=false;
 }
}
async function chooseContact(contact){
 if(state.value!=='ready'||!contacts.value.some(c=>c.contactRef===contact.contactRef))return;
 const ticket=++sourceRevision;
 chosen.value=contact;mobileChat.value=true;timeline.value=[];timelineState.value='checking';timelineError.value='';
 if(!contact.readOnly&&!contact.identityKey){timelineState.value='blocked';timelineError.value=explainNativeFailure('W24_FULL_K_NOT_SIGNED');return}
 try{
  const result=contact.readOnlyPreview?await pancakeMultiApi('history',{fetchImpl:api.value,pageId:contact.pageId,conversationId:contact.conversationId}):await readLiveTimeline({fetchImpl:api.value,contact});
  if(!mounted||ticket!==sourceRevision||chosen.value?.contactRef!==contact.contactRef)return;
  timeline.value=result.messages;timelineState.value='ready';
 }catch(e){
  if(!mounted||ticket!==sourceRevision)return;
  timelineState.value='blocked';timelineError.value=explainNativeFailure(e);
 }
}
const newestInbound=computed(()=>[...timeline.value].reverse().find(x=>x.direction==='INBOUND')||null);
// W47/W24 are the only Actors and authority. This client cannot grant itself
// takeover or W25 send privilege; current installed W47 denies before any POST.
const trustedTakeoverPort=createTrustedTakeoverPort({
 fetchImpl:(url,init)=>api.value(url,init)
});
const lastNativeMessage=computed(()=>{
 const s=selected.value,m=newestInbound.value;
 return s&&m&&m.identityKey===s.identityKey?{
  identityKey:s.identityKey,mid:m.mid,original:m.original,zh:m.zh,
  translationStatus:m.translationRunId?'SOURCE_UNREVIEWED':'PENDING',
  delivery:'NOT_REQUESTED',canSend:false,suggestions:[]
 }:null;
});
async function pollVerifiedMessages(){
 if(pollBusy||state.value!=='ready'||!contacts.value.some(c=>c.readOnly))return;
 pollBusy=true;
 try{
  const next=await readLiveContacts({fetchImpl:api.value});
  if(!mounted||!next.contacts.some(c=>c.readOnly))return;
  const old=new Map(contacts.value.map(c=>[c.contactRef,c.lastMessageTimestamp||0]));
  const updates=next.contacts.filter(c=>c.readOnly&&c.lastMessageTimestamp&&
    old.has(c.contactRef)&&c.lastMessageTimestamp>old.get(c.contactRef));
  if(updates.length){
   incomingNotice.value='Facebook Messenger 收到新消息';
   if(document.hidden&&globalThis.Notification?.permission==='granted')
    new Notification('Facebook Messenger 新消息',{body:'言策已同步新的入站消息'});
  }
  contacts.value=[...next.contacts,...contacts.value.filter(c=>c.readOnlyPreview)];
  if(chosen.value){
   const same=next.contacts.find(c=>c.contactRef===chosen.value.contactRef);
   if(same){chosen.value=same;
    if(updates.some(c=>c.contactRef===same.contactRef)){
     const latest=await readLiveTimeline({fetchImpl:api.value,contact:same});
     timeline.value=latest.messages;timelineState.value='ready';
    }
   }
  }
 }catch{/* Preserve current real timeline when a poll fails. */}
 finally{pollBusy=false}
}
onMounted(()=>{window.addEventListener('keydown',onKeyDown);void refresh();
 refreshTimer=setInterval(()=>void pollVerifiedMessages(),8000);
});
onBeforeUnmount(()=>{window.removeEventListener('keydown',onKeyDown);
 if(refreshTimer!==null)clearInterval(refreshTimer);
 mounted=false;currentRevision++;sourceRevision++;channelStatusRevision++;contacts.value=[];timeline.value=[]});
</script>
<template>
 <section class="bc-real-chat" :class="{'mobile-conversation':mobileChat}" data-test="w46-real-chat" aria-label="B＋C实际联系人与聊天工作台">
  <aside class="bc-real-list" data-test="w46-real-contacts" aria-label="Smart Inbox">
   <div class="bc-sidebar-tools">
    <div class="bc-tools-row" data-test="w46-inbox-toolbar-row-1">
     <div class="bc-inbox-heading"><strong>消息</strong><span v-if="availableUnread!==null&&availableUnread>0" class="bc-badge">{{availableUnread}}</span></div>
     <div class="bc-tools-actions">
      <button type="button" class="bc-round-action" data-test="w46-plus" aria-label="连接账号或创建会话" :aria-expanded="plusOpen" @click="plusOpen=!plusOpen;filterOpen=false">＋</button>
      <button type="button" class="bc-round-action" data-test="w46-filter" aria-label="按平台和账号筛选联系人" :aria-expanded="filterOpen" @click="filterOpen=!filterOpen;plusOpen=false">☷</button>
     </div>
    </div>
    <div class="bc-tools-row" data-test="w46-inbox-toolbar-row-2">
     <label class="bc-search-capsule"><span aria-hidden="true">⌕</span>
      <input ref="searchBox" v-model="search" type="search" data-test="w46-search" aria-label="搜索当前授权联系人" placeholder="搜索联系人、消息…" autocomplete="off"/>
      <kbd>Ctrl K</kbd>
     </label>
     <button v-if="unreadAuthoritative" type="button" class="bc-unread-toggle" data-test="w46-unread" :aria-pressed="unreadOnly"
      :disabled="!unreadAuthoritative" :title="unreadAuthoritative?'筛选权威未读会话':'未读状态尚未接入原生账号'" @click="unreadOnly=!unreadOnly">未读</button>
    </div>
   </div>
   <div v-if="plusOpen" class="bc-action-popover" data-test="w46-plus-menu">
    <button type="button" @click="navigate('ACCOUNTS')">连接社交账号</button>
    <!-- Chat creation remains controlled by each channel's existing account flow. -->
   </div>
   <div v-if="filterOpen" class="bc-action-popover" data-test="w46-filter-menu">
    <label>平台<select v-model="channel" aria-label="平台筛选" @change="onChannelFilterChange"><option v-for="ch in channels" :key="ch.id" :value="ch.id">{{ch.label}}</option></select></label>
    <label>账号<select v-model="account" aria-label="账号筛选" @change="onAccountFilterChange"><option v-for="id in accountIds" :key="id" :value="id">{{id==='ALL'?'全部已授权账号':id}}</option></select></label>

    <button type="button" @click="clearContactFilter">清除筛选</button>
   </div>
   <p v-if="incomingNotice" role="status" class="bc-inbox-state" data-test="w56-real-inbound-notice" @click="incomingNotice=''">{{incomingNotice}}</p>
   <p v-if="state==='ready'&&(channel!=='ALL'||account!=='ALL')" class="bc-filter-applied" data-test="w46-filter-applied" role="status"><span>{{platformName(channel)}}{{account==='ALL'?'':' · '+account}}：{{filtered.length}} / {{contacts.length}}</span><button type="button" @click="clearContactFilter">清除</button></p>
   <div class="bc-inbox-list-scroll" data-test="w46-contacts-scroll">
    <p v-if="state==='checking'&&!contacts.length" class="bc-inbox-state">正在读取本机联系人…</p>
    <div v-else-if="state!=='ready'" class="bc-inbox-state" data-test="w46-contact-waiting">
     <p>{{state==='unavailable'?'对话列表暂时无法加载':'暂无会话'}}</p>
     <button v-if="state==='unavailable'" type="button" @click="refresh">重试</button>
    </div>
    <template v-else>
     <template v-if="pinned.length">
      <button type="button" class="bc-group-title" :aria-expanded="pinnedExpanded" @click="pinnedExpanded=!pinnedExpanded">置顶 <span>{{pinnedExpanded?'⌄':'›'}}</span></button>
      <template v-if="pinnedExpanded">
       <button v-for="c in pinned" :key="c.contactRef" type="button" class="bc-real-contact" :class="{selected:chosen?.contactRef===c.contactRef}" :data-contact-ref="c.contactRef" @click="chooseContact(c)">
        <span class="bc-contact-avatar" aria-hidden="true"><img v-if="c.avatarUrl" :src="c.avatarUrl" loading="lazy" decoding="async" alt="" @error="e=>e.target.style.display='none'"/><span>{{c.displayName.slice(0,1)}}</span></span><span class="bc-contact-body"><strong>{{c.displayName}}</strong><small>{{c.lastMessage || '暂无消息'}}</small></span>
        <span class="bc-channel-mark" data-test="w46-contact-channel" :title="platformName(c.channel)">{{c.channel==='FB_PERSONAL'?'FB':c.channel==='FB_PAGE'?'Page':c.channel==='WHATSAPP_PERSONAL'?'WA':'TG'}}</span>
        <span v-if="c.unreadAuthorized===true&&c.unread>0" class="bc-badge">{{c.unread}}</span>
       </button>
      </template>
     </template>
     <button v-for="c in regular" :key="c.contactRef" type="button" class="bc-real-contact" :class="{selected:chosen?.contactRef===c.contactRef}" :data-contact-ref="c.contactRef" @click="chooseContact(c)">
      <span class="bc-contact-avatar" aria-hidden="true"><img v-if="c.avatarUrl" :src="c.avatarUrl" loading="lazy" decoding="async" alt="" @error="e=>e.target.style.display='none'"/><span>{{c.displayName.slice(0,1)}}</span></span><span class="bc-contact-body"><strong>{{c.displayName}}</strong><small>{{c.lastMessage || '暂无消息'}}</small></span>
      <span class="bc-channel-mark" data-test="w46-contact-channel" :title="platformName(c.channel)">{{c.channel==='FB_PERSONAL'?'FB':c.channel==='FB_PAGE'?'Page':c.channel==='WHATSAPP_PERSONAL'?'WA':'TG'}}</span>
        <span v-if="c.unreadAuthorized===true&&c.unread>0" class="bc-badge">{{c.unread}}</span>
     </button>
     <p v-if="!filtered.length" class="bc-inbox-state" data-test="w46-filter-empty">{{channelStatusMessage||'没有匹配的当前授权联系人'}}</p>
    </template>
   </div>
   <footer class="bc-inbox-footer"><span>{{state==='ready'?(filterActive?filtered.length+' / '+contacts.length+' 个联系人':contacts.length+' 个联系人'):state==='unavailable'?'连接异常':'尚无对话'}}</span>
    <button type="button" :disabled="state==='checking'" @click="refresh">刷新</button>
   </footer>
  </aside>
  <div class="bc-real-conversation" :class="{'is-empty-chat':!selected}" data-test="w46-live-timeline">
   <template v-if="selected">
    <header class="bc-chat-heading">
     <button type="button" class="bc-mobile-back" data-test="w46-mobile-back" @click="backToContacts">‹ 返回</button>
     <span class="bc-contact-avatar" aria-hidden="true"><img v-if="selected.avatarUrl" :src="selected.avatarUrl" decoding="async" alt="" @error="e=>e.target.style.display='none'"/><span>{{selected.displayName.slice(0,1)}}</span></span>
     <div class="bc-chat-title"><strong>{{selected.displayName}}</strong><small>{{selected.readOnlyPreview?(pageManualTarget?'Pancake Facebook Page · 可人工回复':'Pancake Facebook Page · 正在核验发送资格'):selected.readOnly?'Messenger':selected.channel==='FB_PERSONAL'?'Messenger':selected.channel==='FB_PAGE'?'Facebook Page':selected.channel==='WHATSAPP_PERSONAL'?'WhatsApp':selected.channel==='TELEGRAM_PERSONAL'?'Telegram':'聊天'}}</small></div>
     <button type="button" :disabled="timelineState==='checking'" aria-label="刷新消息" title="刷新消息" @click="chooseContact(selected)">⟳</button>
    </header>
    <p v-if="timelineState==='checking'" class="bc-inbox-state">正在加载消息…</p>
    <p v-if="timelineState==='blocked'" role="alert" data-test="w46-messages-error" class="bc-inbox-state">{{timelineError}}</p>
    <div class="bc-real-timeline" data-test="w46-message-scroll">
     <p v-if="timelineState==='ready'&&!timeline.length" class="bc-inbox-state">还没有消息</p>
     <div v-for="m in timeline" :key="m.mid" class="bc-real-message" :data-mid="m.mid">
      <Message :align="m.direction==='OUTBOUND'?'end':'start'">
       <Bubble :align="m.direction==='OUTBOUND'?'end':'start'" variant="default">
        <BubbleContent><div class="bc-message-text" :class="{'is-outgoing':m.direction==='OUTBOUND'}"><p>{{m.original}}</p><p v-if="m.zh" class="bc-translation">{{m.zh}}</p></div></BubbleContent>
       </Bubble>
      </Message>
      <div v-if="!selected?.readOnly&&selected?.identityKey" class="bc-message-meta">
       <button type="button" @click="sourceQuote(m)">引用</button>
      </div>
     </div>
    </div>
    <p v-if="selected.readOnly" class="bc-composer-hold" hidden>只读对话</p>
    <p v-else-if="!selected.identity||!selected.identityKey" class="bc-inbox-state bc-composer-hold">暂时无法发送消息</p>
   </template>
   <div v-else class="bc-real-no-contact" data-test="w46-empty-chat">
    <div aria-hidden="true" class="bc-empty-glow">✦</div>
    <h2>{{state==='ready'?'选择对话开始聊天':state==='unavailable'?'暂时无法加载聊天':'开始聊天'}}</h2>
    <p>{{state==='ready'?'从左侧选择联系人，继续聊天。':state==='unavailable'?'聊天服务暂时无法连接，请重试。':'连接你的聊天账号，联系人和消息会出现在这里。'}}</p>
    <button v-if="state!=='ready'" type="button" @click="state==='unavailable'?refresh():navigate('ACCOUNTS')">{{state==='unavailable'?'重新连接':'连接聊天账号'}}</button>
   </div>
   <!-- One always-mounted original CONTACT Composer. Null K must leave input
        and expert/media operations disabled, not create a second renderer. -->
   <BCNativeComposer ref="composerRef" :fetch-impl="fetchImpl" :media-authority-port="mediaAuthorityPort" :identity="selected?.identityKey&&selected?.identity?selected.identity:null"
    :native-message="lastNativeMessage" :source-mid="newestInbound?.mid||''" :takeover-port="trustedTakeoverPort"
    :native-messenger-room="selected?.contactRef?.startsWith('FB_ROOM|')?selected.contactRef.slice(8):pageManualTarget" :native-messenger-send-port="selected?.readOnlyPreview?manualPageSendPort:manualMessengerSendPort"
    @manual-sent="onManualMessengerSent" @navigate="navigate"/>
  </div>
 </section>
</template>
<style scoped>
.bc-real-chat{display:grid;grid-template-columns:304px minmax(0,1fr);flex:1 1 0;min-width:0;min-height:0;height:100%;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--bg2);color:var(--ink)}
.bc-real-list{position:relative;display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--bg2);border-right:1px solid var(--border)}
.bc-sidebar-tools{padding:10px 10px 9px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--border);min-height:100px;max-height:112px;flex-shrink:0;box-sizing:border-box}
.bc-tools-row{height:40px;display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.bc-inbox-heading{display:flex;align-items:center;gap:8px;padding-left:6px}.bc-inbox-heading strong{font-size:16px;letter-spacing:-.025em}.bc-tools-actions{display:flex;gap:5px}
.bc-round-action{height:36px;min-width:36px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--ink);cursor:pointer;font-size:17px}
.bc-round-action:hover,.bc-round-action[aria-expanded=true]{border-color:var(--accent);background:rgba(var(--accent-rgb),.12)}
.bc-search-capsule{height:40px;flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:0 10px;border-radius:999px;border:1px solid var(--border);background:linear-gradient(120deg,rgba(var(--accent-rgb),.055),transparent 54%),var(--surface);box-shadow:inset 0 1px 0 rgba(255,255,255,.075);transition:box-shadow .18s,border-color .18s}
.bc-search-capsule:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(var(--accent-rgb),.17),inset 0 1px 0 rgba(255,255,255,.08)}
.bc-search-capsule span{font-size:21px;color:var(--accent)}.bc-search-capsule input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:12px}.bc-search-capsule input::placeholder{color:var(--muted)}.bc-search-capsule kbd{white-space:nowrap;font-size:9px;color:var(--muted)}
.bc-unread-toggle{height:38px;min-width:47px;padding:0 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--ink);cursor:pointer}.bc-unread-toggle[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}.bc-unread-toggle:disabled{opacity:.65;cursor:not-allowed}
.bc-filter-applied{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 10px;margin:0;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);background:var(--surface-soft);min-width:0}.bc-filter-applied span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bc-filter-applied button{flex:none;border:0;background:transparent;color:var(--accent);font:inherit;cursor:pointer}.bc-channel-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;min-width:24px;padding:3px 5px;border:1px solid var(--border);border-radius:6px;background:var(--surface-soft);color:var(--muted)}
.bc-inbox-list-scroll{min-height:0;flex:1 1 auto;overflow:auto;scrollbar-width:thin;overscroll-behavior:contain}
.bc-real-contact{position:relative;min-height:68px;width:100%;display:flex;align-items:center;gap:10px;text-align:left;border:0;border-left:2px solid transparent;border-bottom:1px solid var(--border);background:transparent;color:var(--ink);padding:10px 11px;cursor:pointer;transition:background .14s,box-shadow .14s}
.bc-real-contact:hover{background:var(--surface-soft)}.bc-real-contact.selected{border-left-color:var(--accent);background:linear-gradient(96deg,rgba(var(--accent-rgb),.15),rgba(var(--accent-rgb),.025) 80%);box-shadow:inset 2px 0 0 rgba(var(--accent-rgb),.55)}
.bc-contact-avatar{width:40px;height:40px;flex-shrink:0;display:grid;place-items:center;border-radius:14px;background:var(--surface-raised);color:var(--accent);border:1px solid var(--border);font-weight:700;position:relative;overflow:hidden}.bc-contact-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit}.bc-contact-body{display:grid;gap:5px;min-width:0;flex:1}.bc-contact-body strong,.bc-contact-body small{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.bc-contact-body small{font-size:11px;color:var(--muted)}.bc-badge{padding:2px 6px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-size:10px;font-weight:700}
.bc-group-title{width:100%;padding:9px 13px;text-align:left;color:var(--muted);border:0;background:var(--surface-soft);cursor:pointer}.bc-group-title span{float:right}
.bc-action-popover{position:absolute;right:10px;top:54px;width:min(285px,calc(100% - 20px));z-index:30;display:grid;gap:9px;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--surface-raised);box-shadow:0 14px 40px #0006}
.bc-action-popover button,.bc-action-popover select{min-height:35px;text-align:left;background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:9px;padding:8px}
.bc-action-popover button:disabled{opacity:.58}.bc-action-popover label{display:grid;gap:5px}.bc-action-popover small{line-height:1.5;color:var(--muted)}
.bc-inbox-state{padding:14px;color:var(--muted);font-size:13px;line-height:1.6}.bc-inbox-state p{margin:0}.bc-inbox-state button,.bc-real-no-contact button{display:block;margin-top:10px;padding:9px 14px;border:1px solid var(--accent);border-radius:10px;background:rgba(var(--accent-rgb),.13);color:var(--ink);cursor:pointer}
.bc-inbox-footer{min-height:32px;display:flex;justify-content:space-between;align-items:center;padding:6px 12px;gap:6px;border-top:1px solid var(--border);font-size:10px;color:var(--muted)}.bc-inbox-footer button{border:0;background:transparent;color:var(--accent);cursor:pointer}
.bc-real-conversation{min-height:0;min-width:0;display:flex;flex-direction:column;background:var(--bg)}
.bc-chat-heading{display:flex;align-items:center;gap:11px;padding:10px 14px;min-height:57px;border-bottom:1px solid var(--border);background:var(--bg2)}.bc-chat-title{display:grid;gap:4px;min-width:0;flex:1}.bc-chat-title strong,.bc-chat-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bc-chat-title small{color:var(--muted);font-size:11px}.bc-chat-heading button{border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--ink);padding:8px;cursor:pointer}
.bc-real-timeline{min-height:0;flex:1 1 auto;display:flex;flex-direction:column;overflow-y:auto;padding:18px;overscroll-behavior:contain}.bc-real-timeline .bc-real-message:first-of-type{margin-top:0}.bc-real-message{max-width:100%;margin-bottom:14px}.bc-real-message p{white-space:pre-wrap;overflow-wrap:anywhere}.bc-message-text{display:inline-block;max-width:min(72ch,100%);padding:9px 13px;border-radius:14px 14px 14px 5px;background:var(--surface-raised,var(--surface));color:var(--ink);font-size:14px;line-height:1.55;box-shadow:0 1px 3px rgba(0,0,0,.07)}.bc-message-text.is-outgoing{border-radius:14px 14px 5px 14px;background:rgba(var(--accent-rgb),.15)}.bc-message-text p{margin:0}.bc-message-text .bc-translation{margin-top:5px;font-size:12px}.bc-translation{color:var(--accent)}.bc-message-meta{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:11px}.bc-message-meta button{padding:2px 7px;border:0;background:none;color:var(--accent);cursor:pointer}.bc-message-meta button:disabled{opacity:.45}
.bc-real-no-contact{flex:1;min-height:0;display:grid;align-content:center;justify-items:center;gap:12px;padding:20px;text-align:center}.bc-empty-glow{font-size:40px;color:var(--accent);text-shadow:0 0 30px rgba(var(--accent-rgb),.6)}.bc-real-no-contact h2{font-size:20px;margin:0}.bc-real-no-contact p{font-size:14px;line-height:1.65;color:var(--muted);max-width:390px;margin:0}
.bc-mobile-back{display:none}
:deep(.bc-native-composer){flex:0 0 auto}.bc-real-conversation.is-empty-chat :deep(.bc-native-composer){display:none}
@media(min-width:720px) and (max-width:1099px){.bc-real-chat{grid-template-columns:260px minmax(0,1fr)}.bc-search-capsule kbd{display:none}}
@media(max-width:719px){.bc-real-chat{display:block;position:relative}.bc-real-list,.bc-real-conversation{width:100%;height:100%}.bc-real-conversation{display:none}.bc-real-chat.mobile-conversation .bc-real-list{display:none}.bc-real-chat.mobile-conversation .bc-real-conversation{display:flex}.bc-mobile-back{display:block!important;min-height:44px}.bc-tools-row{height:43px}.bc-sidebar-tools{min-height:107px}.bc-round-action{height:44px;min-width:44px}.bc-unread-toggle{height:44px}.bc-search-capsule{height:42px}.bc-real-contact{min-height:70px}}
@media(prefers-reduced-motion:reduce){.bc-real-contact,.bc-search-capsule{transition:none!important}}
</style>
