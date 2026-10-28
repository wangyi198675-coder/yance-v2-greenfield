<script setup>
import {ref,onBeforeUnmount,onMounted} from 'vue';
import {pancakeMultiApi} from './pancake-multi-browser.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const fetcher=()=>props.fetchImpl||globalThis.fetch;
const busy=ref(false),initialized=ref(false),notice=ref(''),accountToken=ref('');
const pages=ref([]),selectedPage=ref(''),pageToken=ref(''),independentPageId=ref('');
const accountConnected=ref(false),apiReady=ref(false);
const credentialRevoked=ref(false),revokedRevision=ref(0),ownerRelinkConfirmed=ref(false);
let alive=true,retryTimer=null,retryCount=0,lastFailureCode='';
function scheduleRetry(){
 if(!alive||apiReady.value||retryTimer||retryCount>=4)return;
 retryCount++;
 retryTimer=setTimeout(()=>{retryTimer=null;if(alive)refresh();},Math.min(7500,retryCount*1600));
}
function retryWhenVisible(){if(alive&&!apiReady.value&&!busy.value)refresh();}
function humanError(e,action){
 const code=String(e?.code||e?.message||'');
 if(action==='capabilities'&&/HTTP_(?:401|403)/.test(code))return '本机会话未恢复（能力接口 '+(code.includes('401')?'401':'403')+'），请重新检测连接。';
 if(code.includes('EXISTING_WEB_LOCAL_SESSION_UNAVAILABLE'))return '本机会话无法建立（'+(code.match(/HTTP_([0-9]+)/)?.[1]||'启动失败')+'），请检查浏览器站点 Cookie 设置。';
 if(code.includes('CURRENT_WEB_SESSION_NOT_VERIFIED'))return '本机会话 Cookie 未生效，请检查浏览器站点 Cookie 设置。';
 if(code.includes('PANCAKE_CAPABILITIES_HTTP_404'))return '当前 API 缺少 Facebook Page 接口，正在重试连接。';
 if(code.includes('_TIMEOUT_30S'))return 'Pancake 官方验证超过30秒，结果尚未确认。请先点击重新查询账户，不要重复提交 Token。';
 if(code.includes('PANCAKE_OFFICIAL_AUTH_102'))
  return 'Pancake 官方账户验证未通过（错误码 102），令牌未保存。你已找到正确的账户令牌入口，请核对复制是否完整，以及当前登录的 Pancake 账户是否拥有这些主页。';
 if(code.includes('PANCAKE_OFFICIAL_ERROR_'))return 'Pancake 官方返回业务错误码 '+(code.match(/PANCAKE_OFFICIAL_ERROR_([0-9]{1,5})/)?.[1]||'未知')+'，并非已确认 Token 错误；令牌未保存。';
 if(code.includes('PANCAKE_OFFICIAL_FAILURE_UNCLASSIFIED'))return 'Pancake 官方没有返回可识别的错误码，令牌未保存。';
 if(code.includes('PANCAKE_ACCOUNT_PAGES_INVALID'))
  return 'Pancake 已返回主页列表，但其分类结构与言策预期不一致（PAGES_INVALID）；账户未保存。';
 if(code.includes('PANCAKE_CREDENTIAL_SIZE_LIMIT'))
  return 'W55 本地加密凭据容量限制未通过（CREDENTIAL_SIZE_LIMIT），不是官方令牌拒绝。';
 if(code.includes('W55_PANCAKE_'))
  return 'W55 原生凭据保存或回读失败：'+(code.match(/W55_PANCAKE_[A-Z0-9_]{3,60}/)?.[0]||'W55_UNVERIFIED');
 if(code.includes('PANCAKE_ACCOUNT_HTTP_'))
  return 'Pancake 账户接口验证未完成：HTTP '+(code.match(/PANCAKE_ACCOUNT_HTTP_([0-9]{3})/)?.[1]||'?')+
   '，错误码 '+(code.match(/_CODE_([A-Z0-9_]{3,80})/)?.[1]||'UNKNOWN')+'。';
 if(code.includes('PANCAKE_TOKEN_REJECTED')||code.includes('PANCAKE_TOKEN_OR_PAGE_REJECTED'))
  return 'Pancake 官方拒绝此 Token。请确认复制的是账户个人设置里的 User Access Token，而不是主页 Page Token。';
 if(code.includes('PANCAKE_ACCOUNT_ALREADY_CONFIGURED'))
  return '账户凭据已被保存，不必重复粘贴。请刷新主页查看现有连接。';
 if(code.includes('PANCAKE_NETWORK_UNAVAILABLE')||code.includes('PANCAKE_REMOTE_UNAVAILABLE'))
  return 'Pancake 官方接口连接失败，请检查网络后重试。';
 if(code.includes('PANCAKE_REVOKED_RELINK_REQUIRES_OWNER_REVIEW'))
  return '此前的 W55 凭据已撤销。请在本机勾选重新绑定确认，并重新输入自己的账户 Token；旧 Token 不会恢复。';
 if(code.includes('PANCAKE_RELINK_REVISION_MISMATCH'))
  return '凭据撤销版本已变化。请点击查询账户状态重新确认后操作。';
 if(code.includes('PANCAKE_ACCOUNT_NOT_CONFIGURED'))return '当前还没有成功保存的 Pancake 账户。';
 if(code.includes('UNAVAILABLE')||code.includes('503'))return '本机 W55 安全凭据或 Pancake 官方接口不可用，验证未完成。';
 if(code.includes('401'))return '验证未通过（HTTP 401）。请检查当前本机会话和 Pancake User Access Token。';
 if(code.includes('403'))return '该主页不属于当前账户，或 Token 无法访问。';
 if(code.includes('429'))return 'Pancake 访问次数受限，请稍后重试。';
 if(code.includes('503'))return '本机账号安全保存或 Pancake 服务尚不可用。';
 return '连接尚未通过验证，请检查令牌和网络后重试。';
}
async function execute(action,args){
 busy.value=true;notice.value='';lastFailureCode='';
 try{return await pancakeMultiApi(action,{fetchImpl:fetcher(),...args})}
 catch(e){lastFailureCode=String(e?.code||e?.message||'');if(alive)notice.value=humanError(e,action);return null}
 finally{if(alive)busy.value=false}
}
async function refresh(){
 if(busy.value)return;
 const cap=await execute('capabilities');
 if(!alive)return;
 if(!cap){apiReady.value=false;scheduleRetry();return;}
 retryCount=0;
 if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
 apiReady.value=cap.credentialReady===true;
 credentialRevoked.value=cap.credentialRevoked===true;
 revokedRevision.value=Number.isSafeInteger(cap.credentialRevision)?cap.credentialRevision:0;
 ownerRelinkConfirmed.value=false;
 initialized.value=true;
 if(!apiReady.value){
  notice.value='此版本尚未接通原 W55 安全保存能力，暂不能输入 Token。';
  return;
 }
 if(credentialRevoked.value){
  accountConnected.value=false;pages.value=[];
  notice.value='本机 W55 中的旧 Pancake 凭据已撤销（版本 '+revokedRevision.value+'）。只有你本人明确确认后，才能保存新的账户授权；旧凭据不会恢复。';
  return;
 }
 const existing=await execute('pages');
 if(!alive)return;
 if(existing){pages.value=existing.pages;accountConnected.value=true;
  notice.value=existing.accountVerified===false?
   'Pancake 官方账户列表暂时限流；已保存的主页仍然保留。你仍可用其他账号 Page 的独立 Token 继续添加，不会覆盖原连接。':
   '已列出当前账户的主页与另外单独验证的主页。其他账号管理的 Page 可在下方用各自的 Page Token 添加。'}
 else{
  accountConnected.value=false;pages.value=[];
  // No account provisioned yet. Stay on the real account setup step.
  if(lastFailureCode.includes('PANCAKE_ACCOUNT_NOT_CONFIGURED'))
   notice.value='当前没有已保存的 Pancake 账户。请将账户 User Access Token 粘贴在下方验证一次。';
  // For other errors, preserve the exact official/native failure from execute().
  // Do not overwrite a 401/502/503 with a misleading generic token warning.
 }
}
async function saveAccount(){
 if(busy.value||!apiReady.value||accountToken.value.trim().length<8||
   (credentialRevoked.value&&(!ownerRelinkConfirmed.value||revokedRevision.value<1)))return;
 const value=accountToken.value.trim();
 const params={userAccessToken:value};
 if(credentialRevoked.value){
  params.ownerReviewedRelink=true;
  params.expectedRevokedRevision=revokedRevision.value;
 }
 const r=await execute('account',params);
 // Wipe immediately after the protected save attempt; never persist in browser.
 accountToken.value='';
 if(!r||!alive)return;
 pages.value=r.pages;accountConnected.value=true;
 credentialRevoked.value=false;ownerRelinkConfirmed.value=false;
 notice.value='Pancake 账户已验证。你也可以在下方添加其他账号管理的主页，使用各自已有的 Page Token。';
}
async function connectPage(){
 if(busy.value||!apiReady.value||!accountConnected.value||
   !selectedPage.value||pageToken.value.length<8)return;
 const token=pageToken.value;
 const id=selectedPage.value;
 const r=await execute('page-token',{pageId:id,pageAccessToken:token});
 pageToken.value='';
 if(!r||!alive)return;
 const current=await execute('pages');
 if(current&&alive)pages.value=current.pages;
 notice.value='该主页的 Pancake API 已验证并安全保存。联系人和聊天的 W24 授权绑定状态独立核验。';
}
function cancelPage(){selectedPage.value='';pageToken.value='';}
onMounted(()=>{
 refresh();
 globalThis.addEventListener('focus',retryWhenVisible);
 globalThis.addEventListener('online',retryWhenVisible);
 document.addEventListener('visibilitychange',retryWhenVisible);
});
onBeforeUnmount(()=>{
 alive=false;
 if(retryTimer)clearTimeout(retryTimer);
 globalThis.removeEventListener('focus',retryWhenVisible);
 globalThis.removeEventListener('online',retryWhenVisible);
 document.removeEventListener('visibilitychange',retryWhenVisible);
 accountToken.value='';pageToken.value='';
});
</script>
<template>
 <article class="pancake-multi" data-test="pancake-multi-page-setup">
  <header class="pancake-heading">
   <div><h3>连接 Facebook Page</h3>
    <p>一个账户可自动发现多个主页；不同账号管理的 Page 也可逐个独立接入。</p>
   </div>
   <span class="status">{{accountConnected?'账户已验证':'等待配置'}}</span>
  </header>
  <p v-if="notice" class="pancake-note" role="status" data-test="pancake-multi-notice">{{notice}}</p>
  <button v-if="!apiReady" type="button" class="pancake-retry" :disabled="busy" data-test="pancake-retry-capabilities" @click="refresh">重新检测连接</button>
  <button v-else-if="!busy&&!accountConnected" type="button" class="pancake-retry" data-test="pancake-recheck-account" @click="refresh">查询账户授权状态</button>
  <section v-if="!accountConnected" class="pancake-section" data-test="pancake-account-config">
   <div class="pancake-section-head"><strong>第一步 · 连接 Pancake 账户</strong>
     <span>只需一次</span></div>
   <p>请从 Pancake「账户 → 个人设置 → API Access Token」复制 User Access Token（不是某个主页的 Page Token）。只会用于查询你管理的主页。</p>
   <a href="https://pages.fm" target="_blank" rel="noopener noreferrer">打开 Pancake 账户个人设置</a>
   <label for="pancake-user-token">Pancake 账户 User Access Token</label>
   <input id="pancake-user-token" type="password" v-model="accountToken"
     autocomplete="off" autocapitalize="off" spellcheck="false"
     placeholder="仅在此处安全输入，不需要发到聊天中"
     :disabled="!apiReady||busy" data-test="pancake-user-token"/>
   <label v-if="credentialRevoked" class="pancake-relink-review" data-test="pancake-relink-owner-review">
    <input type="checkbox" v-model="ownerRelinkConfirmed" :disabled="busy" data-test="pancake-relink-explicit-confirm"/>
    我本人确认重新绑定已撤销的 Pancake 账户。此操作只保存我新输入的令牌，不会恢复旧授权或自动启用消息发送。
   </label>
   <p v-if="busy" role="status" data-test="pancake-account-progress">正在联系 Pancake 官方并核对 W55 安全保存，请勿重复点击。验证请求最多等待 30 秒。</p>
   <button type="button" class="primary"
     :disabled="!apiReady||busy||accountToken.trim().length<8||(credentialRevoked&&!ownerRelinkConfirmed)"
     data-test="pancake-account-save" @click="saveAccount">
     {{busy?'正在验证…':'验证账户并自动读取主页'}}
   </button>
  </section>
  <section v-else class="pancake-section" data-test="pancake-page-list">
   <div class="pancake-section-head"><strong>第二步 · 选择要使用的主页</strong>
    <button type="button" @click="refresh" :disabled="busy">刷新主页</button></div>
   <p>当前账户下的主页自动列出；其他 Pancake／Facebook 账号的 Page 用该主页自己的 Page ID 和现有 Page Token 添加，不会替换已有账户。</p>
   <div v-if="!pages.length" class="pancake-note">当前账户未返回可管理的 Facebook 主页。</div>
   <div v-for="p in pages" :key="p.pageId" class="pancake-page" :data-page-id="p.pageId">
    <div class="pancake-page-info">
     <strong>{{p.name||'未命名主页'}}</strong>
     <small>主页 ID {{p.pageId}}</small>
     <span :class="p.tokenConfigured?'configured':'pending'">{{p.tokenConfigured?'Pancake API 凭据已保存':'需要主页 Token'}}</span>
    </div>
    <button type="button" :disabled="busy" data-test="pancake-select-page"
     @click="selectedPage=p.pageId;pageToken=''">
     {{p.tokenConfigured?'更新主页凭据':'连接此主页'}}
    </button>
   </div>
   <div class="pancake-token-panel" data-test="pancake-independent-page-add">
    <strong>添加其他账号管理的 Facebook Page</strong>
    <p>只使用该 Page 的独立官方令牌。不会切换或覆盖你已经接入的 Pancake 账号。</p>
    <label for="pancake-independent-page-id">其他账号的 Page ID</label>
    <input id="pancake-independent-page-id" v-model.trim="independentPageId" inputmode="numeric"
      autocomplete="off" spellcheck="false" placeholder="输入 Facebook Page ID"
      :disabled="busy" data-test="pancake-independent-page-id"/>
    <button type="button" :disabled="busy||!/^[0-9]{1,40}$/.test(independentPageId)"
      data-test="pancake-select-independent-page"
      @click="selectedPage=independentPageId;pageToken=''">添加此主页的 Page Token</button>
   </div>
   <div v-if="selectedPage" class="pancake-token-panel" data-test="pancake-page-token-panel">
    <strong>主页 {{pages.find(p=>p.pageId===selectedPage)?.name||selectedPage}}</strong>
    <p>打开该主页在 Pancake 中的「设置 → 工具 → Public API access token」，复制**现有** Token。不要点击生成新令牌，以免使旧令牌失效。</p>
    <a href="https://pancake.biz/" target="_blank" rel="noopener noreferrer">打开 Pancake 工作区</a>
    <label for="pancake-page-token">此主页的 Page Access Token</label>
    <input id="pancake-page-token" type="password" v-model="pageToken" autocomplete="off"
      spellcheck="false" :disabled="busy||!apiReady"
      placeholder="仅适用于当前选中的主页" data-test="pancake-page-token"/>
    <div class="pancake-actions">
     <button type="button" @click="cancelPage">取消</button>
     <button type="button" class="primary" :disabled="busy||pageToken.length<8"
       data-test="pancake-verify-page" @click="connectPage">
       验证并保存此主页
     </button>
    </div>
   </div>
  </section>
  <footer>言策只在官方验证后显示相应主页的 API 状态。真人联系人授权、消息发送及 AI 托管仍由原 W24/W25 独立核验。</footer>
 </article>
</template>
<style scoped>
.pancake-multi{display:grid;gap:14px;max-width:680px;width:100%;margin:0;color:var(--ink)}
.pancake-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.pancake-heading h3{font-size:18px;margin:0 0 6px}
.pancake-heading p,.pancake-section p,.pancake-multi footer{font-size:12px;line-height:1.55;color:var(--muted);margin:0}
.status{white-space:nowrap;color:var(--muted);font-size:11px;border:1px solid var(--border);border-radius:20px;padding:5px 8px}
.pancake-note{font-size:12px;line-height:1.5;padding:9px 11px;border:1px solid var(--border);border-radius:9px;margin:0}
.pancake-retry{justify-self:start;border:1px solid var(--border);background:var(--bg2);color:var(--ink);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:12px}
.pancake-retry:disabled{opacity:.55;cursor:wait}
.pancake-section{display:grid;gap:10px;border:1px solid var(--border);border-radius:13px;padding:16px;background:var(--bg2);min-width:0}
.pancake-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pancake-section-head span,.pancake-multi small{font-size:11px;color:var(--muted)}
.pancake-multi label{font-size:13px;font-weight:600}
.pancake-multi a{font-size:12px;color:var(--accent);text-decoration:underline}
.pancake-multi input{width:100%;box-sizing:border-box;min-width:0;min-height:44px;border:1px solid var(--border);background:var(--bg);color:var(--ink);border-radius:9px;padding:9px 11px}
.pancake-multi button{min-height:41px;border:1px solid var(--border);border-radius:9px;padding:8px 12px;background:var(--bg);color:var(--ink);cursor:pointer}
.pancake-multi button:disabled,.pancake-multi input:disabled{opacity:.48;cursor:not-allowed}
.pancake-multi button.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent;font-weight:650}
.pancake-page{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:10px;padding:11px}
.pancake-page-info{display:grid;gap:4px}
.pancake-page-info strong{font-size:13px}.pancake-page-info span{font-size:11px}
.configured{color:var(--accent)}.pending{color:var(--muted)}
.pancake-token-panel{border-top:1px solid var(--border);padding-top:12px;display:grid;gap:9px}
.pancake-token-panel strong{font-size:13px}
.pancake-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
@media(max-width:470px){.pancake-heading,.pancake-page{align-items:stretch;flex-direction:column}.pancake-section{padding:11px}}
</style>