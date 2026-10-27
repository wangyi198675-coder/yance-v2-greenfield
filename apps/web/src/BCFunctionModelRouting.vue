<script setup>
import {ref,computed,watch} from 'vue';
const props=defineProps({active:{type:Boolean,default:false},csrf:{type:String,default:null},fetchImpl:{type:Function,default:null}});
const features=Object.freeze([
 {id:'PRIVATE_BRAIN',name:'私人闺蜜大脑'},
 {id:'TRANSLATE',name:'聊天翻译'},
 {id:'REPLY_SUGGESTIONS',name:'真人回复建议'},
 {id:'RELATIONSHIP_SUMMARY',name:'关系记忆分析'},
 {id:'EXPERT_TASKS',name:'专家与任务'},
 {id:'MEDIA_UNDERSTANDING',name:'媒体理解'},
 {id:'AUTOPILOT',name:'已授权自动托管'}
]);
const labels=Object.freeze({LLAMACPP_LOCAL_QWEN3_8B_FREE:'本地Qwen3',OPENROUTER_USER_API:'OpenRouter',CHATGPT_PLAN_SIWC:'ChatGPT会员'});
const state=ref(null),busy=ref(false),error=ref(''),notice=ref(''),drafts=ref({}),pendingPaid=ref('');
const search=ref(''),searchModels=ref([]),searchBusy=ref(false),totalMatches=ref(0);
let requestEpoch=0;
const isReady=computed(()=>state.value?.authoritative===true);
const options=computed(()=>{
 const entries=[...(state.value?.availableModels||[]),...searchModels.value];
 const unique=new Map(entries.filter(m=>m.available&&m.configured).map(m=>[m.provider+'|'+m.modelId,m]));
 return [...unique.values()];
});
const fetcher=(url,opt={})=>(props.fetchImpl||globalThis.fetch)(url,{credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...opt});
const key=x=>x.provider+'|'+x.modelId;
const describe=code=>code==='CURRENT_USER_SESSION_REQUIRED'?'当前尚未建立有效私人会话':code==='MODEL_ROUTING_VERSION_CONFLICT'?'模型设置已更新，请刷新后再操作':code==='MODEL_NOT_AVAILABLE_FOR_ASSIGNMENT'?'原生模型或账号已失效，请核实来源':code==='OPENROUTER_COST_CONFIRMATION_REQUIRED'?'需要先确认OpenRouter单独计费':'模型分配服务暂不可用';
async function load(){
 const ticket=++requestEpoch;busy.value=true;error.value='';notice.value='';
 try{
  const r=await fetcher('/api/v2/model-routing');
  const result=await r.json();
  if(ticket!==requestEpoch)return;
  if(!r.ok||result?.ok!==true||result?.authoritative!==true||
   !Array.isArray(result?.assignments)||!Array.isArray(result?.availableModels))throw Error(result?.error||('HTTP_'+r.status));
  state.value=result;searchModels.value=[];totalMatches.value=0;
  drafts.value=Object.fromEntries(result.assignments.map(a=>[a.functionId,
   a.choice?key(a.choice):'']));
 }catch(e){if(ticket===requestEpoch){state.value=null;error.value=describe(String(e?.message||e))}}
 finally{if(ticket===requestEpoch)busy.value=false}
}
async function lookup(){
 if(!state.value||searchBusy.value)return;
 searchBusy.value=true;error.value='';
 try{
  const route='/api/v2/model-routing/catalog?q='+encodeURIComponent(search.value.trim())+'&limit=100';
  const response=await fetcher(route);
  const data=await response.json();
  if(!response.ok||data?.authoritative!==true||!Array.isArray(data?.models))
   throw Error(data?.error||'MODEL_CATALOG_UNAVAILABLE');
  searchModels.value=data.models;totalMatches.value=data.total;
 }catch(e){error.value=describe(String(e?.message||e))}
 finally{searchBusy.value=false}
}
watch([()=>props.active,()=>props.csrf],([yes])=>{if(yes)void load();else{requestEpoch++;state.value=null;drafts.value={}}},{immediate:true});
async function save(feature){
 if(busy.value||!state.value||typeof props.csrf!=='string'||!/^[a-f0-9]{64}$/.test(props.csrf))return;
 const option=options.value.find(m=>key(m)===drafts.value[feature]);
 if(!option)return;
 let confirmPaidCost=false;
 if(option.provider==='OPENROUTER_USER_API'){
  // Selection is a preference, NOT a charge. The current user's explicit
  // cost acknowledgement cannot grant sender or agent permission.
  if(pendingPaid.value!==feature){pendingPaid.value=feature;notice.value='OpenRouter按你的独立Key计费。再次点击确认保存此偏好（不会自动调用模型）。';return}
  confirmPaidCost=true;
 }
 const ticket=++requestEpoch;busy.value=true;error.value='';notice.value='';
 try{
  const r=await fetcher('/api/v2/model-routing',{method:'POST',headers:{
   'content-type':'application/json','x-yance-csrf':props.csrf
  },body:JSON.stringify({functionId:feature,provider:option.provider,modelId:option.modelId,
   expectedRevision:state.value.revision,confirmPaidCost})});
  const result=await r.json();
  if(ticket!==requestEpoch)return;
  if(!r.ok||result?.authoritative!==true)throw Error(result?.error||('HTTP_'+r.status));
  // Server readback is the only saved preference authority, never optimistic.
  const actual=result.assignments?.find(a=>a.functionId===feature)?.choice;
  if(actual?.provider!==option.provider||actual?.modelId!==option.modelId)
   throw Error('MODEL_ROUTING_READBACK_MISMATCH');
  state.value=result;pendingPaid.value='';notice.value='已保存该功能的模型偏好；实际AI运行须通过原Agno资格验证。';
 }catch(e){if(ticket===requestEpoch){error.value=describe(String(e?.message||e));await load()}}
 finally{if(ticket===requestEpoch)busy.value=false}
}
const saved=id=>state.value?.assignments?.find(a=>a.functionId===id)||null;
</script>
<template>
 <section class="bc-function-routing" data-test="model-function-routing" aria-label="按功能分配AI模型">
  <div class="bc-routing-head">
   <div><h3>按功能分配AI</h3><p>各功能可以选择不同AI，互不影响</p></div>
   <button type="button" data-test="model-routing-refresh" :disabled="busy" @click="load">刷新模型与配置</button>
  </div>
  <p v-if="error" class="bc-routing-error" role="alert" data-test="model-routing-error">{{error}}</p>
  <p v-if="notice" role="status" data-test="model-routing-notice">{{notice}}</p>
  <div class="bc-routing-sources" data-test="model-routing-sources">
   <div><strong>本地 Qwen3</strong><span>{{options.some(x=>x.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE')?'本地模型可选择':'等待本地服务验证'}}</span></div>
   <div><strong>OpenRouter</strong><span>{{options.some(x=>x.provider==='OPENROUTER_USER_API')?'有已确认Key的可选模型':'需要本人Key及模型选择'}}</span></div>
   <div><strong>ChatGPT会员</strong><span>官方套餐授权及模型目录尚未接通</span></div>
  </div>
  <form class="bc-routing-search" data-test="model-routing-search" @submit.prevent="lookup">
   <label for="bc-function-model-search">搜索真实可用模型</label>
   <input id="bc-function-model-search" v-model.trim="search" type="search" autocomplete="off"
    placeholder="例如 Claude、GPT、Gemini…" maxlength="96" :disabled="!isReady||searchBusy"/>
   <button type="submit" :disabled="!isReady||searchBusy">{{searchBusy?'搜索中':'查找模型'}}</button>
   <small v-if="totalMatches">匹配 {{totalMatches}} 个官方模型，可继续输入关键词缩小范围</small>
  </form>
  <div class="bc-routing-rows" data-test="model-routing-rows">
   <div v-for="f in features" :key="f.id" class="bc-routing-row" :data-feature="f.id">
    <div class="bc-routing-row-name"><strong>{{f.name}}</strong>
     <small>{{saved(f.id)?.choice?(saved(f.id).eligible?'偏好已保存 · 执行资格待原Agno接线':'来源不可用，请重新选择'):'尚未配置专用模型'}}</small>
    </div>
    <select :aria-label="'为'+f.name+'选择模型'" :data-test="'model-routing-choice-'+f.id"
     :value="drafts[f.id]||''" :disabled="!isReady||busy||options.length===0"
     @change="e=>{drafts[f.id]=e.target.value;pendingPaid=''}">
     <option value="">请选择真实可用模型</option>
     <option v-for="m in options" :key="key(m)" :value="key(m)"
      :disabled="f.id==='MEDIA_UNDERSTANDING'&&m.capabilities?.vision!==true">{{labels[m.provider]}} · {{m.name||m.modelId}}</option>
     <option v-if="saved(f.id)?.choice&&saved(f.id)?.eligible&&
      !options.some(m=>key(m)===key(saved(f.id).choice))"
      :value="key(saved(f.id).choice)">{{labels[saved(f.id).choice.provider]}} · {{saved(f.id).choice.modelId}}</option>
    </select>
    <button type="button" :data-test="'model-routing-save-'+f.id"
      :disabled="!isReady||busy||!csrf||!drafts[f.id]||drafts[f.id]=== (saved(f.id)?.choice?key(saved(f.id).choice):'')"
     @click="save(f.id)">{{pendingPaid===f.id?'确认OpenRouter费用':'保存'}}</button>
   </div>
  </div>
  <p class="bc-routing-note" data-test="model-routing-runtime-boundary">这里保存功能级模型偏好，不会自动产生费用、发送消息或启动托管。当前实际Agno执行仍使用原已授权模型；功能级运行绑定待原W43/W47接口复签。联系人/专家的专用授权尚未接线，不能在此伪造联系人配置。</p>
 </section>
</template>
<style scoped>
.bc-function-routing{display:grid;gap:13px;min-width:0}
.bc-routing-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.bc-routing-head h3{margin:0;font-size:16px}.bc-routing-head p{font-size:12px;color:var(--muted);margin:4px 0 0}
.bc-routing-head button,.bc-routing-row button{border:1px solid var(--border);border-radius:10px;padding:9px 11px;background:var(--surface-soft);color:var(--ink);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.bc-routing-head button:disabled,.bc-routing-row button:disabled{opacity:.5;cursor:not-allowed}
.bc-routing-sources{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.bc-routing-sources>div{display:grid;gap:6px;padding:13px;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft);box-shadow:0 5px 25px #00000014}
.bc-routing-sources strong{font-size:13px}.bc-routing-sources span{font-size:11px;color:var(--muted);line-height:1.45}
.bc-routing-search{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bc-routing-search label{font-size:12px;color:var(--muted)}
.bc-routing-search input{flex:1;min-width:140px;max-width:500px;min-height:38px;
 border:1px solid var(--border);background:var(--surface-soft);color:var(--ink);border-radius:22px;padding:8px 12px}
.bc-routing-search button{border:1px solid var(--border);background:var(--surface-soft);color:var(--ink);
 border-radius:10px;min-height:38px;padding:8px 11px;cursor:pointer}
.bc-routing-search button:disabled{opacity:.5}.bc-routing-search small{width:100%;color:var(--muted)}
.bc-routing-rows{display:grid;gap:2px}
.bc-routing-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(170px,1.3fr) 73px;gap:12px;align-items:center;border-bottom:1px solid var(--border);padding:11px 0}
.bc-routing-row-name{display:grid;gap:4px}.bc-routing-row-name strong{font-size:13px}.bc-routing-row-name small{font-size:11px;color:var(--muted)}
.bc-routing-row select{width:100%;min-height:39px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft);color:var(--ink);font:inherit;font-size:12px;padding:7px;min-width:0}
.bc-routing-row button{min-height:39px;text-align:center}
.bc-routing-note{font-size:11px!important;line-height:1.7!important;color:var(--muted);margin:0}
.bc-routing-error{color:var(--ink);border-left:2px solid #c57843;padding:5px 10px;background:var(--surface-soft);font-size:12px}.bc-routing-error+p{font-size:12px}
@media(max-width:870px){.bc-routing-sources{grid-template-columns:1fr}.bc-routing-row{grid-template-columns:1fr 73px}.bc-routing-row-name{grid-column:1/-1}}
@media(max-width:430px){.bc-routing-head{align-items:flex-start}.bc-routing-head button{font-size:10px;padding:8px}.bc-routing-row{gap:7px;grid-template-columns:minmax(0,1fr) 63px}}
</style>