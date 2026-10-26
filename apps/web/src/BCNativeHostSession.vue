<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {createNativeSessionViewer} from './native-host-status-port.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const state=ref('正在核验'),active=ref(false),busy=ref(false);
let alive=true,generation=0;
const viewer=createNativeSessionViewer({fetchImpl:(url,opts)=>
 (props.fetchImpl||globalThis.fetch)(url,opts)});
async function check(){
 const rev=++generation;busy.value=true;
 try{
  const r=await viewer.inspect();
  if(!alive||rev!==generation)return;
  active.value=r.nativeActive;
  state.value=r.trustedForBrain?'Windows 与 W47 服务端均已确认':
   r.nativeActive?'Windows 本地会话已启动，但 W47 可信自动登录尚未接通':
   'Windows 原生会话未激活';
 }catch{
  if(alive&&rev===generation){
   active.value=false;state.value=viewer.available?'无法读取 Windows 原生会话':
    '当前是网页预览；请在官方 Windows 程序中检查原生会话';
  }
 }finally{if(alive&&rev===generation)busy.value=false}
}
async function logout(){
 if(!active.value||busy.value||!viewer.available)return;
 const rev=++generation;busy.value=true;
 try{
  const r=await viewer.logout();
  if(!alive||rev!==generation)return;
  active.value=r.nativeActive;
  state.value='已调用 Windows 原生注销；W47 权限须再次独立回读';
 }catch{if(alive&&rev===generation)state.value='原生注销回执不可用，不能宣称退出成功'}
 finally{if(alive&&rev===generation)busy.value=false}
}
onMounted(check);onBeforeUnmount(()=>{alive=false;generation++});
</script>
<template>
 <section class="bc-native-host" data-test="w46-native-session" aria-label="Windows 本机应用会话">
  <strong>Windows 原生会话</strong>
  <p role="status" data-test="w46-native-session-state">{{state}}</p>
  <div>
   <Button size="sm" variant="outline" data-test="w46-native-session-check" :disabled="busy" @click="check">检查本机身份</Button>
   <Button v-if="active" size="sm" variant="outline" data-test="w46-native-session-logout" :disabled="busy" @click="logout">退出当前原生会话</Button>
  </div>
  <small>本机身份不等于 Agno 模型和云端费用授权。只有 W47 实际会话回读可放行 PRIVATE。</small>
 </section>
</template>
<style scoped>
.bc-native-host{display:grid;gap:8px;border:1px solid var(--w46-edge,#777);border-radius:9px;padding:12px;min-width:0}
.bc-native-host div{display:flex;flex-wrap:wrap;gap:8px}
.bc-native-host p,.bc-native-host small{font-size:12px}
</style>
