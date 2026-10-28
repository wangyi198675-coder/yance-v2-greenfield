<script setup>
import {ref,computed,onMounted,watch} from 'vue';
import BCNativeCloudKeySettings from './BCNativeCloudKeySettings.vue';
import BCOfficialChatGPTConnect from './BCOfficialChatGPTConnect.vue';
const props=defineProps({webCsrf:{type:String,default:''},fetchImpl:{type:Function,default:null},active:{type:Boolean,default:false}});
const emit=defineEmits(['navigate']);
const TYPES=Object.freeze([
 ['PRIVATE_BRAIN','闺蜜大脑','深度对话、关系分析与记忆'],
 ['TRANSLATE','翻译','日常翻译可优先使用本地或低成本模型'],
 ['REPLY_SUGGESTIONS','回复建议','生成真实聊天回复建议'],
 ['RELATIONSHIP_SUMMARY','关系总结','分析联系人关系与上下文'],
 ['EXPERT_TASKS','专家任务','调用既有专业智能体工具'],
 ['MEDIA_UNDERSTANDING','媒体理解','仅使用支持媒体输入的模型'],
 ['AUTOPILOT','自动托管','连续运行，优先稳定且明确预算']
]);
const IDS=Object.freeze({
 OPENROUTER_USER_API:'OpenRouter',OPENAI_USER_API:'OpenAI API',
 LLAMACPP_LOCAL_QWEN3_8B_FREE:'本地 Qwen3',CHATGPT_PLAN_SIWC:'ChatGPT 官方账号'
});
const tab=ref('overview'),chosen=ref('TRANSLATE'),status=ref('idle'),message=ref('');
const routing=ref(null),catalog=ref(null),keys=ref(null),keyVerified=ref(false);
const selected=ref(''),paidConfirmed=ref(false),saving=ref(false),stale=ref(false);
const lastCheck=ref(''),errorStatus=ref('');
let sequence=0;
const csrfOk=computed(()=>/^[a-f0-9]{64}$/.test(props.webCsrf||''));
const rows=computed(()=>Array.isArray(routing.value?.assignments)?routing.value.assignments:[]);
const models=computed(()=>Array.isArray(routing.value?.availableModels)?routing.value.availableModels.filter(x=>x?.available===true&&x?.configured===true&&typeof x?.modelId==='string'):[]);
const current=computed(()=>rows.value.find(x=>x.functionId===chosen.value)||null);
const modelOption=m=>m.provider+'|'+m.modelId;
const displayModel=x=>x?.modelId||'尚未选择';
const providerName=x=>IDS[x]||'未知来源';
const cloudKeys=computed(()=>Array.isArray(keys.value?.providers)?keys.value.providers:[]);
const keyFor=p=>cloudKeys.value.find(x=>x.provider===p);
const localModels=computed(()=>models.value.filter(x=>x.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'));
const activeModels=computed(()=>models.value.filter(x=>!['CHATGPT_PLAN_SIWC'].includes(x.provider)||x.available));
const selectedModel=computed(()=>activeModels.value.find(x=>modelOption(x)===selected.value));
const brainModel=computed(()=>{
 const b=catalog.value;
 return b?.authoritative===true&&typeof b.selectedModelId==='string'&&b.selectedModelId
  ? b.selectedModelId:'尚未确认';
});
const selectedRow=computed(()=>TYPES.find(x=>x[0]===chosen.value)||TYPES[0]);
const friendlyError=e=>{
 const s=String(e?.message||e);const code=String(/HTTP_(\d+)/.exec(s)?.[1]||'');
 if(code==='401')return '当前私人会话未授权，请进入闺蜜大脑建立会话后刷新';
 if(code==='403')return '原生同源授权或 CSRF 未通过，未保存任何改动';
 if(code==='409')return '模型配置已被其他窗口更新，请刷新后重新选择';
 if(code==='503')return '原生模型资格或持久化能力尚不可用';
 return '无法确认服务端最新状态，已保留上次读回的结果';
};
const request=async (path,options={})=>{
 const f=props.fetchImpl||globalThis.fetch;
 const r=await f(path,{credentials:'same-origin',cache:'no-store',redirect:'error',
  referrerPolicy:'no-referrer',...options});
 if(!r?.ok)throw Error('HTTP_'+(r?.status||'ERROR'));
 return r.json();
};
async function refresh(){
 const seq=++sequence;status.value='checking';message.value='正在读取原生模型与密钥状态…';
 const result=await Promise.allSettled([
  request('/api/v2/model-routing'),
  request('/api/v2/private-brain/model-config'),
  request('/api/v2/private-brain/cloud-keys')
 ]);
 if(seq!==sequence)return;
 if(result[0].status==='fulfilled'){
  const x=result[0].value;
  if(x?.ok===true&&x?.authoritative===true&&x?.canSend===false&&Array.isArray(x?.assignments)){
   routing.value=x;stale.value=false;
  }else{stale.value=true}
 }else{stale.value=true}
 if(result[1].status==='fulfilled'&&result[1].value?.authoritative===true)catalog.value=result[1].value;
 keyVerified.value=result[2].status==='fulfilled'&&result[2].value?.ok===true&&result[2].value?.credentialValueReturned===false;
 if(keyVerified.value)keys.value=result[2].value;
 const failures=result.filter(x=>x.status==='rejected');
 status.value=failures.length?'partial':'ready';
 errorStatus.value=failures.map(x=>friendlyError(x.reason)).filter((x,i,a)=>a.indexOf(x)===i).join('；');
 lastCheck.value=new Date().toLocaleTimeString();
 message.value=failures.length?'部分服务端状态读取失败；没有清除之前的配置':'状态已从服务端重新读取';
}
function selectFeature(id){
 chosen.value=id;paidConfirmed.value=false;
 const row=rows.value.find(x=>x.functionId===id);
 const x=row?.choice;
 selected.value=x&&models.value.some(m=>modelOption(m)===modelOption(x))?modelOption(x):'';
 message.value='';
}
watch([chosen,rows],()=>{if(!selected.value&&current.value?.choice){
 const x=current.value.choice;
 if(models.value.some(m=>modelOption(m)===modelOption(x)))selected.value=modelOption(x);
}});
async function save(){
 if(saving.value||!csrfOk.value||!routing.value||!selectedModel.value||stale.value)return;
 const m=selectedModel.value;
 if(m.provider==='OPENROUTER_USER_API'&&!paidConfirmed.value){
  message.value='云端付费模型需要你先明确勾选费用确认';return;
 }
 saving.value=true;message.value='正在保存，并向服务端再次回读…';
 try{
  const result=await request('/api/v2/model-routing',{method:'POST',
   headers:{'content-type':'application/json','x-yance-csrf':props.webCsrf},
   body:JSON.stringify({functionId:chosen.value,provider:m.provider,modelId:m.modelId,
    expectedRevision:routing.value.revision,confirmPaidCost:paidConfirmed.value})});
  if(result?.ok!==true||result?.canSend!==false)throw Error('INVALID_WRITE_RECEIPT');
  const recheck=await request('/api/v2/model-routing');
  const saved=recheck?.assignments?.find(x=>x.functionId===chosen.value);
  if(recheck?.authoritative!==true||recheck?.revision!==result.revision||
   saved?.choice?.provider!==m.provider||saved?.choice?.modelId!==m.modelId)
    throw Error('READBACK_MISMATCH');
  routing.value=recheck;stale.value=false;
  paidConfirmed.value=false;
  message.value='模型偏好已保存并回读确认；实际 W43 任务执行接线状态以服务端为准';
 }catch(e){stale.value=true;message.value=friendlyError(e)+'；请刷新状态重新核对'}
 finally{saving.value=false}
}
const keyText=p=>{
 if(!keys.value||!keyVerified.value)return keys.value?'上次密钥状态 · 待复核':'密钥状态未核验';
 const k=keyFor(p);
 if(!k)return '密钥状态未核验';
 return k.configured===true?'密钥已保存 · rev '+k.revision:
  k.revoked===true?'已撤销':'未配置';
};
onMounted(()=>{if(props.active)void refresh()});
watch(()=>props.active,x=>{if(x)void refresh()});
watch(()=>props.webCsrf,()=>{if(props.active)void refresh()});
</script>
<template>
 <section class="yance-model-center" data-test="ai-model-center" aria-label="AI 模型中心">
  <header class="model-hero">
   <div><h2>AI 模型中心</h2><p>统一查看模型来源、密钥状态和各项功能的模型偏好。按需选择本地或云端模型。</p></div>
   <button type="button" class="btn-secondary" data-test="model-center-refresh" :disabled="status==='checking'" @click="refresh">↻ 刷新状态</button>
  </header>
  <div class="model-dashboard">
   <div class="summary-card"><span>ChatGPT 官方账号</span><strong>{{brainModel}}</strong><small>官方账号连接与 API Key 是两种独立授权</small></div>
   <div class="summary-card"><span>云端 API Key</span><strong>{{keyText('OPENROUTER_USER_API')}}</strong><small>OpenAI API：{{keyText('OPENAI_USER_API')}}</small></div>
   <div class="summary-card"><span>本地 Qwen3</span><strong>{{localModels.length?'可用 '+localModels.length+' 个模型':'尚未确认在线'}}</strong><small>仅显示原生资格目录真实回读</small></div>
   <div class="summary-card"><span>V-Claw 第三方 API</span><strong>协议候选 · 待授权</strong><small>已发现 /v1/models，尚未完成带密钥验证</small></div>
  </div>
  <p class="live-notice" data-test="model-center-status" role="status">
   <span>{{status==='checking'?'检测中':stale?'上次状态 / 待复核':'服务端状态'}}</span>
   {{message}} <small v-if="lastCheck">最后检查 {{lastCheck}}</small>
   <span v-if="errorStatus">{{errorStatus}}</span>
  </p>
  <nav class="model-tabs" aria-label="模型设置分区">
   <button type="button" v-for="t in [['overview','总览'],['routes','功能路由'],['providers','来源与密钥']]" :key="t[0]"
    :class="{current:tab===t[0]}" :data-test="'model-tab-'+t[0]" @click="tab=t[0]">{{t[1]}}</button>
  </nav>
  <section v-show="tab==='overview'" data-test="model-overview">
   <div class="section-heading"><h3>功能模型路由</h3><span>配置偏好由原 W47 保存，实际调用资格独立校验</span></div>
   <div class="route-table">
    <div v-for="t in TYPES" :key="t[0]" class="route-item">
     <div class="route-name"><strong>{{t[1]}}</strong><small>{{t[2]}}</small></div>
     <div class="route-selection"><strong>{{displayModel(rows.find(x=>x.functionId===t[0])?.choice)}}</strong><small>{{providerName(rows.find(x=>x.functionId===t[0])?.choice?.provider)}}</small></div>
     <span class="route-state">{{rows.find(x=>x.functionId===t[0])?.status==='PREFERENCE_SAVED_RUNTIME_NOT_WIRED'?'偏好已保存 · 执行未接线':rows.find(x=>x.functionId===t[0])?.status==='SOURCE_NO_LONGER_ELIGIBLE'?'来源失效':'尚未配置'}}</span>
     <button type="button" class="btn-secondary" :data-test="'route-open-'+t[0]" @click="selectFeature(t[0]);tab='routes'">配置</button>
    </div>
   </div>
  </section>
  <section v-show="tab==='routes'" class="route-editor" data-test="model-routing-editor">
   <aside class="feature-sidebar"><h3>功能列表</h3>
    <button type="button" v-for="t in TYPES" :key="t[0]" :class="{selected:chosen===t[0]}"
     :data-test="'route-feature-'+t[0]" @click="selectFeature(t[0])">
     <strong>{{t[1]}}</strong><small>{{displayModel(rows.find(x=>x.functionId===t[0])?.choice)}}</small>
    </button>
   </aside>
   <div class="feature-editor">
    <h3>{{selectedRow[1]}} · 选择模型</h3><p>{{selectedRow[2]}}</p>
    <div class="strategy-box">
     <strong>可用模型来源</strong>
     <small>只能选择原生服务端已确认有资格的模型。免费、延迟和质量信息需来源真实计费/能力数据。</small>
    </div>
    <label class="form-label">模型
     <select v-model="selected" data-test="route-model-select" :disabled="saving||!csrfOk||stale">
      <option value="">请选择可用模型</option>
      <option v-for="m in activeModels" :key="modelOption(m)" :value="modelOption(m)">
       {{providerName(m.provider)}} · {{m.name||m.modelId}}
      </option>
     </select>
    </label>
    <p class="model-warning" v-if="routing?.routingExecution!=='WIRED_TO_W43'">
     当前状态：{{routing?.routingExecution||'未取得资格回读'}}。保存的是功能偏好，尚不能保证实际任务使用该模型。
    </p>
    <div class="model-warning">
     <strong>备用模型 / 自动故障切换</strong><p>原生执行接口尚未提供已签署的 Fallback 契约，暂不启用，防止意外产生云端费用。</p>
    </div>
    <label v-if="selectedModel?.provider==='OPENROUTER_USER_API'" class="paid-confirm">
     <input v-model="paidConfirmed" type="checkbox" data-test="route-cost-confirm"/>
     我确认使用此云端模型可能产生费用。仅保存偏好，不立即调用模型。
    </label>
    <div class="route-actions">
     <button type="button" class="btn-primary" data-test="route-save" :disabled="!csrfOk||stale||saving||!selectedModel" @click="save">
      {{saving?'正在核对…':'保存模型偏好'}}
     </button>
     <button type="button" class="btn-secondary" @click="refresh">重新读取</button>
    </div>
   </div>
  </section>
  <section v-show="tab==='providers'" data-test="model-providers">
   <div class="provider-grid">
    <article class="provider-tile"><h3>ChatGPT 官方账号</h3><p>账号授权独立于普通 API Key。</p>
     <BCOfficialChatGPTConnect :fetch-impl="fetchImpl"/></article>
    <article class="provider-tile"><h3>云端 AI 密钥</h3>
     <p>复用 W55 原生安全凭据存储；不会在浏览器保存密钥内容。</p>
     <BCNativeCloudKeySettings v-if="csrfOk" :web-csrf="webCsrf" @changed="refresh"/>
     <p v-else>未取得有效私人会话 CSRF，暂不能保存或更新密钥。</p>
    </article>
    <article class="provider-tile"><h3>本地模型</h3><p>{{localModels.length?'已确认原生资格的本地模型：':'尚无可信本地模型可用性回读'}}</p>
     <p v-for="m in localModels.slice(0,8)" :key="m.modelId">{{m.modelId}}</p>
     <button type="button" class="btn-secondary" @click="refresh">检测状态</button></article>
    <article class="provider-tile"><h3>V-Claw API 网关</h3>
     <p><strong>候选接口</strong>：https://token.v-claw.org/v1</p>
     <p>未经授权请求 /v1/models 返回 401；尚未验证 CC-Kiro-Pro 的推理、流式及工具调用协议。</p>
     <p class="model-warning" data-test="vclaw-pending">待原 W55 凭据 Owner 和 W43 模型执行 Owner 签署接入；此处不接受或保存真实 Key。</p>
     <a href="https://token.v-claw.org/keys" target="_blank" rel="noopener noreferrer">查看 V-Claw 密钥管理</a>
    </article>
   </div>
  </section>
  <footer class="model-footnote">连接 ≠ 有权限调用；密钥已保存 ≠ 模型已验证；模型偏好已保存 ≠ 当前任务已切换。第三方网关调用可能携带聊天内容与产生费用，需独立确认。</footer>
 </section>
</template>
<style scoped>
.yance-model-center{display:grid;gap:15px;color:var(--w46-fg,#23324b);min-width:0;width:100%;box-sizing:border-box}
.model-hero{display:flex;align-items:center;justify-content:space-between;gap:12px}
.model-hero h2{font-size:23px;line-height:1.3;letter-spacing:-.4px;margin:0 0 6px}
.model-hero p,.section-heading span,.feature-editor>p{margin:0;color:var(--w46-muted,#71839d);font-size:13px}
.model-dashboard{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.summary-card{border:1px solid var(--w46-edge,#dce5f0);border-radius:12px;background:var(--w46-paper,#fff);padding:16px 14px;display:grid;align-content:start;gap:6px;min-height:102px;box-sizing:border-box}
.summary-card span,.summary-card small{font-size:12px;color:var(--w46-muted,#78879e)}
.summary-card strong{font-size:15px;overflow-wrap:anywhere}
.live-notice{margin:0;border:1px solid var(--w46-edge,#d7e8f7);background:var(--w46-soft,#f1f7fc);border-radius:9px;padding:11px 12px;display:flex;align-items:center;flex-wrap:wrap;gap:9px;font-size:12px}
.live-notice>span:first-child{font-weight:700;color:#1267d7}
.live-notice small{margin-left:auto}
.model-tabs{display:flex;gap:5px;border-bottom:1px solid var(--w46-edge,#dce5f0);padding-bottom:9px}
.model-tabs button{font:inherit;font-size:13px;padding:9px 16px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit}
.model-tabs button.current{background:#e7f1ff;border-color:#bed9ff;color:#156adc;font-weight:700}
.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px}
.section-heading h3,.feature-sidebar h3,.feature-editor h3,.provider-tile h3{font-size:16px;margin:0}
.route-table{border:1px solid var(--w46-edge,#dce5f0);border-radius:12px;overflow:hidden;background:var(--w46-paper,#fff)}
.route-item{display:grid;grid-template-columns:minmax(130px,1.4fr) minmax(145px,1fr) minmax(175px,1fr) auto;gap:12px;align-items:center;padding:12px 15px;border-bottom:1px solid var(--w46-edge,#edf1f7);font-size:12px}
.route-item:last-child{border-bottom:0}.route-name,.route-selection{display:grid;gap:3px}.route-name strong{font-size:13px}.route-name small,.route-selection small{color:var(--w46-muted,#72849e)}
.route-state{font-size:11px;color:#a36a15;overflow-wrap:anywhere}
.btn-primary,.btn-secondary{border-radius:8px;border:1px solid var(--w46-edge,#cbd9e7);padding:9px 12px;font-size:12px;cursor:pointer;font-weight:600}
.btn-primary{background:#1c72ed;color:white;border-color:#1c72ed}.btn-secondary{background:var(--w46-paper,#fff);color:inherit}.btn-primary:disabled,.btn-secondary:disabled{opacity:.5;cursor:not-allowed}
.route-editor{display:grid;grid-template-columns:minmax(170px,220px) minmax(0,1fr);gap:14px}
.feature-sidebar,.feature-editor,.provider-tile{border:1px solid var(--w46-edge,#dce5f0);background:var(--w46-paper,#fff);border-radius:12px;padding:14px;min-width:0}
.feature-sidebar{display:grid;align-content:start;gap:6px}.feature-sidebar h3{margin-bottom:8px}
.feature-sidebar button{padding:11px;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;display:grid;gap:4px;font:inherit}
.feature-sidebar button.selected{background:#eaf4ff;border-color:#86b8fe}.feature-sidebar button small{color:var(--w46-muted,#72849e);font-size:11px}
.feature-editor{display:grid;align-content:start;gap:15px}.strategy-box{padding:13px;border:1px solid var(--w46-edge,#dce5f0);border-radius:10px;display:grid;gap:7px}.strategy-box small{color:var(--w46-muted,#71839d)}
.form-label{display:grid;gap:7px;font-size:12px;font-weight:650}.form-label select{max-width:100%;padding:12px;border:1px solid var(--w46-edge,#cddcec);border-radius:8px;background:var(--w46-paper,#fff);color:inherit}
.model-warning{font-size:12px;color:#9b6c12;background:#fff7e8;border:1px solid #f2dbaf;border-radius:8px;padding:11px;margin:0}.model-warning p{margin:4px 0 0}
.paid-confirm{font-size:12px;display:flex;gap:9px;align-items:center}.route-actions{display:flex;gap:9px}
.provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.provider-tile{display:grid;align-content:start;gap:12px}.provider-tile p{margin:0;font-size:12px;overflow-wrap:anywhere}
.model-footnote{font-size:12px;color:var(--w46-muted,#72849e);line-height:1.7;padding:10px 0 2px}
@media(max-width:950px){.model-dashboard{grid-template-columns:repeat(2,minmax(0,1fr))}.provider-grid{grid-template-columns:1fr}.route-item{grid-template-columns:minmax(100px,1fr) minmax(100px,1fr) auto}.route-state{grid-column:2 / 3}}
@media(max-width:620px){.model-dashboard{grid-template-columns:1fr}.route-editor{grid-template-columns:1fr}.feature-sidebar{grid-template-columns:repeat(2,minmax(0,1fr))}.feature-sidebar h3{grid-column:1 / -1}.route-item{grid-template-columns:1fr 1fr}.route-state{grid-column:1}.model-hero{align-items:flex-start;flex-wrap:wrap}.model-tabs{overflow:auto}}
</style>