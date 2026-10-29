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
const vclawOpen=ref(false),localDetails=ref(false);
const vclawProof=ref({revision:0,state:'unknown',modelCount:0});
const message=ref(''),error=ref(''),lastCheck=ref('');
const modelConfig=ref(null),cloudKeys=ref(null),keysVerified=ref(false);
const selected=ref(''),costApproved=ref(false),stale=ref(true);
const directoryProvider=ref('OPENROUTER_USER_API'),catalogQuery=ref('');
const catalogPage=ref(0),catalogLoading=ref(false),catalogError=ref('');
const catalog=ref({models:[],total:0,revision:0});
const catalogChosen=ref(null);let catalogTicket=0;
let requestId=0;
const csrfOk=computed(()=>/^[a-f0-9]{64}$/.test(props.webCsrf||''));
const isAuthoritative=computed(()=>modelConfig.value?.authoritative===true&&modelConfig.value?.ok===true);
const models=computed(()=>isAuthoritative.value&&Array.isArray(modelConfig.value.models)
 ?modelConfig.value.models.filter(x=>x&&x.configured===true&&x.available===true&&typeof x.provider==='string'&&typeof x.modelId==='string'):[]);
const currentProvider=computed(()=>isAuthoritative.value?modelConfig.value.selectedProvider||'':'');
const currentModel=computed(()=>isAuthoritative.value?modelConfig.value.selectedModelId||'':'');
const localModels=computed(()=>models.value.filter(m=>m.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'));
const cloudModels=computed(()=>models.value.filter(m=>['OPENROUTER_USER_API','OPENAI_USER_API'].includes(m.provider)));
const catalogProviderReady=computed(()=>keyProviders.value.some(p=>
 p.provider===directoryProvider.value&&p.configured===true&&!p.revoked));
async function loadCatalog(page=0){
 const ticket=++catalogTicket;catalogLoading.value=true;catalogError.value='';
 const provider=directoryProvider.value;
 if(!catalogProviderReady.value){
  catalog.value={models:[],total:0,revision:0};
  catalogError.value='该供应商尚未保存有效密钥';
  catalogLoading.value=false;return;
 }
 try{
  const qs=new URLSearchParams({provider,q:catalogQuery.value.trim(),offset:String(page*40),limit:'40'});
  const payload=await request('/api/v2/private-brain/provider-models?'+qs.toString());
  if(ticket!==catalogTicket)return;
  if(!payload.ok||!payload.authoritative||!Array.isArray(payload.models)||
     payload.provider!==provider||payload.canSend!==false)throw Error('INVALID_DIRECTORY_RESPONSE');
  catalog.value=payload;catalogPage.value=page;
 }catch(e){
  if(ticket!==catalogTicket)return;
  catalog.value={models:[],total:0,revision:0};
  catalogError.value=friendly(e);
 }finally{if(ticket===catalogTicket)catalogLoading.value=false}
}
function selectCatalogModel(m){
 if(!m?.selectable||m.provider!=='OPENROUTER_USER_API')return;
 catalogChosen.value=m;selected.value=m.provider+'|'+m.modelId;
 costApproved.value=false;
}
const vclawStatus=computed(()=>{
 if(!keysVerified.value)return '状态未核验';
 const p=keyProviders.value.find(x=>x.provider==='VCLAW_USER_API');
 if(!p||['KEY_SOURCE_UNAVAILABLE','NATIVE_PROVIDER_NOT_CONNECTED'].includes(p.status))return '凭据服务不可用';
 if(!p.configured)return p.revoked?'已撤销':'未配置';
 if(vclawProof.value.revision!==p.revision)return '密钥已保存 · 验证中';
 if(vclawProof.value.state==='verified')return '已连接';
 if(vclawProof.value.state==='rejected')return '密钥无效 · 请更换';
 if(vclawProof.value.state==='unavailable')return '密钥已保存 · 暂无法验证';
 return '密钥已保存 · 验证中';
});
const selectedModel=computed(()=>models.value.find(m=>m.provider+'|'+m.modelId===selected.value)||
 (catalogChosen.value?.provider+'|'+catalogChosen.value?.modelId===selected.value?catalogChosen.value:null));
const keyProviders=computed(()=>keysVerified.value&&Array.isArray(cloudKeys.value?.providers)?cloudKeys.value.providers:[]);
const keyStatus=p=>{
 if(!keysVerified.value)return cloudKeys.value?'上次状态，未核验':'未取得状态';
 const x=keyProviders.value.find(x=>x.provider===p);
 return !x?'未确认':x.configured===true?'已连接':x.revoked===true?'已撤销':'未配置';
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
 // Verify the saved Key via current W47/W55 backend; the browser never sees it.
 const vc=keysVerified.value?key.value?.providers?.find(p=>p.provider==='VCLAW_USER_API'):null;
 vclawProof.value={revision:vc?.revision||0,state:vc?.configured?'checking':'unconfigured',modelCount:0};
 if(vc?.configured&&csrfOk.value){
  try{
   const proof=await request('/api/v2/private-brain/vclaw-verify',{
    method:'POST',headers:{'content-type':'application/json','x-yance-csrf':props.webCsrf},body:'{}'
   });
   if(ticket!==requestId)return;
   vclawProof.value={revision:vc.revision,
    state:proof?.ok===true&&proof?.verified===true&&proof?.revision===vc.revision&&
       proof?.canSend===false?'verified':'unavailable',
    modelCount:Number.isSafeInteger(proof?.modelCount)?proof.modelCount:0};
  }catch(e){
   if(ticket!==requestId)return;
   vclawProof.value={revision:vc.revision,
    state:String(e?.message||'').includes('HTTP_409')?'rejected':'unavailable',modelCount:0};
  }
 }
 const errs=reads.filter(x=>x.status==='rejected').map(x=>friendly(x.reason));
 status.value=errs.length?'partial':'ready';
 error.value=[...new Set(errs)].join('；');
 lastCheck.value=new Date().toLocaleTimeString();
 message.value=errs.length?'连接状态未确认':' ';
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
watch(tab,v=>{if(v==='routes')void loadCatalog(0)});
watch(()=>props.webCsrf,()=>{if(props.active)void refresh()});
onMounted(()=>{if(props.active)void refresh()});
</script>
<template>
 <section class="model-center" data-test="ai-model-center">
  <header class="mc-top">
   <div><h2>AI 模型中心</h2></div>
   <button type="button" data-test="model-center-refresh" :disabled="busy" @click="refresh">刷新状态</button>
  </header>
  <div class="mc-cards">
   <article><span>闺蜜大脑当前模型</span><strong>{{currentModel||'尚未确认'}}</strong><small>{{providerName(currentProvider)}}</small></article>
   <article><span>云端密钥</span><strong>{{keyStatus('OPENROUTER_USER_API')}}</strong><small>OpenAI：{{keyStatus('OPENAI_USER_API')}}</small></article>
   <article><span>本地 Qwen3</span><strong>{{isAuthoritative&&localModels.length?'已连接':'未连接'}}</strong><small>使用 W47 原生模型资格检测</small></article>
   <article><span>V-Claw</span><strong data-test="vclaw-summary-state">{{vclawStatus}}</strong><small>{{vclawStatus==='已连接'?('API 已验证 · '+vclawProof.modelCount+' 个模型'):'等待 API 验证'}}</small></article>
  </div>
  <p v-if="busy||error||status==='partial'" class="mc-status" data-test="model-center-status" role="status">
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

   <div class="mc-route" v-for="f in FUNCTIONS" :key="f[0]">
    <div><strong>{{f[1]}}</strong></div>
    <span>{{f[0]==='PRIVATE_BRAIN'?currentModel||'未确认':'当前未提供独立模型选择'}}</span>
    <button type="button" :disabled="f[0]!=='PRIVATE_BRAIN'" @click="tab='routes'">{{f[0]==='PRIVATE_BRAIN'?'选择模型':'待原生接线'}}</button>
   </div>
  </section>
  <section v-show="tab==='routes'" class="mc-selection" data-test="model-routing-editor">
   <div class="mc-directory" data-test="provider-model-directory">
    <div class="mc-directory-header">
     <div><h3>云端模型目录</h3><small>来自供应商实时目录；展示不代表已具备付费推理资格</small></div>
     <strong data-test="directory-count">{{catalogLoading?'读取中…':catalog.total+' 个模型'}}</strong>
    </div>
    <div class="mc-directory-filters">
     <select v-model="directoryProvider" data-test="directory-provider" @change="loadCatalog(0)" aria-label="模型供应商">
      <option value="OPENROUTER_USER_API">OpenRouter</option>
      <option value="VCLAW_USER_API">V-Claw</option>
     </select>
     <input v-model="catalogQuery" data-test="directory-search" type="search"
      placeholder="搜索模型名称或 ID（例如 GPT、Claude、Gemini）"
      @keydown.enter="loadCatalog(0)" aria-label="搜索模型"/>
     <button type="button" data-test="directory-search-button" :disabled="catalogLoading" @click="loadCatalog(0)">搜索</button>
    </div>
    <p v-if="catalogError" class="mc-directory-error" data-test="directory-error">{{catalogError}}</p>
    <div class="mc-directory-list" data-test="directory-results">
     <button v-for="m in catalog.models" :key="m.provider+'|'+m.modelId"
      type="button" class="mc-directory-model" :class="{chosen:selected===m.provider+'|'+m.modelId}"
      :disabled="!m.selectable||busy||saving" @click="selectCatalogModel(m)">
      <span><strong>{{m.name||m.modelId}}</strong><small>{{m.modelId}}</small></span>
      <small>{{m.selectable?'选择用于闺蜜大脑':'目录已连接 · 尚未开通执行'}}</small>
     </button>
     <p v-if="!catalogLoading&&!catalog.models.length&&!catalogError">此条件下没有可显示的模型</p>
    </div>
    <div class="mc-directory-pager">
     <span>第 {{catalogPage+1}} 页，每页最多 40 条</span>
     <button type="button" :disabled="catalogLoading||catalogPage===0" @click="loadCatalog(catalogPage-1)">上一页</button>
     <button type="button" :disabled="catalogLoading||(catalogPage+1)*40>=catalog.total" @click="loadCatalog(catalogPage+1)">下一页</button>
    </div>
    <p class="mc-directory-hint" v-if="directoryProvider==='VCLAW_USER_API'">V-Claw 的真实模型列表可以浏览；付费推理仍需原生 Agno/W43 执行授权完成后才能选择。不会伪装成已能发送。</p>
   </div>
   <h3>闺蜜大脑 · 原生模型选择</h3>

   <label>模型来源与型号
    <select v-model="selected" data-test="route-model-select" :disabled="busy||saving||stale||!isAuthoritative||!csrfOk">
     <option value="">请选择原生已授权模型</option>
     <option v-if="catalogChosen&&!models.some(m=>m.provider===catalogChosen.provider&&m.modelId===catalogChosen.modelId)" :value="catalogChosen.provider+'|'+catalogChosen.modelId">{{providerName(catalogChosen.provider)}} · {{catalogChosen.modelId}}</option>
     <option v-for="m in models" :key="m.provider+'|'+m.modelId" :value="m.provider+'|'+m.modelId">
      {{providerName(m.provider)}} · {{m.modelId}}
     </option>
    </select>
   </label>
   <p class="mc-note" v-if="!isAuthoritative">当前没有取得原生模型配置权威回读，不能提交变更。</p>

   <label v-if="selectedModel&&['OPENROUTER_USER_API','OPENAI_USER_API'].includes(selectedModel.provider)" class="mc-check">
    <input type="checkbox" v-model="costApproved" data-test="route-cost-confirm"/>我确认该云端模型可能产生 API 费用；此操作只设置模型，不会发出推理请求。
   </label>
   <button type="button" class="mc-primary" data-test="route-save" :disabled="busy||saving||stale||!isAuthoritative||!csrfOk||!selectedModel" @click="saveBrainModel">
    {{saving?'正在回读…':'保存并验证'}}
   </button>
  </section>
  <section v-show="tab==='providers'" class="mc-providers" data-test="model-providers">
   <article><BCOfficialChatGPTConnect :fetch-impl="fetchImpl"/></article>
   <article><BCNativeCloudKeySettings v-if="csrfOk" :web-csrf="webCsrf" @changed="refresh"/>
    <p v-else>私人会话未授权，不能保存密钥。请先进入闺蜜大脑建立会话。</p>
   </article>
   <article><h3>本地 Qwen3</h3>
    <strong>{{isAuthoritative&&localModels.length?'已连接':'未连接'}}</strong>
    <p v-if="localModels.length" v-for="m in localModels" :key="m.modelId">{{m.modelId}}</p>
    <div class="mc-source-actions"><button type="button" data-test="local-model-recheck" @click="refresh">重新检测</button><button type="button" data-test="local-model-details" @click="localDetails=!localDetails">{{localDetails?'收起':'原因'}}</button></div>
    <p v-if="localDetails" data-test="local-model-diagnostics">言策使用原生 llama.cpp（127.0.0.1:11605）。如服务已启动仍未连接，请检查 W47 模型鉴权和会话状态。</p></article>
   <article><h3>V-Claw</h3><strong data-test="vclaw-current-state">{{vclawStatus}}</strong>
    <button type="button" data-test="vclaw-manage-inline" @click="vclawOpen=!vclawOpen">{{vclawOpen?'收起':'管理密钥'}}</button>
    <div v-if="vclawOpen" data-test="vclaw-pending"><BCNativeCloudKeySettings v-if="csrfOk" :web-csrf="webCsrf" fixed-provider="VCLAW_USER_API" :external-status="vclawStatus" @changed="refresh"/><p v-else>请先建立本机私人会话。</p><small>V-Claw 密钥由原 W55 Windows 凭据保管。保存不等于接口鉴权或付费推理已经通过。</small></div></article>
  </section>

 </section>
</template>
<style scoped>
.model-center{color:inherit;display:grid;gap:15px;min-width:0;font-size:13px;--mc-line:color-mix(in srgb,currentColor 14%,transparent);--mc-panel:color-mix(in srgb,currentColor 6%,transparent)}
.mc-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.mc-top h2{margin:0 0 6px;font-size:22px}.mc-top p,.mc-foot,.mc-selection p,.mc-routes>p{opacity:.77;margin:0}.mc-top button,.mc-tabs button,.mc-route button,.mc-providers button,.mc-primary{font:inherit;cursor:pointer;border-radius:8px;padding:9px 12px;border:1px solid var(--mc-line);background:var(--mc-panel);color:inherit}.mc-top button:disabled,.mc-route button:disabled,.mc-primary:disabled{opacity:.5;cursor:not-allowed}
.mc-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.mc-cards article{background:var(--mc-panel);border:1px solid var(--mc-line);border-radius:12px;padding:13px;display:grid;gap:8px;min-height:105px;align-content:start}.mc-cards span,.mc-cards small{font-size:12px;opacity:.74}.mc-cards strong{font-size:15px;overflow-wrap:anywhere}.mc-status{display:flex;flex-wrap:wrap;gap:8px;padding:11px;border:1px solid var(--mc-line);border-radius:9px;margin:0;background:var(--mc-panel)}.mc-status span{color:#fbbf73}.mc-status small{margin-left:auto;opacity:.7}
.mc-tabs{display:flex;gap:6px;border-bottom:1px solid var(--mc-line);padding-bottom:9px}.mc-tabs .active{background:#2563c8;color:white;border-color:#6299ee}.mc-routes,.mc-selection{display:grid;gap:12px}.mc-routes h3,.mc-selection h3,.mc-providers h3{margin:0;font-size:16px}.mc-route{display:grid;grid-template-columns:minmax(140px,1.3fr) minmax(130px,1fr) auto;gap:12px;align-items:center;background:var(--mc-panel);padding:12px;border-radius:9px;border:1px solid var(--mc-line)}.mc-route>div{display:grid;gap:4px}.mc-route small{opacity:.65}.mc-route>span{opacity:.85}.mc-selection,.mc-providers>article{border:1px solid var(--mc-line);background:var(--mc-panel);padding:18px;border-radius:12px}.mc-selection label{display:grid;gap:8px}.mc-selection select{min-width:0;width:100%;padding:11px;border:1px solid var(--mc-line);background:var(--mc-panel);color:inherit;border-radius:8px}.mc-selection .mc-check{display:flex;align-items:center;gap:8px}.mc-primary{background:#2469d8;color:white;width:max-content}.mc-note{padding:10px;border-radius:8px;border:1px solid var(--mc-line)}.mc-providers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mc-providers>article{display:grid;gap:13px;align-content:start;min-width:0}.mc-providers>article p{margin:0;overflow-wrap:anywhere}.mc-source-actions{display:flex;gap:8px;flex-wrap:wrap}.mc-providers>article strong{font-size:14px}.mc-providers>article small{opacity:.7}.mc-foot{font-size:12px;padding-bottom:6px}
@media(max-width:950px){.mc-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.mc-providers{grid-template-columns:1fr}}@media(max-width:620px){.mc-cards{grid-template-columns:1fr}.mc-route{grid-template-columns:1fr 1fr}.mc-route button{grid-column:2}.mc-top{flex-wrap:wrap}.mc-tabs{overflow:auto}}
.model-center :deep(.bc-siwc),.model-center :deep(.cloud-key-panel){border:0;padding:0;background:transparent;box-shadow:none}
.model-center :deep(.bc-siwc-test){border-top:1px solid var(--mc-line);padding-top:10px}
.model-center :deep(.cloud-key-panel>strong){font-size:14px}
.model-center .mc-providers>article{gap:10px}
.mc-directory{display:grid;gap:12px;min-width:0}
.mc-directory-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.mc-directory-header small,.mc-directory-hint{opacity:.74}
.mc-directory-filters{display:grid;grid-template-columns:minmax(125px,190px) minmax(0,1fr) auto;gap:9px;align-items:center}
.mc-directory-filters select,.mc-directory-filters input{width:100%;min-width:0;background:#173346;color:#f2f8ff;border:1px solid #446578;border-radius:8px;padding:11px;font:inherit}
.mc-directory-filters input::placeholder{color:#c3d2dc}
.mc-directory-filters option,.mc-selection option{background:#fff;color:#132538;font-size:14px}
.mc-directory-filters button,.mc-directory-pager button{background:#183c54;color:#f2f8ff;border:1px solid #55758c;border-radius:8px;padding:10px 13px;cursor:pointer}
.mc-directory-list{display:grid;gap:5px;max-height:355px;overflow:auto;scrollbar-gutter:stable;padding-right:3px}
.mc-directory-model{display:flex;justify-content:space-between;align-items:center;text-align:left;gap:16px;width:100%;border:1px solid #38586c;border-radius:8px;padding:11px 13px;background:#19394d;color:#eef8ff;cursor:pointer;font:inherit}
.mc-directory-model>span{display:grid;gap:3px;min-width:0}.mc-directory-model small{color:#c4d7e5;overflow-wrap:anywhere}
.mc-directory-model.chosen{border-color:#6caaff;background:#235074}
.mc-directory-model:disabled{cursor:default;opacity:.8}
.mc-directory-pager{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.mc-directory-pager span{margin-right:auto}
.mc-directory-pager button:disabled{opacity:.42;cursor:not-allowed}
.mc-directory-error{color:#f4b48b}
@media(max-width:620px){.mc-directory-filters{grid-template-columns:1fr auto}.mc-directory-filters select{grid-column:1/-1}.mc-directory-model{flex-direction:column;align-items:flex-start}}
</style>