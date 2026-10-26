<script setup>
import {computed,ref,watch} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {Popover,PopoverTrigger,PopoverContent} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/popover';
import {createManagedStopController} from './managed-stop.mjs';
import {fullK} from './composer-bridge.mjs';
// Reuses existing B+C conversation header, no second agent or dashboard.
// The server (not Vue) must authenticate Actor/account/peer/scope and mutate W44.
const emit=defineEmits(['authority-change']);
const props=defineProps({identity:{type:Object,default:null},stopPort:{type:Object,default:null},
 appearance:{type:String,default:'light'}});
const menuOpen=ref(false),contact=ref(null),account=ref(null);
const busy=ref(''),reason=ref('');
let controller=createManagedStopController({port:props.stopPort});
let revision=0;
const activeK=computed(()=>{try{return props.identity?fullK(props.identity):null}catch{return null}});
const statusLabel=s=>s?.status==='COMMITTED'?'已停止':s?.status==='PENDING'?'停止中':
 s?.status==='STOPPING'?'正在停止':s?.status==='UNQUALIFIED'?'没有有效托管授权':
 s?.status==='ACTIVE'?'正在托管':'接口未接入/无法确认';
function selected(scope){return scope==='CONTACT'?contact:account}
async function refresh(){
 const epoch=++revision;
 const id=props.identity;
 if(!id){contact.value=null;account.value=null;return}
 let k;try{k=fullK(id)}catch{return}
 const rows=await Promise.all(['CONTACT','GLOBAL'].map(scope=>controller.read(id,scope)));
 if(epoch!==revision||activeK.value!==k)return;
 contact.value=rows[0];account.value=rows[1];
 emit('authority-change',{identity:{...id},identityKey:k,scope:'CONTACT',status:rows[0].status});
 emit('authority-change',{identity:{...id},identityKey:k,scope:'GLOBAL',status:rows[1].status});
}
watch(()=>props.stopPort,()=>{controller=createManagedStopController({port:props.stopPort});refresh()});
watch(activeK,refresh,{immediate:true});
async function stop(scope){
 if(!activeK.value||busy.value)return;
 const id={...props.identity},k=activeK.value,epoch=revision;
 busy.value=scope;reason.value='';
 try{
   const result=await controller.stop(id,scope);
   if(activeK.value!==k||revision!==epoch)return;
   selected(scope).value=result;
   emit('authority-change',{identity:{...id},identityKey:k,scope,status:result.status});
   reason.value=result?.reason||'';
 }catch(e){if(activeK.value===k)reason.value=String(e?.message||e)}
 finally{busy.value=''}
}
const header=computed(()=>{
 const states=[contact.value,account.value].map(x=>x?.status);
 return states.includes('PENDING')?'停止中':
  states.includes('STOPPING')?'正在停止':
  states.includes('COMMITTED')?'已停止':'停止托管';
});
defineExpose({refresh});
</script>

<template>
 <Popover :open="menuOpen" @update:open="v=>{menuOpen=v;if(v)refresh()}">
  <PopoverTrigger as-child>
   <Button v-if="activeK" variant="outline" size="sm"
     data-test="stop-managed-trigger" aria-label="管理当前联系人和账号自动托管">
     {{header}}
   </Button>
  </PopoverTrigger>
  <PopoverContent align="end" class="bc-stop-menu" :data-mode="appearance">
   <div data-test="managed-stop-controls" role="group" aria-label="停止托管控制">
    <strong>停止自动托管</strong>
    <p class="bc-stop-hint">仅当前选中的账号和联系人。停止后不发送任何消息。</p>
    <div class="bc-stop-line">
     <Button variant="outline" size="sm" data-test="stop-contact"
       :disabled="!!busy||contact?.status!=='ACTIVE'"
       @click="stop('CONTACT')">停止此联系人</Button>
     <span data-test="stop-contact-state" role="status">{{statusLabel(contact)}}</span>
    </div>
    <div class="bc-stop-line">
     <Button variant="outline" size="sm" data-test="stop-account"
       :disabled="!!busy||account?.status!=='ACTIVE'"
       @click="stop('GLOBAL')">停止当前账号</Button>
     <span data-test="stop-account-state" role="status">{{statusLabel(account)}}</span>
    </div>
    <p class="bc-stop-hint">账号范围限定当前平台账号，不影响其他账号。</p>
    <p v-if="reason" data-test="stop-error" role="alert">{{reason}}</p>
    <Button variant="ghost" size="sm" data-test="stop-refresh" @click="refresh">从服务端刷新状态</Button>
   </div>
  </PopoverContent>
 </Popover>
</template>

<style>
.bc-stop-menu{width:min(330px,calc(100vw - 24px));padding:12px;display:grid;gap:8px;
 background:#ffffff;color:#17212b;border:1px solid #d8dfe8;border-radius:12px;
 box-shadow:0 16px 45px #0005;z-index:100}
.bc-stop-menu[data-mode='dark']{background:#17293a;color:#f0f6fc;border-color:#37526a}
.bc-stop-menu :deep(button){border-color:currentColor}
.bc-stop-menu strong{font-size:13px}.bc-stop-hint{font-size:12px;opacity:.75;line-height:1.5}
.bc-stop-line{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bc-stop-line span{font-size:12px;overflow-wrap:anywhere;text-align:right;max-width:130px}
.bc-stop-menu [role="alert"]{color:var(--destructive,inherit);font-size:12px;overflow-wrap:anywhere}
</style>
