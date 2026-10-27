<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import {checkChannel,setupChannel,channelError} from './channel-setup-contract.mjs';
const props=defineProps({channel:{type:Object,required:true},fetchImpl:{type:Function,default:null}});
const state=ref('checking'),notice=ref(''),busy=ref(false),receipt=ref(null);
let alive=true,revision=0,expiryTimer=null;
const fetcher=()=>props.fetchImpl||globalThis.fetch;
function clearReceipt(){receipt.value=null;if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null}}
async function refresh(){
 const id=++revision;clearReceipt();busy.value=true;state.value='checking';notice.value='';
 try{
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  state.value=v.state;
  notice.value=v.online?'原生服务确认当前已授权账号在线':'尚未完成本人官方授权';
 }catch(e){
  if(alive&&id===revision){state.value='unavailable';notice.value=channelError(e)}
 }finally{if(alive&&id===revision)busy.value=false}
}
async function setup(){
 const id=++revision;clearReceipt();busy.value=true;notice.value='';
 try{
  const v=await setupChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  receipt.value=v;state.value='WAITING_USER_AUTH';
  notice.value='原生服务要求本人按官方流程授权。授权前仍为未连接';
  if(v.qr){
   expiryTimer=setTimeout(()=>{
    if(alive&&id===revision){clearReceipt();state.value='EXPIRED';notice.value='真实二维码已过期，请重新申请'}
   },Math.max(0,v.qr.expiresAt-Date.now()));
  }
 }catch(e){
  if(alive&&id===revision){state.value='unavailable';notice.value=channelError(e)}
 }finally{if(alive&&id===revision)busy.value=false}
}
onMounted(refresh);
onBeforeUnmount(()=>{alive=false;revision++;clearReceipt()});
</script>
<template>
 <div class="w46-channel" data-test="w46-native-provider" :data-provider="channel.id">
  <BCBrandIcon :name="channel.id" :size="23"/>
  <strong>{{channel.label}}</strong>
  <small role="status" data-test="native-provider-state">{{state==='ONLINE_VERIFIED'?'原生账号 ONLINE_VERIFIED':state==='checking'?'正在读取当前 SDK':'WAITING_USER_AUTH / '+state}}</small>
  <p data-test="native-provider-feedback">{{notice}}</p>
  <div class="native-actions">
   <Button variant="outline" size="sm" data-test="native-provider-check" :disabled="busy" @click="refresh">检查连接</Button>
   <Button variant="outline" size="sm" data-test="native-provider-setup" :disabled="busy||state==='ONLINE_VERIFIED'" @click="setup">准备官方授权</Button>
  </div>
  <template v-if="receipt">
   <small>原生流程：{{receipt.nextAction}}</small>
   <a v-if="receipt.officialConnectUrl" :href="receipt.officialConnectUrl"
      target="_blank" rel="noopener noreferrer" data-test="native-provider-connect-real">
     打开已安装的 Facebook 官方授权程序
   </a>
   <a v-if="receipt.officialDocs" :href="receipt.officialDocs" target="_blank"
      rel="noopener noreferrer" data-test="native-provider-docs">查看官方授权步骤</a>
   <div v-if="receipt.qr" data-test="native-provider-qr">
    <img :src="receipt.qr.src" alt="由 Baileys 原生连接产生的当前 WhatsApp 二维码"/>
    <small>请本人扫码，扫码后必须回读实际连接状态；到期自动清除</small>
   </div>
  </template>
 </div>
</template>
<style scoped>
.w46-channel{display:grid;align-content:start;gap:8px;min-width:0}
.w46-channel p,.w46-channel small{font-size:12px;overflow-wrap:anywhere}
.native-actions{display:flex;flex-wrap:wrap;gap:6px}
.native-actions button{max-width:100%}
.w46-channel img{width:min(240px,100%);height:auto}
.w46-channel a{color:var(--w46-accent,currentColor);text-decoration:underline;font-size:12px}
</style>
