<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {currentFirstPartyWebSession,renewFirstPartyWebSession} from './local-first-party-session.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const session=ref(null),models=ref([]),selected=ref(''),message=ref('');
const busy=ref(false),connecting=ref(false),testText=ref(''),response=ref('');
let disposed=false,poll=null,csrf='';
const request=(url,options={})=>(props.fetchImpl||globalThis.fetch)(url,{
 credentials:'same-origin',cache:'no-store',redirect:'error',...options});
const read=async(url,options)=>{
 const res=await request(url,options);
 let data;try{data=await res.json()}catch{data=null}
 if(!res.ok)throw Error(String(data?.error||'HTTP_'+res.status));
 return data;
};
const sessionExpired=e=>['LOCAL_SESSION_REQUIRED','CURRENT_LOCAL_SESSION_OR_CSRF_REQUIRED',
 'CURRENT_SESSION_REVOKED_DURING_ROUTING'].includes(String(e?.message||e));
async function ensureCurrentSession({renew=false}={}){
 // Share the existing W47 browser-local in-flight session authority with WA
 // and Pancake. A separate ChatGPT bootstrap races their HttpOnly cookie.
 const fetcher=props.fetchImpl||globalThis.fetch;
 const s=await (renew?renewFirstPartyWebSession(fetcher):currentFirstPartyWebSession(fetcher));
 if(!['WEB_LOCAL_PRIVATE','NATIVE_FIRST_PARTY'].includes(s.sessionKind)||
    typeof s.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(s.csrfToken))
   throw Error('LOCAL_PRIVATE_SESSION_NOT_AVAILABLE');
 csrf=s.csrfToken;
}
async function currentSessionCall(action){
 await ensureCurrentSession();
 try{return await action()}
 catch(e){
  if(!sessionExpired(e))throw e;
  // Another local API process may have replaced its in-memory cookie state.
  // Re-issue the existing Web PRIVATE-only session once; never bypass an
  // actual third-party provider grant or retry an external action blindly.
  csrf='';
  await ensureCurrentSession({renew:true});
  return action();
 }
}
const requestPost=(url,body={})=>read(url,{
 method:'POST',headers:{'content-type':'application/json','x-yance-csrf':csrf},body:JSON.stringify(body)
});
async function refresh(){
 try{
  const data=await currentSessionCall(()=>read('/api/v2/chatgpt/status'));
  if(disposed)return;
  session.value=data;connecting.value=data.connecting===true;
  if(data.lastError?.message)message.value=data.lastError.message;
  else if(!data.connecting||sessionExpired({message:message.value.replace(/^连接状态：/,'')}))
   message.value='';
  if(data.status==='connected'&&data.sharing){
   const list=await read('/api/v2/chatgpt/models');
   if(disposed)return;
   models.value=Array.isArray(list.models)?list.models:[],
   selected.value=models.value.some(m=>m.modelId===selected.value)?selected.value:(models.value[0]?.modelId||'');
  }else{models.value=[];selected.value=''}
  if(!connecting.value&&poll){clearInterval(poll);poll=null}
 }catch(e){
  if(!disposed)message.value='连接状态：'+String(e.message||e).slice(0,120);
  if(poll){clearInterval(poll);poll=null}
 }
}
async function connect(){
 if(busy.value)return;
 busy.value=true;message.value='正在打开 ChatGPT 官方登录页面…';
 try{
  const s=await currentSessionCall(()=>requestPost('/api/v2/chatgpt/sign-in'));
  if(s.status!=='CONNECTING')throw Error('SIGN_IN_NOT_STARTED');
  connecting.value=true;message.value='请在打开的浏览器页面登录并确认授权。完成后这里会自动更新。';
  if(poll)clearInterval(poll);
  poll=setInterval(()=>{void refresh()},2500);
 }catch(e){message.value=String(e.message||e).slice(0,170)}
 finally{busy.value=false}
}
async function disconnect(){
 if(busy.value)return;
 busy.value=true;try{
  await currentSessionCall(()=>requestPost('/api/v2/chatgpt/disconnect'));
  message.value='已断开 ChatGPT';response.value='';await refresh();
 }catch(e){message.value=String(e.message||e).slice(0,140)}
 finally{busy.value=false}
}
async function test(){
 if(busy.value||!selected.value||!testText.value.trim())return;
 busy.value=true;message.value='正在请求官方 ChatGPT 模型的真实回答…';response.value='';
 try{
  const receipt=await currentSessionCall(()=>requestPost('/api/v2/chatgpt/test-turn',{model:selected.value,text:testText.value.trim()}));
  if(receipt.verifiedProviderResponse!==true||!receipt.text)throw Error('MODEL_RESPONSE_NOT_CONFIRMED');
  response.value=receipt.text;message.value='官方 SDK 真实响应已返回。这是模型连接测试，未写入 Agno 历史。';
 }catch(e){message.value='测试失败：'+String(e.message||e).slice(0,140)}
 finally{busy.value=false}
}
onMounted(()=>{void refresh()});
onBeforeUnmount(()=>{disposed=true;if(poll)clearInterval(poll)});
</script>
<template>
 <section class="bc-siwc" data-test="chatgpt-official-sdk">
  <header><strong>ChatGPT 官方账号连接</strong><small>OpenAI @siwc/local · 独立于 API Key</small></header>
  <div class="bc-siwc-state" data-test="chatgpt-official-state">
   <span>{{session?.status==='connected'?(session.sharing?'已连接 · 已获模型使用授权':'已登录 · 模型使用尚未授权'):connecting?'正在等待登录':'未连接'}}</span>
   <small v-if="session?.identity?.email">{{session.identity.email}}</small>
  </div>
  <div class="bc-siwc-actions">
   <button type="button" data-test="chatgpt-official-connect" :disabled="busy||connecting"
    @click="connect">{{connecting?'请完成浏览器授权':session?.status==='connected'?'重新连接 ChatGPT':'使用 ChatGPT 登录'}}</button>
   <button v-if="session?.status==='connected'" type="button" data-test="chatgpt-official-disconnect"
    :disabled="busy" @click="disconnect">断开</button>
   <button type="button" :disabled="busy" data-test="chatgpt-official-refresh" @click="refresh">检查状态</button>
  </div>
  <p v-if="message" role="status" data-test="chatgpt-official-message">{{message}}</p>
  <div v-if="session?.status==='connected'&&session.sharing" class="bc-siwc-test">
   <label>测试官方模型连接
    <select v-model="selected" data-test="chatgpt-official-model">
     <option v-for="m in models" :key="m.modelId" :value="m.modelId">{{m.name}}</option>
    </select>
   </label>
   <textarea v-model="testText" rows="3" maxlength="2000" data-test="chatgpt-official-test-input"
    placeholder="输入一句测试问题，确认 ChatGPT 能否真实回答"/>
   <button type="button" :disabled="busy||!selected||!testText.trim()"
    data-test="chatgpt-official-test-send" @click="test">测试真实回答</button>
   <p v-if="response" data-test="chatgpt-official-test-answer">{{response}}</p>
   <small>测试只使用官方 SDK 的 Responses 调用，不会假装写入 Agno 的多轮对话历史。</small>
  </div>
 </section>
</template>
<style>
.bc-siwc{display:grid;gap:12px;border:1px solid var(--border);border-radius:14px;padding:18px;background:var(--bg2);min-width:0}
.bc-siwc>header{display:flex;gap:7px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.bc-siwc>header strong{font-size:17px}
.bc-siwc>header small,.bc-siwc-state small{color:var(--muted);font-size:12px}
.bc-siwc-state{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px}
.bc-siwc-actions{display:flex;gap:9px;flex-wrap:wrap}
.bc-siwc button{cursor:pointer;border:1px solid var(--border);border-radius:9px;min-height:38px;padding:8px 12px;color:var(--ink);background:var(--surface-soft);font-size:13px}
.bc-siwc button:first-child{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.bc-siwc button:disabled{cursor:default;opacity:.6}
.bc-siwc p{margin:0;line-height:1.65;font-size:13px;overflow-wrap:anywhere}
.bc-siwc-test{display:grid;gap:10px;min-width:0}
.bc-siwc-test label{display:grid;gap:7px;font-size:13px}
.bc-siwc-test select,.bc-siwc-test textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft);color:var(--ink);padding:10px}
.bc-siwc-test small{color:var(--muted);font-size:12px}
</style>
