<script setup>
import {ref,onMounted,onBeforeUnmount,computed} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import BCBrandIcon from './BCBrandIcon.vue';
import BCPancakeMultiPageSetup from './BCPancakeMultiPageSetup.vue';
import {checkChannel,setupChannel,channelError,invokeFbPageNativeAuthorization,
 saveFbPageCredentialConfiguration} from './channel-setup-contract.mjs';
const props=defineProps({
 channel:{type:Object,required:true},fetchImpl:{type:Function,default:null}
});
const state=ref('checking'),notice=ref(''),busy=ref(false),receipt=ref(null);
const chosenPage=ref(''),pageChoices=ref([]),nativeReady=ref(false);
// Credentials are transient local form state. Never store in localStorage,
// URL, query params, browser profile, diagnostic log, or conversation history.
const pageId=ref(''),pageToken=ref(''),secureEnrollmentReady=ref(false);
const configNotice=ref('');
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
 isFbPage.value?(nativeReady.value?'连接 Facebook Page':'Facebook Page 暂不可连接'):
 state.value==='WAITING_USER_AUTH'&&receipt.value?.qr?'重新获取二维码':'连接账号');
function clearReceipt(){
 receipt.value=null;
 if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null;}
}
async function refresh(){
 const id=++revision;clearReceipt();busy.value=true;state.value='checking';notice.value='';
 try{
  if(isFbPage.value){
   const capabilityResponse=await fetcher()('/api/v2/providers/fb-page/authorization/capabilities',{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'
   });
   const capability=capabilityResponse?.ok?await capabilityResponse.json():null;
   secureEnrollmentReady.value=capability?.channel==='FB_PAGE'&&
    capability.secureCredentialEnrollment===true;
   if(!secureEnrollmentReady.value){pageToken.value='';}
   if(capability?.channel!=='FB_PAGE'||capability.ownerPortConnected!==true){
    nativeReady.value=false;
    if(alive&&id===revision){
     state.value='OFFICIAL_SETUP_REQUIRED';
     notice.value='Facebook Page 官方连接接口尚未接通，当前不能开始授权。';
    }
    return;
   }
   const sessionResponse=await fetcher()('/api/v2/local-session/status',{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'
   });
   const local=sessionResponse?.ok?await sessionResponse.json():null;
   nativeReady.value=local?.authorized===true&&local?.sessionKind==='NATIVE_FIRST_PARTY'&&
    typeof local.csrfToken==='string'&&/^[a-f0-9]{64}$/.test(local.csrfToken);
   if(!nativeReady.value){
    if(alive&&id===revision){
     state.value='OFFICIAL_SETUP_REQUIRED';
     notice.value='Facebook Page 网页授权尚未接通。私人聊天仍可正常使用，无须终端配对。';
    }
    return;
   }
   if(alive&&id===revision){state.value='unconnected';notice.value='请连接你自己的 Facebook Page。';}
   return;
  }
  const v=await checkChannel({channel:props.channel.id,fetchImpl:fetcher()});
  if(!alive||id!==revision)return;
  state.value=v.state;
  notice.value=v.online?'原生账号身份已验证':'尚未完成本人授权';
 }catch(e){
  if(alive&&id===revision){
   state.value='unavailable';
   notice.value=isFbPage.value?
    'Facebook Page 连接状态暂不可核验，稍后可重新检查。':
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
     '当前 Facebook Page 账号授权通道尚未接通，无法启动连接。':
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
async function savePageConfig(){
 if(!secureEnrollmentReady.value||busy.value)return;
 busy.value=true;configNotice.value='';
 try{
  const receipt=await saveFbPageCredentialConfiguration({
   pageId:pageId.value.trim(),pagePublicApiToken:pageToken.value,
   fetchImpl:fetcher()
  });
  if(!alive)return;
  configNotice.value=receipt.saved?
   '凭据已保存至系统保护区。请继续读取并选择 Facebook 主页；这还不代表连接成功。':
   '凭据保存状态尚未确认。';
 }catch{
  if(alive)configNotice.value='凭据未保存。请检查本机安全保存服务后再试。';
 }finally{
  // Never retain social tokens after an attempted save.
  pageToken.value='';busy.value=false;
 }
}
onMounted(()=>{if(!isFbPage.value)refresh()});
onBeforeUnmount(()=>{
 alive=false;revision++;clearReceipt();pageChoices.value=[];
 pageToken.value='';
});
</script>
<template>
 <BCPancakeMultiPageSetup v-if="isFbPage" :fetch-impl="fetcher()" />
 <article v-else class="w46-channel" data-test="w46-native-provider" :data-provider="channel.id">
  <header class="w46-channel-top">
   <span class="w46-channel-icon"><BCBrandIcon :name="channel.id" :size="29"/></span>
   <span class="w46-channel-state" role="status" data-test="native-provider-state">{{statusLabel}}</span>
  </header>
  <div class="w46-channel-copy">
   <strong>{{display.title}}</strong><p>{{display.description}}</p>
  </div>
  <div class="w46-channel-bottom">
   <section v-if="isFbPage" class="w46-page-config" data-test="fb-page-config">
    <div class="w46-page-config-head">
     <strong>Facebook Page 连接配置</strong>
     <span>只需要一个主页令牌</span>
    </div>
    <p class="w46-page-config-hint">你已在 Pancake 授权 Facebook Page，不用重新登录 Facebook。只需确认该主页 ID，并提供此主页专属的 Page Access Token。</p>
    <div class="w46-config-field">
     <label for="w46-pancake-page-id">Facebook Page ID</label>
     <p>直接复制 Pancake 主页地址中的数字，例如 pancake.biz/页面ID/setting/tools；不是另一枚授权令牌。</p>
     <input id="w46-pancake-page-id" type="text" v-model.trim="pageId"
      autocomplete="off" inputmode="numeric" pattern="[0-9]*"
      placeholder="你的 Pancake 主页数字 ID"
      :disabled="!secureEnrollmentReady||busy" data-test="fb-page-id"/>
    </div>
    <div class="w46-config-field">
     <label for="w46-pancake-page-token">Page Access Token（唯一必需的令牌）</label>
     <p>在 Pancake 工作区「设置 → 工具 → Public API access token」创建令牌。</p>
     <a href="https://pancake.biz/" target="_blank" rel="noopener noreferrer" data-test="pancake-page-settings">打开我的 Pancake 工作区</a>
     <input id="w46-pancake-page-token" type="password" v-model="pageToken"
      autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="在安全录入启用后粘贴主页 Public API Token"
      :disabled="!secureEnrollmentReady||busy" data-test="fb-page-public-api-token"/>
    </div>
    <p v-if="!secureEnrollmentReady" class="w46-page-config-warning"
     data-test="fb-page-credential-hold">安全保存接口尚未接入，当前不能输入或保存令牌。不要把令牌发到聊天里，也不要粘贴到公开表单。</p>
    <p v-else class="w46-page-config-hint">令牌仅通过言策同源请求提交给原 W55 系统凭据保护能力，不保存在浏览器本地。</p>
    <Button variant="outline" size="sm" data-test="fb-page-save-config"
     :disabled="!secureEnrollmentReady||busy||!(/^[0-9]{1,40}$/.test(pageId))||pageToken.trim().length<8"
     @click="savePageConfig">安全保存凭据，下一步验证主页</Button>
    <p v-if="configNotice" role="status" class="w46-page-config-hint" data-test="fb-page-config-result">{{configNotice}}</p>
    <p class="w46-page-config-foot">保存后由言策核验所填主页的 Pancake 官方 API；未验证通过前不会显示“已连接”。不需要重新进行 Facebook 授权。</p>
   </section>
   <Button class="w46-channel-connect" size="sm" data-test="native-provider-setup"
    :disabled="busy||(isFbPage&&!nativeReady)||state==='ONLINE_VERIFIED'||state==='PAGE_SELECTION_REQUIRED'"
    @click="setup">{{connectLabel}}</Button>
   <p v-if="notice" class="w46-channel-feedback" role="status"
    data-test="native-provider-feedback">{{notice}}</p>
   <div v-if="isFbPage&&state==='WAITING_USER_AUTH'&&receipt?.entryAvailable===true"
    class="w46-channel-auth-result" data-test="fb-page-actual-started">
    <p>请完成本人官方登录；配置凭据只允许通过上方启用后的安全输入框保存。</p>
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
.w46-page-config{display:grid;gap:13px;border:1px solid var(--border);border-radius:14px;padding:15px;background:var(--bg);min-width:0}
.w46-page-config-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.w46-page-config-head strong{font-size:15px;color:var(--ink)}
.w46-page-config-head span{font-size:11px;color:var(--muted)}
.w46-page-config-hint,.w46-page-config-foot{font-size:12px;line-height:1.55;color:var(--muted);margin:0}
.w46-config-field{display:grid;gap:7px;min-width:0}
.w46-config-field label{font-size:13px;font-weight:600;color:var(--ink)}
.w46-config-field p{font-size:12px;line-height:1.45;color:var(--muted);margin:0}
.w46-config-field a{font-size:12px;color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.w46-config-field input{width:100%;min-width:0;min-height:44px;padding:9px 12px;border:1px solid var(--border);background:var(--bg2);color:var(--ink);border-radius:10px;box-sizing:border-box}
.w46-config-field input:disabled{opacity:.58;cursor:not-allowed}
.w46-page-config-warning{font-size:12px;line-height:1.55;padding:10px 12px;border:1px solid var(--border);border-radius:10px;color:var(--muted);margin:0}
@media(max-width:430px){.w46-page-config{padding:12px}.w46-page-config-head{align-items:flex-start}}
@media (prefers-reduced-motion:reduce){.w46-channel{transition:none}}
</style>
