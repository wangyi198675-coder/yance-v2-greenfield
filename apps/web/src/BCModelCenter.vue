<script setup>
import {ref,computed,watch,onMounted} from 'vue';
import BCNativeCloudKeySettings from './BCNativeCloudKeySettings.vue';
import BCOfficialChatGPTConnect from './BCOfficialChatGPTConnect.vue';
// Presentation and thin adapter ONLY. Canonical model selection is W47/W43/W55,
// never the forbidden custom per-function routing JSON registry.
const props=defineProps({webCsrf:{type:String,default:''},fetchImpl:{type:Function,default:null},active:{type:Boolean,default:false}});
const FUNCTIONS=Object.freeze([
 ['PRIVATE_BRAIN','闺蜜大脑','复用现有 Agno 私人会话的真实模型选择'],
 ['TRANSLATE','翻译','现有翻译执行 Owner；尚无逐功能模型选择授权'],
 ['REPLY_SUGGESTIONS','回复建议','沿用已有回复建议执行能力'],
 ['RELATIONSHIP_SUMMARY','关系总结','沿用已有关系/记忆 Owner'],
 ['EXPERT_TASKS','专家任务','沿用既有 Agno 专家与工具'],
 ['MEDIA_UNDERSTANDING','媒体理解','以原媒体能力与模型资格为准'],
 ['AUTOPILOT','自动托管','沿用当前授权、预算和托管执行 Owner']
]);
const PROVIDERS=Object.freeze({
 OPENROUTER_USER_API:'OpenRouter',OPENAI_USER_API:'OpenAI API',
 LLAMACPP_LOCAL_QWEN3_8B_FREE:'本地 Qwen3',CHATGPT_PLAN_SIWC:'ChatGPT 官方账号'
});
const tab=ref('overview'),busy=ref(false),saving=ref(false),status=ref('idle');
const message=ref(''),error=ref(''),lastCheck=ref('');
const modelConfig=ref(null),cloudKeys=ref(null),keysVerified=ref(false);
const selected=ref(''),costApproved=ref(false),stale=ref(true);
let requestId=0;
const csrfOk=computed(()=>/^[a-f0-9]{64}$/.test(props.webCsrf||''));
const isAuthoritative=computed(()=>modelConfig.value?.authoritative===true&&modelConfig.value?.ok===true);
const models=computed(()=>isAuthoritative.value&&Array.isArray(modelConfig.value.models)
 ?modelConfig.value.models.filter(x=>x&&x.configured===true&&x.available===true&&typeof x.provider==='string'&&typeof x.modelId==='string'):[]);
const currentProvider=computed(()=>isAuthoritative.value?modelConfig.value.selectedProvider||'':'');
const currentModel=computed(()=>isAuthoritative.value?modelConfig.value.selectedModelId||'':'');
const localModels=computed(()=>models.value.filter(m=>m.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'));
const cloudModels=computed(()=>models.value.filter(m=>['OPENROUTER_USER_API','OPENAI_USER_API'].includes(m.provider)));
const selectedModel=computed(()=>models.value.find(m=>m.provider+'|'+m.modelId===selected));
const keyProviders=computed(()=>keysVerified.value&&Array.isArray(cloudKeys.value?.providers)?cloudKeys.value.providers:[]);
const keyStatus=p=>{
 if(!keysVerified.value)return cloudKeys.value?'上次状态，未核验':'未取得状态';
 const x=keyProviders.value.find(x=>x.provider===p);
 return !x?'未确认':x.configured===true?'已保存 · rev '+x.revision:x.revoked===true?'已撤销':'未配置';
};
const providerName=p=>PROVIDERS[p]||'未知来源';
const friendly=e=>{
 const msg=String(e?.message||e);const code=/HTTP_(\d+)/.exec(msg)?.[1];
 return code==='401'?'当前私人会话未授权，请进入闺蜜大脑自动建立本机私人会话':
 code==='403'?'权限校验失败：当前会话或 CSRF 未获服务端认可':
 code==='409'?'原生模型版本已变化，请刷新后重新选择':
 code==='503'?'原生模型执行/凭据 Owner 尚未接通':
 '状态未能从原生服务端确认；已保留上次结果';
};
async function request(path,opt={}){
 const result=await (props.fetchImpl||globalThis.fetch)(path,{
  credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...opt});
 if(!result?.ok)throw Error('HTTP_'+(result?.status||'UNAVAILABLE'));
 return result.json();
}
async function refresh(){
 const ticket=++requestId;busy.value=true;status.value='checking';message.value='正在读取原生模型与密钥状态…';error.value='';
 const reads=await Promise.allSettled([
  request('/api/v2/private-brain/model-config'),
  request('/api/v2/private-brain/cloud-keys')
 ]);
 if(ticket!==requestId)return;
 const model=reads[0],key=reads[1];
 if(model.status==='fulfilled'&&model.value?.ok===true){
  modelConfig.value=model.value;
  stale.value=model.value.authoritative!==true;
  if(model.value.authoritative===true){
   const exact=(model.value.selectedProvider||'')+'|'+(model.value.selectedModelId||'');
   selected.value=models.value.some(m=>m.provider+'|'+m.modelId===exact)?exact:'';
  }
 }else stale.value=true;
 keysVerified.value=key.status==='fulfilled'&&key.value?.ok===true&&key.value?.credentialValueReturned===false;
 if(keysVerified.value)cloudKeys.value=key.value;
 const errs=reads.filter(x=>x.status==='rejected').map(x=>friendly(x.reason));
 status.value=errs.length?'partial':'ready';
 error.value=[...new Set(errs)].join('；');
 lastCheck.value=new Date().toLocaleTimeString();
 message.value=errs.length?'部分原生状态不可用；旧显示不会当作现时有效状态':'原生状态已重新读取';
 busy.value=false;
}
async function saveBrainModel(){
 if(saving.value||busy.value||stale.value||!isAuthoritative.value||!csrfOk.value||!selectedModel.value)return;
 const m=selectedModel.value,charge=['OPENROUTER_USER_API','OPENAI_USER_API'].includes(m.provider);
 if(charge&&!costApproved.value){message.value='云端 API 模型必须先确认可能产生费用';return}
 saving.value=true;message.value='正在写入现有 W47 模型配置并读回确认…';error.value='';
 try{
  const body={provider:m.provider,modelId:m.modelId,...(charge?{confirmPaidCost:true}:{})};
  const write=await request('/api/v2/private-brain/model-selection',{
   method:'POST',headers:{'content-type':'application/json','x-yance-csrf':props.webCsrf},
   body:JSON.stringify(body)
  });
  if(write?.ok!==true||write?.authoritative!==true||write?.canSend!==false)throw Error('WRITE_NOT_CONFIRMED');
  const after=await request('/api/v2/private-brain/model-config');
  if(after?.ok!==true||after?.authoritative!==true||after?.selectedProvider!==m.provider||
   after?.selectedModelId!==m.modelId||after?.canSend!==false)throw Error('READBACK_MISMATCH');
  modelConfig.value=after;stale.value=false;costApproved.value=false;
  message.value='闺蜜大脑模型已由原生服务端保存并读回确认';
 }catch(e){stale.value=true;error.value=friendly(e);message.value='保存结果未经确认，请刷新检查，不会假报成功'}
 finally{saving.value=false}
}
watch(()=>props.active,v=>{if(v)void refresh()});
watch(()=>props.webCsrf,()=>{if(props.active)void refresh()});
onMounted(()=>{if(props.active)void refresh()});
</script>
<template>
 <section class="model-center" data-test="ai-model-center">
  <header class="mc-top">
   <div><h2>AI 模型中心</h2><p>一个入口管理模型来源、私人会话模型与真实连接状态。</p></div>
   <button type="button" data-test="model-center-refresh" :disabled="busy" @click="refresh">刷新状态</button>
  </header>
  <div class="mc-cards">
   <article><span>闺蜜大脑当前模型</span><strong>{{currentModel||'尚未确认'}}</strong><small>{{providerName(currentProvider)}}</small></article>
   <article><span>云端密钥</span><strong>{{keyStatus('OPENROUTER_USER_API')}}</strong><small>OpenAI：{{keyStatus('OPENAI_USER_API')}}</small></article>
   <article><span>本地 Qwen3</span><strong>{{isAuthoritative?(localModels.length?'候选可用':'未确认在线'):'未验证'}}</strong><small>只有原生资格回读可确认连接</small></article>
   <article><span>V-Claw 第三方 API</span><strong>协议候选 · 未授权</strong><small>发现 /v1/models 鉴权；未验证真实推理</small></article>
  </div>
  <p class="mc-status" data-test="model-center-status" role="status">
   <b>{{busy?'正在核对':stale?'状态未核验':'原生状态已确认'}}</b> {{message}}
   <span v-if="error">{{error}}</span><small v-if="lastCheck">检查于 {{lastCheck}}</small>
  </p>
  <nav class="mc-tabs">
   <button type="button" :class="{active:tab==='overview'}" data-test="model-tab-overview" @click="tab='overview'">总览</button>
   <button type="button" :class="{active:tab==='routes'}" data-test="model-tab-routes" @click="tab='routes'">模型选择</button>
   <button type="button" :class="{active:tab==='providers'}" data-test="model-tab-providers" @click="tab='providers'">来源与密钥</button>
  </nav>
  <section v-show="tab==='overview'" class="mc-routes">
   <h3>项目功能与模型状态</h3>
   <p>各项功能继续使用原生执行 Owner；不另建七套模型路由器。</p>
   <div class="mc-route" v-for="f in FUNCTIONS" :key="f[0]">
    <div><strong>{{f[1]}}</strong><small>{{f[2]}}</small></div>
    <span>{{f[0]==='PRIVATE_BRAIN'?currentModel||'未确认':'当前未提供独立模型选择'}}</span>
    <button type="button" :disabled="f[0]!=='PRIVATE_BRAIN'" @click="tab='routes'">{{f[0]==='PRIVATE_BRAIN'?'选择模型':'待原生接线'}}</button>
   </div>
  </section>
  <section v-show="tab==='routes'" class="mc-selection" data-test="model-routing-editor">
   <h3>闺蜜大脑 · 原生模型选择</h3>
   <p>当前由 W47/W43 和现有 Agno 负责真正执行，不额外保存自建 JSON 模型路由。</p>
   <label>模型来源与型号
    <select v-model="selected" data-test="route-model-select" :disabled="busy||saving||stale||!isAuthoritative||!csrfOk">
     <option value="">请选择原生已授权模型</option>
     <option v-for="m in models" :key="m.provider+'|'+m.modelId" :value="m.provider+'|'+m.modelId">
      {{providerName(m.provider)}} · {{m.modelId}}
     </option>
    </select>
   </label>
   <p class="mc-note" v-if="!isAuthoritative">当前没有取得原生模型配置权威回读，不能提交变更。</p>
   <p class="mc-note">翻译、回复建议、专家及自动托管的专属模型切换需要各自原生执行接口；不把偏好选项冒充真实执行。</p>
   <label v-if="selectedModel&&['OPENROUTER_USER_API','OPENAI_USER_API'].includes(selectedModel.provider)" class="mc-check">
    <input type="checkbox" v-model="costApproved" data-test="route-cost-confirm"/>我确认该云端模型可能产生 API 费用；此操作只设置模型，不会发出推理请求。
   </label>
   <button type="button" class="mc-primary" data-test="route-save" :disabled="busy||saving||stale||!isAuthoritative||!csrfOk||!selectedModel" @click="saveBrainModel">
    {{saving?'正在回读…':'保存并验证'}}
   </button>
  </section>
  <section v-show="tab==='providers'" class="mc-providers" data-test="model-providers">
   <article><h3>ChatGPT 官方账号</h3><p>账号连接与 API 密钥独立。</p>
    <BCOfficialChatGPTConnect :fetch-impl="fetchImpl"/></article>
   <article><h3>云端 API 密钥</h3><p>沿用 W55 本机安全保管与原生同源接口。</p>
    <BCNativeCloudKeySettings v-if="csrfOk" :web-csrf="webCsrf" @changed="refresh"/>
    <p v-else>私人会话未授权，不能保存密钥。请先进入闺蜜大脑建立会话。</p>
   </article>
   <article><h3>本地模型</h3><p v-if="!isAuthoritative">尚未验证原生 Qwen3 服务状态</p>
    <p v-else-if="!localModels.length">原生模型目录未确认可用 Qwen3</p>
    <p v-for="m in localModels" :key="m.modelId">{{m.modelId}}</p>
    <button type="button" @click="refresh">重新检测</button></article>
   <article><h3>V-Claw 第三方 API</h3>
    <p>候选地址：https://token.v-claw.org/v1</p>
    <p data-test="vclaw-pending">/v1/models 未携带密钥返回 401。真实 Key 鉴权、模型能力、计费与工具调用尚未验收；此处不会接收或保存密钥。</p>
    <a href="https://token.v-claw.org/keys" target="_blank" rel="noopener noreferrer">打开密钥管理</a></article>
  </section>
  <p class="mc-foot">密钥已保存 ≠ 模型在线；模型已选择 ≠ 第三方推理已验证。所有真人发信继续由原发送授权独立控制。</p>
 </section>
</template>
<style scoped>
.model-center{color:inherit;display:grid;gap:15px;min-width:0;font-size:13px;--mc-line:color-mix(in srgb,currentColor 14%,transparent);--mc-panel:color-mix(in srgb,currentColor 6%,transparent)}
.mc-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.mc-top h2{margin:0 0 6px;font-size:22px}.mc-top p,.mc-foot,.mc-selection p,.mc-routes>p{opacity:.77;margin:0}.mc-top button,.mc-tabs button,.mc-route button,.mc-providers button,.mc-primary{font:inherit;cursor:pointer;border-radius:8px;padding:9px 12px;border:1px solid var(--mc-line);background:var(--mc-panel);color:inherit}.mc-top button:disabled,.mc-route button:disabled,.mc-primary:disabled{opacity:.5;cursor:not-allowed}
.mc-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.mc-cards article{background:var(--mc-panel);border:1px solid var(--mc-line);border-radius:12px;padding:13px;display:grid;gap:8px;min-height:105px;align-content:start}.mc-cards span,.mc-cards small{font-size:12px;opacity:.74}.mc-cards strong{font-size:15px;overflow-wrap:anywhere}.mc-status{display:flex;flex-wrap:wrap;gap:8px;padding:11px;border:1px solid var(--mc-line);border-radius:9px;margin:0;background:var(--mc-panel)}.mc-status span{color:#fbbf73}.mc-status small{margin-left:auto;opacity:.7}
.mc-tabs{display:flex;gap:6px;border-bottom:1px solid var(--mc-line);padding-bottom:9px}.mc-tabs .active{background:#2563c8;color:white;border-color:#6299ee}.mc-routes,.mc-selection{display:grid;gap:12px}.mc-routes h3,.mc-selection h3,.mc-providers h3{margin:0;font-size:16px}.mc-route{display:grid;grid-template-columns:minmax(140px,1.3fr) minmax(130px,1fr) auto;gap:12px;align-items:center;background:var(--mc-panel);padding:12px;border-radius:9px;border:1px solid var(--mc-line)}.mc-route>div{display:grid;gap:4px}.mc-route small{opacity:.65}.mc-route>span{opacity:.85}.mc-selection,.mc-providers>article{border:1px solid var(--mc-line);background:var(--mc-panel);padding:18px;border-radius:12px}.mc-selection label{display:grid;gap:8px}.mc-selection select{min-width:0;width:100%;padding:11px;border:1px solid var(--mc-line);background:var(--mc-panel);color:inherit;border-radius:8px}.mc-selection .mc-check{display:flex;align-items:center;gap:8px}.mc-primary{background:#2469d8;color:white;width:max-content}.mc-note{padding:10px;border-radius:8px;border:1px solid var(--mc-line)}.mc-providers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mc-providers>article{display:grid;gap:13px;align-content:start;min-width:0}.mc-providers>article p{margin:0;overflow-wrap:anywhere}.mc-foot{font-size:12px;padding-bottom:6px}
@media(max-width:950px){.mc-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.mc-providers{grid-template-columns:1fr}}@media(max-width:620px){.mc-cards{grid-template-columns:1fr}.mc-route{grid-template-columns:1fr 1fr}.mc-route button{grid-column:2}.mc-top{flex-wrap:wrap}.mc-tabs{overflow:auto}}
</style>