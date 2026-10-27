<script setup>
import {ref,watch,computed,nextTick,onMounted} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCVisualAurora from './BCVisualAurora.vue';
import './BCVisualThemeSystem.css';
import BCBrandIcon from './BCBrandIcon.vue';
import BCPrivateBrainWorkspace from './BCPrivateBrainWorkspace.vue';
import BCLiveChatWorkspace from './BCLiveChatWorkspace.vue';
import BCChannelAccountSetup from './BCChannelAccountSetup.vue';
import BCNativeHostSession from './BCNativeHostSession.vue';
import BCMediaWorkspace from './BCMediaWorkspace.vue';
import BCSettingsWorkspace from './BCSettingsWorkspace.vue';
import {WORKSPACES,CHANNELS,R4_SETTINGS_CATEGORIES,R4_STOP_FAILURE_STATES,
 readWorkspaceSnapshot,explainCapability} from './product-workspace-contract.mjs';
const props=defineProps({
 activeWorkspace:{type:String,default:'CHAT'},
 enabled:{type:Boolean,default:false},
 fetchImpl:{type:Function,default:null},
 mediaAuthorityPort:{type:Object,default:null},
 appearance:{type:String,default:'dark'},
 theme:{type:String,default:'Obsidian Lime'}
});
const emit=defineEmits(['select','toggle-theme','cycle-theme']);
// Browser-native per-origin appearance preference; two safe strings, no secrets or identities.
const THEME_NAMES=Object.freeze(['Obsidian Lime','Cosmic Sunset','Ocean Electric','Amber Ember','Opal Prism']);
const UI_THEME_STORAGE_KEY='yance.ui.theme.appearance.v1';
function validThemePreference(v){
 return v&&typeof v==='object'&&Object.keys(v).length===2&&
  THEME_NAMES.includes(v.theme)&&(v.appearance==='dark'||v.appearance==='light');
}
async function rememberThemeAfterOriginalAppUpdate(){
 await nextTick();
 const value={theme:props.theme,appearance:props.appearance};
 if(!validThemePreference(value))return;
 try{window.localStorage.setItem(UI_THEME_STORAGE_KEY,JSON.stringify(value))}catch{
  // User may have disabled browser storage; do not claim durable save.
 }
}
function cycleOriginalTheme(){
 emit('cycle-theme');
 void rememberThemeAfterOriginalAppUpdate();
}
function toggleOriginalAppearance(){
 emit('toggle-theme');
 void rememberThemeAfterOriginalAppUpdate();
}
onMounted(()=>{
 let desired=null;
 try{
  const raw=window.localStorage.getItem(UI_THEME_STORAGE_KEY);
  if(raw&&raw.length<=160){
   const value=JSON.parse(raw);
   if(validThemePreference(value))desired=value;
  }
 }catch{
  // Unavailable storage must not block the chat UI.
 }
 if(!desired)return;
 const start=THEME_NAMES.indexOf(props.theme),target=THEME_NAMES.indexOf(desired.theme);
 if(start>=0&&target>=0){
  const steps=(target-start+THEME_NAMES.length)%THEME_NAMES.length;
  for(let i=0;i<steps;i++)emit('cycle-theme');
 }
 if(desired.appearance!==props.appearance)emit('toggle-theme');
});
const compactInfo=ref(false);
const snapshot=ref(null),error=ref('尚未连接真实运行环境'),loading=ref(false);
const menuOpen=ref(false);
const channelDetailsOpen=ref(false);
const addAccountOpen=ref(false);
const connectTrigger=ref({});
function connectAnother(channelId){
 if(!CHANNELS.some(item=>item.id===channelId))return;
 connectTrigger.value={...connectTrigger.value,[channelId]:(connectTrigger.value[channelId]||0)+1};
 addAccountOpen.value=false;
}


const contentScroller=ref(null);
const settingCategory=ref('general');
// Design tabs are navigation only until authoritative Persona/Expert APIs are signed.
const personaTab=ref('pending'),expertTab=ref('experts');
const personaModal=ref(null);
// Only the original native Persona owner can provide actual pending rules,
// active revisions, learning grants and rollback receipts.
function showPersonaDetail(kind){personaModal.value={kind}}
function closePersonaDetail(){personaModal.value=null}
const personaTabs=Object.freeze([{id:'pending',label:'待审规则'},{id:'current',label:'当前人格'},{id:'versions',label:'版本'}]);
const expertTabs=Object.freeze([{id:'experts',label:'专家'},{id:'tasks',label:'任务记录'},{id:'skills',label:'工具 / Skills'}]);
// Read ONLY the original W43 authenticated expert, tool and Run contracts.
// No new registry, no unverified expert execution or business side effect.
const expertPhase=ref('idle'),expertRows=ref([]),nativeRuns=ref([]),nativeTools=ref([]);
const expertShowCatalog=ref(false),expertSearch=ref('');
let expertReadEpoch=0;
const availableExperts=computed(()=>expertRows.value.filter(e=>e.installed&&e.registered));
const displayedExperts=computed(()=>{
 const source=expertShowCatalog.value?expertRows.value:availableExperts.value;
 const q=expertSearch.value.trim().toLowerCase();
 return source.filter(e=>!q||(e.label+' '+e.expertId).toLowerCase().includes(q));
});
async function refreshExpertWorkspace(){
 const id=++expertReadEpoch;
 expertPhase.value='loading';expertRows.value=[];nativeRuns.value=[];nativeTools.value=[];
 try{
  const read=async url=>{
   const response=await (props.fetchImpl||globalThis.fetch)(url,{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{accept:'application/json'}});
   if(!response.ok)throw Error('NATIVE_READ_UNAVAILABLE');
   return response.json();
  };
  let dto;
  if(expertTab.value==='experts'){
   dto=await read('/api/v2/private-brain/experts');
   if(dto?.authoritative!==true||dto.source!=='W43_NATIVE_AGNO_EXPERT'||
     dto.status!=='NATIVE_EXPERT_DIRECTORY_READ'||dto.canSend!==false||
     !Array.isArray(dto.experts)||dto.experts.length>30||
     !dto.experts.every(e=>typeof e.expertId==='string'&&/^[a-z0-9-]{3,64}$/.test(e.expertId)&&
      typeof e.label==='string'&&typeof e.installed==='boolean'&&
      typeof e.registered==='boolean'&&typeof e.enabled==='boolean'&&
      typeof e.canInvoke==='boolean')||
     dto.experts.filter(e=>e.installed&&e.registered).length!==dto.registeredCount)
     throw Error('EXPERT_AUTHORITY_INVALID');
   if(id!==expertReadEpoch)return;
   expertRows.value=dto.experts.map(e=>({
    expertId:e.expertId,label:e.label.slice(0,100),installed:e.installed,
    registered:e.registered,enabled:e.enabled,canInvoke:e.canInvoke
   }));
  }else if(expertTab.value==='tasks'){
   dto=await read('/api/v2/private-brain/runs?threadId=personal&limit=10');
   if(dto?.authoritative!==true||dto.source!=='W43_NATIVE_AGNO_SDK'||
      dto.status!=='NATIVE_RUNS_READ'||dto.canSend!==false||
      !Array.isArray(dto.runs)||dto.runs.length>10)throw Error('RUN_AUTHORITY_INVALID');
   if(id!==expertReadEpoch)return;
   nativeRuns.value=dto.runs.map(r=>({
    id:String(r.runId||r.id||'').slice(0,100),
    status:String(r.status||'未知状态').slice(0,50)
   }));
  }else{
   dto=await read('/api/v2/private-brain/tools');
   if(dto?.authoritative!==true||dto.source!=='W43_NATIVE_AGNO_SDK'||
      dto.canSend!==false||!Array.isArray(dto.registeredTools)||
      dto.registeredTools.length>50)throw Error('TOOL_AUTHORITY_INVALID');
   if(id!==expertReadEpoch)return;
   nativeTools.value=dto.registeredTools.map(t=>({
    name:String(t.name||t.toolName||t.id||'已注册工具').slice(0,90),
    businessExecutable:t.businessExecutable===true
   }));
  }
  expertPhase.value='ready';
 }catch{
  if(id===expertReadEpoch)expertPhase.value='unavailable';
 }
}
watch([()=>props.activeWorkspace,expertTab],([workspace])=>{
 expertReadEpoch++;
 if(workspace==='TASKS')void refreshExpertWorkspace();
 else{expertPhase.value='idle';expertRows.value=[];nativeRuns.value=[];nativeTools.value=[]}
},{immediate:true});
const category=computed(()=>R4_SETTINGS_CATEGORIES.find(c=>c.id===settingCategory.value)||R4_SETTINGS_CATEGORIES[0]);
let epoch=0;
const selected=computed(()=>WORKSPACES.find(x=>x.id===props.activeWorkspace)||WORKSPACES[0]);
async function refresh(){
 const rev=++epoch;
 if(!props.enabled){snapshot.value=null;error.value='仅非生产候选界面';return}
 loading.value=true;error.value='';
 try{
  const fetched=await readWorkspaceSnapshot({fetchImpl:props.fetchImpl||globalThis.fetch});
  if(rev!==epoch)return;
  snapshot.value=fetched;
 }catch(e){
  if(rev!==epoch)return;
  snapshot.value=null;error.value='无法读取真实服务端：'+String(e.message||e);
 }finally{if(rev===epoch)loading.value=false}
}
watch(()=>props.enabled,refresh,{immediate:true});
watch(()=>props.activeWorkspace,async()=>{
 menuOpen.value=false;
 addAccountOpen.value=false;
 closePersonaDetail();
 await nextTick();
 if(contentScroller.value)contentScroller.value.scrollTop=0;
});
function choose(k){if(!WORKSPACES.some(x=>x.id===k))return;emit('select',k);menuOpen.value=false}
async function openCommand(){choose('CHAT');await nextTick();document.querySelector('[data-test="w46-search"]')?.focus()}
const status=computed(()=>{
 if(loading.value)return '连接检查中';
 if(error.value)return props.activeWorkspace==='BRAIN'?
  '私人 AI · 选择模型来源':'本机服务尚未连接 · 真人发送禁用';
 if(!snapshot.value?.trustedSession)return props.activeWorkspace==='BRAIN'?
  '私人 AI · 请选择已配置的模型来源':'社交账号未连接 · 真人发送禁用';
 return '已取得服务会话，仍需权限范围验证';
});
const readonlyAccount=computed(()=>snapshot.value?.connectedAccountCount||0);
// Reuse the exact W47 snapshot already read for this workspace. Never show a
// fabricated zero-contact authority when the native endpoint denies access.
const peopleQuery=ref(''),peopleChannel=ref('ALL'),peopleAccount=ref('ALL');
const peopleVerified=computed(()=>snapshot.value?.trustedSession===true&&
 snapshot.value?.contactsAccess==='SIGNED_NATIVE_READ');
const peopleContacts=computed(()=>peopleVerified.value&&Array.isArray(snapshot.value?.contacts)?
 snapshot.value.contacts:[]);
const peopleAccountOptions=computed(()=>['ALL',...new Set(peopleContacts.value
 .map(c=>String(c.accountRef||'')).filter(Boolean))]);
const peopleFiltered=computed(()=>{
 const q=peopleQuery.value.trim().toLowerCase();
 return peopleContacts.value.filter(c=>
  (peopleChannel.value==='ALL'||c.channel===peopleChannel.value)&&
  (peopleAccount.value==='ALL'||c.accountRef===peopleAccount.value)&&
  (!q||[c.displayName,c.peerRef,c.accountRef].some(v=>String(v||'').toLowerCase().includes(q))));
});
const peopleLabel=c=>String(c?.displayName||c?.peerRef||'联系人').slice(0,100);
const channelLabel=id=>CHANNELS.find(c=>c.id===id)?.label||String(id||'其他平台');
defineExpose({refresh});
</script>
<template>
 <div v-if="enabled" class="w46-product-candidate" :data-mode="appearance" :data-active-workspace="activeWorkspace" data-test="w46-product-candidate">
  <BCVisualAurora/>
  <header class="w46-compact-global" data-test="w46-compact-nav">
   <div class="w46-compact-brand"><span class="w46-brand-glyph">言</span><strong>言策</strong></div>
   <nav class="w46-main-links" aria-label="R4紧凑主导航">
    <Button size="sm" :variant="activeWorkspace==='CHAT'?'secondary':'ghost'" data-test="workspace-CHAT" @click="choose('CHAT')">聊天</Button>
    <Button size="sm" :variant="activeWorkspace==='BRAIN'?'secondary':'ghost'" data-test="workspace-BRAIN" @click="choose('BRAIN')">闺蜜大脑</Button>
    <Button size="sm" :variant="activeWorkspace==='AUTOPILOT'?'secondary':'ghost'" data-test="workspace-AUTOPILOT" @click="choose('AUTOPILOT')">托管</Button>
    <Button size="sm" variant="ghost" data-test="workspace-all" :aria-expanded="menuOpen" @click="menuOpen=!menuOpen">全部⌄</Button>
   </nav>
   <div class="w46-global-tools">
    <Button size="sm" variant="ghost" data-test="w46-command" aria-label="搜索联系人 Ctrl+K" @click="openCommand">⌕</Button>
    <Button size="sm" variant="ghost" data-test="w46-theme" :title="'主题：'+theme" @click="cycleOriginalTheme">◐</Button>
    <Button size="sm" variant="ghost" data-test="w46-appearance" :title="appearance==='dark'?'切换浅色':'切换深色'" @click="toggleOriginalAppearance">{{appearance==='dark'?'☀':'☾'}}</Button>
    <Button size="sm" variant="ghost" data-test="w46-info" aria-label="查看服务状态" @click="compactInfo=!compactInfo">ⓘ</Button>
   </div>
   <div v-if="menuOpen" class="w46-workspace-menu" data-test="workspace-mobile-list">
    <Button v-for="item in WORKSPACES.filter(i=>!['CHAT','BRAIN','AUTOPILOT'].includes(i.id))" :key="item.id" size="sm" variant="ghost" :data-test="'workspace-'+item.id" @click="choose(item.id)">{{item.label}}</Button>
   </div>
  </header>
  <div v-if="compactInfo||(error&&!['CHAT','AUTOPILOT','PEOPLE'].includes(activeWorkspace))" class="w46-compact-status" data-test="w46-trusted-status" role="status">
   <span>{{status}}</span><Button size="xs" variant="outline" data-test="w46-refresh" :disabled="loading" @click="refresh">刷新状态</Button>
  </div>
  <div ref="contentScroller" tabindex="0" role="region"
   :aria-label="selected.label+'工作区内容（可滚动）'" class="w46-candidate-content" data-test="w46-workspace-content">
   <div class="w46-workspace-intro">
    <div><p class="w46-caption">{{selected.section}} · 原生能力权限待签署</p><h2>{{selected.label}}</h2>
      <p>{{selected.hint}}</p></div>
    <span class="w46-inactive" data-test="w46-capability-status">
     {{explainCapability(snapshot,activeWorkspace)}}</span>
   </div>
   <BCLiveChatWorkspace v-show="activeWorkspace==='CHAT'" :fetch-impl="fetchImpl" :media-authority-port="mediaAuthorityPort" @navigate="choose"/>
   <section v-if="activeWorkspace==='ACCOUNTS'" class="w46-r4-channel-workspace" data-test="w46-channel-workspace" aria-label="连接社交账号">
    <header class="w46-r4-channel-toolbar">
     <div class="w46-r4-channel-title"><strong>我的聊天账号</strong><small>连接多个账号，所有消息仍在「聊天」中查看</small></div>
     <div class="w46-r4-channel-actions">
      <span v-if="snapshot?.trustedSession" class="w46-r4-channel-count" data-test="w46-authoritative-account-count">已验证 {{readonlyAccount}} 个</span>
      <button type="button" class="w46-add-account-global" data-test="w46-add-account-global" :aria-expanded="addAccountOpen"
       @click="addAccountOpen=!addAccountOpen">＋ 添加账号</button>
      <button type="button" class="w46-r4-channel-details-toggle" data-test="w46-channel-details-toggle"
       :aria-expanded="channelDetailsOpen" aria-controls="w46-channel-details"
       @click="channelDetailsOpen=!channelDetailsOpen">{{channelDetailsOpen?'收起详情':'帮助'}}</button>
     </div>
    </header>
    <div class="w46-r4-channel-grid" data-test="w46-channel-grid" aria-label="四平台原生连接入口">
     <BCChannelAccountSetup v-for="channel in CHANNELS" :key="channel.id"
      :channel="channel" :fetch-impl="fetchImpl" :connect-trigger="connectTrigger[channel.id]||0"/>
    </div>
    <div v-if="addAccountOpen" class="w46-add-account-backdrop" data-test="w46-account-add-dialog" @click.self="addAccountOpen=false">
     <section class="w46-add-account-panel" role="dialog" aria-modal="true" aria-label="添加聊天账号">
      <header><div><strong>添加聊天账号</strong><p>选择平台，在言策中连接你自己的账号</p></div>
       <button type="button" aria-label="关闭添加账号" @click="addAccountOpen=false">✕</button>
      </header>
      <button v-for="channel in CHANNELS" :key="channel.id" type="button" class="w46-add-platform"
       :data-test="'w46-add-platform-'+channel.id" @click="connectAnother(channel.id)">
       <span class="w46-add-platform-icon"><BCBrandIcon :name="channel.id" :size="30"/></span>
       <span class="w46-add-platform-label"><strong>{{channel.id==='FB_PERSONAL'?'Facebook Messenger':channel.id==='FB_PAGE'?'Facebook Page':channel.id==='WHATSAPP_PERSONAL'?'WhatsApp':'Telegram'}}</strong>
        <small>{{channel.id==='FB_PAGE'?'添加你管理的公共主页':'添加你的个人账号'}}</small></span>
       <span aria-hidden="true">›</span>
      </button>
     </section>
    </div>
    <section v-if="channelDetailsOpen" id="w46-channel-details" class="w46-r4-channel-details"
     data-test="w46-multi-account" role="region" aria-label="账号连接详情">
     <strong>账号连接状态</strong>
     <p>{{snapshot?.trustedSession?'已建立本机会话，连接账号仍以每个平台原生状态回读为准。':'尚未建立可验证的本机会话。请在对应平台通过本人官方流程完成授权。'}}</p>
     <p>多个账号及授权范围需由原生服务提供真实记录；尚无权威账号列表时不展示示例账号。</p>
    </section>
   </section>
   <section v-else-if="activeWorkspace==='PEOPLE'" class="w46-people" data-test="w46-people-workspace" aria-label="联系人管理">
    <header class="w46-people-toolbar">
     <div class="w46-people-heading"><h2>联系人</h2>
      <span v-if="peopleVerified" data-test="w46-people-count">{{peopleContacts.length}} 位联系人</span>
     </div>
     <div class="w46-people-actions">
      <button type="button" data-test="w46-people-refresh" :disabled="loading" @click="refresh">{{loading?'正在刷新':'刷新'}}</button>
      <button type="button" data-test="w46-people-accounts" class="w46-people-connect" @click="choose('ACCOUNTS')">连接账号</button>
     </div>
    </header>
    <div class="w46-people-body">
     <section class="w46-people-search-panel" aria-label="联系人筛选">
      <label class="w46-people-search"><span aria-hidden="true">⌕</span>
       <input v-model="peopleQuery" type="search" data-test="w46-people-search" placeholder="搜索联系人、账号…" aria-label="搜索联系人" autocomplete="off"/>
      </label>
      <label class="w46-people-select">平台
       <select v-model="peopleChannel" data-test="w46-people-channel" aria-label="选择联系人平台">
        <option value="ALL">全部平台</option>
        <option v-for="c in CHANNELS" :key="c.id" :value="c.id">{{c.label}}</option>
       </select>
      </label>
      <label v-if="peopleAccountOptions.length>1" class="w46-people-select">账号
       <select v-model="peopleAccount" data-test="w46-people-account" aria-label="选择已授权账号">
        <option v-for="id in peopleAccountOptions" :key="id" :value="id">{{id==='ALL'?'全部账号':id}}</option>
       </select>
      </label>
     </section>
     <section v-if="loading&&!snapshot" class="w46-people-empty" role="status">
      <span class="w46-people-symbol" aria-hidden="true">◎</span><h3>正在加载联系人</h3>
      <p>正在读取已连接账号中的联系人。</p>
     </section>
     <section v-else-if="error" class="w46-people-empty" data-test="w46-people-error" role="status">
      <span class="w46-people-symbol" aria-hidden="true">◎</span><h3>暂时无法加载联系人</h3>
      <p>请检查本机服务连接，然后重试。不会显示未经验证的联系人。</p>
      <button type="button" @click="refresh">重试</button>
     </section>
     <section v-else-if="!peopleVerified||peopleContacts.length===0" class="w46-people-empty" data-test="w46-people-empty" role="status">
      <span class="w46-people-symbol" aria-hidden="true">◎</span>
      <h3>{{peopleVerified?'还没有联系人':'把聊天账号连接到言策'}}</h3>
      <p>{{peopleVerified?'当前账号还没有可显示的联系人。连接更多账号后，这里会自动显示真实联系人。':'连接 Facebook、WhatsApp 或 Telegram 后，就可以在这里查看并搜索已授权的联系人。'}}</p>
      <button type="button" data-test="w46-people-empty-connect" @click="choose('ACCOUNTS')">连接聊天账号</button>
      <div class="w46-people-platforms" aria-label="支持的平台">
       <span v-for="c in CHANNELS" :key="c.id">{{c.label}}</span>
      </div>
     </section>
     <section v-else class="w46-people-results" data-test="w46-people-results" aria-label="已授权联系人">
      <div class="w46-people-result-head"><strong>联系人列表</strong>
       <span>{{peopleFiltered.length}} 位匹配</span></div>
      <div v-if="!peopleFiltered.length" class="w46-people-no-match">没有找到匹配的联系人。可以更换关键词或平台筛选。</div>
      <div v-for="(contact,index) in peopleFiltered" :key="contact.contactRef||index" class="w46-people-row" data-test="w46-people-row">
       <span class="w46-people-avatar" aria-hidden="true">{{peopleLabel(contact).slice(0,1)}}</span>
       <div class="w46-people-row-copy"><strong>{{peopleLabel(contact)}}</strong>
        <small>{{channelLabel(contact.channel)}} · {{contact.accountRef||'当前账号'}}</small></div>
       <span class="w46-people-source">已连接</span>
      </div>
     </section>
     <div v-if="peopleContacts.length" class="w46-people-bottom"><span>联系人仅来自当前已授权的账号。</span>
      <button type="button" @click="choose('CHAT')">前往聊天</button></div>
    </div>
   </section>
   <section v-else-if="activeWorkspace==='AUTOPILOT'" class="w46-autopilot" data-test="w46-autopilot-workspace" aria-label="自动托管中心">
    <header class="w46-autopilot-toolbar">
     <div><h2>自动托管</h2><p>让闺蜜大脑按照你的授权，协助管理真实聊天。</p></div>
     <button type="button" data-test="w46-autopilot-refresh" :disabled="loading" @click="refresh">{{loading?'正在刷新':'刷新状态'}}</button>
    </header>
    <div class="w46-autopilot-body">
     <section class="w46-autopilot-overview" data-test="w46-autopilot-real-status" role="status">
      <span class="w46-autopilot-emblem" aria-hidden="true">✦</span>
      <div class="w46-autopilot-overview-copy">
       <strong>{{loading?'正在读取状态':error?'暂时无法读取托管状态':readonlyAccount===0?'尚未连接聊天账号':'托管状态尚待确认'}}</strong>
       <p>{{error?'本机服务暂时没有返回完整状态。你可以重试，原有授权和聊天数据不会因此更改。':readonlyAccount===0?'连接你自己的社交账号后，才能查看可管理的联系人与托管授权。':'已检测到聊天账号，但尚未获取当前托管授权与开关的权威结果。'}}</p>
      </div>
      <button v-if="!error&&readonlyAccount===0" type="button" data-test="w46-autopilot-connect" @click="choose('ACCOUNTS')">连接聊天账号</button>
      <button v-else-if="error" type="button" data-test="w46-autopilot-retry" @click="refresh">重新连接</button>
     </section>
     <div class="w46-autopilot-modes">
      <article class="w46-autopilot-mode" data-test="w46-global-custody">
       <div class="w46-autopilot-mode-heading"><span class="w46-autopilot-mode-icon" aria-hidden="true">◎</span><strong>全局托管</strong></div>
       <p>统一管理你明确授权的聊天账号与联系人。</p>
       <span class="w46-autopilot-readonly">尚未取得全局托管授权状态</span>
      </article>
      <article class="w46-autopilot-mode" data-test="w46-contact-custody">
       <div class="w46-autopilot-mode-heading"><span class="w46-autopilot-mode-icon" aria-hidden="true">◉</span><strong>指定联系人</strong></div>
       <p>仅托管你选择的联系人，其他聊天不受影响。</p>
       <span class="w46-autopilot-readonly">尚未取得联系人托管授权状态</span>
       <button v-if="readonlyAccount>0" type="button" data-test="w46-autopilot-open-chats" @click="choose('CHAT')">查看联系人</button>
      </article>
     </div>
     <p class="w46-autopilot-help">你主动接管某位联系人的聊天时，其他已经授权托管的联系人不应被打断。所有自动发送仍由原有授权机制控制。</p>
    </div>
   </section>
   <section v-else-if="activeWorkspace==='PERSONA'" class="w46-r4-feature w46-r4-persona" data-test="w46-persona-studio">
    <header class="w46-r4-feature-toolbar" data-test="w46-persona-toolbar">
     <div class="w46-r4-feature-title"><strong>人格与学习</strong><small>让闺蜜大脑更懂你的表达习惯</small></div>
     <nav class="w46-r4-feature-tabs" aria-label="人格与学习">
      <button v-for="tab in personaTabs" :key="tab.id" type="button" :class="{active:personaTab===tab.id}" :aria-pressed="personaTab===tab.id" :data-test="'w46-persona-tab-'+tab.id" @click="personaTab=tab.id">{{tab.label}}</button>
      <button type="button" class="w46-persona-learning-status" data-test="w46-persona-learning-status" @click="showPersonaDetail('learning')">学习说明 <span aria-hidden="true">ⓘ</span></button>
     </nav>
    </header>
    <div class="w46-r4-feature-body w46-r4-persona-layout">
     <section class="w46-r4-feature-card w46-persona-main-card" data-test="w46-persona-main-card">
      <div class="w46-r4-card-head">
       <strong>{{personaTab==='pending'?'待审核的学习建议':personaTab==='current'?'当前人格':'版本历史'}}</strong>
       <span class="w46-persona-approval-status">等待同步</span>
      </div>
      <div class="w46-persona-verified-empty" role="status" data-test="w46-persona-source-hold">
       <span class="w46-persona-empty-icon" aria-hidden="true">{{personaTab==='pending'?'✦':personaTab==='current'?'◈':'↺'}}</span>
       <h3>{{personaTab==='pending'?'尚未获取学习建议':personaTab==='current'?'暂时无法查看当前人格':'暂时无法查看版本记录'}}</h3>
       <p>{{personaTab==='pending'?'待审核规则必须来自真实的学习记录。在数据接通之前，不会把示例当成待审核建议。':personaTab==='current'?'已生效的表达规则和个人记忆，需要从现有服务读取后才能显示。':'只有取得真实版本记录，才能查看差异、撤回或回滚。'}}</p>
       <button type="button" data-test="w46-persona-open-brain" @click="choose('BRAIN')">前往闺蜜大脑</button>
      </div>
     </section>
     <aside class="w46-r4-feature-card w46-r4-details w46-persona-guide" data-test="w46-persona-details-card">
      <div class="w46-r4-card-head">
       <strong>学习与人格管理</strong>
       <button type="button" class="w46-persona-details-link" data-test="w46-persona-details-open" @click="showPersonaDetail('version')">了解更多</button>
      </div>
      <div class="w46-persona-guide-list">
       <div><span aria-hidden="true">01</span><section><strong>学习建议</strong><p>先查看建议，再决定是否采用。</p></section></div>
       <div><span aria-hidden="true">02</span><section><strong>个性化表达</strong><p>保留你的沟通偏好，不混淆联系人信息。</p></section></div>
       <div><span aria-hidden="true">03</span><section><strong>版本控制</strong><p>已确认的改动才会进入版本记录。</p></section></div>
      </div>
      <p class="w46-persona-guide-note">目前尚未接通可核验的人格数据，这里不会显示演示规则或虚假的学习进度。</p>
     </aside>
    </div>
    <div v-if="personaModal" class="w46-persona-modal-mask" data-test="w46-persona-example-details" @click.self="closePersonaDetail">
     <section class="w46-persona-modal" role="dialog" aria-modal="true" aria-labelledby="w46-persona-modal-title">
      <header><strong id="w46-persona-modal-title">{{personaModal.kind==='learning'?'学习说明':'人格版本与控制'}}</strong>
       <button type="button" data-test="w46-persona-detail-close" aria-label="关闭详情" @click="closePersonaDetail">关闭</button>
      </header>
      <div class="w46-persona-modal-body">
       <p v-if="personaModal.kind==='learning'">人格学习用于整理表达偏好和规则建议，正式采用前应由你审核。当前页面未取得服务端学习状态，不能确认学习是否已开启。</p>
       <p v-else>规则版本、撤回和回滚需要真实的版本记录及当前授权。服务端尚未返回这些记录时，不提供假版本和无效操作。</p>
       <p class="w46-persona-modal-caution">本页只展示可说明的功能范围，不代表学习、规则审批或版本变更已执行。</p>
      </div>
     </section>
    </div>
   </section>
   <section v-else-if="activeWorkspace==='TASKS'" class="w46-r4-feature w46-real-tools" data-test="w46-tools-experts">
    <header class="w46-r4-feature-toolbar">
     <div class="w46-r4-feature-title"><strong>工具与任务</strong><small>查看已连接的专家与实际任务</small></div>
     <nav class="w46-r4-feature-tabs" aria-label="工具与任务">
      <button v-for="tab in expertTabs" :key="tab.id" type="button" :class="{active:expertTab===tab.id}" :aria-pressed="expertTab===tab.id" :data-test="'w46-expert-tab-'+tab.id" @click="expertTab=tab.id">{{tab.label}}</button>
     </nav>
    </header>
    <div class="w46-r4-feature-body w46-r4-expert-layout">
     <section class="w46-r4-feature-card w46-tools-main" data-test="w46-tools-main">
      <div class="w46-r4-card-head">
       <strong>{{expertTab==='experts'?'可用专家':expertTab==='tasks'?'任务记录':'工具与 Skills'}}</strong>
       <button type="button" class="w46-tools-refresh" :disabled="expertPhase==='loading'" data-test="w46-tools-refresh" @click="refreshExpertWorkspace">{{expertPhase==='loading'?'正在读取':'刷新'}}</button>
      </div>
      <div v-if="expertPhase==='loading'" class="w46-tools-empty" role="status" data-test="w46-tools-loading">
       <span class="w46-tools-empty-symbol" aria-hidden="true">✧</span><h3>正在载入{{expertTab==='experts'?'专家':expertTab==='tasks'?'任务':'工具'}}</h3>
       <p>仅从你当前的私人会话读取数据。</p>
      </div>
      <div v-else-if="expertPhase==='unavailable'||expertPhase==='idle'" class="w46-tools-empty" data-test="w46-tools-unavailable" role="status">
       <span class="w46-tools-empty-symbol" aria-hidden="true">✧</span>
       <h3>暂时无法查看{{expertTab==='experts'?'专家':expertTab==='tasks'?'任务记录':'工具列表'}}</h3>
       <p>打开闺蜜大脑建立私人会话后，再回来查看已连接的能力与记录。</p>
       <button type="button" data-test="w46-tools-open-brain" @click="choose('BRAIN')">前往闺蜜大脑</button>
      </div>
      <template v-else-if="expertTab==='experts'">
       <div class="w46-tools-filters" data-test="w46-tools-expert-filters">
        <label class="w46-tools-search"><span aria-hidden="true">⌕</span>
         <input v-model="expertSearch" type="search" placeholder="搜索专家…" aria-label="搜索已读取的专家" autocomplete="off"/>
        </label>
        <button type="button" data-test="w46-tools-expert-browse" :aria-pressed="expertShowCatalog" @click="expertShowCatalog=!expertShowCatalog">{{expertShowCatalog?'仅看已接入':'浏览全部目录'}}</button>
       </div>
       <div v-if="!displayedExperts.length" class="w46-tools-empty" data-test="w46-tools-empty" role="status">
        <span class="w46-tools-empty-symbol" aria-hidden="true">✧</span>
        <h3>{{expertSearch?'没有匹配的专家':'暂时没有已接入的专家'}}</h3>
        <p>当前只展示原生服务已确认的安装状态。</p>
       </div>
       <div v-else class="w46-tools-list" data-test="w46-tools-expert-list">
        <article v-for="e in displayedExperts" :key="e.expertId" class="w46-tools-row" data-test="w46-tools-expert-row">
         <span class="w46-tools-glyph" aria-hidden="true">✦</span>
         <div class="w46-tools-row-copy"><strong>{{e.label}}</strong><small>{{e.installed&&e.registered?(e.enabled?'已接入':'已安装 · 当前停用'):'尚未接入'}}</small></div>
         <button v-if="e.installed&&e.registered&&e.enabled" type="button" data-test="w46-tools-use-expert" @click="choose('BRAIN')">去使用</button>
        </article>
       </div>
      </template>
      <template v-else-if="expertTab==='tasks'">
       <div v-if="!nativeRuns.length" class="w46-tools-empty" data-test="w46-tools-empty" role="status">
        <span class="w46-tools-empty-symbol" aria-hidden="true">◷</span><h3>还没有任务记录</h3>
        <p>闺蜜大脑执行的任务会在服务端产生记录后显示在这里。</p>
        <button type="button" @click="choose('BRAIN')">打开闺蜜大脑</button>
       </div>
       <div v-else class="w46-tools-list" data-test="w46-tools-run-list">
        <article v-for="run in nativeRuns" :key="run.id" class="w46-tools-row">
         <span class="w46-tools-glyph" aria-hidden="true">◷</span>
         <div class="w46-tools-row-copy"><strong>任务 {{run.id}}</strong><small>{{run.status}}</small></div>
        </article>
       </div>
      </template>
      <template v-else>
       <div v-if="!nativeTools.length" class="w46-tools-empty" data-test="w46-tools-empty" role="status">
        <span class="w46-tools-empty-symbol" aria-hidden="true">⌘</span><h3>暂无已确认的工具</h3>
        <p>原生工具注册成功后会在这里显示，不会把设计候选当成已安装。</p>
       </div>
       <div v-else class="w46-tools-list" data-test="w46-tools-native-list">
        <article v-for="tool in nativeTools" :key="tool.name" class="w46-tools-row">
         <span class="w46-tools-glyph" aria-hidden="true">⌘</span>
         <div class="w46-tools-row-copy"><strong>{{tool.name}}</strong><small>{{tool.businessExecutable?'执行权限须另行确认':'只读或未开放执行'}}</small></div>
        </article>
       </div>
      </template>
     </section>
     <aside class="w46-r4-feature-card w46-r4-details w46-tools-aside" data-test="w46-tools-details">
      <div class="w46-r4-card-head"><strong>能力概览</strong></div>
      <div class="w46-tools-summary">
       <span>专家</span><strong>{{expertPhase==='ready'&&expertTab==='experts'?availableExperts.length+' 位已接入':'等待读取'}}</strong>
       <span>任务记录</span><strong>{{expertPhase==='ready'&&expertTab==='tasks'?nativeRuns.length+' 条':'按需查看'}}</strong>
       <span>工具</span><strong>{{expertPhase==='ready'&&expertTab==='skills'?nativeTools.length+' 项':'按需查看'}}</strong>
      </div>
      <p>专家与工具由闺蜜大脑统一调用，不需要另外创建一个助手。</p>
      <button type="button" class="w46-tools-aside-brain" data-test="w46-tools-aside-open-brain" @click="choose('BRAIN')">进入闺蜜大脑</button>
     </aside>
    </div>
   </section>
   <BCSettingsWorkspace v-else-if="activeWorkspace==='SETTINGS'" :fetch-impl="fetchImpl"
    :active="activeWorkspace==='SETTINGS'" :theme="theme" :appearance="appearance"
    @navigate="choose" @cycle-theme="cycleOriginalTheme" @toggle-theme="toggleOriginalAppearance"/>
   <BCMediaWorkspace v-else-if="activeWorkspace==='MEDIA'" :fetch-impl="fetchImpl"
    :active="activeWorkspace==='MEDIA'" :media-authority-port="mediaAuthorityPort"/>
   <div v-else-if="activeWorkspace==='BRAIN'" class="w46-brain-one" data-test="w46-brain-one">
    <BCPrivateBrainWorkspace :fetch-impl="fetchImpl"/>
   </div>
   <div v-else-if="activeWorkspace!=='CHAT'" class="w46-blank">
    <strong>{{selected.label}}尚未授权</strong>
    <p>已保留单一 Agno／现有 W25 契约，不会为界面另建 Agent 或消息发送链。</p>
    <p v-if="activeWorkspace==='BRAIN'">唯一闺蜜大脑仍使用原产品右栏/工作区，未获可信 Run 前不产生模型回复。</p>
    <p v-if="activeWorkspace==='PERSONA'">审批 PENDING、撤权、过期都需原生服务回读；无接口时不能显示为启用。</p>
    <p v-if="activeWorkspace==='MEDIA'">图片、视频和语音缺少已授权 Provider；没有生成或发送操作。</p>
    <p v-if="activeWorkspace==='TASKS'">Tool、Trace 和历史需原生 Agno Run 资格；不会模拟成功回执。</p>
   </div>
   <div class="w46-workspace-auth">
    <div v-if="activeWorkspace==='ACCOUNTS'" class="w46-auth-summary" data-test="w46-chatgpt-auth-unavailable">
     <strong>ChatGPT 官方身份授权</strong><span>未授权 · 套餐资格未核验 · 费用权限未核验</span>
     <Button disabled data-test="chatgpt-auth-unavailable" variant="outline">连接 ChatGPT · 官方授权暂不可用</Button>
    </div>
    <small>真实状态来自 W47 API。R4 的导航措辞、九分类及 252 Stable ID 对位需原件签认。</small>
   </div>
  </div>
 </div>
</template>
<style>
/* Draft-only overlay: never expose the frozen W37 120 synthetic contacts as live data. */
#yance-prototype:has(> .w46-product-candidate:not([data-active-workspace='CHAT'])) main.workspace{display:none!important}
#yance-prototype:has(> .w46-product-candidate) .lab-strip{display:none!important}
#yance-prototype:has(> .w46-product-candidate) .arm-switch,
#yance-prototype:has(> .w46-product-candidate) .arm-menu,
#yance-prototype:has(> .w46-product-candidate) .global-private-entry,
#yance-prototype:has(> .w46-product-candidate) .statusbar{display:none!important}
#yance-prototype:has(> .w46-product-candidate) .brand small,
#yance-prototype:has(> .w46-product-candidate) .brand span{display:none!important}
.w46-product-candidate{--w46-panel:#f7f9fc;--w46-text:#172232;--w46-edge:#ced7e4;--w46-accent:#225073;background:var(--w46-panel);color:var(--w46-text);border-bottom:1px solid var(--w46-edge);font-size:13px}
.w46-product-candidate[data-mode=dark]{--w46-panel:#182a39;--w46-text:#eff5fc;--w46-edge:#355064;--w46-accent:#c1ef59}
.w46-product-candidate:not([data-active-workspace='CHAT']){
 flex:1 1 0;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden
}
.w46-product-candidate:not([data-active-workspace='CHAT']) .w46-product-top,
.w46-product-candidate:not([data-active-workspace='CHAT']) .w46-workspace-tabs,
.w46-product-candidate:not([data-active-workspace='CHAT']) .w46-small-workspaces{flex:0 0 auto}
.w46-product-top{display:flex;align-items:center;gap:13px;min-height:42px;padding:7px 14px;flex-wrap:wrap}
.w46-product-heading{display:flex;align-items:center;gap:8px}.w46-product-marker{font-size:10px;opacity:.7}
.w46-product-state{flex:1;min-width:120px;text-align:right;color:var(--w46-accent);font-size:12px}
.w46-workspace-tabs{display:flex;gap:3px;align-items:center;overflow:auto;padding:3px 13px 7px;scrollbar-width:thin}
.w46-workspace-tabs button{white-space:nowrap;flex-shrink:0}
.w46-small-workspaces{display:none;position:relative}
.w46-workspace-menu{position:absolute;top:100%;left:9px;z-index:80;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;background:var(--w46-panel);color:var(--w46-text);border:1px solid var(--w46-edge);border-radius:12px;padding:10px;width:min(340px,calc(100vw - 18px));box-shadow:0 16px 44px #0005}
.w46-candidate-content{
 flex:1 1 0;min-height:0;min-width:0;
 overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;
 scroll-behavior:auto;touch-action:pan-y;
 padding:clamp(14px,3vw,32px);padding-bottom:max(28px,env(safe-area-inset-bottom,0px));
 display:grid;gap:20px;align-content:start
}
.w46-candidate-content:focus-visible{outline:2px solid var(--w46-accent);outline-offset:-3px}
.w46-workspace-intro{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.w46-workspace-intro h2{font-size:22px;font-weight:700}.w46-workspace-intro p{opacity:.8}
.w46-caption{letter-spacing:.06em;text-transform:uppercase;font-size:10px}
.w46-inactive{border:1px solid var(--w46-edge);border-radius:20px;padding:6px 10px;font-size:11px}
.w46-channel-grid,.w46-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
.w46-channel,.w46-status-grid>div,.w46-blank{padding:16px;border:1px solid var(--w46-edge);border-radius:12px;display:grid;gap:9px;background:transparent}
.w46-channel-mark{width:27px;height:27px;border-radius:8px;display:grid;place-items:center;border:1px solid currentColor;font-weight:700}
.w46-channel small,.w46-status-grid span,.w46-workspace-auth small,.w46-note{font-size:11px;opacity:.77}
.w46-note{grid-column:1/-1}.w46-workspace-auth{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.w46-account-summary{grid-column:1/-1;border:1px solid var(--w46-edge);padding:14px;border-radius:12px;display:grid;gap:8px}
.w46-account-summary p{font-size:12px;opacity:.8}.w46-account-summary button{justify-self:start}
.w46-auth-summary{border:1px solid var(--w46-edge);padding:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;border-radius:10px}
.w46-auth-summary span,.w46-auth-summary p{font-size:12px;opacity:.84}
.w46-operator-grid{display:grid;gap:12px}
.w46-brain-one{min-width:0;width:100%}
.w46-product-candidate[data-active-workspace='CHAT']{flex:1 1 0;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.w46-product-candidate[data-active-workspace='CHAT'] .w46-candidate-content{grid-template-rows:auto minmax(300px,1fr) auto;overflow-y:auto;gap:8px;padding:10px}
.w46-product-candidate[data-active-workspace='CHAT'] .w46-workspace-auth{display:none}
.w46-danger-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.w46-danger{border:1px solid var(--w46-edge);border-radius:12px;padding:14px;display:grid;gap:8px}
.w46-danger strong{font-family:ui-monospace,monospace;overflow-wrap:anywhere;color:var(--w46-accent)}
.w46-danger p,.w46-danger span,.w46-danger small{opacity:.8;font-size:12px}
.w46-settings{display:grid;grid-template-columns:180px minmax(0,1fr);gap:18px;align-items:start}
.w46-settings-nav{display:grid;gap:5px;border:1px solid var(--w46-edge);padding:8px;border-radius:12px}
.w46-settings-nav button{text-align:left;justify-content:flex-start}
.w46-settings-main{min-height:280px;border:1px solid var(--w46-edge);border-radius:12px;padding:20px;display:grid;align-content:start;gap:16px}
.w46-settings-main h3{font-size:18px;font-weight:700}
.w46-settings-mobile{display:none}
@media(max-width:950px){.w46-settings{grid-template-columns:150px minmax(0,1fr)}
 .w46-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.w46-settings{display:block}.w46-settings-nav{display:none}
 .w46-settings-mobile{display:grid;gap:6px;margin-bottom:12px;font-weight:600}
 .w46-settings-mobile select{width:100%;min-height:44px;background:var(--w46-panel);color:var(--w46-text);border:1px solid var(--w46-edge);border-radius:9px;padding:8px}
 .w46-danger-grid{grid-template-columns:1fr}}
@media(max-width:430px){.w46-account-summary{padding:11px}.w46-settings-main{padding:14px}
 .w46-status-grid{grid-template-columns:1fr}}

@media(max-width:720px){.w46-workspace-tabs{display:none}.w46-small-workspaces{display:block;padding:3px 9px 9px}.w46-product-state{text-align:left;order:2;width:100%}.w46-channel-grid,.w46-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:430px){.w46-channel-grid,.w46-status-grid{grid-template-columns:1fr 1fr}.w46-product-top{gap:5px;padding:7px 9px}.w46-product-marker{max-width:180px}}

#yance-prototype:has(> .w46-product-candidate)>.topbar{display:none!important}
#yance-prototype:has(> .w46-product-candidate) .lab-strip{display:none!important}
.w46-product-candidate{--w46-panel:var(--bg2);--w46-text:var(--ink);--w46-edge:var(--border);--w46-accent:var(--accent);background:var(--bg);color:var(--ink);height:100%;min-height:0;display:flex;flex-direction:column;flex:1 1 0;border:0}
.w46-product-candidate[data-mode=dark]{--w46-panel:var(--bg2);--w46-text:var(--ink);--w46-edge:var(--border);--w46-accent:var(--accent)}
.w46-compact-global{position:relative;display:grid;grid-template-columns:minmax(130px,1fr) auto minmax(150px,1fr);flex:0 0 48px;align-items:center;gap:10px;padding:0 13px;min-height:48px;max-height:48px;z-index:45;background:linear-gradient(115deg,rgba(var(--accent-rgb),.095),transparent 52%),var(--bg2);border-bottom:1px solid var(--border)}
.w46-compact-brand{display:flex;align-items:center;gap:7px;white-space:nowrap;margin-right:4px}.w46-brand-glyph{display:grid;place-items:center;width:29px;height:29px;border-radius:10px;font-size:16px;font-weight:800;color:var(--accent-ink);background:var(--accent);box-shadow:0 0 18px rgba(var(--accent-rgb),.22)}.w46-compact-brand strong{font-size:15px;letter-spacing:-.04em}
.w46-main-links{display:flex;min-width:0;align-items:center;justify-content:center;gap:3px;flex:0 0 auto;justify-self:center}.w46-main-links button{flex-shrink:0;border-radius:9px}.w46-global-tools{display:flex;align-items:center;justify-self:end;gap:2px;flex:0 0 auto}.w46-global-tools button{min-width:29px;padding:6px!important}
.w46-compact-global .w46-workspace-menu{position:absolute;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;top:calc(100% - 1px);left:50%;transform:translateX(-50%);z-index:100;width:min(360px,calc(100vw - 22px));padding:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface-raised);box-shadow:0 18px 42px #0008}
.w46-compact-status{display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);flex-shrink:0}.w46-compact-status span{flex:1}
.w46-candidate-content{padding:0!important;gap:0!important;display:flex!important;flex-direction:column!important;flex:1 1 0;min-height:0!important;overflow:hidden!important}
.w46-workspace-intro{display:none!important}
.w46-candidate-content>.bc-real-chat,.w46-candidate-content>.w46-brain-one{min-height:0;flex:1 1 0}
.w46-brain-one{display:flex;min-height:0;padding:0}
.w46-workspace-auth{display:none!important}
.w46-native-catalog{display:grid;align-content:start;gap:12px;flex:1;overflow:auto;padding:16px clamp(12px,3vw,28px)}
.w46-native-catalog header{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}.w46-native-catalog h2{font-size:18px;margin:0}.w46-native-catalog small{color:var(--muted)}
.w46-persona-panel,.w46-native-panel{display:grid;gap:12px;max-width:1100px;border:1px solid var(--border);border-radius:15px;padding:16px;background:var(--bg2)}
.w46-native-actions{display:flex;flex-wrap:wrap;gap:8px}.w46-native-actions button:disabled{opacity:.42;filter:grayscale(.5);cursor:not-allowed}
.w46-experts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:8px}.w46-expert-item{display:grid;gap:5px;border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--surface)}
.w46-native-panel summary{cursor:pointer}.w46-native-catalog p{font-size:12px;color:var(--muted);margin:0}
/* Approved R4 Expert and Persona structure: visible list first; no fabricated
   installed expert, persona rule, run or grant. 43px contextual toolbar. */
.w46-r4-feature{display:flex;min-height:0;min-width:0;flex:1;flex-direction:column;background:var(--bg)}
.w46-r4-feature-toolbar{box-sizing:border-box;display:flex;flex:0 0 43px;min-height:43px;align-items:center;justify-content:space-between;padding:0 17px;gap:10px;border-bottom:1px solid var(--border);background:var(--bg2)}
.w46-r4-feature-title{display:flex;gap:9px;align-items:center;white-space:nowrap}
.w46-r4-feature-title strong{font-size:15px}.w46-r4-feature-title small{font-size:11px;color:var(--muted)}
.w46-r4-feature-tabs{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none}
.w46-r4-feature-tabs button{flex-shrink:0;padding:6px 9px;border:0;border-radius:8px;color:var(--muted);background:transparent;cursor:pointer;font-size:11px}
.w46-r4-feature-tabs button.active{background:rgba(var(--accent-rgb),.13);color:var(--accent)}
.w46-r4-feature-tabs button:focus-visible{outline:2px solid var(--accent)}
.w46-r4-feature-body{box-sizing:border-box;display:grid;flex:1;min-height:0;min-width:0;gap:12px;padding:13px 15px;overflow:auto;align-content:start}
.w46-r4-expert-layout{grid-template-columns:minmax(0,1fr) 315px}
.w46-r4-persona-layout{grid-template-columns:minmax(0,1fr) 290px}
.w46-r4-feature-card{min-width:0;border:1px solid var(--border);background:var(--bg2);border-radius:12px;overflow:hidden;align-self:start}
.w46-r4-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px;border-bottom:1px solid var(--border)}
.w46-r4-card-head strong{font-size:13px}.w46-r4-card-head small{color:var(--muted);font-size:10px}
.w46-r4-expert-list{padding:3px 13px}
.w46-r4-expert-row{display:flex;align-items:center;gap:11px;min-height:59px;padding:10px 2px;border-bottom:1px solid var(--border)}
.w46-r4-expert-row:last-child{border:0}
.w46-r4-expert-glyph{display:grid;place-items:center;flex:0 0 35px;width:35px;height:35px;border-radius:10px;color:var(--accent);background:var(--surface-soft);border:1px solid var(--border)}
.w46-r4-expert-row>div{min-width:0;display:grid;gap:4px;flex:1}
.w46-r4-expert-row strong{font-size:12px}.w46-r4-expert-row small{font-size:10px;color:var(--muted);line-height:1.5}
.w46-r4-expert-row button:disabled{opacity:.56;cursor:not-allowed}
.w46-r4-details{padding:0 0 13px}.w46-r4-details>p,.w46-r4-details>.w46-r4-feature-empty,.w46-r4-details>.w46-native-actions{margin:12px 13px}
.w46-r4-details p{font-size:12px;line-height:1.7;color:var(--muted)}
.w46-r4-feature-empty{padding:20px 14px;color:var(--muted);font-size:12px;line-height:1.65}
.w46-r4-feature-empty strong{display:block;color:var(--ink);font-size:13px}.w46-r4-feature-empty p{margin-top:8px}
/* Persona visual examples are hard-coded DESIGN samples, not approved server
   records. Original Agno/Persona and revision writes remain unavailable. */
.w46-r4-persona{position:relative}
.w46-r4-persona .w46-r4-persona-layout{align-content:stretch;grid-template-rows:minmax(0,1fr)}
.w46-r4-persona-layout>.w46-r4-feature-card{align-self:stretch}
.w46-r4-persona .w46-r4-card-head{min-height:43px;box-sizing:border-box}
.w46-persona-learning-status{border:1px solid var(--border)!important;background:var(--surface-soft)!important}
.w46-persona-approval-status{font-size:10px;padding:5px 8px;border-radius:7px;background:var(--surface-soft);color:var(--muted);white-space:nowrap}
.w46-persona-design-list{padding:0 13px}
.w46-persona-design-row{display:flex;align-items:center;gap:11px;min-height:60px;border-bottom:1px solid var(--border);padding:8px 0}
.w46-persona-design-row:last-of-type{border-bottom:0}
.w46-persona-example-icon{flex:0 0 35px;width:35px;height:35px;display:grid;place-items:center;background:var(--surface-soft);border:1px solid var(--border);border-radius:10px;color:var(--accent)}
.w46-persona-example-copy{display:grid;gap:5px;min-width:0;flex:1}
.w46-persona-example-copy strong{font-size:12px;font-weight:650;color:var(--ink)}
.w46-persona-example-copy small{font-size:10px;color:var(--muted);line-height:1.45}
.w46-persona-small-action,.w46-persona-details-button{background:var(--surface-soft);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer}
.w46-persona-small-action:hover,.w46-persona-details-button:hover{border-color:var(--accent)}
.w46-persona-design-note{font-size:11px;color:var(--muted);line-height:1.7;margin:20px 0 12px}
.w46-persona-details-link{font-size:10px;background:var(--surface-soft);border:1px solid var(--border);border-radius:7px;color:var(--muted);padding:5px 8px;cursor:pointer}
.w46-persona-details-button{margin:0 13px 13px}
.w46-persona-modal-mask{position:absolute;inset:43px 0 0;z-index:55;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.52)}
.w46-persona-modal{width:min(450px,100%);max-height:min(480px,85vh);overflow:auto;background:var(--surface-raised);border:1px solid var(--border);border-radius:14px;box-shadow:0 16px 38px rgba(0,0,0,.25)}
.w46-persona-modal header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);gap:14px}
.w46-persona-modal header strong{font-size:14px}
.w46-persona-modal header button{border:1px solid var(--border);border-radius:8px;padding:6px 10px;background:var(--surface-soft);color:var(--ink);cursor:pointer}
.w46-persona-modal-body{padding:15px 16px}
.w46-persona-modal-body p{font-size:12px;line-height:1.7;color:var(--muted);margin:12px 0}
.w46-persona-modal-body .w46-persona-modal-caution{font-size:11px;border-top:1px solid var(--border);padding-top:13px}
@media(max-width:719px){
 .w46-r4-persona-layout{grid-template-rows:auto auto!important}
 .w46-r4-persona .w46-r4-details{display:block}
 .w46-r4-persona .w46-r4-feature-toolbar{gap:5px}
 .w46-r4-persona .w46-r4-feature-tabs{gap:1px}
 .w46-r4-persona .w46-r4-feature-tabs button{font-size:10px;padding:6px 5px}
 .w46-r4-persona .w46-r4-feature-title strong{font-size:12px}
 .w46-persona-design-list{padding:0 10px}
 .w46-persona-design-row{gap:7px}
 .w46-persona-small-action{padding:6px 7px}
}
@media(prefers-reduced-motion:reduce){.w46-persona-modal,.w46-persona-modal-mask{transition:none!important;animation:none!important}}
@media(max-width:1000px){.w46-r4-expert-layout{grid-template-columns:minmax(0,1fr) 260px}.w46-r4-persona-layout{grid-template-columns:minmax(0,1fr) clamp(215px,26.5%,250px)}}
@media(max-width:719px){.w46-r4-feature-toolbar{padding:0 9px}.w46-r4-feature-title small{display:none}.w46-r4-feature-body{padding:8px;grid-template-columns:minmax(0,1fr)}.w46-r4-details{display:none}.w46-r4-feature-tabs button{padding:6px}.w46-r4-expert-row{gap:8px}}
.w46-candidate-content>.w46-operator-grid,.w46-candidate-content>.w46-channel-grid,.w46-candidate-content>.w46-settings,.w46-candidate-content>.w46-blank{padding:16px;overflow:auto;min-height:0}
@media(min-width:720px) and (max-width:1099px){.w46-main-links button{padding:7px 9px!important}}
@media(max-width:719px){.w46-compact-global{display:flex;padding:0 7px;gap:4px}.w46-compact-brand strong{display:none}.w46-brand-glyph{height:27px;width:27px}.w46-main-links{flex:1;justify-content:flex-start;gap:0}.w46-main-links button{font-size:11px;padding:7px 6px!important}.w46-global-tools button{padding:5px!important;min-width:26px}.w46-compact-global .w46-workspace-menu{left:7px;transform:none}.w46-brain-one{padding:0}}
@media(max-width:360px){.w46-main-links button{font-size:10px;padding:6px 4px!important}.w46-global-tools{gap:0}.w46-compact-brand{margin:0}}
@media(prefers-reduced-motion:reduce){.w46-brand-glyph{box-shadow:none}}

/* User-approved R4 Compact: CHANNELS uses the same 43px context toolbar
   and genuine SDK setup ports as the other workspaces. No duplicate admin shell. */
.w46-r4-channel-workspace{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;overflow:auto;background:var(--bg)}
.w46-r4-channel-toolbar{display:flex;flex-shrink:0;box-sizing:border-box;min-height:43px;align-items:center;justify-content:space-between;gap:12px;padding:4px 16px;background:var(--bg2);border-bottom:1px solid var(--border)}
.w46-r4-channel-toolbar>strong{font-size:15px;letter-spacing:-.02em}
.w46-r4-channel-actions{display:flex;align-items:center;gap:12px;min-width:0}
.w46-r4-channel-count{color:var(--muted);font-size:11px}
.w46-r4-channel-details-toggle{border:1px solid var(--border)!important;border-radius:999px;background:var(--surface-soft)!important;color:var(--ink)!important;min-height:34px;padding:5px 13px;font-size:12px;cursor:pointer;white-space:nowrap}
.w46-r4-channel-details-toggle:hover,.w46-r4-channel-details-toggle:focus-visible{border-color:var(--accent)!important;box-shadow:0 0 0 2px rgba(var(--accent-rgb),.13)}
.w46-r4-channel-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:stretch;align-content:start;grid-auto-rows:max-content;flex-shrink:0;padding:16px;min-height:0}
.w46-r4-channel-details{margin:0 16px 16px;padding:15px 17px;border:1px solid var(--border);border-radius:14px;background:var(--bg2);font-size:12px;line-height:1.7}
.w46-r4-channel-details strong{font-size:13px}
.w46-r4-channel-details p{color:var(--muted);margin:7px 0 0}
@media(max-width:1099px){.w46-r4-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.w46-r4-channel-grid{grid-template-columns:minmax(0,1fr);gap:10px;padding:10px}.w46-r4-channel-details{margin:0 10px 10px}.w46-r4-channel-toolbar{padding:4px 10px}.w46-r4-channel-toolbar>strong{font-size:13px}.w46-r4-channel-count{display:none}}
/* W09-3: real-state autopilot center; no fabricated revoke, expiry or budget events. */
.w46-autopilot{display:flex;flex:1 1 0;flex-direction:column;min-height:0;min-width:0;overflow-y:auto;overscroll-behavior:contain;background:var(--bg);color:var(--ink)}
.w46-autopilot-toolbar{box-sizing:border-box;display:flex;min-height:64px;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:12px clamp(14px,2vw,24px);border-bottom:1px solid var(--border);background:var(--bg2)}
.w46-autopilot-toolbar h2{margin:0;font-size:17px;font-weight:700;letter-spacing:-.025em}
.w46-autopilot-toolbar p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
.w46-autopilot-toolbar button,.w46-autopilot-overview button,.w46-autopilot-mode button{flex-shrink:0;min-height:35px;border:1px solid var(--border);border-radius:9px;padding:8px 13px;background:var(--surface-soft);color:var(--ink);cursor:pointer;font-size:13px}
.w46-autopilot-toolbar button:disabled{opacity:.55;cursor:not-allowed}
.w46-autopilot-body{box-sizing:border-box;display:flex;flex:1 1 0;min-height:0;flex-direction:column;gap:16px;width:100%;max-width:1120px;margin:0 auto;padding:clamp(14px,2vw,26px)}
.w46-autopilot-overview{display:flex;flex:0 0 auto;align-items:center;gap:18px;padding:24px;border-radius:16px;border:1px solid var(--border);background:linear-gradient(120deg,rgba(var(--accent-rgb),.085),transparent 65%),var(--bg2)}
.w46-autopilot-emblem{display:grid;flex:0 0 50px;place-items:center;width:50px;height:50px;border-radius:15px;background:rgba(var(--accent-rgb),.13);color:var(--accent);font-size:27px}
.w46-autopilot-overview-copy{flex:1;min-width:0}
.w46-autopilot-overview-copy strong{display:block;font-size:18px;font-weight:650;line-height:1.4}
.w46-autopilot-overview-copy p{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.7}
.w46-autopilot-overview button{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.w46-autopilot-modes{display:grid;flex:1 1 0;min-height:0;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:14px}
.w46-autopilot-mode{min-height:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px;padding:22px;border:1px solid var(--border);border-radius:15px;background:var(--bg2)}
.w46-autopilot-mode-heading{display:flex;align-items:center;gap:10px}
.w46-autopilot-mode-heading strong{font-size:16px;font-weight:650}
.w46-autopilot-mode-icon{width:34px;height:34px;display:grid;place-items:center;flex-shrink:0;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft);color:var(--accent);font-size:22px}
.w46-autopilot-mode p{font-size:13px;line-height:1.65;color:var(--muted);margin:0}
.w46-autopilot-readonly{margin-top:4px;font-size:12px;color:var(--muted)}
.w46-autopilot-help{flex:0 0 auto;margin:0;padding:12px 14px;border-radius:10px;background:var(--surface-soft);color:var(--muted);font-size:12px;line-height:1.7}
@media(max-width:719px){.w46-autopilot-toolbar{padding:11px 12px}.w46-autopilot-toolbar p{max-width:240px}.w46-autopilot-body{padding:14px;gap:12px;flex:1 0 auto;min-height:min-content}.w46-autopilot-overview{padding:17px;gap:12px;flex-wrap:wrap}.w46-autopilot-overview-copy strong{font-size:16px}.w46-autopilot-overview button{margin-left:0}.w46-autopilot-modes{grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(2,minmax(125px,1fr));min-height:274px;gap:12px}.w46-autopilot-mode{min-height:125px;padding:17px}}

/* W09-3 fixed 44751: verified-only contact directory, no fixture or new send path. */
.w46-people{display:flex;flex:1 1 0;flex-direction:column;min-height:0;min-width:0;overflow-y:auto;overscroll-behavior:contain;background:var(--bg);color:var(--ink)}
.w46-people-toolbar{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 auto;min-height:59px;padding:11px clamp(12px,2vw,22px);background:var(--bg2);border-bottom:1px solid var(--border)}
.w46-people-heading{display:flex;align-items:center;gap:12px;min-width:0}
.w46-people-heading h2{font-size:18px;letter-spacing:-.025em;line-height:1.3;margin:0}
.w46-people-heading span{font-size:12px;color:var(--muted)}
.w46-people-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.w46-people-actions button,.w46-people-empty button,.w46-people-bottom button{min-height:36px;padding:8px 13px;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft);color:var(--ink);font-size:13px;cursor:pointer}
.w46-people-actions button:disabled{opacity:.55;cursor:not-allowed}
.w46-people-actions .w46-people-connect,.w46-people-empty button{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:650}
.w46-people-body{box-sizing:border-box;display:flex;flex-direction:column;gap:15px;width:100%;max-width:1050px;align-self:center;padding:clamp(14px,2.5vw,27px)}
.w46-people-search-panel{display:flex;align-items:end;gap:10px;min-width:0;padding:13px;border:1px solid var(--border);border-radius:13px;background:var(--bg2)}
.w46-people-search{display:flex;align-items:center;gap:9px;min-width:100px;min-height:41px;flex:1 1 300px;padding:0 13px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--muted)}
.w46-people-search span{font-size:18px}
.w46-people-search input{min-width:0;width:100%;min-height:39px;border:0;outline:none;background:transparent;color:var(--ink);font-size:13px}
.w46-people-search:focus-within{border-color:var(--accent)}
.w46-people-select{display:flex;flex-direction:column;gap:5px;min-width:145px;font-size:11px;color:var(--muted)}
.w46-people-select select{min-height:41px;min-width:0;width:100%;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--surface);color:var(--ink);font-size:13px;cursor:pointer}
.w46-people-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:320px;padding:42px 22px;text-align:center;border:1px solid var(--border);border-radius:16px;background:linear-gradient(140deg,rgba(var(--accent-rgb),.065),transparent 65%),var(--bg2)}
.w46-people-symbol{width:60px;height:60px;display:grid;place-items:center;border-radius:18px;color:var(--accent);background:rgba(var(--accent-rgb),.12);font-size:36px}
.w46-people-empty h3{font-size:22px;font-weight:680;margin:3px 0 0;letter-spacing:-.03em}
.w46-people-empty p{max-width:475px;font-size:14px;line-height:1.7;margin:0;color:var(--muted)}
.w46-people-platforms{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:6px}
.w46-people-platforms span{padding:5px 10px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:11px}
.w46-people-results{border:1px solid var(--border);border-radius:14px;background:var(--bg2);overflow:hidden}
.w46-people-result-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px 17px;border-bottom:1px solid var(--border)}
.w46-people-result-head strong{font-size:14px}.w46-people-result-head span{font-size:12px;color:var(--muted)}
.w46-people-row{display:flex;gap:12px;align-items:center;min-height:66px;padding:10px 17px;border-bottom:1px solid var(--border)}
.w46-people-row:last-child{border-bottom:0}
.w46-people-avatar{display:grid;place-items:center;flex:0 0 41px;height:41px;border-radius:14px;background:rgba(var(--accent-rgb),.13);color:var(--accent);font-weight:700}
.w46-people-row-copy{min-width:0;flex:1;display:grid;gap:4px}
.w46-people-row-copy strong{font-size:14px;overflow-wrap:anywhere}
.w46-people-row-copy small{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.w46-people-source{font-size:11px;color:var(--muted)}
.w46-people-no-match{padding:25px;color:var(--muted);font-size:13px}
.w46-people-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px}
@media(max-width:600px){.w46-people-body{padding:12px;gap:10px}.w46-people-toolbar{padding:10px 11px}.w46-people-heading h2{font-size:16px}.w46-people-actions{gap:5px}.w46-people-actions button{padding:7px 9px;font-size:12px}.w46-people-search-panel{padding:10px;flex-wrap:wrap;gap:8px}.w46-people-search{flex-basis:100%}.w46-people-select{flex:1 1 120px}.w46-people-empty{min-height:290px;padding:30px 16px}.w46-people-empty h3{font-size:18px}.w46-people-empty p{font-size:13px}.w46-people-row{padding:10px}.w46-people-source{display:none}}

/* R4 four-column personal account view, preserving existing nav and theme tokens. */
.w46-r4-channel-workspace{position:relative}
.w46-r4-channel-grid{gap:12px;padding:14px;align-items:start}
.w46-r4-channel-title{display:grid;gap:2px;min-width:0}
.w46-r4-channel-title strong{font-size:14px;letter-spacing:-.02em}
.w46-r4-channel-title small{font-size:10px;color:var(--muted)}
.w46-r4-channel-actions{gap:9px}
.w46-add-account-global{min-height:31px;padding:5px 12px;border:1px solid rgba(var(--accent-rgb),.65);
 border-radius:9px;background:rgba(var(--accent-rgb),.14);color:var(--accent);
 font-size:11px;font-weight:750;white-space:nowrap;cursor:pointer}
.w46-add-account-global:hover,.w46-add-account-global:focus-visible{background:rgba(var(--accent-rgb),.23);
 outline:2px solid rgba(var(--accent-rgb),.24);outline-offset:2px}
.w46-r4-channel-details-toggle{min-height:31px;padding:4px 10px;font-size:11px}
.w46-add-account-backdrop{position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.66);
 display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
.w46-add-account-panel{width:min(412px,100%);max-height:min(640px,90vh);overflow-y:auto;
 border:1px solid rgba(var(--accent-rgb),.26);border-radius:19px;
 background:var(--bg2);box-shadow:0 24px 64px rgba(0,0,0,.38);padding:18px}
.w46-add-account-panel>header{display:flex;align-items:start;justify-content:space-between;
 margin-bottom:14px;padding:0 0 12px;border-bottom:1px solid var(--border)}
.w46-add-account-panel>header strong{font-size:17px;color:var(--ink)}
.w46-add-account-panel>header p{font-size:11px;color:var(--muted);margin:5px 0 0}
.w46-add-account-panel>header button{border:0;background:var(--surface-soft);border-radius:9px;
 color:var(--ink);font-size:13px;width:30px;height:30px;cursor:pointer}
.w46-add-platform{display:flex;align-items:center;gap:12px;width:100%;padding:11px 10px;
 margin-bottom:7px;background:var(--surface-soft);border:1px solid var(--border);
 border-radius:12px;color:var(--ink);text-align:left;cursor:pointer}
.w46-add-platform:hover,.w46-add-platform:focus-visible{border-color:var(--accent);
 background:rgba(var(--accent-rgb),.07);outline-offset:2px}
.w46-add-platform-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;
 border:1px solid var(--border);flex:0 0 35px}
.w46-add-platform-label{display:grid;gap:4px;min-width:0;flex:1}
.w46-add-platform-label strong{font-size:12px}
.w46-add-platform-label small{font-size:10px;color:var(--muted)}
.w46-add-platform>span:last-child{font-size:22px;color:var(--muted)}
@media(max-width:1099px){.w46-r4-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.w46-r4-channel-grid{grid-template-columns:1fr;padding:10px}.w46-r4-channel-title small{display:none}.w46-add-account-global{padding:5px 9px}}
@media(prefers-reduced-motion:reduce){.w46-add-account-panel,.w46-add-platform{transition:none!important}}

/* W09-3 PERSONA product empty state: no simulated learning/approvals. */
.w46-r4-persona .w46-r4-persona-layout{grid-template-rows:minmax(0,1fr)!important;align-content:stretch!important;align-items:stretch;gap:14px;padding:clamp(12px,2.2vw,24px);grid-template-columns:minmax(0,1fr) minmax(245px,315px);overflow:hidden}
.w46-r4-persona-layout>.w46-r4-feature-card{align-self:start!important}
.w46-r4-persona .w46-r4-persona-layout>.w46-persona-main-card{align-self:stretch!important;min-height:0;height:100%}
.w46-r4-persona .w46-r4-persona-layout>.w46-persona-guide{align-self:start!important}
.w46-persona-main-card{display:flex;flex-direction:column;min-height:0}
.w46-persona-main-card>.w46-r4-card-head{min-height:57px!important;padding:16px 20px}
.w46-persona-main-card>.w46-r4-card-head strong{font-size:15px}
.w46-persona-main-card .w46-persona-approval-status{font-size:11px}
.w46-persona-verified-empty{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;box-sizing:border-box;padding:40px 30px}
.w46-persona-empty-icon{display:grid;place-items:center;width:62px;height:62px;flex:0 0 62px;border-radius:18px;border:1px solid var(--border);background:rgba(var(--accent-rgb),.1);color:var(--accent);font-size:30px}
.w46-persona-verified-empty h3{margin:4px 0 0;font-size:20px;letter-spacing:-.03em;color:var(--ink)}
.w46-persona-verified-empty p{margin:0;max-width:450px;line-height:1.75;font-size:14px;color:var(--muted)}
.w46-persona-verified-empty button{min-height:39px;margin-top:8px;padding:9px 18px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);font-size:13px;font-weight:650;cursor:pointer}
.w46-persona-guide>.w46-r4-card-head{padding:16px}
.w46-persona-guide>.w46-r4-card-head strong{font-size:14px}
.w46-persona-guide-list{display:grid;padding:8px 16px 0}
.w46-persona-guide-list>div{display:flex;gap:10px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--border)}
.w46-persona-guide-list>div:last-child{border-bottom:0}
.w46-persona-guide-list>div>span{font-size:11px;font-weight:700;color:var(--accent);width:27px;flex:0 0 27px;padding-top:3px}
.w46-persona-guide-list section{min-width:0}
.w46-persona-guide-list section strong{font-size:13px;font-weight:650;color:var(--ink)}
.w46-persona-guide-list section p{margin:5px 0 0;font-size:12px;line-height:1.65;color:var(--muted)}
.w46-persona-guide>.w46-persona-guide-note{margin:6px 16px 16px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;line-height:1.65}
.w46-r4-persona .w46-r4-feature-title small{color:var(--muted)}
.w46-r4-persona .w46-r4-feature-tabs button{font-size:12px}
@media(max-width:950px){.w46-r4-persona .w46-r4-persona-layout{grid-template-columns:minmax(0,1fr) minmax(215px,250px);gap:10px;padding:12px}.w46-persona-verified-empty{padding:30px 18px}}
@media(max-width:719px){.w46-r4-persona .w46-r4-persona-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(330px,1fr) auto!important;padding:10px;overflow-y:auto}.w46-persona-main-card{min-height:0}.w46-persona-main-card>.w46-r4-card-head{padding:14px}.w46-persona-verified-empty h3{font-size:18px}.w46-persona-verified-empty p{font-size:13px}.w46-r4-persona .w46-r4-feature-tabs button{font-size:11px}}
/* W09-3: expert/task page reads only original W43 authenticated endpoints. */
.w46-real-tools .w46-r4-expert-layout{grid-template-columns:minmax(0,1fr) minmax(230px,285px);grid-template-rows:minmax(0,1fr);align-content:stretch;align-items:stretch;gap:15px;padding:clamp(12px,2vw,24px);overflow:hidden}
.w46-real-tools .w46-r4-expert-layout>.w46-r4-feature-card{align-self:start;min-width:0}
 .w46-real-tools .w46-r4-expert-layout>.w46-tools-main{align-self:stretch;min-height:0;height:100%}
.w46-tools-main{display:flex;flex-direction:column;min-height:0}
.w46-tools-main>.w46-r4-card-head{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px}
.w46-tools-main>.w46-r4-card-head strong{font-size:15px}
.w46-tools-refresh,.w46-tools-filters button,.w46-tools-row button,.w46-tools-empty button,.w46-tools-aside-brain{min-height:35px;padding:7px 12px;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft);color:var(--ink);font-size:12px;cursor:pointer}
.w46-tools-refresh:disabled{opacity:.5;cursor:not-allowed}
.w46-tools-empty{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;box-sizing:border-box;padding:32px 18px}
.w46-tools-empty-symbol{display:grid;place-items:center;width:62px;height:62px;border-radius:18px;background:rgba(var(--accent-rgb),.1);border:1px solid var(--border);color:var(--accent);font-size:32px}
.w46-tools-empty h3{font-size:20px;letter-spacing:-.025em;color:var(--ink);font-weight:650;margin:4px 0 0}
.w46-tools-empty p{margin:0;max-width:435px;font-size:14px;line-height:1.7;color:var(--muted)}
.w46-tools-empty button,.w46-tools-aside-brain{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600;margin-top:6px}
.w46-tools-filters{display:flex;gap:9px;align-items:center;padding:12px 15px;border-bottom:1px solid var(--border)}
.w46-tools-search{flex:1;min-width:0;display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:9px;padding:0 11px;min-height:39px;background:var(--surface)}
.w46-tools-search input{min-width:0;width:100%;font-size:13px;min-height:36px;border:0;outline:0;background:transparent;color:var(--ink)}
.w46-tools-list{flex:1;min-height:0;min-width:0;overflow-y:auto;overscroll-behavior:contain;padding:0 15px}
.w46-tools-row{display:flex;align-items:center;gap:12px;min-height:71px;padding:11px 3px;border-bottom:1px solid var(--border)}
.w46-tools-row:last-child{border-bottom:0}
.w46-tools-glyph{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);font-size:20px;color:var(--accent)}
.w46-tools-row-copy{flex:1;min-width:0;display:grid;gap:5px}
.w46-tools-row-copy strong{font-size:13px;line-height:1.5;color:var(--ink);overflow-wrap:anywhere}
.w46-tools-row-copy small{font-size:12px;color:var(--muted);line-height:1.4}
.w46-tools-aside>.w46-r4-card-head{padding:16px}
.w46-tools-summary{display:grid;grid-template-columns:1fr auto;gap:13px;padding:18px;border-bottom:1px solid var(--border)}
.w46-tools-summary span{font-size:12px;color:var(--muted)}
.w46-tools-summary strong{font-size:12px;color:var(--ink);font-weight:600;text-align:right}
.w46-tools-aside>p{font-size:12px;color:var(--muted);line-height:1.7;margin:15px 18px}
.w46-tools-aside-brain{margin:0 18px 18px}
@media(max-width:900px){.w46-real-tools .w46-r4-expert-layout{grid-template-columns:minmax(0,1fr) minmax(185px,220px);gap:10px;padding:12px}}
@media(max-width:719px){.w46-real-tools .w46-r4-expert-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:10px;padding:10px}.w46-tools-main{min-height:0}.w46-tools-empty{min-height:0}.w46-tools-empty h3{font-size:18px}.w46-tools-empty p{font-size:13px}.w46-tools-filters{flex-wrap:wrap}.w46-tools-search{flex-basis:100%}.w46-tools-aside{margin-bottom:16px}}
/* Keep the visible compact navigation menu above the WOW visual content layer. */
.w46-product-candidate>.w46-compact-global{z-index:65!important}
/* W09-3 fixed 44751: three simple personal channel cards + full-width
   Facebook Page workspace. Original credential and grant ports stay untouched. */
.w46-r4-channel-workspace{overflow:hidden}
.w46-r4-channel-workspace .w46-r4-channel-grid{
 display:grid;flex:1 1 0;min-height:0;overflow-y:auto;overscroll-behavior:contain;
 grid-template-columns:repeat(3,minmax(0,1fr));
 grid-template-rows:max-content minmax(335px,1fr);grid-auto-rows:max-content;
 gap:14px;padding:clamp(12px,1.6vw,20px);align-items:stretch;align-content:start;
}
.w46-r4-channel-grid>:nth-child(1){grid-column:1;grid-row:1}
.w46-r4-channel-grid>:nth-child(3){grid-column:2;grid-row:1}
.w46-r4-channel-grid>:nth-child(4){grid-column:3;grid-row:1}
.w46-r4-channel-grid>:nth-child(2){grid-column:1/-1;grid-row:2;min-width:0}
.w46-r4-channel-grid>.w46-channel{min-height:252px}
.w46-r4-channel-grid>.w46-channel .w46-channel-copy strong{font-size:15px}
.w46-r4-channel-grid>.w46-channel .w46-channel-copy p{font-size:12px}
.w46-r4-channel-grid>.w46-channel .w46-account-placeholder{font-size:12px}
.w46-r4-channel-grid>.pancake-multi{
 display:grid;box-sizing:border-box;width:100%;max-width:none;min-width:0;
 grid-template-columns:minmax(230px,.85fr) minmax(340px,1.3fr);
 grid-template-rows:auto minmax(0,1fr) auto;
 grid-template-areas:"heading config" "notice config" "footer config";
 align-items:start;align-content:start;gap:14px 24px;
 border:1px solid var(--border);border-radius:16px;background:var(--bg2);
 padding:clamp(16px,2vw,25px);box-shadow:0 8px 30px #00000016;
}
.w46-r4-channel-grid>.pancake-multi>.pancake-heading{grid-area:heading;min-width:0}
.w46-r4-channel-grid>.pancake-multi>.pancake-note{grid-area:notice;align-self:start}
.w46-r4-channel-grid>.pancake-multi>.pancake-section{grid-area:config;min-width:0}
.w46-r4-channel-grid>.pancake-multi>footer{grid-area:footer;align-self:end;max-width:420px}
.w46-r4-channel-grid>.pancake-multi .pancake-heading h3{font-size:19px;line-height:1.35}
.w46-r4-channel-grid>.pancake-multi .pancake-heading p{font-size:13px;line-height:1.7}
.w46-r4-channel-grid>.pancake-multi .pancake-section{
 padding:clamp(15px,2vw,23px);background:var(--surface-soft);
 border-color:var(--border);gap:12px;align-content:start;
}
.w46-r4-channel-grid>.pancake-multi .pancake-section p,
.w46-r4-channel-grid>.pancake-multi .pancake-note{font-size:13px;line-height:1.7}
.w46-r4-channel-grid>.pancake-multi .pancake-section label{font-size:13px}
.w46-r4-channel-grid>.pancake-multi .pancake-section-head strong{font-size:15px}
.w46-r4-channel-grid>.pancake-multi .pancake-section input{font-size:13px;min-height:44px}
.w46-r4-channel-grid>.pancake-multi .pancake-section button{font-size:13px}
.w46-r4-channel-grid>.pancake-multi .pancake-page{min-width:0;flex-wrap:wrap}
.w46-r4-channel-grid>.pancake-multi .pancake-page-info{min-width:0}
@media(max-width:1000px){
 .w46-r4-channel-workspace .w46-r4-channel-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:max-content max-content minmax(300px,1fr)}
 .w46-r4-channel-grid>:nth-child(4){grid-column:1/-1;grid-row:2}
 .w46-r4-channel-grid>:nth-child(2){grid-column:1/-1;grid-row:3}
 .w46-r4-channel-grid>.pancake-multi{grid-template-columns:1fr;grid-template-rows:auto;grid-template-areas:"heading" "notice" "config" "footer"}
 .w46-r4-channel-grid>.pancake-multi>footer{max-width:none}
}
@media(max-width:640px){
 .w46-r4-channel-workspace .w46-r4-channel-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:auto;grid-auto-rows:max-content;gap:11px;padding:11px}
 .w46-r4-channel-grid>:nth-child(1){grid-column:1;grid-row:1}
 .w46-r4-channel-grid>:nth-child(3){grid-column:1;grid-row:2}
 .w46-r4-channel-grid>:nth-child(4){grid-column:1;grid-row:3}
 .w46-r4-channel-grid>:nth-child(2){grid-column:1;grid-row:4}
 .w46-r4-channel-grid>.w46-channel{min-height:215px}
 .w46-r4-channel-grid>.pancake-multi{gap:13px;padding:15px}
 .w46-r4-channel-grid>.pancake-multi .pancake-section{padding:13px}
 .w46-r4-channel-grid>.pancake-multi .pancake-heading{flex-wrap:wrap}
 .w46-r4-channel-grid>.pancake-multi .pancake-heading h3{font-size:17px}
}
</style>
