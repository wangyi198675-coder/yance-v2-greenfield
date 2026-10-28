<script setup>
import {ref,watch,onMounted,onBeforeUnmount,computed} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import BCPancakeMultiPageSetup from './BCPancakeMultiPageSetup.vue';
import {checkChannel,setupChannel,channelError} from './channel-setup-contract.mjs';
import {readWhatsAppNative,connectWhatsAppNative,readWhatsAppNativeQr,
 changeWhatsAppNativeConnection,whatsappNativeError} from './whatsapp-native-user-flow.mjs';
const props=defineProps({channel:{type:Object,required:true},fetchImpl:{type:Function,default:null},
 connectTrigger:{type:Number,default:0}});
const state=ref('checking'),notice=ref(''),busy=ref(false),receipt=ref(null);
const verifiedAccounts=ref(null);
const userRequested=ref(false),qrOpen=ref(false);
const isWhatsApp=computed(()=>props.channel.id==='WHATSAPP_PERSONAL');
// Before a user has clicked Connect, missing browser-local authorization is
// a setup condition, not evidence that the Baileys SDK is unavailable.
const needsLocalSession=e=>[
 'WHATSAPP_LOCAL_SESSION_REQUIRED','WHATSAPP_HTTP_401',
 'LOCAL_FIRST_PARTY_SESSION_NOT_VERIFIED','LOCAL_FIRST_PARTY_BOOTSTRAP_HTTP_401'
].includes(String(e?.code??e?.message??''));
let alive=true,revision=0,expiryTimer=null,pollTimer=null,waTimer=null;
const stopWaPoll=()=>{if(waTimer){clearTimeout(waTimer);waTimer=null}};
async function waUpdate(id){
 const result=await readWhatsAppNative({fetchImpl:fetcher()});
 if(!alive||id!==revision)return;
 state.value=result.online?'ONLINE_VERIFIED':result.state;
 if(result.online){
   stopWaPoll();clearReceipt();qrOpen.value=false;
   verifiedAccounts.value=[{accountId:result.account.platformJid,
    displayName:result.account.platformJid,state:'ONLINE_VERIFIED'}];
   notice.value='WhatsApp已连接，正在同步联系人和聊天记录';return;
 }
 verifiedAccounts.value=[];
 if(result.qrAvailable){
  try{const qr=await readWhatsAppNativeQr({fetchImpl:fetcher()});
   if(alive&&id===revision){receipt.value={qr};notice.value='请在WhatsApp的已关联设备中扫描二维码';}
  }catch(e){if(!String(e?.code??e?.message??'').includes('409'))throw e;}
 }else if(result.state==='WAITING_USER_AUTH')notice.value='点击连接账号后使用自己的手机扫码';
 else if(result.state==='STARTING_NATIVE_SDK')notice.value='正在从WhatsApp获取二维码';
}
function waPoll(id){
 stopWaPoll();
 if(!alive||id!==revision||['ONLINE_VERIFIED','REVOKED','unavailable'].includes(state.value))return;
 waTimer=setTimeout(async()=>{
  if(!alive||id!==revision)return;
  try{await waUpdate(id)}catch(e){if(alive&&id===revision){
   state.value='unavailable';notice.value=whatsappNativeError(e);}}
  if(alive&&id===revision)waPoll(id);
 },1700);
}
const fetcher=()=>props.fetchImpl||globalThis.fetch;
const isFbPage=computed(()=>props.channel.id==='FB_PAGE');
const providerCopy=Object.freeze({
 FB_PERSONAL:{title:'Facebook Messenger',description:'连接你的个人 Messenger'},
 FB_PAGE:{title:'Facebook Page',description:'连接你管理的 Facebook 主页'},
 WHATSAPP_PERSONAL:{title:'WhatsApp',description:'使用本人手机完成连接'},
 TELEGRAM_PERSONAL:{title:'Telegram',description:'通过官方 Telegram 流程登录'}
});
const display=computed(()=>providerCopy[props.channel.id]||{title:props.channel.label,description:'连接你的社交账号'});
const statusLabel=computed(()=>state.value==='ONLINE_VERIFIED'?'已连接':
 state.value==='checking'?'检查中':
 state.value==='EXPIRED'?'二维码已过期':
 state.value==='LOCAL_SESSION_NEEDED'?'待连接':
 state.value==='WAITING_USER_AUTH'?(receipt.value?.qr?'等待扫码':'等待授权'):
 state.value==='WAITING_QR_SCAN'?'等待扫码':
 state.value==='STARTING_NATIVE_SDK'?'连接中':
 state.value==='unavailable'?'暂不可用':'未连接');
function clearReceipt(){receipt.value=null;if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null}}
async function refresh(){
 const id=++revision;clearReceipt();stopWaPoll();busy.value=true;state.value='checking';notice.value='';
 try{
  if(isWhatsApp.value){await waUpdate(id);if(['STARTING_NATIVE_SDK','WAITING_QR_SCAN'].includes(state.value))waPoll(id);return}
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  state.value=v.state;
  verifiedAccounts.value=v.accounts;
  notice.value=v.online?'原生服务确认已连接':'尚未完成本人授权';
 }catch(e){
  if(alive&&id===revision){
   if(isWhatsApp.value&&!userRequested.value&&needsLocalSession(e)){
    state.value='LOCAL_SESSION_NEEDED';notice.value='点击连接 WhatsApp 将重新建立本机会话';
   }else{state.value='unavailable';notice.value=isWhatsApp.value?whatsappNativeError(e):channelError(e)}
  }
 }finally{if(alive&&id===revision)busy.value=false}
}
async function setup(){
 if(busy.value)return;
 userRequested.value=true;
 // Facebook's existing verified local bridge opens from the actual click.
 // No Facebook credentials are collected by the Yance renderer.
 let fbLogin=null;
 if(props.channel.id==='FB_PERSONAL'&&typeof window!=='undefined'){
  fbLogin=window.open('about:blank','yance_facebook_login','width=570,height=760');
  if(fbLogin)fbLogin.opener=null;
 }
 if(isWhatsApp.value)qrOpen.value=true;
 const id=++revision;clearReceipt();stopWaPoll();busy.value=true;notice.value='';
 try{
  if(isWhatsApp.value){
   const started=await connectWhatsAppNative({fetchImpl:fetcher()});
   if(!alive||id!==revision)return;
   state.value=started.state;notice.value='正在从WhatsApp获取扫码二维码';
   await waUpdate(id);
   if(alive&&id===revision&&state.value!=='ONLINE_VERIFIED')waPoll(id);
   return;
  }
  const v=await setupChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  receipt.value=v;state.value='WAITING_USER_AUTH';
  if(v.officialConnectUrl){
   if(fbLogin&&!fbLogin.closed)fbLogin.location.replace(v.officialConnectUrl);
   notice.value='请在打开的连接窗口完成登录，之后返回言策核对账号状态';
  }else{
   if(fbLogin&&!fbLogin.closed)fbLogin.close();
   notice.value=v.qr?'使用自己的手机扫描二维码':'此平台暂未返回可直接登录的授权入口';
  }
  if(v.qr){
   expiryTimer=setTimeout(()=>{
    if(alive&&id===revision){clearReceipt();state.value='EXPIRED';notice.value='二维码已过期，请重新连接'}
   },Math.max(0,v.qr.expiresAt-Date.now()));
  }
 }catch(e){
  if(fbLogin&&!fbLogin.closed)fbLogin.close();
  if(alive&&id===revision){state.value='unavailable';notice.value=isWhatsApp.value?whatsappNativeError(e):channelError(e)}
 }finally{if(alive&&id===revision)busy.value=false}
}
async function pollStatus(){
 if(!alive||busy.value)return;
 const id=revision;
 try{
  if(isWhatsApp.value){await waUpdate(id);return}
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  verifiedAccounts.value=v.accounts;
  if(v.online){clearReceipt();state.value='ONLINE_VERIFIED';notice.value='账号已连接'}
  else if(!receipt.value)state.value=v.state;
 }catch(e){if(!receipt.value&&id===revision){
  state.value=isWhatsApp.value&&!userRequested.value&&needsLocalSession(e)?'LOCAL_SESSION_NEEDED':'unavailable';
 }}
}
watch(()=>props.connectTrigger,(next,prev)=>{if(next>prev)setup()});
onMounted(()=>{if(!isFbPage.value){refresh();pollTimer=setInterval(pollStatus,15000)}});
onBeforeUnmount(()=>{alive=false;revision++;clearReceipt();stopWaPoll();if(pollTimer)clearInterval(pollTimer)});
async function waDisconnect(action){
 const id=++revision;stopWaPoll();clearReceipt();busy.value=true;
 try{const result=await changeWhatsAppNativeConnection(action,{fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  state.value=result.state;verifiedAccounts.value=[];
  notice.value=action==='revoke'?'账号已移除':'WhatsApp已断开';
 }catch(e){if(alive&&id===revision){state.value='unavailable';notice.value=whatsappNativeError(e)}}
 finally{if(alive&&id===revision)busy.value=false}
}
defineExpose({setup,refresh});
</script>
<template>
 <BCPancakeMultiPageSetup v-if="isFbPage" :fetch-impl="fetcher()" />
 <article v-else class="w46-channel" data-test="w46-native-provider" :data-provider="channel.id">
  <header class="w46-channel-top">
   <span class="w46-channel-icon"><BCBrandIcon :name="channel.id" :size="29"/></span>
   <span class="w46-channel-state" role="status" data-test="native-provider-state">{{statusLabel}}</span>
  </header>
  <div class="w46-channel-copy">
   <strong>{{display.title}}</strong>
   <p>{{display.description}}</p>
  </div>
  <div class="w46-native-account-list" data-test="w46-verified-account-list">
   <div v-for="account in verifiedAccounts||[]" :key="account.accountId" class="w46-account-identity"
    data-test="w46-verified-account" :title="account.displayName">
    <span class="w46-account-initial" aria-hidden="true">{{account.displayName.slice(0,1)}}</span>
    <span class="w46-account-name">{{account.displayName}}<small>{{account.state==='ONLINE_VERIFIED'?'已连接':'暂时断开'}}</small></span>
    <span class="w46-account-check" aria-label="平台已验证账号">✓</span>
   </div>
   <p v-if="!verifiedAccounts?.length" class="w46-account-placeholder">
    {{state==='ONLINE_VERIFIED'?'已连接，账号信息正在同步':state==='checking'?'正在检查账号…':'还没有已验证的账号'}}
   </p>
  </div>
  <div class="w46-channel-bottom">
   <Button class="w46-channel-connect" size="sm"
    data-test="native-provider-setup" :disabled="busy||(isWhatsApp&&state==='ONLINE_VERIFIED')"
    @click="isWhatsApp&&['WAITING_QR_SCAN','STARTING_NATIVE_SDK'].includes(state)?qrOpen=true:setup()"><span aria-hidden="true">＋</span> {{busy?'正在处理…':isWhatsApp&&['WAITING_QR_SCAN','STARTING_NATIVE_SDK'].includes(state)?'查看二维码':state==='ONLINE_VERIFIED'?'添加另一个账号':state==='WAITING_USER_AUTH'?(receipt?.qr?'重新获取二维码':isWhatsApp?'连接 WhatsApp':'重新获取授权'):'连接账号'}} </Button>
   <p v-if="(receipt||state==='EXPIRED'||userRequested)&&notice"
    class="w46-channel-feedback" role="status" data-test="native-provider-feedback">{{state==='unavailable'?'当前无法连接，请查看帮助':notice}}</p>
   <div v-if="receipt" class="w46-channel-auth-result" data-test="native-provider-auth-result">
    <a v-if="receipt.officialConnectUrl" :href="receipt.officialConnectUrl"
     target="_blank" rel="noopener noreferrer" data-test="native-provider-connect-real">继续本人官方授权</a>
    <a v-if="receipt.officialDocs" :href="receipt.officialDocs"
     target="_blank" rel="noopener noreferrer" data-test="native-provider-docs">查看官方连接步骤</a>
    <div v-if="receipt.qr&&!isWhatsApp" data-test="native-provider-qr">
     <img :src="receipt.qr.src" alt="当前由Baileys原生服务提供的WhatsApp登录二维码"/>
     <small>本人扫码后请检查实际连接状态。二维码过期后须重新获取。</small>
    </div>
    <p v-if="!receipt.officialConnectUrl&&!receipt.officialDocs&&!receipt.qr">当前平台尚未返回可操作的本人授权步骤。</p>
   </div>
   <div v-if="isWhatsApp&&['WAITING_QR_SCAN','STARTING_NATIVE_SDK','ONLINE_VERIFIED'].includes(state)" class="w46-channel-native-actions">
    <Button variant="outline" size="sm" :disabled="busy" @click="waDisconnect('disconnect')">断开连接</Button>
    <Button v-if="state==='ONLINE_VERIFIED'" variant="outline" size="sm" :disabled="busy" @click="waDisconnect('revoke')">移除账号</Button>
   </div>
   <Teleport to="body">
   <div v-if="qrOpen&&isWhatsApp" class="w46-qr-backdrop" data-test="native-provider-qr-dialog" @click.self="qrOpen=false">
    <section class="w46-qr-dialog" role="dialog" aria-modal="true" aria-label="连接 WhatsApp">
     <header><div><strong>连接 WhatsApp</strong><p>手机 WhatsApp → 已关联设备 → 关联设备</p></div>
      <button type="button" aria-label="关闭扫码窗口" data-test="native-provider-close-qr" @click="qrOpen=false">✕</button></header>
     <div v-if="receipt?.qr" class="w46-qr-live" data-test="native-provider-qr">
      <img :src="receipt.qr.src" alt="当前服务端真实 WhatsApp 连接二维码"/>
      <p>使用手机扫码；成功后自动核实连接状态。</p>
     </div>
     <div v-else class="w46-qr-wait" role="status">
      <p>{{busy||['STARTING_NATIVE_SDK','WAITING_QR_SCAN','checking'].includes(state)?'正在获取实时扫码二维码…':'当前没有可用的登录二维码'}}</p>
      <p v-if="state==='unavailable'">{{notice}}</p>
      <button v-if="!busy&&state==='unavailable'" type="button" @click="setup">重新连接</button>
     </div>
    </section>
   </div>
   </Teleport>
   <details class="w46-channel-extra" data-test="native-provider-details">
    <summary>连接问题？查看帮助</summary>
    <p>连接状态由原生平台回读，不根据界面点击判定成功。</p>
    <p v-if="!receipt&&notice">{{notice}}</p>
    <Button variant="outline" size="sm" data-test="native-provider-check" :disabled="busy" @click="refresh">检查连接状态</Button>
   </details>
  </div>
 </article>
</template>
<style scoped>
.w46-channel{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:218px;height:auto;overflow:visible;padding:19px 18px 16px;border:1px solid var(--border);border-radius:16px;background:var(--bg2);box-shadow:0 12px 25px #00000012;transition:border-color .16s,transform .16s,box-shadow .16s}
.w46-channel:hover{border-color:rgba(var(--accent-rgb),.47);box-shadow:0 12px 32px rgba(var(--accent-rgb),.07),0 6px 22px #00000022;transform:translateY(-1px)}
.w46-channel-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.w46-channel-icon{width:43px;height:43px;display:grid;place-items:center;border-radius:13px;background:var(--surface-soft);border:1px solid var(--border)}
.w46-channel-state{font-size:11px;white-space:nowrap;color:var(--muted);background:var(--surface-soft);padding:5px 9px;border-radius:999px;border:1px solid var(--border)}
.w46-channel[data-provider] .w46-channel-copy{display:grid;gap:7px}
.w46-channel-copy strong{font-size:15px;color:var(--ink);letter-spacing:-.015em}
.w46-channel-copy p{font-size:12px;color:var(--muted);line-height:1.5;margin:0;overflow-wrap:anywhere}
.w46-channel-bottom{display:grid;gap:10px;margin-top:auto;min-width:0}
.w46-channel-connect{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px;min-height:41px;width:100%;border-radius:10px!important;background:var(--accent)!important;color:var(--accent-ink)!important;font-weight:750;box-shadow:0 4px 18px rgba(var(--accent-rgb),.11)}
.w46-channel-connect:disabled{filter:grayscale(.65);opacity:.55}
.w46-channel-connect:not(:disabled):hover{filter:brightness(1.08);box-shadow:0 5px 24px rgba(var(--accent-rgb),.23)}
.w46-channel-feedback{color:var(--muted);font-size:11px;line-height:1.5;margin:0;overflow-wrap:anywhere}
.w46-channel-auth-result{display:grid;gap:9px;background:var(--surface-soft);border:1px solid var(--border);border-radius:10px;padding:11px}
.w46-channel-auth-result a{color:var(--accent);font-size:12px;text-decoration:underline;overflow-wrap:anywhere}
.w46-channel-auth-result p,.w46-channel-auth-result small{color:var(--muted);font-size:11px;line-height:1.5}
.w46-channel-auth-result img{width:min(240px,100%);height:auto}
.w46-channel-native-actions{display:flex;gap:8px;flex-wrap:wrap}
.w46-channel-extra{border-top:1px solid var(--border);padding-top:9px;color:var(--muted);font-size:11px}
.w46-channel-extra summary{cursor:pointer;font-size:11px;line-height:1.8;list-style:revert}
.w46-channel-extra p{font-size:11px;line-height:1.5;margin:8px 0;overflow-wrap:anywhere}
.w46-channel-extra button{max-width:100%}
@media(max-width:600px){.w46-channel{min-height:182px;padding:15px;gap:10px}}
@media(prefers-reduced-motion:reduce){.w46-channel,.w46-channel-connect{transition:none!important;transform:none!important}}

/* R4 personal multi-account polish: preserve the existing four-brand cards,
   native SDK API and five-theme CSS variables. */
.w46-channel{min-height:272px;padding:15px;gap:11px;border-radius:15px;background:
 linear-gradient(160deg,rgba(var(--accent-rgb),.035),transparent 52%),var(--bg2);
 box-shadow:0 5px 21px #00000010}
.w46-channel-top{align-items:flex-start}
.w46-channel-icon{width:39px;height:39px;border-radius:12px;background:var(--surface-soft)}
.w46-channel-copy{min-height:44px}
.w46-channel-copy strong{font-size:14px}
.w46-channel-copy p{font-size:11px}
.w46-channel-state{font-size:10px;padding:4px 8px}
.w46-native-account-list{min-height:58px;display:grid;align-content:start;gap:6px}
.w46-account-placeholder{margin:5px 0 0;padding:11px 9px;border-radius:10px;
 border:1px dashed var(--border);color:var(--muted);font-size:11px;line-height:1.55;
 text-align:center}
.w46-account-identity{display:flex;align-items:center;gap:8px;padding:7px 8px;
 background:var(--surface-soft);border:1px solid var(--border);border-radius:11px;min-width:0}
.w46-account-initial{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;
 border-radius:50%;background:rgba(var(--accent-rgb),.16);color:var(--accent);
 font-size:13px;font-weight:750}
.w46-account-name{min-width:0;display:grid;gap:2px;flex:1;overflow:hidden;text-overflow:ellipsis;
 white-space:nowrap;color:var(--ink);font-weight:650;font-size:11px}
.w46-account-name small{font-size:10px;color:var(--muted);font-weight:450}
.w46-account-check{color:var(--accent);font-size:14px}
.w46-channel-bottom{gap:8px}
.w46-channel-connect{min-height:37px;border-radius:9px!important;font-size:12px!important;box-shadow:none}
.w46-channel-extra{opacity:.9}
.w46-channel-extra summary{font-size:10px}
@media(max-width:600px){.w46-channel{min-height:240px;padding:13px}}
/* Real native WhatsApp QR is shown only after the original W47 bytes API attests it. */
.w46-qr-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.72);backdrop-filter:blur(4px)}
.w46-qr-dialog{display:flex;flex-direction:column;box-sizing:border-box;gap:18px;width:min(440px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:22px;border:1px solid var(--border);border-radius:16px;background:var(--surface-raised);color:var(--ink);box-shadow:0 24px 65px #0009}
.w46-qr-dialog header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.w46-qr-dialog header strong{font-size:18px}
.w46-qr-dialog header p{font-size:13px;line-height:1.6;margin:6px 0 0;color:var(--muted)}
.w46-qr-dialog header button{min-width:35px;min-height:35px;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft);color:var(--ink);cursor:pointer}
.w46-qr-live,.w46-qr-wait{display:grid;justify-items:center;gap:13px;text-align:center}
.w46-qr-live img{display:block;width:min(280px,100%);height:auto;aspect-ratio:1;background:white;padding:12px;border-radius:12px}
.w46-qr-live p,.w46-qr-wait p{font-size:13px;line-height:1.6;color:var(--muted);margin:0}
.w46-qr-wait{padding:28px 12px}
.w46-qr-wait button{padding:10px 17px;border-radius:9px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);cursor:pointer}
@media(max-width:600px){.w46-qr-dialog{padding:16px}}
</style>
