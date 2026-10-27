<script setup>
import {ref,watch,computed,nextTick} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
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
const compactInfo=ref(false);
const snapshot=ref(null),error=ref('尚未连接真实运行环境'),loading=ref(false);
const menuOpen=ref(false);
const channelDetailsOpen=ref(false);
const contentScroller=ref(null);
const settingCategory=ref('general');
// Design tabs are navigation only until authoritative Persona/Expert APIs are signed.
const personaTab=ref('pending'),expertTab=ref('experts');
const personaModal=ref(null);
// UI-only reference examples from the user-approved R4 design, never PersonaPolicy facts.
const personaExamples=Object.freeze([
 {title:'自然、成熟、简短表达',description:'建议规则 · 来源待核验',symbol:'✦'},
 {title:'忠于用户本人事实',description:'联系人推断不能变成本人事实',symbol:'◈'},
 {title:'跨会话表达偏好',description:'可暂停、撤销及恢复到先前版本',symbol:'↗'}
]);
function showPersonaDetail(kind,index=null){personaModal.value={kind,index}}
function closePersonaDetail(){personaModal.value=null}
const personaTabs=Object.freeze([{id:'pending',label:'待审规则'},{id:'current',label:'当前人格'},{id:'versions',label:'版本'}]);
const expertTabs=Object.freeze([{id:'experts',label:'专家 10'},{id:'tasks',label:'任务'},{id:'skills',label:'Skills / MCP'}]);
const designExpertCatalog=Object.freeze(['人格与真人表达专家','德国 WhatsApp 自然聊天专家','欧洲语言文化专家','长期关系记忆专家','聊天目标规划专家','回复质量成长专家','多媒体对话专家','系统健康安全专家','开源能力发现专家','安全修复升级专家']);
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
  <div v-if="compactInfo||(error&&activeWorkspace!=='CHAT')" class="w46-compact-status" data-test="w46-trusted-status" role="status">
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
     <strong>连接社交账号</strong>
     <div class="w46-r4-channel-actions">
      <span class="w46-r4-channel-count" data-test="w46-authoritative-account-count">{{snapshot?.trustedSession?'已验证账号 '+readonlyAccount:'账号状态待验证'}}</span>
      <button type="button" class="w46-r4-channel-details-toggle" data-test="w46-channel-details-toggle"
       :aria-expanded="channelDetailsOpen" aria-controls="w46-channel-details"
       @click="channelDetailsOpen=!channelDetailsOpen">{{channelDetailsOpen?'收起详情':'账号详情'}} <span aria-hidden="true">{{channelDetailsOpen?'⌃':'⌄'}}</span></button>
     </div>
    </header>
    <div class="w46-r4-channel-grid" data-test="w46-channel-grid" aria-label="四平台原生连接入口">
     <BCChannelAccountSetup v-for="channel in CHANNELS" :key="channel.id"
      :channel="channel" :fetch-impl="fetchImpl"/>
    </div>
    <section v-if="channelDetailsOpen" id="w46-channel-details" class="w46-r4-channel-details"
     data-test="w46-multi-account" role="region" aria-label="账号连接详情">
     <strong>账号连接状态</strong>
     <p>{{snapshot?.trustedSession?'已建立本机会话，连接账号仍以每个平台原生状态回读为准。':'尚未建立可验证的本机会话。请在对应平台通过本人官方流程完成授权。'}}</p>
     <p>多个账号及授权范围需由原生服务提供真实记录；尚无权威账号列表时不展示示例账号。</p>
    </section>
   </section>
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
   <section v-else-if="activeWorkspace==='PERSONA'" class="w46-r4-feature w46-r4-persona" data-test="w46-persona-studio">
    <header class="w46-r4-feature-toolbar" data-test="w46-persona-toolbar">
     <div class="w46-r4-feature-title"><strong>人格与学习</strong><small>规则 · 记忆 · 版本</small></div>
     <nav class="w46-r4-feature-tabs" aria-label="人格与学习">
      <button v-for="tab in personaTabs" :key="tab.id" type="button" :class="{active:personaTab===tab.id}" :aria-pressed="personaTab===tab.id" :data-test="'w46-persona-tab-'+tab.id" @click="personaTab=tab.id">{{tab.label}}</button>
      <button type="button" class="w46-persona-learning-status" data-test="w46-persona-learning-status" @click="showPersonaDetail('learning')">学习状态 <span aria-hidden="true">ⓘ</span></button>
     </nav>
    </header>
    <div class="w46-r4-feature-body w46-r4-persona-layout">
     <section class="w46-r4-feature-card" data-test="w46-persona-main-card">
      <div class="w46-r4-card-head">
       <strong>{{personaTab==='pending'?'待审规则 · 设计示例':personaTab==='current'?'当前人格':'版本历史'}}</strong>
       <span class="w46-persona-approval-status">{{personaTab==='pending'?'未执行审批':'来源待核验'}}</span>
      </div>
      <div v-if="personaTab==='pending'" class="w46-persona-design-list" data-test="w46-persona-design-list">
       <div v-for="(rule,index) in personaExamples" :key="rule.title" class="w46-persona-design-row" :data-test="'w46-persona-rule-example-'+index">
        <span class="w46-persona-example-icon" aria-hidden="true">{{rule.symbol}}</span>
        <div class="w46-persona-example-copy"><strong>{{rule.title}}</strong><small>{{rule.description}}</small></div>
        <button type="button" class="w46-persona-small-action" :data-test="'w46-persona-rule-view-'+index" @click="showPersonaDetail('rule',index)">查看</button>
       </div>
       <p class="w46-persona-design-note" role="status" data-test="w46-persona-source-hold">仅展示设计中的规则入口，审批、版本与学习必须连接已有服务端并经过真实读回。</p>
      </div>
      <div v-else class="w46-r4-feature-empty" role="status" data-test="w46-persona-source-hold">
       <strong>{{personaTab==='current'?'当前人格版本尚未取得权威回读':'尚无经核验的历史版本'}}</strong>
       <p>本人事实、联系人推断和学习建议必须由原W43/W45权威来源分别核实；此处不把设计示例当作真实历史。</p>
      </div>
     </section>
     <aside class="w46-r4-feature-card w46-r4-details" data-test="w46-persona-details-card">
      <div class="w46-r4-card-head">
       <strong>人格版本与控制</strong>
       <button type="button" class="w46-persona-details-link" data-test="w46-persona-details-open" @click="showPersonaDetail('version')">详情</button>
      </div>
      <p>已生效版本、规则来源、冲突、撤回和回滚在这里按需展示。</p>
      <p>原R4中的技术状态面板与大幅说明文字不长期占据核心操作区域。</p>
      <button type="button" class="w46-persona-details-button" data-test="w46-persona-rule-details" @click="showPersonaDetail('version')">打开规则详情</button>
     </aside>
    </div>
    <div v-if="personaModal" class="w46-persona-modal-mask" data-test="w46-persona-example-details" @click.self="closePersonaDetail">
     <section class="w46-persona-modal" role="dialog" aria-modal="true" aria-labelledby="w46-persona-modal-title">
      <header><strong id="w46-persona-modal-title">{{personaModal.kind==='rule'?personaExamples[personaModal.index]?.title:personaModal.kind==='learning'?'学习状态':'人格版本与规则详情'}}</strong>
       <button type="button" data-test="w46-persona-detail-close" aria-label="关闭详情" @click="closePersonaDetail">关闭</button>
      </header>
      <div class="w46-persona-modal-body">
       <span class="w46-persona-approval-status">设计示例 · 未执行审批</span>
       <p v-if="personaModal.kind==='rule'">{{personaExamples[personaModal.index]?.description}}</p>
       <p v-else-if="personaModal.kind==='learning'">学习状态尚未获得服务端有效版本、授权范围和历史事件回读，此处仅显示设计中的状态入口，未开启学习。</p>
       <p v-else>已生效版本、规则来源、冲突、撤回和回滚须由原W43/W45及版本授权接口真实读回。当前没有可核验的规则详情或版本操作。</p>
       <p class="w46-persona-modal-caution">该内容为只读界面示例，并非真实已批准规则、持久记忆或已完成的版本变更。</p>
      </div>
     </section>
    </div>
   </section>
   <section v-else-if="activeWorkspace==='TASKS'" class="w46-r4-feature" data-test="w46-tools-experts">
    <header class="w46-r4-feature-toolbar">
     <div class="w46-r4-feature-title"><strong>工具与任务</strong><small>已完成 ≠ 已启用</small></div>
     <nav class="w46-r4-feature-tabs" aria-label="工具与任务"><button v-for="tab in expertTabs" :key="tab.id" type="button" :class="{active:expertTab===tab.id}" :aria-pressed="expertTab===tab.id" :data-test="'w46-expert-tab-'+tab.id" @click="expertTab=tab.id">{{tab.label}}</button></nav>
    </header>
    <div class="w46-r4-feature-body w46-r4-expert-layout">
     <section class="w46-r4-feature-card">
      <div class="w46-r4-card-head"><strong>{{expertTab==='experts'?'专家目录 · 十类设计候选':expertTab==='tasks'?'任务与运行':'Skills / MCP'}}</strong><small>待W43核实安装与授权</small></div>
      <div v-if="expertTab==='experts'" class="w46-r4-expert-list" data-test="w46-r4-expert-list">
       <div v-for="(name,index) in designExpertCatalog" :key="name" class="w46-r4-expert-row">
        <span class="w46-r4-expert-glyph" aria-hidden="true">{{index===0?'◈':index===8?'⌕':'✧'}}</span>
        <div><strong>{{name}}</strong><small>{{index===8?'原W43本地只读源码已接入；当前Web启用与权限尚未回读':'设计目录候选，尚无真实安装与执行资格'}}</small></div>
        <Button size="sm" variant="outline" disabled :title="'等待W43/W47原生身份及启用状态确认'">待核验</Button>
       </div>
      </div>
      <div v-else class="w46-r4-feature-empty"><strong>尚无经本机服务确认的{{expertTab==='tasks'?'任务执行记录':'Skills / MCP 能力'}}</strong><p>只能由原Agno工具、运行和Trace返回真实来源，未接通时不模拟结果。</p></div>
     </section>
     <aside class="w46-r4-feature-card w46-r4-details"><div class="w46-r4-card-head"><strong>任务与执行详情</strong><small>按需查看</small></div>
      <p>选择合法安装的专家或任务后，才显示Agno Run、Tool与Trace。未完成身份和能力签署前不允许调用。</p>
      <div class="w46-r4-feature-empty" role="status">已验证执行：暂无 · 授权范围：未获得原生回读</div>
     </aside>
    </div>
   </section>
   <BCSettingsWorkspace v-else-if="activeWorkspace==='SETTINGS'" :fetch-impl="fetchImpl"
    :active="activeWorkspace==='SETTINGS'" :theme="theme" :appearance="appearance"
    @navigate="choose" @cycle-theme="emit('cycle-theme')" @toggle-theme="emit('toggle-theme')"/>
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
</style>
