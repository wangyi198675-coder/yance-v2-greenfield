<script setup>
import {ref,watch,computed,nextTick} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import BCPrivateBrainWorkspace from './BCPrivateBrainWorkspace.vue';
import BCLiveChatWorkspace from './BCLiveChatWorkspace.vue';
import BCChannelAccountSetup from './BCChannelAccountSetup.vue';
import BCNativeHostSession from './BCNativeHostSession.vue';
import {WORKSPACES,CHANNELS,R4_SETTINGS_CATEGORIES,R4_STOP_FAILURE_STATES,
 readWorkspaceSnapshot,explainCapability} from './product-workspace-contract.mjs';
const props=defineProps({
 activeWorkspace:{type:String,default:'CHAT'},
 enabled:{type:Boolean,default:false},
 fetchImpl:{type:Function,default:null},
 appearance:{type:String,default:'dark'},
 theme:{type:String,default:'Obsidian Lime'}
});
const emit=defineEmits(['select','toggle-theme','cycle-theme']);
const compactInfo=ref(false);
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
defineExpose({refresh});
</script>
<template>
 <div v-if="enabled" class="w46-product-candidate" :data-mode="appearance" :data-active-workspace="activeWorkspace" data-test="w46-product-candidate">
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
    <Button size="sm" variant="ghost" data-test="w46-theme" :title="'主题：'+theme" @click="emit('cycle-theme')">◐</Button>
    <Button size="sm" variant="ghost" data-test="w46-appearance" :title="appearance==='dark'?'切换浅色':'切换深色'" @click="emit('toggle-theme')">{{appearance==='dark'?'☀':'☾'}}</Button>
    <Button size="sm" variant="ghost" data-test="w46-info" aria-label="查看服务状态" @click="compactInfo=!compactInfo">ⓘ</Button>
   </div>
   <div v-if="menuOpen" class="w46-workspace-menu" data-test="workspace-mobile-list">
    <Button v-for="item in WORKSPACES.filter(i=>!['CHAT','BRAIN','AUTOPILOT'].includes(i.id))" :key="item.id" size="sm" variant="ghost" :data-test="'workspace-'+item.id" @click="choose(item.id)">{{item.label}}</Button>
   </div>
  </header>
  <div v-if="compactInfo||error" class="w46-compact-status" data-test="w46-trusted-status" role="status">
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
   <BCLiveChatWorkspace v-show="activeWorkspace==='CHAT'" :fetch-impl="fetchImpl" @navigate="choose"/>
   <div v-if="activeWorkspace==='ACCOUNTS'" class="w46-channel-grid" aria-label="四渠道真实授权回读">
    <BCChannelAccountSetup v-for="channel in CHANNELS" :key="channel.id"
     :channel="channel" :fetch-impl="fetchImpl"/>
    <p class="w46-note">R4 四平台品牌 SVG 路径来源已校验；平台连接须取得各原生渠道授权回读。</p>
    <div class="w46-account-summary" data-test="w46-multi-account">
     <strong>多账号管理 · 已验证账号 {{readonlyAccount}}</strong>
     <p>同一渠道可独立绑定多个账号，当前全部未授权。账号列表仅能由可信原生服务返回。</p>
     <p>Messenger · mautrix-meta | Page · Pancake | WhatsApp · Baileys | Telegram · TDLib JSON</p>
     <p>点击上方「准备官方授权」从 W47 正式服务获取上游步骤。没有原生签署结果时不会显示已连接。</p>
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
   <div v-else-if="activeWorkspace==='PERSONA'" class="w46-native-catalog" data-test="w46-persona-studio">
     <header><h2>人格 Studio</h2><small>真实学习与审批待接线</small></header>
     <div class="w46-persona-panel"><strong>规则与历史版本</strong><p>等待 W43/W45 提供原生规则、学习历史和版本状态，不显示虚构规则。</p>
      <div class="w46-native-actions"><Button disabled size="sm">批准规则 · 暂未接通</Button><Button disabled size="sm">暂停</Button><Button disabled size="sm">撤销</Button><Button disabled size="sm">版本回滚</Button></div>
     </div>
   </div>
   <div v-else-if="activeWorkspace==='TASKS'" class="w46-native-catalog" data-test="w46-tools-experts">
    <header><h2>工具与任务</h2><small>唯一 Agno 工具、运行和专家</small></header>
    <details class="w46-native-panel"><summary>专家中心 · 十类设计候选</summary>
     <p>原 W43 专家注册与联系人作用域尚未返回可核验清单，当前不可调用。</p>
     <div class="w46-experts-grid">
      <div v-for="name in ['人格与真人表达专家','德国 WhatsApp 自然聊天专家','欧洲语言文化专家','长期关系记忆专家','聊天目标规划专家','回复质量成长专家','多媒体对话专家','系统健康安全专家','开源能力发现专家','安全修复升级专家']" :key="name" class="w46-expert-item"><strong>{{name}}</strong><small>待W43核实安装与授权</small></div>
     </div>
    </details>
    <details class="w46-native-panel"><summary>工具运行 / Skills / MCP / Trace</summary><p>尚无此工作区经服务端签署的任务与运行回读，不模拟执行成功。</p></details>
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
     <BCNativeHostSession v-if="settingCategory==='diagnostics'" :fetch-impl="fetchImpl"/>
     <div v-if="settingCategory==='diagnostics'||settingCategory==='privacy'" class="w46-danger-grid" data-test="w46-diagnostics-failclosed">
      <div v-for="item in R4_STOP_FAILURE_STATES" :key="item.id" class="w46-danger">
       <strong>{{item.id}}</strong><p>{{item.effect}}</p>
       <span>未取得该状态的授权来源，此处仅定义禁用规则</span>
      </div>
     </div>
    </div>
   </div>
   <div v-else-if="activeWorkspace==='BRAIN'" class="w46-brain-one" data-test="w46-brain-one">
    <BCPrivateBrainWorkspace :fetch-impl="fetchImpl"/>
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
.w46-compact-global{position:relative;display:flex;flex:0 0 48px;align-items:center;gap:10px;padding:0 13px;min-height:48px;max-height:48px;z-index:45;background:linear-gradient(115deg,rgba(var(--accent-rgb),.095),transparent 52%),var(--bg2);border-bottom:1px solid var(--border)}
.w46-compact-brand{display:flex;align-items:center;gap:7px;white-space:nowrap;margin-right:4px}.w46-brand-glyph{display:grid;place-items:center;width:29px;height:29px;border-radius:10px;font-size:16px;font-weight:800;color:var(--accent-ink);background:var(--accent);box-shadow:0 0 18px rgba(var(--accent-rgb),.22)}.w46-compact-brand strong{font-size:15px;letter-spacing:-.04em}
.w46-main-links{display:flex;min-width:0;align-items:center;gap:3px;flex:1}.w46-main-links button{flex-shrink:0;border-radius:9px}.w46-global-tools{display:flex;align-items:center;gap:2px;flex:0 0 auto}.w46-global-tools button{min-width:29px;padding:6px!important}
.w46-compact-global .w46-workspace-menu{position:absolute;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;top:calc(100% - 1px);left:135px;z-index:100;width:min(360px,calc(100vw - 22px));padding:12px;border:1px solid var(--border);border-radius:13px;background:var(--surface-raised);box-shadow:0 18px 42px #0008}
.w46-compact-status{display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);flex-shrink:0}.w46-compact-status span{flex:1}
.w46-candidate-content{padding:0!important;gap:0!important;display:flex!important;flex-direction:column!important;flex:1 1 0;min-height:0!important;overflow:hidden!important}
.w46-workspace-intro{display:none!important}
.w46-candidate-content>.bc-real-chat,.w46-candidate-content>.w46-brain-one{min-height:0;flex:1 1 0}
.w46-brain-one{display:flex;min-height:0;padding:10px 12px}
.w46-workspace-auth{display:none!important}
.w46-native-catalog{display:grid;align-content:start;gap:12px;flex:1;overflow:auto;padding:16px clamp(12px,3vw,28px)}
.w46-native-catalog header{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}.w46-native-catalog h2{font-size:18px;margin:0}.w46-native-catalog small{color:var(--muted)}
.w46-persona-panel,.w46-native-panel{display:grid;gap:12px;max-width:1100px;border:1px solid var(--border);border-radius:15px;padding:16px;background:var(--bg2)}
.w46-native-actions{display:flex;flex-wrap:wrap;gap:8px}.w46-native-actions button:disabled{opacity:.62}
.w46-experts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:8px}.w46-expert-item{display:grid;gap:5px;border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--surface)}
.w46-native-panel summary{cursor:pointer}.w46-native-catalog p{font-size:12px;color:var(--muted);margin:0}
.w46-candidate-content>.w46-operator-grid,.w46-candidate-content>.w46-channel-grid,.w46-candidate-content>.w46-settings,.w46-candidate-content>.w46-blank{padding:16px;overflow:auto;min-height:0}
@media(max-width:719px){.w46-compact-global{padding:0 7px;gap:4px}.w46-compact-brand strong{display:none}.w46-brand-glyph{height:27px;width:27px}.w46-main-links{gap:0}.w46-main-links button{font-size:11px;padding:7px 6px!important}.w46-global-tools button{padding:5px!important;min-width:26px}.w46-compact-global .w46-workspace-menu{left:7px}.w46-brain-one{padding:7px}}
@media(max-width:360px){.w46-main-links button{font-size:10px;padding:6px 4px!important}.w46-global-tools{gap:0}.w46-compact-brand{margin:0}}
@media(prefers-reduced-motion:reduce){.w46-brand-glyph{box-shadow:none}}
</style>
