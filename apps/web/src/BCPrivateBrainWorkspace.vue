<script setup>
import {ref,onMounted,onBeforeUnmount,computed} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {PRIVATE_ROUTES,authStatus,publicModelCatalog,modelCatalog,confirmedModelSelection,
  verifiedTurn,verifiedHistory,privateError,jsonApi,endpointBody} from './private-brain-ui-contract.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const api=(u,options)=>jsonApi(props.fetchImpl||globalThis.fetch,u,options);
const session=ref(null),catalog=ref(null),publicProviders=ref([]),messages=ref([]),busy=ref(false);
const loadState=ref('checking'),notice=ref(''),setupOpen=ref(false),text=ref('');
const chosen=ref(''),requestInFlight=ref(false);
let revision=0,mounted=true,sessionDeadline=null;
const threadId='personal';
const safeCurrent=id=>mounted&&revision===id;
const selected=computed(()=>catalog.value?.models.find(m=>m.provider+'|'+m.modelId===chosen.value)||null);
const providers=computed(()=>publicProviders.value.map(p=>({
 id:p.id,name:p.name,desc:p.id==='LLAMACPP_LOCAL_QWEN3_8B_FREE'?'选装。不安装也不阻止云端模型':
 p.id==='OPENAI_USER_API'?'API Key 须由本机安全存储，ChatGPT 订阅不等于 API 额度':
 '用户本人批准费用后，原生服务端才可使用已保护的 OpenRouter Key'
})));
function clearSession(){
 session.value=null;catalog.value=null;chosen.value='';
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
  const s=authStatus(await api(PRIVATE_ROUTES.session));
  if(!safeCurrent(id))return;
  if(!s.authorized){
   // Ordinary PRIVATE use never asks the person for a terminal pair code.
   // The original W47 process/session owner must establish local access on app startup.
   loadState.value='setup-required';setupOpen.value=true;return
  }
  session.value=s;armExpiry(s.expiresAt);
  let models;
  try{models=modelCatalog(await api(PRIVATE_ROUTES.config),publicProviders.value)}
  catch(e){if(safeCurrent(id)){loadState.value='models-unavailable';notice.value=reason(e)};return}
  if(!safeCurrent(id))return;
  catalog.value=models;chosen.value=models.configured?
   models.selectedProvider+'|'+models.selectedModelId:'';
  if(!models.configured){loadState.value='no-model';setupOpen.value=true;return}
  await loadHistory(id);
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
 if(busy.value||!catalog.value||!selected.value||!selected.value.available||!selected.value.configured)return;
 const id=++revision;busy.value=true;notice.value='';
 try{
  ensureCurrent();
  const m=selected.value;
  const r=await api(PRIVATE_ROUTES.selection,endpointBody(PRIVATE_ROUTES.selection,
   {provider:m.provider,modelId:m.modelId},session.value.csrf));
  confirmedModelSelection(r,{provider:m.provider,modelId:m.modelId});
  // POST is not final authority. Reload the same W47 authenticated model-config.
  const verified=modelCatalog(await api(PRIVATE_ROUTES.config),publicProviders.value);
  if(!safeCurrent(id))return;
  if(verified.selectedProvider!==m.provider||verified.selectedModelId!==m.modelId)
    throw Error('SELECTION_GET_NOT_CONFIRMED');
  catalog.value=verified;chosen.value=m.provider+'|'+m.modelId;
  setupOpen.value=false;await loadHistory(id);
 }catch(e){if(safeCurrent(id)){notice.value=reason(e);loadState.value='model-selection-unavailable'}}
 finally{if(safeCurrent(id))busy.value=false}
}
async function send(){
 const prompt=text.value.trim();if(!prompt||prompt.length>4000||requestInFlight.value||busy.value||
    loadState.value!=='ready'||!catalog.value?.configured)return;
 const model=catalog.value.models.find(m=>m.modelId===catalog.value.selectedModelId&&
   m.provider===catalog.value.selectedProvider&&m.available&&m.configured);
 if(!model)return;
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
onMounted(refresh);
onBeforeUnmount(()=>{mounted=false;revision++;clearSession();text.value=''});
</script>
<template>
 <section class="bc-private-brain" data-test="bc-private-brain" aria-label="唯一闺蜜大脑">
  <header class="bc-private-brain-head">
   <div><strong>闺蜜大脑</strong><p>一个私人智能体 · 模型设置与聊天历史</p></div>
   <Button size="sm" variant="outline" data-test="brain-check" :disabled="busy||requestInFlight" @click="refresh">检查连接</Button>
  </header>
  <p class="bc-private-brain-state" role="status" data-test="brain-state">
   {{loadState==='checking'?'正在核实服务端':loadState==='ready'?'历史已由服务端恢复':
    loadState==='no-model'?'尚未配置 AI 模型':
    loadState==='setup-required'?'先设置 AI 模型；本机服务连接后即可聊天':
    loadState==='service-unavailable'?'AI 服务暂时不可用，仍可查看模型设置':
    loadState==='models-unavailable'?'模型服务接口尚未接通':
    loadState==='history-unavailable'?'真实对话或历史暂不可用':'模型选择尚未确认'}}
  </p>
  <p v-if="notice" class="bc-private-notice" role="alert" data-test="brain-error">{{notice}}</p>
  <Button variant="outline" size="sm" data-test="brain-open-settings"
   :disabled="busy||requestInFlight" @click="setupOpen=!setupOpen">{{catalog?.configured?'切换AI模型':'设置AI模型'}}</Button>
  <div v-if="setupOpen" class="bc-private-settings" data-test="brain-model-settings">
   <h3>选择 AI 模型</h3>
   <p>可选择 OpenRouter、OpenAI API 或已安装的本地模型。本地 Qwen3 完全可选，不影响云端模型。</p>
   <div v-for="provider in providers" :key="provider.id" class="bc-provider">
    <strong>{{provider.name}}</strong><small>{{provider.desc}}</small>
    <template v-for="m in catalog?.models.filter(x=>x.provider===provider.id)||[]" :key="m.modelId">
     <label><input v-model="chosen" type="radio" name="private-model" :value="m.provider+'|'+m.modelId"
       :disabled="!session||!m.available||busy"/>
       {{m.modelId}} · {{m.available&&m.configured?'已配置':'未授权或不可用'}}</label>
    </template>
    <small v-if="!catalog?.models.some(m=>m.provider===provider.id)">尚无经服务端验证的可选模型</small>
   </div>
   <Button size="sm" data-test="brain-select-model" :disabled="!session||!selected||!selected.available||!selected.configured||busy" @click="selectModel">确认使用此模型</Button>
   <p class="bc-private-notice" data-test="brain-native-key-hold">
    使用自己的云端 API Key，请在言策本机的模型设置中保存。当前版本若尚未提供安全的密钥保存入口，会明确保持不可用；不在网页或日志中填写、显示密钥。
   </p>
  </div>
  <div class="bc-private-history" data-test="brain-history" role="log" aria-label="私人聊天历史">
   <p v-if="!messages.length">暂无经过服务端确认的历史消息</p>
   <article v-for="(m,i) in messages" :key="i" :data-role="m.role">
    <strong>{{m.role==='user'?'你':m.role==='assistant'?'闺蜜大脑':'工具回执'}}</strong>
    <p>{{m.content}}</p>
   </article>
  </div>
  <form class="bc-private-compose" @submit.prevent="send">
   <label for="bc-private-question">给闺蜜大脑发消息</label>
   <textarea id="bc-private-question" v-model="text" rows="3" maxlength="4000"
     data-test="brain-question" placeholder="输入你的问题" :disabled="loadState!=='ready'||busy||requestInFlight"></textarea>
   <Button type="submit" data-test="brain-send"
     :disabled="loadState!=='ready'||busy||requestInFlight||!text.trim()">{{requestInFlight?'正在等待真实模型回执':'发送给闺蜜大脑'}}</Button>
  </form>
  <small>私人聊天不是 CONTACT Composer；不启用社交平台外发。没有受信任的 Agno Run 时不会生成模拟回复。</small>
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
.bc-credential{display:grid;gap:8px}.bc-credential input{width:100%;box-sizing:border-box}
.bc-private-history{min-height:100px;max-height:350px;overflow-y:auto;border:1px solid var(--w46-edge,#777);padding:12px;border-radius:9px;display:grid;align-content:start;gap:12px}
.bc-private-history article{padding:8px 10px;border:1px solid var(--w46-edge,#777);border-radius:9px}
.bc-private-history article p{white-space:pre-wrap;overflow-wrap:anywhere}
.bc-private-compose{display:grid;gap:8px}.bc-private-compose textarea,.bc-credential input{min-width:0;color:inherit;background:transparent;border:1px solid var(--w46-edge,#777);border-radius:8px;padding:10px}
.bc-private-brain button{justify-self:start}.bc-private-notice{color:#dc7575}
</style>
