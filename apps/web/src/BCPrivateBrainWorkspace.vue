<script setup>
import {ref,onMounted,onBeforeUnmount,computed} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCNativeCloudKeySettings from './BCNativeCloudKeySettings.vue';
import {PRIVATE_ROUTES,authStatus,publicModelCatalog,modelCatalog,confirmedModelSelection,
  verifiedTurn,verifiedHistory,privateError,jsonApi,endpointBody} from './private-brain-ui-contract.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const api=(u,options)=>jsonApi(props.fetchImpl||globalThis.fetch,u,options);
const session=ref(null),catalog=ref(null),publicProviders=ref([]),messages=ref([]),busy=ref(false);
const loadState=ref('checking'),notice=ref(''),setupOpen=ref(false),toolsOpen=ref(false),text=ref('');
const chosen=ref(''),requestInFlight=ref(false);
const modelCostApproved=ref(false),brainExpertOpen=ref(false);
function toggleBrainExpert(){brainExpertOpen.value=!brainExpertOpen.value;if(brainExpertOpen.value){toolsOpen.value=false;setupOpen.value=false}}
function toggleBrainModel(){setupOpen.value=!setupOpen.value;if(setupOpen.value){brainExpertOpen.value=false;toolsOpen.value=false}}
function toggleBrainTools(){toolsOpen.value=!toolsOpen.value;if(toolsOpen.value){brainExpertOpen.value=false;setupOpen.value=false}}
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
onMounted(refresh);
onBeforeUnmount(()=>{mounted=false;revision++;clearSession();text.value=''});
</script>
<template>
 <section class="bc-private-brain" data-test="bc-private-brain" aria-label="唯一闺蜜大脑">
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
    <Button size="sm" variant="ghost" data-test="brain-open-settings" :disabled="busy||requestInFlight" @click="setupOpen=!setupOpen">模型 ▾</Button>
    <Button size="sm" variant="ghost" data-test="brain-check" :disabled="busy||requestInFlight" @click="refresh">历史</Button>
    <Button size="sm" variant="ghost" data-test="brain-toggle-tools" :aria-expanded="toolsOpen" @click="toolsOpen=!toolsOpen">工具详情 ▣</Button>
   </div>
  </header>
  <p v-if="notice" class="bc-private-notice" role="alert" data-test="brain-error">{{notice}}</p>
  <details v-if="toolsOpen" open class="bc-brain-trace" data-test="w46-brain-tools"><summary>真实执行详情 · 工具 / Run / Trace</summary><div v-if="messages.some(m=>m.role==='tool')" class="bc-brain-tool-list"><article v-for="(m,i) in messages.filter(m=>m.role==='tool')" :key="i"><strong>工具回执</strong><p>{{m.content}}</p></article></div><p v-else>当前历史中没有经服务端核实的工具回执；专家和运行详情待 W43 原生接口接线。</p></details>
  <div v-if="setupOpen" class="bc-private-settings" data-test="brain-model-settings">
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
  </div>  <div v-if="brainExpertOpen" class="bc-brain-context-menu" data-test="brain-expert-popup" role="menu" aria-label="闺蜜大脑专家选择">
    <div class="bc-brain-popup-head"><strong>选择专家</strong><button type="button" data-test="brain-expert-close" @click="toggleBrainExpert">关闭</button></div>
    <p>原W43十类专家目录尚未通过W47正式HTTP资格回读。可显示目录，不伪称已经安装或运行。</p>
    <button type="button" disabled>任务专家 · 待真实注册和本人授权</button>
    <button type="button" disabled>当前联系人专家 · 待联系人身份K</button>
    <button type="button" disabled>全局默认专家 · 待持续授权</button>
  </div>
  <form class="bc-private-compose" @submit.prevent="send">
   <label for="bc-private-question" class="bc-brain-sr-label">给闺蜜大脑发消息</label>
   <small v-if="catalog?.configured&&catalog.selectedProvider!=='LLAMACPP_LOCAL_QWEN3_8B_FREE'" data-test="cloud-model-consent-status">当前云端模型由你主动选择并确认费用；后续对话按该供应商实际计费，无需每条重复勾选。切换收费模型时将再次确认。</small>
   <textarea id="bc-private-question" v-model="text" rows="2" maxlength="4000"
     data-test="brain-question" placeholder="向闺蜜大脑提问；可召唤专家或执行已授权任务" :disabled="loadState!=='ready'||busy||requestInFlight"></textarea>
   <div class="bc-brain-compose-toolbar">
    <div class="bc-brain-compose-tools">
     <Button type="button" size="sm" variant="ghost" :aria-expanded="brainExpertOpen" @click="toggleBrainExpert" data-test="brain-expert">＋ 专家</Button>
     <Button type="button" size="sm" variant="ghost" :disabled="busy||requestInFlight" :aria-expanded="setupOpen" @click="toggleBrainModel" data-test="brain-compose-model">模型</Button>
     <Button type="button" size="sm" variant="ghost" :aria-expanded="toolsOpen" @click="toggleBrainTools" data-test="brain-compose-tools">工具</Button>
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
.bc-private-settings{top:auto!important;right:auto!important;left:max(10px,calc((100% - 844px)/2 + 64px));bottom:103px;width:min(410px,calc(100vw - 24px));max-height:min(67vh,540px)}
.bc-brain-trace{top:auto!important;right:auto!important;left:max(10px,calc((100% - 844px)/2 + 115px));bottom:103px;width:min(320px,calc(100vw - 24px));max-height:65vh}
@media(max-width:719px){.bc-brain-context-menu,.bc-private-settings,.bc-brain-trace{left:10px!important;bottom:96px;width:min(340px,calc(100vw - 20px))}}
</style>
