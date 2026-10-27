<script setup>
import {ref,onMounted,onBeforeUnmount,computed,nextTick} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCNativeCloudKeySettings from './BCNativeCloudKeySettings.vue';
import {PRIVATE_ROUTES,authStatus,publicModelCatalog,modelCatalog,confirmedModelSelection,
  verifiedTurn,verifiedHistory,privateError,jsonApi,endpointBody} from './private-brain-ui-contract.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const api=(u,options)=>jsonApi(props.fetchImpl||globalThis.fetch,u,options);
const session=ref(null),catalog=ref(null),publicProviders=ref([]),messages=ref([]),busy=ref(false);
const loadState=ref('checking'),notice=ref(''),setupOpen=ref(false),toolsOpen=ref(false),text=ref('');
const chosen=ref(''),requestInFlight=ref(false);
const modelCostApproved=ref(false),brainExpertOpen=ref(false),brainRoot=ref(null);
const nativeTools=ref([]),nativeRuns=ref([]),nativeReadState=ref('idle'),nativeTrace=ref(null),traceReadState=ref('idle');
const experts=ref([]),expertsState=ref('idle'),expertError=ref(''),expertBusy=ref(false),expertStableId=ref(''),chosenExpertId=ref(''),expertConsent=ref(false),expertVerified=ref(null);
let expertEpoch=0;
let nativeReadRevision=0;
const brainTrigger={experts:'brain-expert',model:'brain-compose-model',tools:'brain-compose-tools'};
function brainActiveMenu(){return brainExpertOpen.value?'experts':setupOpen.value?'model':toolsOpen.value?'tools':null}
function closeBrainMenu(restoreFocus=false){
 const prior=brainActiveMenu();
 brainExpertOpen.value=false;setupOpen.value=false;toolsOpen.value=false;nativeReadRevision++;expertEpoch++;
 if(restoreFocus&&prior)nextTick(()=>brainRoot.value?.querySelector('[data-test="'+brainTrigger[prior]+'"]')?.focus());
}
async function focusBrainPopup(){
 await nextTick();
 brainRoot.value?.querySelector('.bc-brain-context-menu button:not(:disabled), .bc-private-settings button:not(:disabled), .bc-brain-trace summary')?.focus();
}
async function toggleBrainExpert(){
 if(brainExpertOpen.value){closeBrainMenu(true);return}
 closeBrainMenu();brainExpertOpen.value=true;await focusBrainPopup();void loadExperts();
}

function verifyExpertDirectory(dto){
 if(dto?.authoritative!==true||dto.source!=='W43_NATIVE_AGNO_EXPERT'||
  dto.status!=='NATIVE_EXPERT_DIRECTORY_READ'||dto.canSend!==false||
  dto.cataloguedCount!==10||dto.installedReadOnlyCount!==1||dto.registeredCount!==1||
  !Array.isArray(dto.experts)||dto.experts.length!==10||
  dto.experts.filter(x=>x.installed).length!==1||
  dto.experts.filter(x=>x.installed&&x.registered).length!==1||
  dto.experts.filter(x=>x.canInvoke).length>1||
  !dto.experts.every(x=>typeof x.expertId==='string'&&/^[a-z0-9-]{3,64}$/.test(x.expertId)&&
   typeof x.label==='string'&&typeof x.installed==='boolean'&&typeof x.registered==='boolean'&&
   typeof x.enabled==='boolean'&&typeof x.canInvoke==='boolean'&&
   (!x.canInvoke||(x.expertId==='oss-discovery'&&x.registered&&x.installed&&x.enabled&&
    x.availableMode==='READ_ONLY_STABLE252_INSPECTION'))))
  throw Error('EXPERT_DIRECTORY_NOT_VERIFIED');
 return dto.experts.map(x=>({
   expertId:x.expertId,label:x.label,installed:x.installed,registered:x.registered,
   enabled:x.enabled,canInvoke:x.canInvoke,availableMode:x.availableMode,
   qualification:String(x.qualification||''),revision:x.revision
 }));
}
async function loadExperts(){
 const ticket=++expertEpoch;
 experts.value=[];expertVerified.value=null;expertConsent.value=false;chosenExpertId.value='';expertError.value='';
 expertsState.value='loading';
 try{
  ensureCurrent();
  const rows=verifyExpertDirectory(await api('/api/v2/private-brain/experts'));
  if(ticket!==expertEpoch||!mounted||!brainExpertOpen.value)return;
  experts.value=rows;expertsState.value='ready';
 }catch{
  if(ticket===expertEpoch&&mounted){expertsState.value='unavailable';expertError.value='原W43专家目录暂不可用或未授权'}
 }
}
const expertEligible=computed(()=>{
 const x=experts.value.find(v=>v.expertId==='oss-discovery');
 const m=catalog.value?.models?.find(v=>v.provider===catalog.value.selectedProvider&&v.modelId===catalog.value.selectedModelId);
 return expertsState.value==='ready'&&x?.registered===true&&x.installed===true&&
  x.enabled===true&&x.canInvoke===true&&
  x.availableMode==='READ_ONLY_STABLE252_INSPECTION'&&
  loadState.value==='ready'&&catalog.value?.configured===true&&
  m?.available===true&&m?.configured===true&&!!session.value&&
  session.value.expiresAt>Date.now();
});
async function runExpert(){
 const stableId=expertStableId.value.trim();
 if(expertBusy.value||chosenExpertId.value!=='oss-discovery'||!expertEligible.value||!expertConsent.value||
  !/^(?:[A-Z]{1,3}[0-9]{2,3}|UIE-[0-9]{3})$/.test(stableId))return;
 const ticket=++expertEpoch;expertBusy.value=true;expertError.value='';expertVerified.value=null;
 const id=revision;
 try{
  ensureCurrent();
  const fresh=verifyExpertDirectory(await api('/api/v2/private-brain/experts'));
  const x=fresh.find(v=>v.expertId==='oss-discovery');
  if(!x?.installed||!x.enabled||!x.canInvoke||!safeCurrent(id)||ticket!==expertEpoch||!brainExpertOpen.value)
   throw Error('EXPERT_CURRENT_SCOPE_REVOKED');
  const model=checkedModelCatalog(await api(PRIVATE_ROUTES.config));
  if(!model.configured||model.selectedProvider!==catalog.value?.selectedProvider||
   model.selectedModelId!==catalog.value?.selectedModelId||!safeCurrent(id))
   throw Error('EXPERT_MODEL_QUALIFICATION_CHANGED');
  const requestId='expert_'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const receipt=await api('/api/v2/private-brain/experts/oss-discovery/turn',{
   method:'POST',headers:{'content-type':'application/json','x-yance-csrf':session.value.csrf},
   body:JSON.stringify({requestId,stableId,threadId:'personal',usageScope:'THIS_TASK'})
  });
  if(!safeCurrent(id)||ticket!==expertEpoch||!brainExpertOpen.value)return;
  if(receipt?.authoritative!==true||receipt.source!=='W43_NATIVE_AGNO_EXPERT'||
   receipt.status!=='COMPLETED_READ_ONLY_CATALOG_INSPECTION'||receipt.expertId!=='oss-discovery'||
   receipt.stableId!==stableId||receipt.usageScope!=='THIS_TASK'||
   receipt.businessExecuted!==false||receipt.qualityQualified!==false||receipt.canSend!==false||
   !/^[A-Za-z0-9_-]{6,128}$/.test(receipt.runId||'')||
   typeof receipt.assistantText!=='string'||!receipt.assistantText)
   throw Error('EXPERT_RECEIPT_NOT_AUTHENTICATED');
  const runId=receipt.runId;
  const [run,trace]=await Promise.all([
   api('/api/v2/private-brain/runs/'+encodeURIComponent(runId)+'?threadId=personal'),
   api('/api/v2/private-brain/runs/'+encodeURIComponent(runId)+'/trace?threadId=personal')
  ]);
  if(!safeCurrent(id)||ticket!==expertEpoch||!brainExpertOpen.value)return;
  if(run?.authoritative!==true||run.source!=='W43_NATIVE_AGNO_SDK'||
   run.runId!==runId||run.canSend!==false||run.status!=='COMPLETED'||
   !Array.isArray(run.tools)||!run.tools.length||
   trace?.authoritative!==true||trace.source!=='W43_NATIVE_AGNO_SDK'||
   trace.runId!==runId||trace.canSend!==false||trace.noTraceFabricated!==true||
   trace.status!=='NATIVE_TRACES_FOUND'||!Array.isArray(trace.traces)||
   !Number.isSafeInteger(trace.traceCount)||trace.traceCount<1)
    throw Error('EXPERT_RUN_TRACE_GET_MISMATCH');
  expertVerified.value={runId,stableId,traceCount:trace.traceCount,text:receipt.assistantText.slice(0,1400)};
  expertConsent.value=false;
  // Do NOT inject this expert receipt as an invented chat assistant turn.
 }catch(e){if(ticket===expertEpoch&&safeCurrent(id))expertError.value='专家执行未完整核实：'+reason(e)}
 finally{if(ticket===expertEpoch)expertBusy.value=false}
}

async function toggleBrainModel(){
 if(setupOpen.value){closeBrainMenu(true);return}
 closeBrainMenu();setupOpen.value=true;await focusBrainPopup();
}
async function readNativeTools(){
 const ticket=++nativeReadRevision;nativeReadState.value='loading';nativeTools.value=[];nativeRuns.value=[];nativeTrace.value=null;traceReadState.value='idle';
 try{
  ensureCurrent();
  const [tools,runs]=await Promise.all([api('/api/v2/private-brain/tools'),
   api('/api/v2/private-brain/runs?threadId=personal&limit=10')]);
  if(!mounted||ticket!==nativeReadRevision||!toolsOpen.value)return;
  if(tools?.authoritative!==true||tools?.source!=='W43_NATIVE_AGNO_SDK'||tools?.canSend!==false||
   !Array.isArray(tools.registeredTools)||tools.registeredTools.length>50||
   runs?.authoritative!==true||runs?.source!=='W43_NATIVE_AGNO_SDK'||runs?.status!=='NATIVE_RUNS_READ'||runs?.canSend!==false||
   !Array.isArray(runs.runs)||runs.runs.length>10)throw Error('UNVERIFIED_AGNO_INSPECTION');
  nativeTools.value=tools.registeredTools.map(t=>({label:String(t.name||t.toolName||t.id||'已注册工具').slice(0,80),businessExecutable:t.businessExecutable===true}));
  nativeRuns.value=runs.runs.map(r=>({id:String(r.runId||r.id||'').slice(0,128),status:String(r.status||'未知').slice(0,50)}));
  nativeReadState.value='ready';
 }catch{if(mounted&&ticket===nativeReadRevision)nativeReadState.value='unavailable'}
}
async function readNativeTrace(run){
 if(!toolsOpen.value||!run||!/^[A-Za-z0-9_-]{6,128}$/.test(run.id))return;
 const ticket=++nativeReadRevision;nativeTrace.value=null;traceReadState.value='loading';
 try{
  ensureCurrent();
  const dto=await api('/api/v2/private-brain/runs/'+encodeURIComponent(run.id)+'/trace?threadId=personal');
  if(!mounted||ticket!==nativeReadRevision||!toolsOpen.value)return;
  if(dto?.authoritative!==true||dto?.source!=='W43_NATIVE_AGNO_SDK'||dto?.canSend!==false||
   dto.runId!==run.id||dto.noTraceFabricated!==true||
   !['NATIVE_TRACES_FOUND','NATIVE_TRACE_NOT_FOUND'].includes(dto.status)||
   !Array.isArray(dto.traces)||dto.traces.length>50||
   !Number.isSafeInteger(dto.traceCount)||dto.traceCount<0)
   throw Error('W43_NATIVE_TRACE_UNVERIFIED');
  nativeTrace.value={runId:run.id,count:dto.traceCount,status:dto.status};
  traceReadState.value='ready';
 }catch{if(mounted&&ticket===nativeReadRevision)traceReadState.value='unavailable'}
}
async function toggleBrainTools(){
 if(toolsOpen.value){closeBrainMenu(true);return}
 closeBrainMenu();toolsOpen.value=true;await focusBrainPopup();void readNativeTools();
}
function brainMenuKeyboard(e){
 const active=brainActiveMenu();if(!active)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeBrainMenu(true);return}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 const popup=brainRoot.value?.querySelector('.bc-brain-context-menu, .bc-private-settings, .bc-brain-trace');
 if(!popup?.contains(document.activeElement))return;
 const items=[...popup.querySelectorAll('button:not(:disabled), summary, input:not(:disabled), a[href]')].filter(x=>x.getClientRects().length);
 if(!items.length)return;
 e.preventDefault();const index=items.indexOf(document.activeElement);
 const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length-1:index-1);
 items[next].focus();
}
function brainOutsideClick(e){
 if(!brainActiveMenu())return;
 if(!e.target.closest?.('.bc-brain-context-menu, .bc-private-settings, .bc-brain-trace, [data-test="brain-expert"], [data-test="brain-compose-model"], [data-test="brain-compose-tools"], [data-test="brain-open-settings"], [data-test="brain-toggle-tools"]'))closeBrainMenu();
}
let revision=0,mounted=true,sessionDeadline=null;
const threadId='personal';
const safeCurrent=id=>mounted&&revision===id;
const selected=computed(()=>catalog.value?.models.find(m=>m.provider+'|'+m.modelId===chosen.value)||null);
const cloudCandidate=computed(()=>!!selected.value?.keyRequired);
const modelChangeRequired=computed(()=>!!selected.value&&(!catalog.value?.configured||
 selected.value.provider!==catalog.value.selectedProvider||
 selected.value.modelId!==catalog.value.selectedModelId));
const paidChangeRequiresConsent=computed(()=>cloudCandidate.value&&modelChangeRequired.value);
function checkedModelCatalog(dto){
 // W47 Web PRIVATE may truthfully report protected WinCred attached.
 // Reuse the signed W46 model schema without claiming the browser owns a vault.
 if(dto?.secureCredentialStorage===true){
  if(dto.authoritative!==true||dto.credentialsExposed!==false)
   throw Error('W47_CLOUD_MODEL_AUTHORITY_INVALID');
  return modelCatalog({...dto,secureCredentialStorage:false},publicProviders.value);
 }
 return modelCatalog(dto,publicProviders.value);
}
const providers=computed(()=>publicProviders.value.map(p=>({
 id:p.id,name:p.name,desc:p.id==='LLAMACPP_LOCAL_QWEN3_8B_FREE'?'选装。不安装也不阻止云端模型':
 p.id==='OPENAI_USER_API'?'API Key 须由本机安全存储，ChatGPT 订阅不等于 API 额度':
 '用户本人批准费用后，原生服务端才可使用已保护的 OpenRouter Key'
})));
function clearSession(){
 session.value=null;catalog.value=null;chosen.value='';
 modelCostApproved.value=false;
 if(sessionDeadline!==null){clearTimeout(sessionDeadline);sessionDeadline=null}
}
function ensureCurrent(){
 if(!session.value||session.value.expiresAt<=Date.now()){
  clearSession();throw Error('PRIVATE_SESSION_EXPIRED');
 }
}
function armExpiry(expiresAt){
 if(sessionDeadline!==null)clearTimeout(sessionDeadline);
 sessionDeadline=setTimeout(()=>{
  // PRIVATE remains automatic: on expiry re-read the same local W47 source,
  // never ask a person for a pair code or fabricate a renewed Session.
  clearSession();void refresh();
 },Math.max(0,expiresAt-Date.now()));
}
async function refresh(){
 if(requestInFlight.value)return;
 const id=++revision;
 busy.value=true;loadState.value='checking';notice.value='';
 clearSession();messages.value=[];publicProviders.value=[]; // never preserve unverified history across account changes
 try{
  publicProviders.value=publicModelCatalog(await api(PRIVATE_ROUTES.catalog)); // actual W47 public metadata, not readiness
  let s=authStatus(await api(PRIVATE_ROUTES.session));
  if(!s.authorized&&typeof window!=='undefined'&&window.location.hostname==='127.0.0.1'){
   // No pairing. Only the actual local single-user Web server may issue
   // this PRIVATE-only session; its endpoint is absent in normal release.
   try{
    await api(PRIVATE_ROUTES.webPrivateStart,{
      method:'POST',headers:{'content-type':'application/json'},body:'{}'
    });
    s=authStatus(await api(PRIVATE_ROUTES.session));
   }catch{}
  }
  if(!safeCurrent(id))return;
  if(!s.authorized){
   // Ordinary PRIVATE use never asks the person for a terminal pair code.
   // The original W47 process/session owner must establish local access on app startup.
   loadState.value='setup-required';setupOpen.value=true;return
  }
  session.value=s;armExpiry(s.expiresAt);
  let models;
  try{models=checkedModelCatalog(await api(PRIVATE_ROUTES.config))}
  catch(e){if(safeCurrent(id)){loadState.value='models-unavailable';notice.value=reason(e)};return}
  if(!safeCurrent(id))return;
  catalog.value=models;chosen.value=models.configured?
   models.selectedProvider+'|'+models.selectedModelId:
   (models.models.find(m=>m.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'&&m.available)?.provider+
    '|'+models.models.find(m=>m.provider==='LLAMACPP_LOCAL_QWEN3_8B_FREE'&&m.available)?.modelId
    ||'');
  // Existing Agno History must load with NO model configured.
  await loadHistory(id);
  if(!safeCurrent(id))return;
  if(!models.configured){loadState.value='no-model';setupOpen.value=true;return}
 }catch(e){if(safeCurrent(id)){
   loadState.value='service-unavailable';setupOpen.value=true;notice.value=reason(e)
  }}
 finally{if(safeCurrent(id))busy.value=false}
}
function reason(e){
 const match=/PRIVATE_HTTP_(\d+)/.exec(String(e?.message||e));
 return match?privateError(Number(match[1])):'服务端权威校验尚未完成，当前不可用';
}
async function loadHistory(id=revision){
 try{
  ensureCurrent();
  const h=verifiedHistory(await api(PRIVATE_ROUTES.history+'?threadId='+encodeURIComponent(threadId)),threadId);
  if(!safeCurrent(id))return;
  messages.value=h;loadState.value='ready';
 }catch(e){if(safeCurrent(id)){loadState.value='history-unavailable';notice.value=reason(e)}}
}
async function selectModel(){
 if(busy.value||!catalog.value||!selected.value||!selected.value.available||!selected.value.configured||
  !modelChangeRequired.value||(paidChangeRequiresConsent.value&&!modelCostApproved.value))return;
 const id=++revision;busy.value=true;notice.value='';
 try{
  ensureCurrent();
  const m=selected.value;
  const selection={provider:m.provider,modelId:m.modelId};
  const input=m.keyRequired?{
   method:'POST',headers:{'content-type':'application/json','x-yance-csrf':session.value.csrf},
   body:JSON.stringify({...selection,confirmPaidCost:true})
  }:endpointBody(PRIVATE_ROUTES.selection,selection,session.value.csrf);
  const r=await api(PRIVATE_ROUTES.selection,input);
  const receipt=checkedModelCatalog(r);
  if(!receipt.configured||receipt.selectedProvider!==m.provider||receipt.selectedModelId!==m.modelId)
   throw Error('MODEL_SELECTION_POST_NOT_CONFIRMED');
  // POST is not final authority. Reload the same W47 authenticated model-config.
  const verified=checkedModelCatalog(await api(PRIVATE_ROUTES.config));
  if(!safeCurrent(id))return;
  if(verified.selectedProvider!==m.provider||verified.selectedModelId!==m.modelId)
    throw Error('SELECTION_GET_NOT_CONFIRMED');
  catalog.value=verified;chosen.value=m.provider+'|'+m.modelId;
  modelCostApproved.value=false;
  setupOpen.value=false;await loadHistory(id);
 }catch(e){if(safeCurrent(id)){notice.value=reason(e);loadState.value='model-selection-unavailable'}}
 finally{if(safeCurrent(id))busy.value=false}
}
async function send(){
 const prompt=text.value.trim();if(!prompt||prompt.length>4000||requestInFlight.value||busy.value||
    loadState.value!=='ready'||!catalog.value?.configured)return;
 const model=catalog.value.models.find(m=>m.modelId===catalog.value.selectedModelId&&
   m.provider===catalog.value.selectedProvider&&m.available&&m.configured);
 if(!model)return; // Cloud fee consent was verified once at model selection by W47.
 const id=++revision;requestInFlight.value=true;notice.value='';
 try{
  ensureCurrent();
  const requestId='req_'+Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('');
  // Keep user text local until successful W43 completed receipt; never fake assistant.
  const body={threadId,text:prompt,requestId};
  const reply=await api(PRIVATE_ROUTES.turn,endpointBody(PRIVATE_ROUTES.turn,body,session.value.csrf));
  verifiedTurn(reply,{threadId,requestId,provider:model.provider,modelId:model.modelId});
  if(!safeCurrent(id))return;
  text.value=''; // history is sole persisted authority
  await loadHistory(id); // if history unavailable, don't fabricate turn in timeline
 }catch(e){if(safeCurrent(id)){notice.value=reason(e);loadState.value='history-unavailable'}}
 finally{if(safeCurrent(id))requestInFlight.value=false}
}
onMounted(()=>{document.addEventListener('keydown',brainMenuKeyboard);document.addEventListener('pointerdown',brainOutsideClick);void refresh()});
onBeforeUnmount(()=>{document.removeEventListener('keydown',brainMenuKeyboard);document.removeEventListener('pointerdown',brainOutsideClick);
 mounted=false;revision++;nativeReadRevision++;expertEpoch++;clearSession();text.value=''});
</script>
<template>
 <section ref="brainRoot" class="bc-private-brain" data-test="bc-private-brain" aria-label="唯一闺蜜大脑">
  <header class="bc-private-brain-head">
   <div class="bc-private-brain-heading"><strong>闺蜜大脑</strong><span>私人 Agno · 独立会话</span>
    <p class="bc-private-brain-state" role="status" data-test="brain-state">
   {{loadState==='checking'?'正在核实服务端':loadState==='ready'?'历史已由服务端恢复':
    loadState==='no-model'?'尚未配置 AI 模型':
    loadState==='setup-required'?'先设置 AI 模型；本机服务连接后即可聊天':
    loadState==='service-unavailable'?'AI 服务暂时不可用，仍可查看模型设置':
    loadState==='models-unavailable'?'模型服务接口尚未接通':
    loadState==='history-unavailable'?'真实对话或历史暂不可用':'模型选择尚未确认'}}
    </p>
   </div>
   <div class="bc-private-brain-actions">
    <Button size="sm" variant="ghost" data-test="brain-open-settings" aria-haspopup="menu" :aria-expanded="setupOpen" :disabled="busy||requestInFlight" @click="toggleBrainModel">模型 ▾</Button>
    <Button size="sm" variant="ghost" data-test="brain-check" :disabled="busy||requestInFlight" @click="refresh">历史</Button>
    <Button size="sm" variant="ghost" data-test="brain-toggle-tools" aria-haspopup="menu" :aria-expanded="toolsOpen" @click="toggleBrainTools">工具详情 ▣</Button>
   </div>
  </header>
  <p v-if="notice" class="bc-private-notice" role="alert" data-test="brain-error">{{notice}}</p>
  <details v-if="toolsOpen" open class="bc-brain-trace" data-test="w46-brain-tools" id="w46-brain-tools-menu"><summary tabindex="0">真实执行详情 · 工具 / Run / Trace</summary><div v-if="messages.some(m=>m.role==='tool')" class="bc-brain-tool-list"><article v-for="(m,i) in messages.filter(m=>m.role==='tool')" :key="i"><strong>工具回执</strong><p>{{m.content}}</p></article></div><p v-else>当前历史内暂无经过服务端确认的工具回执。</p>
   <p v-if="nativeReadState==='loading'">正在读取W43原生工具与Run…</p>
   <p v-else-if="nativeReadState==='unavailable'">本机原生工具／Run接口不可用或未授权；不显示模拟记录。</p>
   <template v-else-if="nativeReadState==='ready'">
    <p>已注册工具 {{nativeTools.length}} 项，实际执行资格由W43授权决定。</p>
    <div v-for="(tool,i) in nativeTools" :key="i">{{tool.label}} · {{tool.businessExecutable?'服务端限制执行':'只读／未开放执行'}}</div>
    <p>当前有来源Run {{nativeRuns.length}} 条</p>
    <div v-for="(run,i) in nativeRuns" :key="i" class="bc-native-run-row">
     <span>{{run.id}} · {{run.status}}</span>
     <button type="button" :disabled="!run.id||!/^[-A-Za-z0-9_]{6,128}$/.test(run.id)" @click="readNativeTrace(run)">查看 Trace</button>
    </div>
    <p v-if="traceReadState==='loading'">正在读取原生Trace…</p>
    <p v-else-if="traceReadState==='unavailable'">此Run的原生Trace未授权或不可用。</p>
    <p v-else-if="traceReadState==='ready'&&nativeTrace">Run {{nativeTrace.runId}}：{{nativeTrace.count}} 条有来源Trace（{{nativeTrace.status}}）</p>
   </template></details>
  <div v-if="setupOpen" class="bc-private-settings" data-test="brain-model-settings" id="w46-brain-model-menu" role="menu" aria-label="当前私人模型选择">
   <h3>选择 AI 模型</h3>
   <BCNativeCloudKeySettings :web-csrf="session?.csrf" @changed="refresh"/>
   <p>可选择 OpenRouter、OpenAI API 或已安装的本地模型。本地 Qwen3 完全可选，不影响云端模型。</p>
   <div v-for="provider in providers" :key="provider.id" class="bc-provider">
    <strong>{{provider.name}}</strong><small>{{provider.desc}}</small>
    <template v-for="m in catalog?.models.filter(x=>x.provider===provider.id)||[]" :key="m.modelId">
     <label><input v-model="chosen" type="radio" name="private-model" :value="m.provider+'|'+m.modelId"
       :disabled="!session||!m.available||busy" @change="modelCostApproved=false"/>
       {{m.modelId}} · {{m.available&&m.configured?'已配置':'未授权或不可用'}}</label>
    </template>
    <small v-if="!catalog?.models.some(m=>m.provider===provider.id)">尚无经服务端验证的可选模型</small>
   </div>
   <label v-if="paidChangeRequiresConsent" class="bc-cloud-cost-confirm" data-test="cloud-model-cost-confirm">
    <input v-model="modelCostApproved" type="checkbox" :disabled="busy"/>
    <span>{{selected?.billingNotice||'该云端模型可能按调用收费。'}}我确认选择此云端模型并了解可能产生的费用。</span>
   </label>
   <Button size="sm" data-test="brain-select-model" :disabled="!session||!selected||!selected.available||!selected.configured||busy||!modelChangeRequired||(paidChangeRequiresConsent&&!modelCostApproved)" @click="selectModel">{{modelChangeRequired?'确认使用此模型':'当前正在使用'}}</Button>
   <p class="bc-private-notice" data-test="brain-native-key-hold">
    云端 API Key 仅在服务端确认安全保存接口可用时才能提交。暂未接通时不会在浏览器内保存密钥，也不会要求安装桌面版。
   </p>
  </div>
  <div class="bc-private-history" data-test="brain-history" role="log" aria-label="私人聊天历史">
   <p v-if="!messages.length">暂无经过服务端确认的历史消息</p>
   <article v-for="(m,i) in messages" :key="i" :data-role="m.role">
    <strong>{{m.role==='user'?'你':m.role==='assistant'?'闺蜜大脑':'工具回执'}}</strong>
    <p>{{m.content}}</p>
   </article>
  </div>  <div v-if="brainExpertOpen" class="bc-brain-context-menu" data-test="brain-expert-popup" id="w46-brain-expert-menu" role="menu" aria-label="闺蜜大脑专家选择">
    <div class="bc-brain-popup-head"><strong>选择专家</strong><button type="button" data-test="brain-expert-close" @click="toggleBrainExpert">关闭</button></div>
    <p v-if="expertsState==='loading'">正在读取W47原生专家目录…</p>
    <p v-else-if="expertsState==='unavailable'" role="alert">{{expertError}}</p>
    <template v-else-if="expertsState==='ready'">
     <p data-test="brain-experts-authoritative-count">服务端登记 {{experts.length}} 类，实际安装 {{experts.filter(x=>x.installed).length}} 类。仅PRIVATE本次任务，不授予联系人权限。</p>
     <div v-for="expert in experts" :key="expert.expertId" class="bc-native-expert-row">
      <strong>{{expert.label}}</strong>
      <small>{{expert.installed?(expert.enabled?'已安装启用':'已安装但停用'):'未安装'}} · {{expert.qualification}}</small>
      <button type="button" :data-test="'native-expert-'+expert.expertId" :disabled="!expertEligible||expert.expertId!=='oss-discovery'||!expert.canInvoke||expertBusy" @click="chosenExpertId=expert.expertId;expertConsent=false;expertVerified=null"> {{chosenExpertId===expert.expertId?'本次已选择':expert.canInvoke?'选择本次只读专家':'暂不可用'}}</button>
     </div>
     <label class="bc-native-expert-label">本次只读查询的Stable ID
      <input v-model="expertStableId" data-test="brain-expert-stable-id" maxlength="7" placeholder="例如 A01" :disabled="!expertEligible||chosenExpertId!=='oss-discovery'||expertBusy"/>
     </label>
     <label class="bc-native-expert-label"><input type="checkbox" v-model="expertConsent" data-test="brain-expert-consent" :disabled="!expertEligible||chosenExpertId!=='oss-discovery'||expertBusy"/>
       我明确批准调用当前已选模型，仅查询本次任务的Stable ID；如模型收费按原供应商结算。不授权社交发送或自动托管。
     </label>
     <button type="button" data-test="brain-expert-run" :disabled="!expertEligible||chosenExpertId!=='oss-discovery'||!expertConsent||expertBusy||!/^(?:[A-Z]{1,3}[0-9]{2,3}|UIE-[0-9]{3})$/.test(expertStableId.trim())" @click="runExpert">确认执行只读专家</button>
     <p v-if="expertBusy">正在等待W43原生Run与Trace核验…</p>
     <p v-if="expertError" role="alert">{{expertError}}</p>
     <article v-if="expertVerified" data-test="brain-expert-verified-run">
      <strong>已核验原生Run</strong>
      <small>{{expertVerified.runId}} · Trace {{expertVerified.traceCount}} · Stable ID {{expertVerified.stableId}}</small>
      <p>{{expertVerified.text}}</p>
     </article>
    </template>
  </div>
  <form class="bc-private-compose" @submit.prevent="send">
   <label for="bc-private-question" class="bc-brain-sr-label">给闺蜜大脑发消息</label>
   <small v-if="catalog?.configured&&catalog.selectedProvider!=='LLAMACPP_LOCAL_QWEN3_8B_FREE'" data-test="cloud-model-consent-status">当前云端模型由你主动选择并确认费用；后续对话按该供应商实际计费，无需每条重复勾选。切换收费模型时将再次确认。</small>
   <textarea id="bc-private-question" v-model="text" rows="2" maxlength="4000"
     data-test="brain-question" placeholder="向闺蜜大脑提问；可召唤专家或执行已授权任务" :disabled="loadState!=='ready'||busy||requestInFlight"></textarea>
   <div class="bc-brain-compose-toolbar">
    <div class="bc-brain-compose-tools">
     <Button type="button" size="sm" variant="ghost" :aria-expanded="brainExpertOpen" @click="toggleBrainExpert" data-test="brain-expert" aria-haspopup="menu" aria-controls="w46-brain-expert-menu">＋ 专家</Button>
     <Button type="button" size="sm" variant="ghost" :disabled="busy||requestInFlight" :aria-expanded="setupOpen" @click="toggleBrainModel" data-test="brain-compose-model" aria-haspopup="menu" aria-controls="w46-brain-model-menu">模型</Button>
     <Button type="button" size="sm" variant="ghost" :aria-expanded="toolsOpen" @click="toggleBrainTools" data-test="brain-compose-tools" aria-haspopup="menu" aria-controls="w46-brain-tools-menu">工具</Button>
     <Button type="button" size="sm" variant="ghost" disabled title="附件尚待W23原生媒体资格接线" data-test="brain-attachment">附件</Button>
    </div>
    <Button type="submit" data-test="brain-send"
     :disabled="loadState!=='ready'||busy||requestInFlight||!text.trim()">{{requestInFlight?'正在等待真实模型回执':'发送 ↗'}}</Button>
   </div>
  </form>

 </section>
</template>
<style scoped>
.bc-private-brain{display:grid;gap:14px;width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--w46-edge,#777);border-radius:12px;padding:clamp(12px,3vw,24px)}
.bc-private-brain-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.bc-private-brain-head strong{font-size:20px}.bc-private-brain-head p,.bc-provider small{font-size:12px;opacity:.75}
.bc-private-brain-state{color:var(--w46-accent,currentColor)}
.bc-private-settings{display:grid;gap:12px;border:1px solid var(--w46-edge,#777);border-radius:10px;padding:12px;min-width:0}
.bc-provider{display:grid;gap:6px;padding:10px;border:1px solid var(--w46-edge,#777);border-radius:8px}
.bc-provider label{display:flex;gap:9px;align-items:center;overflow-wrap:anywhere}
.bc-cloud-cost-confirm{display:flex;align-items:start;gap:8px;max-width:100%;overflow-wrap:anywhere;font-size:12px}
.bc-cloud-cost-confirm input{flex-shrink:0}
.bc-credential{display:grid;gap:8px}.bc-credential input{width:100%;box-sizing:border-box}
.bc-private-history{min-height:100px;max-height:350px;overflow-y:auto;border:1px solid var(--w46-edge,#777);padding:12px;border-radius:9px;display:grid;align-content:start;gap:12px}
.bc-private-history article{padding:8px 10px;border:1px solid var(--w46-edge,#777);border-radius:9px}
.bc-private-history article p{white-space:pre-wrap;overflow-wrap:anywhere}
.bc-private-compose{display:grid;gap:8px}.bc-private-compose textarea,.bc-credential input{min-width:0;color:inherit;background:transparent;border:1px solid var(--w46-edge,#777);border-radius:8px;padding:10px}
.bc-private-brain button{justify-self:start}.bc-private-notice{color:#dc7575}

.bc-private-brain{display:flex!important;flex:1 1 0;flex-direction:column;min-height:0;height:100%;padding:12px 16px!important;gap:8px!important;background:var(--bg2);border-color:var(--border);color:var(--ink);box-shadow:0 14px 40px rgba(0,0,0,.07)}
.bc-private-brain-head{display:flex;min-height:42px;flex:0 0 auto;align-items:center;padding-bottom:7px;border-bottom:1px solid var(--border);flex-wrap:nowrap}
.bc-private-brain-head strong{font-size:17px}.bc-private-brain-actions{display:flex;align-items:center;gap:6px}
.bc-private-brain-state{font-size:11px;color:var(--muted);margin:0;flex:0 0 auto}
.bc-private-notice{font-size:12px;flex:0 0 auto}.bc-private-settings{max-height:min(42vh,360px);overflow:auto;flex:0 0 auto;background:var(--surface);border-color:var(--border)}
.bc-brain-trace{padding:8px 12px;background:var(--surface-soft);border:1px solid var(--border);border-radius:10px;font-size:11px;flex:0 0 auto;color:var(--muted)}.bc-brain-trace summary{cursor:pointer;color:var(--ink)}.bc-brain-trace p{overflow-wrap:anywhere}
.bc-native-run-row{display:grid;gap:4px;margin:6px 0;overflow-wrap:anywhere}
.bc-native-run-row button{border:1px solid var(--border);border-radius:8px;padding:5px 7px;max-width:max-content;background:var(--surface-soft);color:var(--ink);cursor:pointer}
.bc-private-history{flex:1 1 0;min-height:140px;max-height:none!important;display:block;overflow-y:auto;background:var(--bg);border:0!important;padding:13px 4px!important;overscroll-behavior:contain}
.bc-private-history article{width:fit-content;max-width:min(84%,760px);margin:8px auto 14px 0;border:1px solid var(--border);border-radius:15px 15px 15px 4px;padding:12px 16px;background:var(--surface);box-shadow:0 4px 18px rgba(0,0,0,.055)}
.bc-private-history article[data-role=user]{margin-left:auto;margin-right:0;border-radius:15px 15px 4px 15px;border-color:rgba(var(--accent-rgb),.28);background:linear-gradient(135deg,rgba(var(--accent-rgb),.14),rgba(var(--accent-rgb),.055))}
.bc-private-history article strong{font-size:11px;color:var(--accent)}.bc-private-history article p{margin:7px 0 0;line-height:1.65}
.bc-private-compose{flex:0 0 auto;display:grid;gap:7px;border:1px solid var(--border);padding:11px 12px;border-radius:18px;background:var(--surface);box-shadow:0 0 0 1px rgba(var(--accent-rgb),.055),0 12px 24px rgba(0,0,0,.065)}.bc-private-compose label{font-size:11px;color:var(--muted)}
.bc-private-compose textarea{border-radius:12px;resize:vertical;min-height:66px;background:var(--bg2)!important;border-color:var(--border)!important}.bc-private-compose textarea:focus{outline:2px solid rgba(var(--accent-rgb),.38);border-color:var(--accent)!important}.bc-private-compose button{background:var(--accent);color:var(--accent-ink);border-radius:11px}
@media(max-width:719px){.bc-private-brain{padding:9px!important}.bc-private-brain-head{gap:4px}.bc-private-brain-head strong{font-size:15px}.bc-private-brain-head button{font-size:11px}.bc-private-history article{max-width:92%}}
/* R4 Compact approval: ONE full-width 43px context bar, centered 880px
   native Agno timeline, and a bottom prompt. Do not replace any API or history. */
.bc-private-brain{position:relative;width:100%;min-height:0;height:100%;padding:0!important;gap:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:var(--bg)!important}
.bc-private-brain-head{box-sizing:border-box;flex:0 0 43px;height:43px;min-height:43px;padding:0 17px;border-bottom:1px solid var(--border);background:var(--bg2);gap:12px}
.bc-private-brain-heading{display:flex;align-items:center;gap:10px;min-width:0}
.bc-private-brain-heading strong{font-size:15px;white-space:nowrap}
.bc-private-brain-heading>span{font-size:11px;color:var(--muted);white-space:nowrap}
.bc-private-brain-state{font-size:10px;color:var(--muted);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bc-private-brain-actions{gap:7px;flex-shrink:0}
.bc-private-brain-actions button{font-size:11px}
.bc-private-history{box-sizing:border-box;flex:1 1 0;min-height:0;max-width:880px;width:100%;align-self:center;padding:20px 22px!important;background:transparent!important;border:0!important}
.bc-private-history article{max-width:80%;padding:11px 14px;border-radius:14px 14px 14px 4px}
.bc-private-history article[data-role=user]{border-radius:14px 14px 4px 14px}
.bc-private-compose{box-sizing:border-box;flex:0 0 auto;max-width:844px;width:calc(100% - 36px);align-self:center;margin:0 0 16px;gap:0;padding:11px!important;border-radius:14px;border:1px solid var(--border)}
.bc-brain-sr-label{position:absolute;overflow:hidden;width:1px;height:1px;clip:rect(0,0,0,0);white-space:nowrap}
.bc-private-compose textarea{box-sizing:border-box;min-height:52px!important;max-height:110px;resize:vertical;border:0!important;background:transparent!important;border-radius:0!important;padding:5px 2px;outline-offset:1px}
.bc-private-compose textarea:focus{outline:2px solid rgba(var(--accent-rgb),.45)}
.bc-brain-compose-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--border);padding-top:8px}
.bc-brain-compose-tools{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.bc-brain-compose-tools button{padding:6px 7px!important;font-size:11px;border-radius:7px;background:var(--surface-soft);color:var(--ink)}
.bc-brain-compose-tools button:disabled{opacity:.43;cursor:not-allowed}
.bc-brain-compose-toolbar>[data-test=brain-send]{margin-left:auto;white-space:nowrap;border-radius:8px;color:var(--accent-ink);background:var(--accent)}
.bc-brain-trace{position:absolute;right:12px;top:48px;z-index:25;width:min(310px,calc(100vw - 24px));max-height:65vh;overflow:auto;box-shadow:0 15px 35px rgba(0,0,0,.2);background:var(--surface-raised);border-color:var(--border)}
.bc-private-settings{box-sizing:border-box;position:absolute;top:49px;right:12px;z-index:27;max-width:410px;width:min(410px,calc(100vw - 24px));max-height:min(72vh,620px);overflow:auto;box-shadow:0 15px 38px rgba(0,0,0,.24);background:var(--surface-raised);border-color:var(--border)}
@media(max-width:719px){
 .bc-private-brain-head{padding:0 8px;gap:5px}
 .bc-private-brain-heading{gap:4px}.bc-private-brain-heading>span{display:none}
 .bc-private-brain-state{max-width:95px;font-size:10px}
 .bc-private-brain-actions{gap:2px}.bc-private-brain-actions button{padding:5px!important;font-size:10px}
 .bc-private-history{padding:15px 12px!important}
 .bc-private-compose{width:calc(100% - 20px);margin-bottom:10px;padding:9px!important}
 .bc-brain-compose-tools{gap:1px}.bc-brain-compose-tools button{font-size:10px;padding:5px!important}
 .bc-private-history article{max-width:92%}
}
@media(prefers-reduced-motion:reduce){.bc-private-compose,.bc-private-history article{box-shadow:none}}
/* Input-adjacent R4 popovers retain original PRIVATE Agno model config and cost safety. */
.bc-brain-context-menu{box-sizing:border-box;position:absolute;left:max(10px,calc((100% - 844px)/2 + 12px));bottom:103px;z-index:35;width:min(320px,calc(100vw - 24px));max-height:min(350px,65vh);overflow:auto;display:grid;gap:8px;padding:12px;border:1px solid var(--border);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.26);background:var(--surface-raised);color:var(--ink)}
.bc-brain-popup-head{display:flex;justify-content:space-between;align-items:center}
.bc-brain-context-menu p{margin:0;font-size:11px;line-height:1.55;color:var(--muted)}
.bc-brain-context-menu button{border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--surface-soft);color:var(--ink);font-size:11px;text-align:left}
.bc-brain-context-menu button:disabled{opacity:.6}
.bc-native-expert-row{display:grid;gap:4px;border-bottom:1px solid var(--border);padding:5px 0}
.bc-native-expert-row small{color:var(--muted);overflow-wrap:anywhere}
.bc-native-expert-label{display:flex;align-items:start;gap:6px;font-size:11px}
.bc-native-expert-label input:not([type]){max-width:145px;border-radius:7px;border:1px solid var(--border);padding:5px;background:var(--surface);color:var(--ink)}
.bc-brain-context-menu article{overflow-wrap:anywhere;border:1px solid var(--border);border-radius:8px;padding:8px}
.bc-private-settings{top:auto!important;right:auto!important;left:max(10px,calc((100% - 844px)/2 + 64px));bottom:103px;width:min(410px,calc(100vw - 24px));max-height:min(67vh,540px)}
.bc-brain-trace{top:auto!important;right:auto!important;left:max(10px,calc((100% - 844px)/2 + 115px));bottom:103px;width:min(320px,calc(100vw - 24px));max-height:65vh}
@media(max-width:719px){.bc-brain-context-menu,.bc-private-settings,.bc-brain-trace{left:10px!important;bottom:96px;width:min(340px,calc(100vw - 20px))}}
</style>
