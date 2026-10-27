<script setup>
import {ref,watch,onBeforeUnmount,computed} from 'vue';
import {R4_SETTINGS_CATEGORIES,readWorkspaceSnapshot} from './product-workspace-contract.mjs';
import {mediaCapabilitiesRead} from './w23-media-browser-consumer.mjs';
import BCChannelAccountSetup from './BCChannelAccountSetup.vue';
import BCNativeCloudKeySettings from './BCNativeCloudKeySettings.vue';
import BCNativeHostSession from './BCNativeHostSession.vue';
import BCLocalSessionConnector from './BCLocalSessionConnector.vue';
const props=defineProps({
 active:{type:Boolean,default:false},fetchImpl:{type:Function,default:null},
 theme:{type:String,default:'Obsidian Lime'},appearance:{type:String,default:'dark'}
});
const emit=defineEmits(['navigate','cycle-theme','toggle-theme']);
const category=ref('general'),busy=ref(false),state=ref('idle'),error=ref(''),data=ref(null);
const csrf=ref(null),session=ref(null),notification=ref('unsupported');
let seq=0,alive=true;
const channels=[{id:'FB_PERSONAL',label:'Facebook'},{id:'FB_PAGE',label:'Page'},
{id:'WHATSAPP_PERSONAL',label:'WhatsApp'},{id:'TELEGRAM_PERSONAL',label:'Telegram'}];
const categoryName=computed(()=>R4_SETTINGS_CATEGORIES.find(x=>x.id===category.value)?.label||'设置');
const request=(url,opt)=> (props.fetchImpl||globalThis.fetch)(url,{
 credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...opt
});
const failure=e=>{const s=String(e?.message||e);const code=/HTTP_(401|403|409|503)/.exec(s)?.[1];
 return code==='401'?'401：尚无有效本机或社交授权':
 code==='403'?'403：权限不足，操作没有生效':
 code==='409'?'409：版本冲突或授权已经变化':
 code==='503'?'503：该分类原生Owner接口未接通':s.slice(0,115)};
async function getJson(path){
 const res=await request(path);
 if(!res?.ok)throw Error('HTTP_'+(res?.status||'UNAVAILABLE'));
 return res.json();
}
async function refresh(){
 const t=++seq;busy.value=true;data.value=null;error.value='';state.value='checking';csrf.value=null;session.value=null;
 try{
  if(category.value==='general'||category.value==='diagnostics'){
   const snap=await readWorkspaceSnapshot({fetchImpl:request});
   if(alive&&t===seq)data.value=snap;
  }else if(category.value==='model'||category.value==='accounts'||category.value==='privacy'){
   const s=await getJson('/api/v2/local-session/status');
   if(alive&&t===seq){
    session.value=s;
    // The existing PRIVATE key settings accepts current signed local session CSRF only.
    csrf.value=s?.authorized===true&&typeof s.csrfToken==='string'&&/^[a-f0-9]{64}$/.test(s.csrfToken)?s.csrfToken:null;
    data.value={sessionKind:String(s.sessionKind||'none'),authorized:s.authorized===true,expiresAt:s.expiresAt||null};
   }
  }else if(category.value==='translate'){
   const r=await getJson('/api/v2/translations');
   if(alive&&t===seq)data.value=r;
  }else if(category.value==='media'){
   const c=await mediaCapabilitiesRead(request);
   if(alive&&t===seq)data.value=c;
  }else if(category.value==='notify'){
   notification.value=typeof window!=='undefined'&&'Notification' in window?Notification.permission:'unsupported';
   data.value={browserPermission:notification.value,native:'Windows原生Toast须由原Tauri实机检验'};
  }else if(category.value==='theme'){
   data.value={theme:props.theme,mode:props.appearance,source:'APP_THEME_TOKENS_CURRENT'};
  }
  if(alive&&t===seq)state.value='ready';
 }catch(e){if(alive&&t===seq){state.value='unavailable';error.value=failure(e)}}
 finally{if(alive&&t===seq)busy.value=false}
}
function switchCategory(id){if(!R4_SETTINGS_CATEGORIES.some(x=>x.id===id))return;category.value=id}
watch([()=>props.active,category],([active])=>{if(active)void refresh();else{seq++;data.value=null;csrf.value=null;session.value=null}},{immediate:true});
watch([()=>props.theme,()=>props.appearance],()=>{
 if(category.value==='theme'&&props.active)data.value={theme:props.theme,mode:props.appearance,source:'APP_THEME_TOKENS_CURRENT'};
});
onBeforeUnmount(()=>{alive=false;seq++});
function requestNotificationPermission(){
 // No prompt on load. Browsers alone own this interaction; notification sending is not implied.
 if(typeof window==='undefined'||!('Notification' in window)||Notification.permission!=='default')return;
 void Notification.requestPermission().then(p=>{
  notification.value=p;data.value={browserPermission:p,native:'Windows原生Toast独立验证'};
 }).catch(()=>{notification.value='unknown';error.value='浏览器未确认通知权限'});
}
</script>
<template>
 <section class="bc-settings-workspace" data-test="w46-settings-nine" aria-label="九分类设置">
  <label class="bc-settings-mobile" for="w46-settings-picker">设置分类（9）
   <select id="w46-settings-picker" v-model="category" data-test="settings-mobile-picker">
    <option v-for="x in R4_SETTINGS_CATEGORIES" :key="x.id" :value="x.id">{{x.label}}</option>
   </select>
  </label>
  <nav class="bc-settings-nav" aria-label="设置分类">
   <button v-for="x in R4_SETTINGS_CATEGORIES" :key="x.id" type="button" :aria-pressed="category===x.id"
     :data-test="'settings-'+x.id" @click="switchCategory(x.id)">{{x.label}}</button>
  </nav>
  <section class="bc-settings-detail" data-test="w46-settings-content" :data-category="category">
   <header><div><small>SETTINGS / {{category.toUpperCase()}}</small><h2>{{categoryName}}</h2></div>
    <button type="button" data-test="settings-refresh" :disabled="busy" @click="refresh">刷新真实状态</button>
   </header>
   <p v-if="error" data-test="settings-error" role="alert">{{error}}。当前没有启用未经核实的写操作。</p>
   <p v-if="busy" role="status">正在读取当前服务端信息…</p>
   <template v-if="category==='general'">
    <article data-test="settings-panel-general"><h3>运行概览</h3>
     <p>Web/API源码：{{data?.runtimeSha||'尚未回读'}}</p>
     <p>可信会话：{{data?.trustedSession?'已验证':'未确认'}}</p>
     <p>社交联系人：{{data?.contactsAccess||'未授权'}}，账号{{data?.connectedAccountCount??'未确认'}}</p>
     <p>真人发送由W25独立资格决定：{{data?.canSend===false?'当前禁用':'未取得发送授权'}}</p>
    </article>
   </template>
   <template v-else-if="category==='accounts'">
    <article data-test="settings-panel-accounts"><h3>账号与官方授权</h3>
     <p>本机用户：{{data?.authorized?'已授权本机会话':'未取得有效会话'}}</p>
     <p>本机会话绝不等同于四渠道官方登录。</p>
     <div class="bc-settings-channel-grid"><BCChannelAccountSetup v-for="x in channels" :key="x.id" :channel="x" :fetch-impl="fetchImpl"/></div>
     <BCLocalSessionConnector :fetch-impl="fetchImpl"/>
    </article>
   </template>
   <template v-else-if="category==='model'">
    <article data-test="settings-panel-model"><h3>本地与云端AI模型</h3>
     <p>原唯一PRIVATE Agno模型仍在闺蜜大脑中进行选择，模型费用需本人确认，联系人不继承PRIVATE权限。</p>
     <button type="button" data-test="settings-open-brain" @click="emit('navigate','BRAIN')">进入原闺蜜大脑选择模型</button>
     <p>{{csrf?'已验证本机会话，可使用原W47受保护密钥设置':'本机会话CSRF未确认，不能保存云端API Key'}}</p>
     <BCNativeCloudKeySettings v-if="csrf" :web-csrf="csrf" @changed="refresh"/>
    </article>
   </template>
   <template v-else-if="category==='translate'">
    <article data-test="settings-panel-translate"><h3>翻译来源与偏好</h3>
     <p>原W45翻译接口：{{state==='ready'?'已返回当前授权来源':'无可核验的消息译文或翻译偏好'}}</p>
     <p>原语言偏好和译文缓存只能由服务端授权后变更，不以浏览器localStorage模拟持久化。</p>
     <button type="button" disabled data-test="settings-translate-write">翻译偏好写入暂不可用</button>
    </article>
   </template>
   <template v-else-if="category==='media'">
    <article data-test="settings-panel-media"><h3>本机附件与媒体Provider</h3>
     <p>加密附件：{{data?.attachment_store||'W23原生能力未接通'}}</p>
     <p>生成图片／视频／TTS：{{data?.media_generation?.image||'未接通'}}／{{data?.media_generation?.video||'未接通'}}／{{data?.media_generation?.tts||'未接通'}}</p>
     <button type="button" data-test="settings-open-media" @click="emit('navigate','MEDIA')">打开媒体库</button>
    </article>
   </template>
   <template v-else-if="category==='theme'">
    <article data-test="settings-panel-theme"><h3>外观与主题</h3>
     <p>当前主题：<strong data-test="settings-current-theme">{{theme}}</strong></p>
     <p>外观：<strong data-test="settings-current-mode">{{appearance==='dark'?'深色':'浅色'}}</strong></p>
     <div class="bc-settings-actions"><button type="button" data-test="settings-cycle-theme" @click="emit('cycle-theme')">切换至下一个已批准主题</button>
     <button type="button" data-test="settings-toggle-appearance" @click="emit('toggle-theme')">切换深／浅模式</button></div>
     <small>直接调用原App主题Token逻辑；无第二套偏好存储或虚构保存成功。</small>
    </article>
   </template>
   <template v-else-if="category==='notify'">
    <article data-test="settings-panel-notify"><h3>通知与原生声音</h3>
     <p>浏览器权限：<strong data-test="settings-notification-permission">{{notification}}</strong></p>
     <p>Windows桌面通知仍使用原Tauri＋WebSocket／REST，需要真实Windows安装后核验Toast与声音。</p>
     <button type="button" data-test="settings-request-notifications" :disabled="notification!=='default'" @click="requestNotificationPermission">由本人确认浏览器通知权限</button>
    </article>
   </template>
   <template v-else-if="category==='privacy'">
    <article data-test="settings-panel-privacy"><h3>本机会话与隐私</h3>
     <p>当前会话：{{data?.authorized?'已由原W47确认':'未授权或不可用'}}</p>
     <p>所有联系人K、密钥、Grant撤销需以原Owner服务端权限及版本回读为准；不会将本地会话注销冒充全部渠道撤权。</p>
     <BCLocalSessionConnector :fetch-impl="fetchImpl"/>
     <button type="button" disabled data-test="settings-contact-revoke">撤销联系人授权 · 等待W44真实Grant资格</button>
    </article>
   </template>
   <template v-else-if="category==='diagnostics'">
    <article data-test="settings-panel-diagnostics"><h3>运行与安全诊断</h3>
     <p>已读回源码：{{data?.runtimeSha||'不可用'}}</p>
     <p>可发送：{{data?.canSend===false?'false（禁止）':'未核实'}}</p>
     <p>授权状态：{{data?.contactsAccess||'无法读取'}}</p>
     <BCNativeHostSession :fetch-impl="fetchImpl"/>
     <small>401 / 403 / 409 / 503 直接呈现，不因点击刷新就报告功能成功。</small>
    </article>
   </template>
  </section>
 </section>
</template>
<style scoped>
.bc-settings-workspace{display:grid;grid-template-columns:182px minmax(0,1fr);gap:14px;align-content:start;min-width:0;min-height:0;height:100%;overflow-y:auto;padding:14px clamp(10px,2vw,22px)}
.bc-settings-nav{display:grid;align-content:start;gap:4px;padding:7px;border:1px solid var(--border);border-radius:13px;background:var(--bg2)}
.bc-settings-nav button,.bc-settings-detail button{border:1px solid var(--border);border-radius:9px;background:var(--surface-soft);color:var(--ink);font:inherit;padding:9px;text-align:left}
.bc-settings-nav [aria-pressed=true]{background:var(--surface-raised);border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.bc-settings-detail{min-width:0;display:grid;gap:12px;align-content:start;padding:17px;border:1px solid var(--border);border-radius:14px;background:var(--bg2)}
.bc-settings-detail header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.bc-settings-detail header small{color:var(--muted)}.bc-settings-detail h2{font-size:18px}.bc-settings-detail h3{font-size:16px}
.bc-settings-detail article{display:grid;align-content:start;gap:11px;min-width:0}
.bc-settings-detail p{font-size:12px;overflow-wrap:anywhere;line-height:1.5}
.bc-settings-detail button:disabled{opacity:.55;cursor:not-allowed}
.bc-settings-actions{display:flex;flex-wrap:wrap;gap:8px}
.bc-settings-channel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}
.bc-settings-mobile{display:none}
@media(max-width:950px){.bc-settings-workspace{grid-template-columns:147px minmax(0,1fr)}.bc-settings-channel-grid{grid-template-columns:1fr}}
@media(max-width:720px){.bc-settings-workspace{grid-template-columns:minmax(0,1fr);padding:10px}
 .bc-settings-nav{display:none}.bc-settings-mobile{display:grid;gap:6px;font-size:12px}
 .bc-settings-mobile select{width:100%;min-height:43px;border:1px solid var(--border);border-radius:9px;padding:8px;background:var(--bg2);color:var(--ink)}
 .bc-settings-detail{padding:12px}.bc-settings-channel-grid{grid-template-columns:1fr}}
</style>
