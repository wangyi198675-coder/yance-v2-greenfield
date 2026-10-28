<script setup>
import {ref,watch,onBeforeUnmount,computed} from 'vue';
import {R4_SETTINGS_CATEGORIES,readWorkspaceSnapshot} from './product-workspace-contract.mjs';
import {mediaCapabilitiesRead} from './w23-media-browser-consumer.mjs';
import BCChannelAccountSetup from './BCChannelAccountSetup.vue';
import BCNativeCloudKeySettings from './BCNativeCloudKeySettings.vue';
import BCNativeHostSession from './BCNativeHostSession.vue';
import BCThemeChooser from './BCThemeChooser.vue';
import BCNotificationCenter from './BCNotificationCenter.vue';

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
  if(category.value==='diagnostics'){
   const snap=await readWorkspaceSnapshot({fetchImpl:request});
   if(alive&&t===seq)data.value=snap;
  }else if(category.value==='general'){
   // General is navigation, not an untrusted diagnostics/status page.
   data.value={theme:props.theme,appearance:props.appearance};
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
async function logoutCurrentPrivateSession(){
 if(busy.value||session.value?.paired!==true||typeof session.value.csrfToken!=="string"||!/^[a-f0-9]{64}$/.test(session.value.csrfToken))return;
 const csrfToken=session.value.csrfToken;busy.value=true;error.value="";let operationError="";
 try{
  const res=await request("/api/v2/local-session/logout",{method:"POST",headers:{"content-type":"application/json","x-yance-csrf":csrfToken},body:"{}"});
  const out=await res.json().catch(()=>null);
  if(!res.ok||out?.ok!==true||out?.paired!==false)throw Error("HTTP_"+res.status);
  const recheck=await getJson("/api/v2/local-session/status");
  if(recheck?.paired!==false)throw Error("LOGOUT_READBACK_NOT_CONFIRMED");
  session.value=recheck;data.value={sessionKind:"none",authorized:false,expiresAt:null};csrf.value=null;
 }catch(e){operationError=failure(e);}
 finally{busy.value=false;await refresh();if(operationError)error.value=operationError}
}
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
   <header class="bc-settings-heading"><div><small>设置中心</small><h2>{{categoryName}}</h2></div>
    <button v-if="category!=='general'&&category!=='theme'" type="button" data-test="settings-refresh" :disabled="busy" @click="refresh">刷新</button>
   </header>
   <p v-if="error" data-test="settings-error" role="alert">{{error}}。当前没有启用未经核实的写操作。</p>
   <p v-if="busy&&category!=='general'" role="status">正在读取当前设置…</p>
   <template v-if="category==='general'">
    <article class="bc-settings-home" data-test="settings-panel-general">
     <div class="bc-settings-welcome">
      <div><h3>让言策按你的习惯工作</h3>
       <p>连接账号、选择 AI、调整外观和消息提醒。选择一项即可进入对应设置。</p></div>
     </div>
     <div class="bc-settings-shortcuts" aria-label="常用设置">
      <button type="button" class="bc-settings-shortcut" data-test="settings-general-open-accounts" @click="switchCategory('accounts')">
       <span class="bc-settings-shortcut-icon" aria-hidden="true">⌁</span>
       <span class="bc-settings-shortcut-copy"><strong>账号与连接</strong><small>添加和管理聊天平台账号</small></span><span aria-hidden="true" class="bc-settings-shortcut-chevron">›</span>
      </button>
      <button type="button" class="bc-settings-shortcut" data-test="settings-general-open-model" @click="switchCategory('model')">
       <span class="bc-settings-shortcut-icon" aria-hidden="true">✧</span>
       <span class="bc-settings-shortcut-copy"><strong>AI 模型</strong><small>为不同功能选择模型与来源</small></span><span aria-hidden="true" class="bc-settings-shortcut-chevron">›</span>
      </button>
      <button type="button" class="bc-settings-shortcut" data-test="settings-general-open-notify" @click="switchCategory('notify')">
       <span class="bc-settings-shortcut-icon" aria-hidden="true">◉</span>
       <span class="bc-settings-shortcut-copy"><strong>消息通知</strong><small>查看权限、声音和提醒选项</small></span><span aria-hidden="true" class="bc-settings-shortcut-chevron">›</span>
      </button>
      <button type="button" class="bc-settings-shortcut" data-test="settings-general-open-theme" @click="switchCategory('theme')">
       <span class="bc-settings-shortcut-icon" aria-hidden="true">◐</span>
       <span class="bc-settings-shortcut-copy"><strong>外观与主题</strong><small>当前主题：{{theme}}</small></span><span aria-hidden="true" class="bc-settings-shortcut-chevron">›</span>
      </button>
      <button type="button" class="bc-settings-shortcut" data-test="settings-general-open-translate" @click="switchCategory('translate')">
       <span class="bc-settings-shortcut-icon" aria-hidden="true">文</span>
       <span class="bc-settings-shortcut-copy"><strong>翻译</strong><small>查看语言来源和翻译偏好</small></span><span aria-hidden="true" class="bc-settings-shortcut-chevron">›</span>
      </button>
      <button type="button" class="bc-settings-shortcut" data-test="settings-general-open-privacy" @click="switchCategory('privacy')">
       <span class="bc-settings-shortcut-icon" aria-hidden="true">◇</span>
       <span class="bc-settings-shortcut-copy"><strong>隐私与安全</strong><small>管理本机会话和授权状态</small></span><span aria-hidden="true" class="bc-settings-shortcut-chevron">›</span>
      </button>
     </div>
     <div class="bc-settings-home-footer">
      <div><strong>需要检查连接或运行情况？</strong>
       <p>详细版本、服务状态和技术错误统一放在诊断页面。</p></div>
      <button type="button" data-test="settings-general-open-diagnostics" @click="switchCategory('diagnostics')">打开诊断</button>
     </div>
    </article>
   </template>
   <template v-else-if="category==='accounts'">
    <article data-test="settings-panel-accounts"><h3>账号与官方授权</h3>
     <p>只有真人社交账号连接需要按对应平台的官方流程授权。使用本地聊天和私人闺蜜大脑，不需要额外登录或验证。</p>
     <p>本机会话绝不等同于四渠道官方登录。</p>
     <div class="bc-settings-channel-grid"><BCChannelAccountSetup v-for="x in channels" :key="x.id" :channel="x" :fetch-impl="fetchImpl"/></div>
     <p data-test="settings-accounts-no-terminal-pair">直接选择需要连接的社交平台，并按对应平台的官方步骤授权；本地聊天与私人助手无需额外验证。</p>
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
    <BCThemeChooser :theme="theme" :appearance="appearance"
      @cycle-theme="emit('cycle-theme')" @toggle-appearance="emit('toggle-theme')"/>
   </template>
   <template v-else-if="category==='notify'">
    <BCNotificationCenter :permission="notification"
      @request-permission="requestNotificationPermission"/>
   </template>
   <template v-else-if="category==='privacy'">
    <article data-test="settings-panel-privacy"><h3>本机会话与隐私</h3>
     <p>本机私人会话由应用内部安全管理，不代表已经获得社交账号、联系人隐私或真人发送权限。</p>
     <p>所有联系人K、密钥、Grant撤销需以原Owner服务端权限及版本回读为准；不会将本地会话注销冒充全部渠道撤权。</p>
     <p data-test="settings-privacy-no-terminal-pair">私人本地会话由言策应用内部管理，无需额外操作。社交账号、隐私资料和真人发送仍按现有授权进行保护。</p>
     <p data-test="settings-local-session-state">私人本机会话：{{session?.paired===true?"已建立":"未建立；私人助手会按原有安全流程处理"}}</p>
     <button v-if="session?.paired===true" type="button" :disabled="busy" data-test="settings-local-session-logout" @click="logoutCurrentPrivateSession">退出当前本机会话</button>
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
/* User-facing settings home: real navigation, not duplicated developer telemetry.
   The original nine native settings panels and their write contracts are intact. */
.bc-settings-workspace{grid-template-columns:205px minmax(0,1fr);grid-template-rows:minmax(0,1fr);align-content:stretch;align-items:stretch;overflow:hidden}
.bc-settings-nav{min-height:0;overflow-y:auto;align-self:stretch;padding:10px;gap:6px}
.bc-settings-nav button{min-height:40px;font-size:13px;padding:10px 12px}
.bc-settings-detail{min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding:clamp(16px,2vw,26px);gap:16px}
.bc-settings-heading{flex:0 0 auto;padding-bottom:12px;border-bottom:1px solid var(--border)}
.bc-settings-heading small{font-size:11px;letter-spacing:.02em}
.bc-settings-heading h2{margin:4px 0 0;font-size:21px;line-height:1.35}
.bc-settings-detail .bc-settings-home{flex:1 0 auto;min-height:0;display:flex;flex-direction:column;gap:clamp(15px,2vw,24px);align-content:stretch}
.bc-settings-welcome h3{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:2px 0 8px}
.bc-settings-welcome p{font-size:13px;line-height:1.7;color:var(--muted);margin:0}
.bc-settings-shortcuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
.bc-settings-detail .bc-settings-shortcut{display:flex;align-items:center;gap:14px;min-height:107px;width:100%;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft);padding:16px;text-align:left;cursor:pointer;transition:background .15s,border-color .15s}
.bc-settings-detail .bc-settings-shortcut:hover,.bc-settings-detail .bc-settings-shortcut:focus-visible{background:var(--surface-raised);border-color:var(--accent)}
.bc-settings-shortcut-icon{flex:0 0 41px;width:41px;height:41px;border-radius:12px;display:grid;place-items:center;border:1px solid var(--border);background:rgba(var(--accent-rgb),.1);color:var(--accent);font-size:20px}
.bc-settings-shortcut-copy{flex:1;min-width:0;display:grid;gap:6px}
.bc-settings-shortcut-copy strong{font-size:15px;color:var(--ink);line-height:1.3}
.bc-settings-shortcut-copy small{font-size:12px;line-height:1.5;color:var(--muted);overflow-wrap:anywhere}
.bc-settings-shortcut-chevron{flex:0 0 auto;font-size:24px;color:var(--muted);font-weight:300}
.bc-settings-home-footer{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding:17px 19px;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft)}
.bc-settings-home-footer strong{font-size:13px}
.bc-settings-home-footer p{margin:5px 0 0;font-size:12px;color:var(--muted);line-height:1.6}
.bc-settings-detail .bc-settings-home-footer button{flex:0 0 auto;min-height:37px;padding:8px 15px;border:1px solid var(--border);border-radius:9px;background:var(--surface-raised);text-align:center;cursor:pointer;font-size:12px}
@media(max-width:950px){.bc-settings-workspace{grid-template-columns:162px minmax(0,1fr)}.bc-settings-shortcuts{gap:10px}.bc-settings-detail .bc-settings-shortcut{padding:12px;min-height:98px}}
@media(max-width:720px){.bc-settings-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);padding:10px;overflow:hidden}.bc-settings-detail{padding:15px}.bc-settings-heading h2{font-size:19px}}
@media(max-width:550px){.bc-settings-shortcuts{grid-template-columns:minmax(0,1fr);gap:9px}.bc-settings-detail .bc-settings-shortcut{min-height:76px;padding:12px}.bc-settings-shortcut-icon{flex-basis:36px;width:36px;height:36px}.bc-settings-welcome h3{font-size:19px}.bc-settings-home-footer{padding:14px}.bc-settings-detail .bc-settings-home{gap:15px}}
@media(prefers-reduced-motion:reduce){.bc-settings-detail .bc-settings-shortcut{transition:none}}
</style>
