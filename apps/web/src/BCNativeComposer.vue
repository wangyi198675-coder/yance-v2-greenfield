<script setup>
import {computed,ref,watch} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {InputGroup,InputGroupTextarea} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/input-group';
import {createComposerBridge,fullK} from './composer-bridge.mjs';

// Replacement seam for the ONE selected B+C CONTACT Composer; not a second sender.
const props=defineProps({
  identity:{type:Object,default:null}, sourceMid:{type:String,default:''},
  suggestions:{type:Array,default:()=>[]}, nativeMessage:{type:Object,default:null},
  takeoverPort:{type:Object,default:null}
});
let bridge=createComposerBridge({takeoverPort:props.takeoverPort});
const current=ref({key:null,status:'NO_CONTACT',draft:null,canSend:false});
const composing=ref(false),compositionK=ref(null),why=ref('');
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
function onPaste(event){if(event.clipboardData?.files?.length)
  action('PASTE',{attachments:filesOf(event.clipboardData.files)})}
function chooseSuggestion(row){const id=safeIdentity();if(!id)return;
  try{bridge.adoptCandidate(id,row,currentMid.value);why.value='';update()}
  catch(e){why.value=String(e.message||e)}}
function sourceQuote(source){const id=safeIdentity();if(!id)return false;
  try{bridge.quote(id,source);update();return true}catch{return false}}
defineExpose({sourceQuote}); // Parent timeline source MID, never synthetic quotation.
</script>

<template>
  <section class="bc-native-composer" aria-label="唯一 CONTACT Composer" @dragover.prevent @drop="onDrop">
    <p class="bc-identity">CONTACT · {{current.key||'NO_CONTACT'}} · {{current.status}}</p>
    <p v-if="why" role="alert" class="bc-warning">{{why}}</p>
    <div v-if="sourceMessage" class="bc-source" data-test="native-message">
      <p>原文 · MID {{sourceMessage.mid}} · {{sourceMessage.original}}</p>
      <p v-if="sourceMessage.zh">有来源的译文（质量另行验收） · {{sourceMessage.zh}}</p>
      <p v-else>中文译文：{{sourceMessage.translationStatus==='FIXTURE_ONLY'?'仅模拟数据，不作为真实译文':'暂无经过验证的译文'}}</p>
    </div>
    <div class="bc-replies" aria-label="有来源的建议回复">
      <span>{{cards.length}} 条有来源建议</span>
      <div v-for="s in cards" :key="s.id" class="bc-card">
        <p>{{s.text}}</p><small>Agno Run {{s.provenance.runId}} · MID {{s.provenance.sourceMid}}</small>
        <Button size="sm" variant="outline" @click="chooseSuggestion(s)">填入草稿</Button>
      </div>
    </div>
    <div v-if="current.draft?.quote" class="bc-quote">引用 MID {{current.draft.quote.mid}}</div>
    <InputGroup>
      <InputGroupTextarea :model-value="current.draft?.text||''"
        :disabled="!current.key" aria-label="当前 CONTACT 私有草稿"
        placeholder="输入消息后核验真实接管；未授权不会发送"
        @update:model-value="onInput" @compositionstart="startIME"
        @compositionend="endIME" @paste="onPaste"/>
    </InputGroup>
    <div class="bc-footer">
      <label class="bc-file-label">附件<input type="file" multiple @change="onAttach" :disabled="!current.key"/></label>
      <span>真人发送锁定 · 等待 W25 唯一 MessageDelivery</span>
      <Button disabled size="sm">发送不可用</Button>
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
</style>
