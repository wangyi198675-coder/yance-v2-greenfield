<script setup>
import {ref,onMounted,onBeforeUnmount,computed} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import {checkChannel,setupChannel,channelError,invokeFbPageNativeAuthorization} from './channel-setup-contract.mjs';
const props=defineProps({
 channel:{type:Object,required:true},fetchImpl:{type:Function,default:null}
});
const state=ref('checking'),notice=ref(''),busy=ref(false),receipt=ref(null);
const chosenPage=ref(''),pageChoices=ref([]),nativeReady=ref(false);
let alive=true,revision=0,expiryTimer=null;
const fetcher=()=>props.fetchImpl||globalThis.fetch;
const isFbPage=computed(()=>props.channel.id==='FB_PAGE');
const providerCopy=Object.freeze({
 FB_PERSONAL:{title:'Facebook Messenger',description:'连接你的个人 Messenger'},
 FB_PAGE:{title:'Facebook Page',description:'连接你管理的 Facebook 主页'},
 WHATSAPP_PERSONAL:{title:'WhatsApp',description:'使用本人手机完成连接'},
 TELEGRAM_PERSONAL:{title:'Telegram',description:'通过官方 Telegram 流程登录'}
});
const display=computed(()=>providerCopy[props.channel.id]||{
 title:props.channel.label,description:'连接你的社交账号'
});
const statusLabel=computed(()=>
 state.value==='ONLINE_VERIFIED'?'已连接':
 state.value==='AUTHORIZED_READ_ONLY'?'主页已授权':
 state.value==='PAGE_SELECTION_REQUIRED'?'选择主页':
 state.value==='checking'?'检查中':
 state.value==='EXPIRED'?'二维码已过期':
 state.value==='WAITING_USER_AUTH'?(receipt.value?.qr?'等待扫码':'等待本人授权'):
 state.value==='OFFICIAL_SETUP_REQUIRED'?'尚未启用':
 state.value==='unavailable'?'无法连接':'未连接');
const connectLabel=computed(()=>
 busy.value?'正在核验…':
 state.value==='ONLINE_VERIFIED'?'已连接':
 state.value==='AUTHORIZED_READ_ONLY'?'检查主页授权':
 isFbPage.value?(nativeReady.value?'连接 Facebook Page':'此设备暂未启用连接'):
 state.value==='WAITING_USER_AUTH'&&receipt.value?.qr?'重新获取二维码':'连接账号');
function clearReceipt(){
 receipt.value=null;
 if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null;}
}
async function refresh(){
 const id=++revision;clearReceipt();busy.value=true;state.value='checking';notice.value='';
 try{
  if(isFbPage.value){
   const sessionResponse=await fetcher()('/api/v2/local-session/status',{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'
   });
   const local=sessionResponse?.ok?await sessionResponse.json():null;
   nativeReady.value=local?.authorized===true&&local?.sessionKind==='NATIVE_FIRST_PARTY'&&
    typeof local.csrfToken==='string'&&/^[a-f0-9]{64}$/.test(local.csrfToken);
   if(!nativeReady.value){
    if(alive&&id===revision){
     state.value='OFFICIAL_SETUP_REQUIRED';
     notice.value='此设备还没有启用安全账号连接。请在受信任的言策桌面客户端完成本机授权。';
    }
    return;
   }
  }
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  state.value=v.state;
  notice.value=v.online?'原生账号身份已验证':'尚未完成本人授权';
 }catch(e){
  if(alive&&id===revision){
   state.value='unavailable';
   notice.value=isFbPage.value?
    '此设备尚未建立 Facebook Page 的安全账号会话，当前不能连接。':
    channelError(e);
  }
 }finally{if(alive&&id===revision)busy.value=false;}
}
async function startPage(){
 const r=await invokeFbPageNativeAuthorization({action:'start',fetchImpl:fetcher()});
 if(r.status!=='WAITING_USER_AUTH'||r.entryAvailable!==true)
  throw Error('W27_PAGE_START_NOT_CONFIRMED');
 return r;
}
async function setup(){
 const id=++revision;clearReceipt();busy.value=true;notice.value='';
 try{
  if(isFbPage.value){
   const r=await startPage();
   if(!alive||id!==revision)return;
   state.value=r.status;receipt.value=r;
   notice.value='请在打开的 Pancake 官方页面完成本人登录，并通过言策原生安全窗口录入凭据。';
   return;
  }
  const v=await setupChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  receipt.value=v;
  // A static official documentation URL is never a W27/W28 native grant.
  state.value=v.nextAction==='OFFICIAL_SETUP_REQUIRED'?
   'OFFICIAL_SETUP_REQUIRED':'WAITING_USER_AUTH';
  notice.value=v.nextAction==='OFFICIAL_SETUP_REQUIRED'?
   '当前设备尚未启用此平台的直接连接。下方仅为官方说明，不代表已开始授权。':
   v.qr?'请使用本人手机扫描当前二维码':'请在官方授权页面完成本人操作';
  if(v.qr){
   expiryTimer=setTimeout(()=>{
    if(alive&&id===revision){
     clearReceipt();state.value='EXPIRED';notice.value='二维码已过期，请重新连接';
    }
   },Math.max(0,v.qr.expiresAt-Date.now()));
  }
 }catch(e){
  if(alive&&id===revision){
   state.value='unavailable';
   const v=String(e?.message||e||'');
   if(isFbPage.value&&(v.includes('W54_NATIVE_FIRST_PARTY_SESSION_REQUIRED')||
     v.includes('W27_NATIVE_AUTH_HTTP_503')))nativeReady.value=false;
   notice.value=isFbPage.value?
    v.includes('W54_NATIVE_FIRST_PARTY_SESSION_REQUIRED')?
     '当前只是浏览器会话，尚未获得受保护的本机账号授权。请从已启用原生授权的言策桌面客户端连接。':
    v.includes('W27_NATIVE_AUTH_HTTP_503')?
     'Facebook Page 原生授权尚未接通，不能冒充正在授权。':
     '安全授权未开始，请检查本机授权服务后重试。':
    channelError(e);
  }
 }finally{if(alive&&id===revision)busy.value=false;}
}
async function readPages(){
 const id=++revision;busy.value=true;notice.value='';
 try{
  const r=await invokeFbPageNativeAuthorization({action:'pages',fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  pageChoices.value=r.pages;
  chosenPage.value='';state.value='PAGE_SELECTION_REQUIRED';
  notice.value=r.pages.length?'请选择你有管理权限的主页，再确认连接。':
   '尚未读取到可管理的主页。请检查官方授权和安全凭据。';
 }catch(e){if(alive&&id===revision){notice.value='尚未能读取主页，请先完成官方授权和安全凭据录入。';}}
 finally{if(alive&&id===revision)busy.value=false;}
}
async function bindPage(){
 if(!chosenPage.value||!pageChoices.value.some(x=>x.providerPageId===chosenPage.value))return;
 const id=++revision;busy.value=true;
 try{
  const r=await invokeFbPageNativeAuthorization({
   action:'bind',selectedProviderPageId:chosenPage.value,fetchImpl:fetcher()
  });
  if(!alive||id!==revision)return;
  state.value=r.status;
  notice.value='已核验所选主页的只读授权；消息在线和发送权限仍需独立验证。';
  receipt.value=null;pageChoices.value=[];
 }catch(e){if(alive&&id===revision)notice.value='主页绑定尚未确认，请检查权限后重新选择。';}
 finally{if(alive&&id===revision)busy.value=false;}
}
onMounted(refresh);
onBeforeUnmount(()=>{alive=false;revision++;clearReceipt();pageChoices.value=[]});
</script>
<template>
 <article class="w46-channel" data-test="w46-native-provider" :data-provider="channel.id">
  <header class="w46-channel-top">
   <span class="w46-channel-icon"><BCBrandIcon :name="channel.id" :size="29"/></span>
   <span class="w46-channel-state" role="status" data-test="native-provider-state">{{statusLabel}}</span>
  </header>
  <div class="w46-channel-copy">
   <strong>{{display.title}}</strong><p>{{display.description}}</p>
  </div>
  <div class="w46-channel-bottom">
   <Button class="w46-channel-connect" size="sm" data-test="native-provider-setup"
    :disabled="busy||(isFbPage&&!nativeReady)||state==='ONLINE_VERIFIED'||state==='PAGE_SELECTION_REQUIRED'"
    @click="setup">{{connectLabel}}</Button>
   <p v-if="notice" class="w46-channel-feedback" role="status"
    data-test="native-provider-feedback">{{notice}}</p>
   <div v-if="isFbPage&&state==='WAITING_USER_AUTH'&&receipt?.entryAvailable===true"
    class="w46-channel-auth-result" data-test="fb-page-actual-started">
    <p>官方登录和凭据输入均由本机受保护流程处理，言策不要求在网页内填写 Token。</p>
    <Button size="sm" variant="outline" data-test="fb-page-read-pages"
     :disabled="busy" @click="readPages">我已授权，读取我的主页</Button>
   </div>
   <div v-if="isFbPage&&state==='PAGE_SELECTION_REQUIRED'"
    class="w46-channel-auth-result" data-test="fb-page-page-selection">
    <label for="w46-page-choice">选择要连接的 Facebook 主页</label>
    <select id="w46-page-choice" v-model="chosenPage" data-test="fb-page-choice">
     <option value="">请选择主页</option>
     <option v-for="p in pageChoices" :key="p.providerPageId"
      :value="p.providerPageId">{{p.name||'未命名主页'}} · {{p.providerPageId}}</option>
    </select>
    <Button size="sm" :disabled="busy||!chosenPage" data-test="fb-page-bind"
     @click="bindPage">确认连接此主页</Button>
   </div>
   <div v-if="!isFbPage&&receipt" class="w46-channel-auth-result"
    data-test="native-provider-auth-result">
    <a v-if="receipt.officialConnectUrl" :href="receipt.officialConnectUrl"
     target="_blank" rel="noopener noreferrer" data-test="native-provider-connect-real">
     继续本人官方授权
    </a>
    <a v-if="receipt.officialDocs" :href="receipt.officialDocs"
     target="_blank" rel="noopener noreferrer" data-test="native-provider-docs">
     阅读官方连接说明（非授权）
    </a>
    <div v-if="receipt.qr" data-test="native-provider-qr">
     <img :src="receipt.qr.src" alt="官方原生 WhatsApp 登录二维码"/>
     <small>扫码后请检查真实连接状态。二维码过期后需要重新获取。</small>
    </div>
   </div>
   <details class="w46-channel-extra" data-test="native-provider-details">
    <summary>高级连接诊断</summary>
    <p>状态必须通过原生服务与 W24 当前账号授权回读。</p>
    <Button variant="outline" size="sm" data-test="native-provider-check"
     :disabled="busy" @click="refresh">重新检查状态</Button>
   </details>
  </div>
 </article>
</template>
<style scoped>
.w46-channel{display:flex;flex-direction:column;gap:12px;max-width:550px;min-width:0;height:auto;padding:17px;border:1px solid var(--border);border-radius:16px;background:var(--bg2)}
.w46-channel-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.w46-channel-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--surface-soft);border:1px solid var(--border)}
.w46-channel-state{font-size:12px;color:var(--muted);border:1px solid var(--border);border-radius:99px;padding:5px 10px}
.w46-channel-copy{display:grid;gap:5px}.w46-channel-copy strong{font-size:16px}.w46-channel-copy p,.w46-channel-feedback{font-size:13px;line-height:1.5;color:var(--muted);margin:0}
.w46-channel-bottom,.w46-channel-auth-result{display:grid;gap:10px}
.w46-channel-connect{width:100%;min-height:44px;border-radius:10px!important;background:var(--accent)!important;color:var(--accent-ink)!important;font-weight:700}
.w46-channel-auth-result{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft)}
.w46-channel-auth-result label,.w46-channel-auth-result p{font-size:13px;line-height:1.6;margin:0;color:var(--muted)}
.w46-channel-auth-result select{width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--border);border-radius:9px;padding:11px;min-height:44px}
.w46-channel-auth-result a{font-size:13px;color:var(--accent)}
.w46-channel-auth-result img{max-width:240px;max-height:240px}
.w46-channel-extra{border-top:1px solid var(--border);padding-top:11px;color:var(--muted);font-size:12px}
.w46-channel-extra p{font-size:12px;line-height:1.5}.w46-channel-extra summary{cursor:pointer}
.w46-channel-extra button{min-height:38px}
@media (prefers-reduced-motion:reduce){.w46-channel{transition:none}}
</style>
