<script setup>
import {ref,watch,computed,nextTick} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import {WORKSPACES,CHANNELS,R4_SETTINGS_CATEGORIES,R4_STOP_FAILURE_STATES,
 readWorkspaceSnapshot,explainCapability} from './product-workspace-contract.mjs';
const props=defineProps({
 activeWorkspace:{type:String,default:'CHAT'},
 enabled:{type:Boolean,default:false},
 fetchImpl:{type:Function,default:null},
 appearance:{type:String,default:'dark'}
});
const emit=defineEmits(['select']);
const snapshot=ref(null),error=ref('尚未连接真实运行环境'),loading=ref(false);
const menuOpen=ref(false);
const contentScroller=ref(null);
const settingCategory=ref('general');
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
 await nextTick();
 if(contentScroller.value)contentScroller.value.scrollTop=0;
});
function choose(k){if(!WORKSPACES.some(x=>x.id===k))return;emit('select',k);menuOpen.value=false}
const status=computed(()=>{
 if(loading.value)return '连接检查中';
 if(error.value)return error.value;
 if(!snapshot.value?.trustedSession)return '未取得可信授权 · 无真实联系人 · 发送禁用';
 return '已取得服务会话，仍需权限范围验证';
});
const readonlyAccount=computed(()=>snapshot.value?.connectedAccountCount||0);
defineExpose({refresh});
</script>
<template>
 <div v-if="enabled" class="w46-product-candidate" :data-mode="appearance" :data-active-workspace="activeWorkspace" data-test="w46-product-candidate">
  <div class="w46-product-top">
   <div class="w46-product-heading">
    <strong>言策 V2</strong><span class="w46-product-marker">独立候选 · 未经 R4 原件复核</span>
   </div>
   <div class="w46-product-state" data-test="w46-trusted-status" role="status">{{status}}</div>
   <Button size="sm" variant="outline" data-test="w46-refresh" :disabled="loading" @click="refresh">检查连接</Button>
  </div>
  <nav class="w46-workspace-tabs" aria-label="言策 V2 工作区候选导航">
   <Button v-for="item in WORKSPACES" :key="item.id" size="sm"
     :data-test="'workspace-'+item.id"
     :aria-pressed="item.id===activeWorkspace" :variant="item.id===activeWorkspace?'secondary':'ghost'"
     @click="choose(item.id)">{{item.label}}</Button>
  </nav>
  <div class="w46-small-workspaces">
   <Button size="sm" variant="outline" data-test="workspace-mobile-trigger"
     :aria-expanded="menuOpen" @click="menuOpen=!menuOpen">{{selected.label}} · 九分类</Button>
   <div v-if="menuOpen" class="w46-workspace-menu" role="menu" data-test="workspace-mobile-list">
    <Button v-for="item in WORKSPACES" :key="item.id" variant="ghost" size="sm"
      role="menuitem" :aria-current="item.id===activeWorkspace?'page':undefined"
      @click="choose(item.id)">{{item.label}}</Button>
   </div>
  </div>
  <div v-if="activeWorkspace!=='CHAT'" ref="contentScroller" tabindex="0" role="region"
   :aria-label="selected.label+'工作区内容（可滚动）'" class="w46-candidate-content" data-test="w46-workspace-content">
   <div class="w46-workspace-intro">
    <div><p class="w46-caption">{{selected.section}} · 原生能力权限待签署</p><h2>{{selected.label}}</h2>
      <p>{{selected.hint}}</p></div>
    <span class="w46-inactive" data-test="w46-capability-status">
     {{explainCapability(snapshot,activeWorkspace)}}</span>
   </div>
   <div v-if="activeWorkspace==='CHAT'" class="w46-blank" data-test="w46-chat-no-authority">
    <strong>聊天平台尚未取得可信授权</strong>
    <p>唯一 B＋C CONTACT Composer 的原有逻辑保持不变。本非生产草稿不加载任何 W37 虚构联系人；需要 W47/W24 提供当前登录及联系人授权后由 Shell Owner 复签接入。</p>
    <p>没有已连接账号、收件人或发送资格。当前不能发送消息。</p>
   </div>
   <div v-else-if="activeWorkspace==='ACCOUNTS'" class="w46-channel-grid" aria-label="四渠道真实授权回读">
    <div v-for="channel in CHANNELS" :key="channel.id" class="w46-channel">
     <BCBrandIcon :name="channel.id" :size="23"/>
     <strong>{{channel.label}}</strong>
     <small>未授权 · 0 个已验证账号</small>
    </div>
    <p class="w46-note">R4 四平台品牌 SVG 路径来源已校验；平台连接须取得各原生渠道授权回读。</p>
    <div class="w46-account-summary" data-test="w46-multi-account">
     <strong>多账号管理 · 已验证账号 {{readonlyAccount}}</strong>
     <p>同一渠道可独立绑定多个账号，当前全部未授权。账号列表仅能由可信原生服务返回。</p>
     <p>Messenger · mautrix-meta | Page · Pancake | WhatsApp · Baileys | Telegram · TDLib JSON</p>
     <Button size="sm" variant="outline" disabled>添加账号 · 授权接口未接入</Button>
    </div>
   </div>
   <div v-else-if="activeWorkspace==='PEOPLE'" class="w46-blank">
     <strong>联系人：{{snapshot?.trustedSession?snapshot.realContacts:0}}</strong>
     <p>仅从当前服务端取得有授权的实际身份 K。未连接时不加载演示联系人。</p>
   </div>
   <div v-else-if="activeWorkspace==='AUTOPILOT'" class="w46-operator-grid">
    <div class="w46-status-grid">
    <div><strong>持续授权</strong><span>未签发 / 无可信会话</span></div>
    <div><strong>有效期</strong><span>未获得回读</span></div>
    <div><strong>预算</strong><span>无已验证预算，禁止托管</span></div>
    <div><strong>撤权</strong><span>未授权状态，无可撤销真实 Grant</span></div>
    </div>
    <div class="w46-danger-grid" data-test="w46-hosting-failclosed">
     <article v-for="state in R4_STOP_FAILURE_STATES" :key="state.id" class="w46-danger">
      <strong>{{state.id}}</strong><span>{{state.label}}</span>
      <p>{{state.effect}}</p><small>{{state.action}}</small>
      <Button variant="outline" size="sm" disabled>操作禁用 · 等待服务端核验</Button>
     </article>
    </div>
    <small>安全状态说明：当前未收到真实 REVOKED / 过期 / 预算不足事件，不将演示状态冒充线上告警。</small>
   </div>
   <div v-else-if="activeWorkspace==='SETTINGS'" class="w46-settings" data-test="w46-settings-nine">
    <label class="w46-settings-mobile" for="w46-settings-picker">设置分类 · 共 9 项
     <select id="w46-settings-picker" v-model="settingCategory" aria-label="选择设置分类">
      <option v-for="item in R4_SETTINGS_CATEGORIES" :key="item.id" :value="item.id">{{item.label}}</option>
     </select>
    </label>
    <nav class="w46-settings-nav" aria-label="R4 设置九分类">
      <Button v-for="item in R4_SETTINGS_CATEGORIES" :key="item.id" size="sm"
       :data-test="'settings-'+item.id" :aria-pressed="settingCategory===item.id"
       :variant="settingCategory===item.id?'secondary':'ghost'" @click="settingCategory=item.id">
       {{item.label}}
      </Button>
    </nav>
    <div class="w46-settings-main">
     <h3>{{category.label}}</h3><p class="w46-note">当前没有可用的已授权设置写接口。本分类仅显示可信只读状态。</p>
     <div class="w46-status-grid">
    <div><strong>Web/API</strong><span>{{snapshot?.runtimeSha?.slice(0,12)||'不可用'}}</span></div>
    <div><strong>可信会话</strong><span>{{snapshot?.trustedSession?'已验证':'未建立'}}</span></div>
    <div><strong>账号连接</strong><span>{{readonlyAccount}}</span></div>
    <div><strong>发送资格</strong><span>禁用 · W25 独立审批</span></div>
     </div>
     <div v-if="settingCategory==='accounts'" class="w46-auth-summary" data-test="w46-chatgpt-auth">
      <h3>ChatGPT 官方授权</h3>
      <p>ChatGPT 身份：未授权 · 套餐权益：未核验 · 模型费用资格：未核验。</p>
      <Button disabled variant="outline" size="sm">使用 ChatGPT 登录 · 未接入官方授权</Button>
     </div>
     <div v-if="settingCategory==='diagnostics'||settingCategory==='privacy'" class="w46-danger-grid" data-test="w46-diagnostics-failclosed">
      <div v-for="item in R4_STOP_FAILURE_STATES" :key="item.id" class="w46-danger">
       <strong>{{item.id}}</strong><p>{{item.effect}}</p>
       <span>未取得该状态的授权来源，此处仅定义禁用规则</span>
      </div>
     </div>
    </div>
   </div>
   <div v-else class="w46-blank">
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
</style>
