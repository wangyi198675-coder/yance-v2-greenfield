<script setup lang="ts">
import {ref,computed,onMounted,watch} from 'vue';
type Provider='OPENROUTER_USER_API'|'OPENAI_USER_API';
type Status={provider:Provider,configured:boolean,revoked:boolean,revision:number};
type NativeStatus={provider:string,configured:boolean,revoked:boolean,revision:number};
const props=defineProps<{webCsrf?:string|null}>();
const emit=defineEmits<{changed:[]}>();
const native=typeof window!=='undefined'&&(window as any).__TAURI__?.core?.invoke;
const path='/api/v2/private-brain/cloud-keys';
const vendors=[{id:'OPENROUTER_USER_API',label:'OpenRouter'},
 {id:'OPENAI_USER_API',label:'OpenAI API'}] as const;
const provider=ref<Provider>('OPENROUTER_USER_API');
const key=ref(''),current=ref<Status|null>(null);
const ready=ref(!!native),busy=ref(false),message=ref(''),stale=ref(false);
const webCsrfOk=computed(()=>typeof props.webCsrf==='string'&&/^[a-f0-9]{64}$/.test(props.webCsrf));
const webActive=computed(()=>typeof native!=='function'&&ready.value&&webCsrfOk.value);
const canConfigure=computed(()=>(typeof native==='function'||webActive.value)&&!stale.value);
const nativeId=(p:Provider)=>p==='OPENROUTER_USER_API'?'OPENROUTER':'OPENAI_API';
function verifiedStatus(v:unknown,p:Provider):Status{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_STATUS');
 const x=v as Record<string,unknown>;
 if(x.configured!==true&&x.configured!==false||typeof x.revoked!=='boolean'||
  !Number.isSafeInteger(x.revision)||(x.revision as number)<0||
  (x.provider!==p&&x.provider!==nativeId(p))||
  (x.configured===true&&x.revoked===true))throw Error('INVALID_STATUS');
 return {provider:p,configured:x.configured===true,revoked:x.revoked===true,revision:x.revision as number};
}
function safeResult(d:unknown){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('INVALID_RECEIPT');
 const x=d as Record<string,unknown>;
 if(x.ok!==true||x.canSend!==false||x.credentialValueReturned!==false)
  throw Error('INVALID_RECEIPT');
 return x;
}
async function webRequest(method:'GET'|'POST'|'DELETE',body?:Record<string,unknown>){
 if(typeof window==='undefined'||window.location.hostname!=='127.0.0.1'||
  !webCsrfOk.value||typeof globalThis.fetch!=='function')throw Error('WEB_PRIVATE_SESSION_UNAVAILABLE');
 const r=await globalThis.fetch(path,{method,credentials:'same-origin',
  cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
  ...(method==='GET'?{}:{headers:{'content-type':'application/json','x-yance-csrf':props.webCsrf!},
   body:JSON.stringify(body)})});
 if(!r.ok)throw Error('WEB_HTTP_'+r.status);
 return safeResult(await r.json());
}
async function webStatus(p:Provider):Promise<Status>{
 const d=await webRequest('GET');
 if(!Array.isArray(d.providers)||d.providers.length!==2)throw Error('INVALID_STATUS_LIST');
 const ids=new Set<string>(),statuses=new Map<Provider,Status>();
 for(const x of d.providers){
  const id=(x as Status)?.provider;
  if(!vendors.some(v=>v.id===id)||ids.has(id))throw Error('INVALID_STATUS_LIST');
  ids.add(id);statuses.set(id,verifiedStatus(x,id));
 }
 if(ids.size!==2||!statuses.has(p))throw Error('INVALID_STATUS_LIST');
 return statuses.get(p)!;
}
function userError(e:unknown){
 const s=String((e as Error)?.message||'');
 if(s==='WEB_HTTP_409')return '密钥版本已变化，请刷新状态后重试';
 if(s==='WEB_HTTP_401'||s==='WEB_HTTP_403')return '本机私人会话已失效或请求被拒绝，请检查连接';
 if(s==='WEB_HTTP_422')return 'API Key 或版本不符合服务端要求，请检查后重试';
 if(s==='WEB_HTTP_503'||s==='WEB_HTTP_404'||s==='WEB_PRIVATE_SESSION_UNAVAILABLE')
  return '网页版云端密钥接口暂未接通，请保留现有本地模型设置';
 return '本机密钥操作未取得可核验的服务端确认';
}
async function readStatus(p:Provider){
 if(typeof native==='function'){
  return verifiedStatus(await native('cloud_key_status',{provider:nativeId(p)}),p);
 }
 return webStatus(p);
}
async function refresh(){
 if(busy.value)return;
 busy.value=true;message.value='正在读取服务端密钥状态…';key.value='';
 const p=provider.value;
 try{
  const status=await readStatus(p);
  if(provider.value===p){current.value=status;ready.value=true;stale.value=false;message.value='状态已从服务端确认 · 版本 '+status.revision}
 }catch(e){stale.value=true;ready.value=typeof native==='function';message.value='刷新失败；以下仅为上次确认的状态，不能表示当前仍有效。'+userError(e)}
 finally{busy.value=false}
}
async function save(){
 if(busy.value||!canConfigure.value||key.value.length<16)return;
 const p=provider.value,previous=current.value;
 let pending=key.value;key.value='';
 busy.value=true;message.value='';
 try{
  if(typeof native==='function'){
   const r=await native('cloud_key_store',{provider:nativeId(p),secret:pending,
    ...(previous?.revision?{expectedRevision:previous.revision}:{})});
   verifiedStatus(r,p);
  }else{
   const r=await webRequest('POST',{provider:p,apiKey:pending,
    ...(previous?.revision?{expectedRevision:previous.revision}:{})});
   const written=verifiedStatus(r,p);
   if(!written.configured||written.revoked||written.revision<=0)throw Error('INVALID_RECEIPT');
  }
  const verified=await readStatus(p);
  if(!verified.configured||verified.revoked||
    verified.revision<=(previous?.revision||0))throw Error('STATUS_NOT_CONFIRMED');
  if(provider.value===p){current.value=verified;message.value='服务端已确认密钥保存状态'}
  emit('changed');
 }catch(e){
  current.value=previous;stale.value=true;ready.value=typeof native==='function';
  message.value='保存结果尚未取得可靠回读；原状态不能视为已删除。'+userError(e);
 }finally{pending='';busy.value=false}
}
async function revoke(){
 if(busy.value||!canConfigure.value||!current.value?.configured)return;
 const p=provider.value,previous=current.value;
 busy.value=true;message.value='';key.value='';
 try{
  if(typeof native==='function'){
   verifiedStatus(await native('cloud_key_revoke',{
    provider:nativeId(p),expectedRevision:previous.revision}),p);
  }else{
   const r=await webRequest('DELETE',{provider:p,expectedRevision:previous.revision});
   const removed=verifiedStatus(r,p);
   if(removed.configured||!removed.revoked)throw Error('INVALID_RECEIPT');
  }
  const verified=await readStatus(p);
  if(verified.configured||!verified.revoked||verified.revision<=previous.revision)
   throw Error('STATUS_NOT_CONFIRMED');
  if(provider.value===p){current.value=verified;message.value='服务端已确认密钥撤销'}
  emit('changed');
 }catch(e){current.value=previous;stale.value=true;ready.value=typeof native==='function';message.value='撤销状态未取得可靠回读；请重新验证。'+userError(e)}
 finally{busy.value=false}
}
function onProviderChange(){key.value='';current.value=null;stale.value=false;void refresh()}
onMounted(refresh);
watch(()=>props.webCsrf,()=>{if(typeof native!=='function')void refresh()});
</script>
<template>
 <section class="cloud-key-panel" data-test="cloud-key-native" aria-label="云端 AI Key 设置">
  <strong>云端 AI 密钥</strong>
  <p>可以使用自己的 OpenRouter 或 OpenAI API Key。本地 Qwen3 不受云端设置影响。</p>
  <label>来源
   <select v-model="provider" data-test="cloud-provider" :disabled="busy" @change="onProviderChange">
    <option v-for="p in vendors" :key="p.id" :value="p.id">{{p.label}}</option>
   </select>
  </label>
  <p role="status" data-test="cloud-redacted-status">
    {{stale?'上次已确认（当前状态未核验）':current?.configured?'已保存':current?.revoked?'已撤销':current?'未配置':'待读取'}}
    <span v-if="current"> · 版本 {{current.revision}}</span>
   </p>
   <p v-if="!canConfigure" role="status" data-test="cloud-web-provider-pending">
   当前会话或服务端密钥状态未确认，暂不能提交新 Key。刷新失败不会删除已保存的密钥。
  </p>
  <button v-if="!canConfigure" type="button" data-test="cloud-refresh-pending" :disabled="busy" @click="refresh">重新检查状态</button>
   <template v-else>
   <form @submit.prevent="save">
    <label>API Key
     <input v-model="key" type="password" autocomplete="off" autocapitalize="off"
      spellcheck="false" data-lpignore="true" placeholder="输入自己的 API Key"
      aria-label="仅提交到本机同源密钥服务的 API Key"
      data-test="cloud-secret-input" :disabled="busy"/>
    </label>
    <button type="submit" data-test="cloud-save" :disabled="busy||key.length<16">
     {{current?.configured?'更新密钥':'保存密钥'}}
    </button>
    <button type="button" data-test="cloud-revoke" :disabled="busy||!current?.configured"
     @click="revoke">撤销</button>
    <button type="button" data-test="cloud-refresh" :disabled="busy" @click="refresh">刷新状态</button>
   </form>
  </template>
  <p>Key 不会回填到输入框。密钥设置不自动启动收费推理；首次选择收费模型或主动切换收费来源时确认一次，之后同一已授权模型正常连续聊天。</p>
  <p v-if="message" role="status" data-test="cloud-action-result">{{message}}</p>
 </section>
</template>
<style scoped>
.cloud-key-panel{display:grid;gap:10px;border:1px solid var(--w46-edge,#777);padding:14px;border-radius:10px;min-width:0}
.cloud-key-panel form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
.cloud-key-panel label{display:grid;gap:5px;min-width:0}
.cloud-key-panel input,.cloud-key-panel select{border:1px solid var(--w46-edge,#777);border-radius:6px;padding:8px;background:transparent;color:inherit;max-width:330px;min-width:0;width:100%;box-sizing:border-box}
.cloud-key-panel button{padding:8px 12px;border:1px solid var(--w46-edge,#777);border-radius:6px}
.cloud-key-panel p{font-size:12px;margin:0;overflow-wrap:anywhere}
</style>
