<script setup>
import {computed,ref,watch,nextTick,onMounted,onBeforeUnmount} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {InputGroup,InputGroupTextarea} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/input-group';
import {createComposerBridge,fullK} from './composer-bridge.mjs';

// Replacement seam for the ONE selected B+C CONTACT Composer; not a second sender.
const props=defineProps({
  identity:{type:Object,default:null}, sourceMid:{type:String,default:''},
  suggestions:{type:Array,default:()=>[]}, nativeMessage:{type:Object,default:null},
  takeoverPort:{type:Object,default:null}, draftCandidatePort:{type:Object,default:null}
});
let bridge=createComposerBridge({takeoverPort:props.takeoverPort});
const current=ref({key:null,status:'NO_CONTACT',draft:null,canSend:false});
const composing=ref(false),compositionK=ref(null),why=ref('');
const expertsOpen=ref(false),contactMenu=ref(null),composerRoot=ref(null);
const contactTrigger=Object.freeze({experts:'w46-composer-plus',model:'w46-composer-model',mode:'w46-contact-mode'});
function closeContactMenu(restoreFocus=false){
 const prior=contactMenu.value;
 contactMenu.value=null;expertsOpen.value=false;
 if(restoreFocus&&prior)nextTick(()=>composerRoot.value?.querySelector('[data-test="'+contactTrigger[prior]+'"]')?.focus());
}
async function toggleContactMenu(which){
 if(contactMenu.value===which){closeContactMenu(true);return}
 contactMenu.value=which;expertsOpen.value=which==='experts';
 await nextTick();
 composerRoot.value?.querySelector('.bc-compose-popup button:not(:disabled)')?.focus();
}
function contactMenuKeyboard(e){
 if(!contactMenu.value)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeContactMenu(true);return}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 const popup=composerRoot.value?.querySelector('.bc-compose-popup');
 if(!popup?.contains(document.activeElement))return;
 const buttons=[...popup.querySelectorAll('button:not(:disabled)')];
 if(!buttons.length)return;
 e.preventDefault();const at=buttons.indexOf(document.activeElement);
 const i=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowDown'?(at+1)%buttons.length:(at<=0?buttons.length-1:at-1);
 buttons[i].focus();
}
function contactOutsideClick(e){
 if(!contactMenu.value)return;
 if(!e.target.closest?.('.bc-compose-popup, [data-test="w46-composer-plus"], [data-test="w46-composer-model"], [data-test="w46-contact-mode"]'))closeContactMenu();
}
onMounted(()=>{document.addEventListener('keydown',contactMenuKeyboard);document.addEventListener('pointerdown',contactOutsideClick)});
onBeforeUnmount(()=>{document.removeEventListener('keydown',contactMenuKeyboard);document.removeEventListener('pointerdown',contactOutsideClick)});
watch(()=>props.identity,()=>closeContactMenu());
const designExperts=['人格与真人表达专家','德国 WhatsApp 自然聊天专家','欧洲语言文化专家','长期关系记忆专家','聊天目标规划专家','回复质量成长专家','多媒体对话专家','系统健康安全专家','开源能力发现专家','安全修复升级专家'];
const update=()=>{current.value=bridge.view()};
const safeIdentity=()=>{try{return props.identity&&current.value.key===fullK(props.identity)?props.identity:null}catch{return null}};
const sourceMessage=computed(()=>{
  const id=safeIdentity(),m=props.nativeMessage;
  return id&&m?.identityKey===fullK(id)&&m.mid&&m.delivery==='NOT_REQUESTED'&&
    m.canSend===false?m:null;
});
const currentMid=computed(()=>sourceMessage.value?.mid||props.sourceMid);
watch(()=>props.takeoverPort,()=>{
  bridge=createComposerBridge({takeoverPort:props.takeoverPort});why.value='';
  if(props.identity)bridge.choose(props.identity);update();
});
watch(()=>props.identity,async id=>{
  if(!id){bridge=createComposerBridge({takeoverPort:props.takeoverPort});update();return}
  try{bridge.choose(id);update();await bridge.inspect(id);update()}
  catch(e){why.value=String(e.message||e);current.value={key:null,status:'BLOCKED',draft:null,canSend:false}}
},{immediate:true});
const cards=computed(()=>{
  if(!safeIdentity())return [];
  try{return bridge.candidates(props.identity,currentMid.value,
    sourceMessage.value?sourceMessage.value.suggestions:props.suggestions)}
  catch{return []} // Invalid/unsourced suggestions are not rendered.
});
async function action(kind,patch){
  const identity=safeIdentity();if(!identity)return;
  try{const call=bridge.userAction(identity,kind,patch);update();const result=await call;
    why.value=result.reason||'';update();}
  catch(e){why.value=String(e.message||e);update()}
}
function onInput(v){if(!composing.value)action('TYPE',{text:String(v)})}
function startIME(){composing.value=true;compositionK.value=current.value.key}
function endIME(event){
  composing.value=false;
  if(compositionK.value===current.value.key)action('IME_COMMIT',{text:event.target.value});
  compositionK.value=null;
}
function filesOf(list){return Array.from(list||[]).map(f=>({name:f.name,size:f.size}))}
function onDrop(event){event.preventDefault();if(event.dataTransfer?.files?.length)
  action('DROP',{attachments:filesOf(event.dataTransfer.files)})}
function onAttach(event){if(event.target.files?.length)action('ATTACH',{attachments:filesOf(event.target.files)});
  event.target.value=''}
function onPaste(event){
  if(event.clipboardData?.files?.length){event.preventDefault();
    action('PASTE',{attachments:filesOf(event.clipboardData.files)});return}
  const str=event.clipboardData?.getData('text/plain');
  if(typeof str==='string'&&str.length){
    event.preventDefault();const element=event.target,old=String(current.value.draft?.text||'');
    const a=Number.isInteger(element.selectionStart)?element.selectionStart:old.length;
    const b=Number.isInteger(element.selectionEnd)?element.selectionEnd:a;
    action('PASTE',{text:old.slice(0,a)+str+old.slice(b)})
  }
}
async function chooseSuggestion(row){const id=safeIdentity();if(!id)return;
  try{
    if(typeof props.draftCandidatePort?.draftCandidate!=='function')throw Error('W45_DRAFT_PORT_UNAVAILABLE');
    const capturedK=fullK(id),capturedMid=currentMid.value;
    const receipt=await props.draftCandidatePort.draftCandidate({...id},capturedMid,row.id);
    if(!safeIdentity()||fullK(safeIdentity())!==capturedK||currentMid.value!==capturedMid)
      throw Error('STALE_W45_CONTACT_SELECTION');
    bridge.insertW45Draft(id,capturedMid,row,receipt);why.value='';update();
  }catch(e){why.value=String(e.message||e);update()}
}
function onSendAttempt(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!composing.value){
  e.preventDefault();action('SEND_ATTEMPT',{})}}
function onVoiceReady(metadata){if(metadata?.size>=0)action('VOICE',{attachments:[metadata]})}
// Voice is supplied by the existing capture/attachment owner, never fabricated here.
function sourceQuote(source){const id=safeIdentity();if(!id)return false;
  try{bridge.quote(id,source);update();return true}catch{return false}}
defineExpose({sourceQuote,onVoiceReady}); // Parent timeline source MID, never synthetic quotation.
</script>

<template>
  <section ref="composerRoot" class="bc-native-composer" aria-label="唯一 CONTACT Composer" @dragover.prevent @drop="onDrop">
    <p class="bc-identity" :title="current.key?'当前联系人身份由原W24/W47接口核验':'尚未选择经平台授权的真实联系人'">{{current.key?'当前联系人 · '+current.status:'未选联系人 · 发送已禁用'}}</p>
    <p v-if="why" role="alert" class="bc-warning">{{why}}</p>
    <div v-if="sourceMessage" class="bc-source" data-test="native-message">
      <p>原文 · MID {{sourceMessage.mid}} · {{sourceMessage.original}}</p>
      <p v-if="sourceMessage.zh">有来源的译文（质量另行验收） · {{sourceMessage.zh}}</p>
      <p v-else>中文译文：{{sourceMessage.translationStatus==='FIXTURE_ONLY'?'仅模拟数据，不作为真实译文':'暂无经过验证的译文'}}</p>
    </div>
    <div v-if="current.key" class="bc-replies" aria-label="有来源的建议回复">
      <span>{{cards.length}} 条有来源建议（质量审核：未通过正式签署）</span>
      <div v-for="s in cards" :key="s.id" class="bc-card">
        <p>{{s.text}}</p><small>未审核 · {{s.qualityStatus||'MODEL_QUALITY_UNREVIEWED'}} · 候选 {{s.id}} · Agno Run {{s.provenance.runId}} · MID {{s.provenance.sourceMid}}</small>
        <Button size="sm" variant="outline" @click="chooseSuggestion(s)">填入草稿</Button>
      </div>
    </div>
    <div v-if="current.draft?.quote" class="bc-quote">引用 MID {{current.draft.quote.mid}}</div>
    <InputGroup>
      <InputGroupTextarea :model-value="current.draft?.text||''"
        :disabled="!current.key" aria-label="当前 CONTACT 私有草稿"
        placeholder="输入消息后核验真实接管；未授权不会发送"
        @update:model-value="onInput" @compositionstart="startIME"
        @compositionend="endIME" @paste="onPaste" @keydown="onSendAttempt"/>
    </InputGroup>
    <div class="bc-footer">
      <Button size="sm" variant="ghost" type="button" data-test="w46-composer-plus" aria-haspopup="menu" aria-controls="w46-contact-experts-menu" :aria-expanded="expertsOpen" @click="toggleContactMenu('experts')">＋ 专家</Button>
      <Button size="sm" variant="ghost" type="button" data-test="w46-composer-model" aria-haspopup="menu" aria-controls="w46-contact-model-menu" :aria-expanded="contactMenu==='model'" @click="toggleContactMenu('model')">模型</Button>
      <button type="button" class="bc-mode-label bc-compact-menu-trigger" data-test="w46-contact-mode" aria-haspopup="menu" aria-controls="w46-contact-mode-menu" :aria-expanded="contactMenu==='mode'" @click="toggleContactMenu('mode')">人工 · 辅助 · 自动（待核验）⌄</button>
      <label class="bc-file-label">附件<input type="file" multiple @change="onAttach" :disabled="!current.key"/></label>
      <span class="bc-send-hold" title="真人发送仅允许原W25唯一MessageDelivery通过当前身份及ACK授权边界">未授权 · 不能发送</span>
      <Button disabled size="sm">发送不可用</Button>
    </div>
    <div v-if="expertsOpen" class="bc-expert-candidates bc-compose-popup" data-test="w46-composer-experts" id="w46-contact-experts-menu" role="menu" aria-label="专家选择"><button type="button" data-test="w46-contact-expert-close" @click="toggleContactMenu('experts')">关闭</button>
      <strong>选择协作专家 · 暂未接通</strong>
      <p>本次任务、当前联系人或全局作用域需W43/W45真实注册及持久授权，不能按设计草稿伪造选择。</p>
      <button v-for="name in designExperts" :key="name" type="button" disabled :title="name+'尚未获得原生可用确认'">{{name}} · 未安装核验</button>
    </div>    <div v-if="contactMenu==='model'" class="bc-compose-popup" role="menu" data-test="w46-contact-model-popup" id="w46-contact-model-menu">
      <div class="bc-popup-head"><strong>联系人模型</strong><button type="button" @click="toggleContactMenu('model')">关闭</button></div>
      <p>尚未取得当前联系人完整身份K、原生模型费用预算与授权，不能使用闺蜜大脑私人模型的权限代替。</p>
      <button type="button" disabled>本地模型 · 待资格回读</button><button type="button" disabled>云端模型 · 待密钥和批准</button>
    </div>
    <div v-if="contactMenu==='mode'" class="bc-compose-popup" role="menu" data-test="w46-contact-mode-popup" id="w46-contact-mode-menu">
      <div class="bc-popup-head"><strong>回复模式</strong><button type="button" @click="toggleContactMenu('mode')">关闭</button></div>
      <p>三模式须由原W44/W47读取当前联系人有效授权，真实切换经写入与服务端再次回读才生效。</p>
      <button type="button" disabled data-test="w46-mode-human">人工 · 等待模式回读</button>
      <button type="button" disabled data-test="w46-mode-assisted">辅助 · 等待授权</button>
      <button type="button" disabled data-test="w46-mode-auto">自动托管 · 等待持续授权</button>
    </div>
  </section>
</template>

<style scoped>
.bc-native-composer{display:grid;gap:12px;min-width:0;padding:14px;border-top:1px solid var(--border, currentColor)}
.bc-identity,.bc-quote{font-size:12px;overflow-wrap:anywhere;opacity:.8}
.bc-replies{display:grid;gap:8px}.bc-card{display:grid;gap:6px;padding:8px;border:1px solid var(--border,currentColor);border-radius:10px}
.bc-card p{margin:0}.bc-card small{overflow-wrap:anywhere;opacity:.7}.bc-warning{font-size:12px;color:var(--destructive,inherit)}
.bc-footer{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:12px}
.bc-file-label{display:flex;gap:4px;align-items:center;max-width:160px}
.bc-file-label input{width:95px;max-width:100%}
@media(max-width:430px){.bc-native-composer{padding:10px}.bc-footer{align-items:flex-start}}

.bc-native-composer{gap:8px!important;border-top:1px solid var(--border);background:var(--bg2);border-radius:0 0 13px 13px;padding:9px 12px!important;max-height:min(42vh,360px);overflow-y:auto}
.bc-native-composer :deep(.cn-input-group){border-radius:17px!important;border-color:var(--border);background:linear-gradient(120deg,rgba(var(--accent-rgb),.04),transparent),var(--surface);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.bc-native-composer :deep(.cn-input-group:focus-within){border-color:var(--accent);box-shadow:0 0 0 3px rgba(var(--accent-rgb),.13)}
.bc-mode-label{color:var(--muted);font-size:10px}.bc-footer{justify-content:flex-start!important}.bc-footer .bc-file-label{margin-left:auto}
.bc-expert-candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:7px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px;max-height:220px;overflow:auto}.bc-expert-candidates strong,.bc-expert-candidates p{grid-column:1/-1;margin:0}.bc-expert-candidates p{font-size:11px;color:var(--muted)}
.bc-expert-candidates button{padding:8px;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft);color:var(--muted);text-align:left;opacity:.7}
/* Anchored R4 contextual menus; no second Composer or shadow sender. */
.bc-native-composer{position:relative;overflow:visible!important;max-height:none!important}
.bc-expert-candidates.bc-compose-popup{grid-template-columns:1fr}
.bc-compose-popup{position:absolute;box-sizing:border-box;left:12px;bottom:calc(100% - 1px);z-index:70;width:min(315px,calc(100vw - 32px));max-height:min(300px,58dvh);overflow:auto!important;display:grid;gap:8px;align-content:start;padding:12px;border:1px solid var(--border);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.26);background:var(--surface-raised,var(--surface));color:var(--ink)}
.bc-compose-popup p{font-size:11px;line-height:1.55;margin:0;color:var(--muted)}
.bc-compose-popup button{border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--surface-soft);color:var(--ink);text-align:left;font-size:11px}
.bc-compose-popup button:disabled{opacity:.6}.bc-popup-head{display:flex;align-items:center;justify-content:space-between}
.bc-mode-label.bc-compact-menu-trigger{border:1px solid var(--border);border-radius:8px;padding:7px;background:var(--surface-soft);color:var(--muted);font-size:10px;cursor:pointer}
@media(max-width:430px){.bc-compose-popup{left:4px;width:min(300px,calc(100vw - 24px))}}
</style>
