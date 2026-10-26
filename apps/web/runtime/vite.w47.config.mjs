// W47 composition ONLY: preserve W46 original B+C renderer and unique Composer.
// Suppress frozen W37 fixtures in the actual runtime build; real data comes only from local API.
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
// W09 portable integration: import the exact W46 Owner files cherry-picked into this checkout.
const original=resolve(root,'apps/web/vite.w46.config.mjs');
const owner=(await import(pathToFileURL(original).href)).default;
// Owner-controlled nonproduction preview only. Never touch the signed 4399 stage.
const r4IsolatedPreview=process.env.W47_R4_ISOLATED_PREVIEW==='1';
// An uncommitted or unacknowledged W46 moving tree must never enter W47's R4 preview.
if(r4IsolatedPreview){
 // W09 portable join: signed W46 Owner blobs MUST match this checkout; never
 // resolve a different developer worktree or trust a browser query as authority.
 const w46Root=root;
 const signedSha=process.env.W47_W46_CANDIDATE_SHA||'';
 const expectedOwnerSha='c80345675c94592bbd31e6b0684d8e163364b610';
 const canonicalAck='apps/web/evidence/TO_W09_2_W46_R4_CANDIDATE_OWNER_HANDOFF.md';
 const ownerFiles={
  'apps/web/src/BCProductWorkspaceCandidate.vue':'14a2b6f2300162aaa8c8e115edcc6bdb53b1d12c',
  'apps/web/src/BCLiveChatWorkspace.vue':'61df3ba766ad8d0df618070a9ad1285e26164e05',
  'apps/web/src/live-chat-source.mjs':'9663d5bc6a4ac5117bd4a40097e89eca466ef2f2',
  'apps/web/src/BCChannelAccountSetup.vue':'7c7f3cd877f2dd09f3b4a93ca5f23b668afea078',
  'apps/web/src/BCNativeHostSession.vue':'613b9b761cf1b8325da03677b4051c2807d29a9b',
  'apps/web/src/channel-setup-contract.mjs':'184d2407fc07c99e4eb2316d68d20246c91a2bb1',
  'apps/web/src/native-host-status-port.mjs':'339f78a5ea0c81db23875b479ffa1cf627e1f70f',
  'apps/web/src/BCPrivateBrainWorkspace.vue':'19278758ee59d1a264634bec43bf94134f385101',
  'apps/web/src/private-brain-ui-contract.mjs':'03822dcce8f2bc4b84a8a111431f87431eced794',
  'apps/web/evidence/TO_W09_2_W46_SINGLE_BRAIN_NO_PAIR_MODEL_UI_20261026.md':'2aedb0b4673117999575273079ffc2b5c542de5c',
  'apps/web/evidence/TO_W09_2_W47_W46_MODEL_DTO_NATIVE_JOIN_20261026.md':'c42830240483a4ac553513b7202d7d41136719c8',
  'apps/web/src/BCLocalSessionConnector.vue':'7f62421e0e3410f7e343820be2a17351c4b11139',
  'apps/web/src/local-session-ui-contract.mjs':'07ce57478fd70bc41cc6c219811d24ac9fb8771e',
  'apps/web/evidence/TO_W09_2_W46_LOCAL_SESSION_OWNER_SECURITY_ACK_20261026.md':'de158fd6c5861a88a0ffe95e2a5899077624688c',
  'apps/web/src/BCBrandIcon.vue':'d99edca93a61f0464349cd515a6fee1a0580bb11',
  'apps/web/src/r4-brand-paths.mjs':'d8000f36dabcc5041c858c6c0c2f03a33345e103',
  'apps/web/src/product-workspace-contract.mjs':'01c9be64e4d2e8fa0a5cf3f33c29c5cda3eb235b',
  'apps/web/vite.w46.config.mjs':'cc618b37e5a02a3655421c14ff2fd5726f5a5fda',
  [canonicalAck]:'45893dca88309c678bc7b232f12809d879890c9e'
 };
 const handoff=join(w46Root,canonicalAck);
 const git=(...args)=>execFileSync('git',args,{cwd:w46Root,encoding:'utf8'}).trim();
 const ownerAck=existsSync(handoff)?readFileSync(handoff,'utf8'):'';
 const receiptTracked=git('ls-tree','-r','--name-only','HEAD','--',canonicalAck)===canonicalAck;
 const dirtySource=git('status','--porcelain','--','apps/web/src','apps/web/tests','apps/web/vite.w46.config.mjs',canonicalAck);
 const validSignedBlobs=Object.entries(ownerFiles).every(([path,sha])=>
   existsSync(join(w46Root,path))&&git('hash-object','--',path)===sha&&
   git('rev-parse','HEAD:'+path)===sha);
 if(signedSha!==expectedOwnerSha||dirtySource||!receiptTracked||!validSignedBlobs||
    !ownerAck.includes('W46 → W09-2')||!ownerAck.includes('R4 Vue')||
    !readFileSync(join(w46Root,'apps/web/evidence/TO_W09_2_W46_LOCAL_SESSION_OWNER_SECURITY_ACK_20261026.md'),'utf8').includes('W46_LOCAL_PAIRING_UI_SECURITY_DELTA_PASS')||
    !readFileSync(join(w46Root,'apps/web/evidence/TO_W09_2_W46_SINGLE_BRAIN_NO_PAIR_MODEL_UI_20261026.md'),'utf8').includes('W46_UNIQUE_BRAIN_NO_PAIR_MODEL_UI_SOURCE_BUILD_CHROME_PASS'))
   throw Error('W47_W46_SIGNED_CLEAN_CANDIDATE_AND_OWNER_HANDOFF_REQUIRED');
}
// This proxy target is a NONPRODUCTION QA-only W47 installed-mode API port.
// Keep 47182 as the default for unchanged signed B_88DED, never accept remote host.
const stageApiTarget=process.env.W09_STAGE_API_TARGET||'http://127.0.0.1:47182';
if(!/^http:\/\/127\.0\.0\.1:(?:[1-9][0-9]{3,4})$/.test(stageApiTarget))
  throw Error('W09_LOCAL_STAGE_API_TARGET_INVALID');
function failUnless(code,text){if(!code.includes(text))throw Error('W47_BC_CONTRACT_DRIFT: '+text)}
function gate(){
  return {name:'w47-runtime-truth-gate',enforce:'pre',
    transformIndexHtml(html){
      return html.replace('言策 V2 · 四方案离线交互实验','言策 V2 · 本地运行')
        .replace('</head>','<link rel="icon" href="data:,">\n</head>');
    },
    transform(code,id){
      const file=id.replaceAll('\\','/');
      if(file.endsWith('/approved-clickable-abc-bc/src/store.ts')){
        const exact='const originalContacts=Object.freeze(effectiveFixture.contacts.map(c=>Object.freeze(c)))';
        failUnless(code,exact);
        code=code.replace(exact,'const originalContacts=reactive([] as Contact[])');
        // B+C is the accepted product view; hide the obsolete A/B/C experiment switch.
        code=code.replace(/export const ARMS:[\s\S]*?\n]\nexport const THEMES/,
          "export const ARMS: {id:Arm;label:string;sub:string}[] = [{id:'CHAT-BC-FUSION',label:'B+C · 融合版',sub:'Inbox + Autopilot'}]\nexport const THEMES");
        code=code.replace('arm:ARMS[3].id as Arm','arm:ARMS[0].id as Arm');
        code=code.replace('selected:key(originalContacts[0])', "selected:originalContacts[0]?key(originalContacts[0]):''");
        code=code.replace('export const allContacts=originalContacts as Contact[]',`export const allContacts=originalContacts as Contact[]
// Server supplied list only; no fixture hydration or fake success on failed reads.
void fetch('/api/v2/contacts',{credentials:'omit',redirect:'error'}).then(async response=>{
 if(!response.ok)throw Error('CONTACT_API_'+response.status);
 const payload=await response.json();
 if(payload.authoritative!==true||!Array.isArray(payload.contacts))throw Error('CONTACT_AUTHORITY_INVALID');
 originalContacts.splice(0,originalContacts.length,...payload.contacts);
 state.selected=originalContacts.length?key(originalContacts[0]):'';
}).catch(()=>{originalContacts.splice(0);state.selected=''})`);
        code=code.replace('export const candidates=(c:Contact)=>overlay.reply_cases.find(x=>x.peer_id===c.peer_id)?.candidates||[]',
          'export const candidates=(_c:Contact)=>[]');
        code=code.replace('export const currentMode=(c:Contact)=>state.mode[key(c)]||c.mode',
          "export const currentMode=(_c:Contact)=>'UNAVAILABLE'");
        code=code.replace(/export function editPublic\([\s\S]*?\n}\nexport function adoptCandidate/,
          "export function editPublic(text:string,_source='TEXT'){const c=active.value;if(c)getDraft(c).text=text}\nexport function adoptCandidate");
        code=code.replace(/export function simulateSend\(\)\{[\s\S]*?\n}\nexport function setException/,
          "export function simulateSend(){state.dialog='没有已认证平台发送资格，消息未发送'}\nexport function setException");
        code=code.replace(/export function askPrivate\(\)\{[\s\S]*?\n}\nexport function note/,
          "export function askPrivate(){state.dialog='闺蜜大脑运行授权尚未连接，未生成回复或调用模型'}\nexport function note");
        return code;
      }
      if(file.endsWith('/approved-clickable-abc-bc/src/App.vue')){
        const w46R4Candidate=code.includes('<BCProductWorkspaceCandidate');
        if(r4IsolatedPreview&&!w46R4Candidate)throw Error('W47_R4_W46_OWNER_COMPONENT_NOT_MOUNTED');
        if(!code.includes('<div class="lab-strip">')&&
           !code.includes('<div v-if="!w46WorkspaceEnabled" class="lab-strip">'))
          throw Error('W47_BC_LAB_STRIP_CONTRACT_CHANGED');
        if(w46R4Candidate&&!r4IsolatedPreview){
          const activation="const w46WorkspaceEnabled=new URLSearchParams(window.location.search).get('productDraft')==='1'";
          failUnless(code,activation);
          code=code.replace(activation,'const w46WorkspaceEnabled=false');
        }
        code=code.replace(/const accounts=\[[^\n]*\]/,"const accounts=['ALL']");
        code=code.replace(/const queue=\[[\s\S]*?\n\]\nconst currentException/,
          'const queue=[]\nconst currentException');
        code=code.replace('查看全部120','查看全部')
          .replace('没有匹配的虚构联系人。可清除筛选','尚未连接社交平台，当前没有真实联系人')
          .replace('V2 LAB','V2 本机');
        code=code.replace('function openPrivateWorkspace(){state.privateOpen=true;state.variantMenuOpen=false}',
          "function openPrivateWorkspace(){state.dialog='闺蜜大脑尚未连接可信运行授权，未执行模型调用'}");
        // Remove remnants of the historical W37 clickable LAB from the real no-provider UI.
        // Every old demo control here would otherwise suggest that a real account existed.
        failUnless(code,'四方案真实交互试验 · 本地离线');
        failUnless(code,'加载更多（25）');
        failUnless(code,'所有账号均为fixture-account-1/2');
        code=code.replace('四方案真实交互试验 · 本地离线','本地运行 · 无需言策账号');
        code=code.replace(/<nav class="arm-switch"[\s\S]*?<\/nav>/,'');
        code=code.replace(/<Button variant="ghost" size="icon-sm" aria-label="重置所有实验状态"[\s\S]*?<\/Button>/,'');
        code=code.replace(/<Button variant="ghost" size="icon-sm" aria-label="查看四平台与虚构账号说明"[\s\S]*?<\/Button>/,'');
        code=code.replace('<div class="account-pills">','<div v-if="allContacts.length" class="account-pills">');
        code=code.replace('<div class="channel-pills"','<div v-if="allContacts.length" class="channel-pills"');
        code=code.replace('<div v-if="isAdaptive" class="inbox-pills"','<div v-if="isAdaptive&&allContacts.length" class="inbox-pills"');
        code=code.replace('按冻结数据未读排序 · 无AI推断','仅按已取得的实际消息状态显示');
        code=code.replace('<div class="page-bottom">','<div v-if="filtered.length>paged.length" class="page-bottom">');
        code=code.replace('加载更多（25）','加载更多');
        code=code.replace('Math.min(120,state.pageSize+25)','Math.min(filtered.length,state.pageSize+25)');
        code=code.replace(/<Button variant="ghost" size="sm" @click="state.pageSize=120">查看全部(?:120)?<\/Button>/,'');
        code=code.replace(/<section v-else class="no-active-pane"[\s\S]*?<\/section>/,
          `<section v-else class="no-active-pane" data-test="no-active">
            <LockKeyhole :size="30"/>
            <h2>尚未连接聊天平台</h2>
            <p>本机 API 已启动，但还没有授权的 Facebook、WhatsApp、Telegram 或 Page 账号。</p>
            <p>连接平台需要你主动授权。当前无法读取真人联系人或消息，闺蜜大脑托管与发送保持关闭。</p>
            <small data-test="w47-empty-authority">当前状态：{{w47ApiStatus}}</small>
          </section>`);
        code=code.replace("if(q.get('private')==='1')state.privateOpen=true;",'')
          .replace("if(q.get('pulse')==='1')state.pulseOpen=true;",'')
          .replace("if(q.get('uat')==='1'){const u=await import('./browser-tests');await u.runBrowserUAT()}",'');
        code=code.replace('本地模拟状态','当前运行状态')
          .replace('以下仅为离线测试反馈，不代表真实授权、发送或工具运行。',
             '平台和联系人尚未授权。这里不会模拟登录、聊天或 AI 成功。');
        code=code.replace('仅127.0.0.1 · 离线合成数据','本机 127.0.0.1 · 无平台授权');
        code=code.replace('{{currentArm.sub}} · {{state.theme}} / {{state.appearance}} · reset {{state.resetCount}}',
          '{{state.theme}} / {{state.appearance}}');
        code=code.replace("VIEW {{active?.peer_id||'NO_SELECTION'}} · 真实发送 0 · P4 HOLD",
          '托管未启用 · 消息发送禁用');
        code=code.replace(/<div(?: v-if="!w46WorkspaceEnabled")? class="lab-strip">[\s\S]*?<\/div>/,
          `<div v-if="${w46R4Candidate?'!w46WorkspaceEnabled':'true'}" class="lab-strip" data-test="w47-api-state">
<ShieldCheck :size="13"/> V2 本机运行 · API：{{w47ApiStatus}} · Web: {{w47WebSha}} · 无平台连接 · 自动发送禁用
</div>`);
        code=code.replace('const filePicker=ref<HTMLInputElement|null>(null)',`const filePicker=ref<HTMLInputElement|null>(null)
const w47ApiStatus=ref('正在查询')
const w47WebSha=ref('待读取')
onMounted(async()=>{
  try {
    const [health,capabilities,version]=await Promise.all([
      fetch('/api/v2/runtime/health',{cache:'no-store'}),
      fetch('/api/v2/runtime/capabilities',{cache:'no-store'}),
      fetch('/version.json',{cache:'no-store'})
    ]);
    if(!health.ok||!capabilities.ok||!version.ok)throw Error('API_NOT_CONNECTED');
    const h=await health.json(), c=await capabilities.json(),v=await version.json();
    if(h.ok!==true||h.canSend!==false||c.authoritative!==true)throw Error('API_AUTHORITY_INVALID');
    w47ApiStatus.value=h.apiVersion+' '+h.runtimeSha.slice(0,8)+' / 无授权';
    w47WebSha.value=(v.source_sha||'未记录').slice(0,8);
  }catch{w47ApiStatus.value='不可用；发送禁用'}
})`);
        code=code.replace("note('REAL CLICKABLE OFFLINE HARNESS / W37 SYNTHETIC DATA LOADED')",
          "note('W47 runtime: API no provider credentials; contact list server-sourced')");
        return code;
      }
    }
  };
}
export default {
 ...owner,
 plugins:[...owner.plugins,gate()],
 server:{...owner.server,proxy:{'/api/v2':stageApiTarget}},

 preview:{...owner.preview,host:'127.0.0.1',port:r4IsolatedPreview?44747:4399,strictPort:true,
  proxy:{'/api/v2':{target:stageApiTarget,changeOrigin:true},
         '/w46-native-test':{target:stageApiTarget,changeOrigin:true}}}
};
