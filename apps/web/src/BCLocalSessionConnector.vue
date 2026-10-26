<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {checkedStatus,safeSessionError,validPairingCode} from './local-session-ui-contract.mjs';

const props=defineProps({fetchImpl:{type:Function,default:null}});
const code=ref('');
const session=ref({available:false,paired:false,expiresAt:null});
const csrf=ref('');
const busy=ref(false);
const error=ref('');
let mounted=true,revision=0,expiryTimer=null;
const clearExpiry=()=>{if(expiryTimer!==null){clearTimeout(expiryTimer);expiryTimer=null}};
const request=(path,options)=> (props.fetchImpl||globalThis.fetch)(path,{
 credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',...options
});
const reset=()=>{
 clearExpiry();
 session.value={available:false,paired:false,expiresAt:null};
 csrf.value='';
};
const serverError=(data,response)=>safeSessionError(data,response?.status);
const scheduleExpiry=expiresAt=>{
 clearExpiry();
 if(expiresAt===null)return;
 expiryTimer=setTimeout(()=>{
  expiryTimer=null;
  if(!mounted)return;
  // Expiry is fail-closed immediately; only GET can re-validate a session.
  reset();
  void refresh();
 },Math.max(0,expiresAt-Date.now()));
};
async function refresh(){
 const id=++revision;
 busy.value=true;error.value='';
 reset(); // never display a stale verified state during a pending GET
 try{
  const response=await request('/api/v2/local-session/status');
  if(!response.ok)throw Error('SESSION_STATUS_'+response.status);
  const data=await response.json();
  if(!mounted||id!==revision)return;
  const verified=checkedStatus(data);
  session.value={available:verified.available,paired:verified.paired,expiresAt:verified.expiresAt};
  csrf.value=verified.csrfToken;
  scheduleExpiry(verified.expiresAt);
 }catch(e){
  if(!mounted||id!==revision)return;
  reset();error.value='本机会话尚不可用：'+String(e.message||e);
 }finally{if(mounted&&id===revision)busy.value=false}
}
async function redeem(){
 if(busy.value||!session.value.available||session.value.paired)return;
 const pairingCode=code.value.trim();
 code.value=''; // never persist code, write URL, log or localStorage
 if(!validPairingCode(pairingCode)){error.value='请输入本机终端生成的64位一次性配对码';return}
 busy.value=true;error.value='';
 let requestError='';
 try{
  const response=await request('/api/v2/local-session/redeem',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({pairingCode})
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true||data.paired!==true)
   requestError='配对未成功：'+serverError(data,response);
 }catch{requestError='配对请求未完成，请检查本机服务端'}
 finally{code.value='';busy.value=false}
 // Server GET is the authority; POST response alone is never a success state.
 await refresh();
 if(requestError&&mounted)error.value=requestError;
}
async function logout(){
 if(busy.value||!session.value.paired||!validPairingCode(csrf.value))return;
 const token=csrf.value;
 busy.value=true;error.value='';
 let requestError='';
 try{
  const response=await request('/api/v2/local-session/logout',{
   method:'POST',headers:{'content-type':'application/json','x-yance-csrf':token},
   body:'{}'
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true||data.paired!==false)
   requestError='注销未确认：'+serverError(data,response);
 }catch{requestError='注销请求未完成，请重新检查本机会话'}
 finally{csrf.value='';busy.value=false}
 await refresh();
 if(requestError&&mounted)error.value=requestError;
}
onMounted(refresh);
onBeforeUnmount(()=>{mounted=false;revision++;reset();code.value='';csrf.value='';});
</script>
<template>
 <section class="bc-local-session" data-test="bc-local-session-connector" aria-label="本机会话">
  <div class="bc-local-head">
   <strong>本机连接</strong>
   <Button variant="outline" size="sm" :disabled="busy" data-test="local-session-refresh" @click="refresh">重新检查</Button>
  </div>
  <p role="status" data-test="local-session-verified-state">
   {{busy?'正在向本机服务端确认会话':!session.available?'接口未接通':session.paired?'本机会话已验证（不含任何社交平台授权）':'本机会话未配对'}}
  </p>
  <p v-if="error" class="bc-local-error" role="alert" data-test="local-session-error">{{error}}</p>
  <form v-if="session.available&&!session.paired" @submit.prevent="redeem">
   <p>在本机运行的言策 API 专属终端主动输入 <code>pair</code>，复制90秒内有效的配对码到下方。页面不能自行批准授权。</p>
   <label for="bc-local-pair-code">一次性本机配对码</label>
   <input id="bc-local-pair-code" v-model="code" type="password" inputmode="text"
    autocomplete="off" autocapitalize="off" spellcheck="false" data-test="local-session-one-use-code"
    maxlength="64" placeholder="64位配对码" :disabled="busy"/>
   <Button type="submit" size="sm" :disabled="busy||code.length!==64" data-test="local-session-redeem">验证连接</Button>
  </form>
  <div v-else-if="session.paired">
   <p>本机用户会话已连接。真实账号、联系人、发送权限仍未授权。</p>
   <Button size="sm" variant="outline" :disabled="busy" data-test="local-session-logout" @click="logout">退出本机会话</Button>
  </div>
  <p class="bc-local-caveat">PRIVATE Brain 的安全消息及历史 API 尚待 W47/W43 Owner 签署；未接通前不会生成假回答或启用发送。</p>
 </section>
</template>
<style scoped>
.bc-local-session{display:grid;gap:11px;border:1px solid var(--w46-edge, #686868);border-radius:12px;padding:16px;max-width:680px;min-width:0}
.bc-local-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.bc-local-session form{display:grid;gap:10px;min-width:0}
.bc-local-session input{box-sizing:border-box;width:100%;min-width:0;max-width:100%;padding:10px;border-radius:9px;border:1px solid var(--w46-edge,#777);color:var(--w46-text,inherit);background:var(--w46-panel,transparent)}
.bc-local-session button{justify-self:start}
.bc-local-error{color:#c74343;overflow-wrap:anywhere}
.bc-local-caveat{font-size:12px;opacity:.8}
</style>
