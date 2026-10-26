<script setup lang="ts">
import {ref,onMounted} from 'vue';
type Provider='OPENROUTER'|'OPENAI_API';
type Status={provider:Provider,configured:boolean,revoked:boolean,revision:number};
const native=typeof window!=='undefined'&&(window as any).__TAURI__?.core?.invoke;
const key=ref(''),provider=ref<Provider>('OPENROUTER'),current=ref<Status|null>(null);
const busy=ref(false),message=ref('');
const vendor=[{id:'OPENROUTER',label:'OpenRouter'},{id:'OPENAI_API',label:'OpenAI API'}] as const;
// Exactly the original installed Tauri 2 IPC, not fetch, HTTP, URL or localStorage.
async function command<T>(name:string,args:Record<string,unknown>):Promise<T>{
 if(typeof native!=='function')throw Error('请在已安装的言策桌面版配置密钥');
 return native(name,args);
}
async function refresh(){
 busy.value=true;message.value='';
 try{current.value=await command<Status>('cloud_key_status',{provider:provider.value})}
 catch(e){current.value=null;message.value='无法读取本机密钥状态：'+String(e)}
 finally{busy.value=false}
}
async function save(){
 if(busy.value||key.value.length<16)return;
 busy.value=true;message.value='';
 let pending=key.value;key.value='';
 try{
  current.value=await command<Status>('cloud_key_store',{
   provider:provider.value,secret:pending,
   expectedRevision:current.value?.revision||undefined
  });
  message.value='密钥已保存到当前 Windows 用户的系统凭据库';
 }catch(e){message.value='保存未完成：'+String(e)}
 finally{pending='';busy.value=false}
}
async function revoke(){
 if(busy.value||!current.value?.configured)return;
 busy.value=true;message.value='';key.value='';
 try{
  current.value=await command<Status>('cloud_key_revoke',{
   provider:provider.value,expectedRevision:current.value.revision
  });
  message.value='已撤销该来源的密钥，不会再用于模型调用';
 }catch(e){message.value='撤销未确认：'+String(e)}
 finally{busy.value=false}
}
onMounted(refresh);
</script>
<template>
 <section class="cloud-key-panel" data-test="cloud-key-native" aria-label="本机云端 AI Key 设置">
  <strong>云端 AI 密钥</strong>
  <p>在自己的电脑保存 OpenRouter 或 OpenAI API Key，无需配对码，也不要求安装本地模型。</p>
  <p v-if="!native" role="status" data-test="cloud-web-provider-pending">网页版云端密钥暂未接通，当前不会接收或保存 API Key。正在复用现有本机 WinCred；无需安装新程序才能继续使用本地 Qwen3。</p>
  <template v-else>
   <label>来源
    <select v-model="provider" data-test="cloud-provider" :disabled="busy" @change="refresh">
     <option v-for="p in vendor" :key="p.id" :value="p.id">{{p.label}}</option>
    </select>
   </label>
   <p role="status" data-test="cloud-redacted-status">
    {{current?.configured?'已保存':current?.revoked?'已撤销':'未配置'}}
    <span v-if="current"> · 版本 {{current.revision}}</span>
   </p>
   <form @submit.prevent="save">
    <label>API Key
     <input v-model="key" type="password" autocomplete="off" spellcheck="false"
      aria-label="只保存到当前Windows用户的API Key" placeholder="输入自己的API Key"
      data-test="cloud-secret-input" :disabled="busy"/>
    </label>
    <button type="submit" data-test="cloud-save" :disabled="busy||key.length<16">
      {{current?.configured?'更新密钥':'保存密钥'}}
    </button>
    <button type="button" data-test="cloud-revoke" :disabled="busy||!current?.configured"
      @click="revoke">撤销</button>
    <button type="button" data-test="cloud-refresh" :disabled="busy" @click="refresh">刷新状态</button>
   </form>
   <p>云端模型可能收费。保存密钥本身不会发起调用；实际模型选择和费用同意仍由你决定，不自动切换付费来源。</p>
   <p v-if="message" role="status" data-test="cloud-action-result">{{message}}</p>
  </template>
 </section>
</template>
<style scoped>
.cloud-key-panel{display:grid;gap:10px;border:1px solid var(--w46-edge,#777);padding:14px;border-radius:10px}
.cloud-key-panel form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
.cloud-key-panel label{display:grid;gap:5px}
.cloud-key-panel input,.cloud-key-panel select{border:1px solid var(--w46-edge,#777);border-radius:6px;padding:8px;background:transparent;color:inherit;max-width:330px}
.cloud-key-panel button{padding:8px 12px;border:1px solid var(--w46-edge,#777);border-radius:6px}
.cloud-key-panel p{font-size:12px;margin:0}
</style>
