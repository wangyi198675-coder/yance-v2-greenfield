<script setup>
import {ref,watch,onMounted,onBeforeUnmount,computed} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import {checkChannel,setupChannel,channelError} from './channel-setup-contract.mjs';
const props=defineProps({channel:{type:Object,required:true},fetchImpl:{type:Function,default:null},
 connectTrigger:{type:Number,default:0}});
const state=ref('checking'),notice=ref(''),busy=ref(false),receipt=ref(null);
const verifiedAccounts=ref(null);
let alive=true,revision=0,expiryTimer=null,pollTimer=null;
const fetcher=()=>props.fetchImpl||globalThis.fetch;
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
 state.value==='WAITING_USER_AUTH'?(receipt.value?.qr?'等待扫码':'等待授权'):
 state.value==='unavailable'?'暂不可用':'未连接');
function clearReceipt(){receipt.value=null;if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null}}
async function refresh(){
 const id=++revision;clearReceipt();busy.value=true;state.value='checking';notice.value='';
 try{
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  state.value=v.state;
  verifiedAccounts.value=v.accounts;
  notice.value=v.online?'原生服务确认已连接':'尚未完成本人授权';
 }catch(e){
  if(alive&&id===revision){state.value='unavailable';notice.value=channelError(e)}
 }finally{if(alive&&id===revision)busy.value=false}
}
async function setup(){
 if(busy.value)return;
 const id=++revision;clearReceipt();busy.value=true;notice.value='';
 try{
  const v=await setupChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  receipt.value=v;state.value='WAITING_USER_AUTH';
  notice.value=v.qr?'请使用本人手机扫描当前二维码':'请在下方进入原生官方授权步骤';
  if(v.qr){
   expiryTimer=setTimeout(()=>{
    if(alive&&id===revision){clearReceipt();state.value='EXPIRED';notice.value='二维码已过期，请重新连接'}
   },Math.max(0,v.qr.expiresAt-Date.now()));
  }
 }catch(e){
  if(alive&&id===revision){state.value='unavailable';notice.value=channelError(e)}
 }finally{if(alive&&id===revision)busy.value=false}
}
async function pollStatus(){
 if(!alive||busy.value)return;
 const id=revision;
 try{
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  verifiedAccounts.value=v.accounts;
  if(v.online){clearReceipt();state.value='ONLINE_VERIFIED';notice.value='账号已连接'}
  else if(!receipt.value)state.value=v.state;
 }catch{if(!receipt.value&&id===revision){state.value='unavailable'}}
}
watch(()=>props.connectTrigger,(next,prev)=>{if(next>prev)setup()});
onMounted(()=>{refresh();pollTimer=setInterval(pollStatus,15000)});
onBeforeUnmount(()=>{alive=false;revision++;clearReceipt();if(pollTimer)clearInterval(pollTimer)});
defineExpose({setup,refresh});
</script>
<template>
 <article class="w46-channel" data-test="w46-native-provider" :data-provider="channel.id">
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
    data-test="native-provider-setup" :disabled="busy"
    @click="setup"><span aria-hidden="true">＋</span> {{busy?'正在处理…':state==='ONLINE_VERIFIED'?'添加另一个账号':state==='WAITING_USER_AUTH'?(receipt?.qr?'重新获取二维码':'重新获取授权'):'连接账号'}} </Button>
   <p v-if="(receipt||state==='unavailable'||state==='EXPIRED')&&notice"
    class="w46-channel-feedback" role="status" data-test="native-provider-feedback">{{notice}}</p>
   <div v-if="receipt" class="w46-channel-auth-result" data-test="native-provider-auth-result">
    <a v-if="receipt.officialConnectUrl" :href="receipt.officialConnectUrl"
     target="_blank" rel="noopener noreferrer" data-test="native-provider-connect-real">继续本人官方授权</a>
    <a v-if="receipt.officialDocs" :href="receipt.officialDocs"
     target="_blank" rel="noopener noreferrer" data-test="native-provider-docs">查看官方连接步骤</a>
    <div v-if="receipt.qr" data-test="native-provider-qr">
     <img :src="receipt.qr.src" alt="当前由Baileys原生服务提供的WhatsApp登录二维码"/>
     <small>本人扫码后请检查实际连接状态。二维码过期后须重新获取。</small>
    </div>
    <p v-if="!receipt.officialConnectUrl&&!receipt.officialDocs&&!receipt.qr">当前平台尚未返回可操作的本人授权步骤。</p>
   </div>
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
</style>
