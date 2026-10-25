// W47 composition ONLY: preserve W46 original B+C renderer and unique Composer.
// Suppress frozen W37 fixtures in the actual runtime build; real data comes only from local API.
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const original=resolve(root,'../W46_BC_NATIVE_20261025/apps/web/vite.w46.config.mjs');
const owner=(await import(pathToFileURL(original).href)).default;
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
        failUnless(code,'<div class="lab-strip">');
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
        code=code.replace(/<div class="lab-strip">[\s\S]*?<\/div>/,
          `<div class="lab-strip" data-test="w47-api-state">
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
 server:{...owner.server,proxy:{'/api/v2':'http://127.0.0.1:47182'}},
 preview:{...owner.preview,port:4399,strictPort:true,
  proxy:{'/api/v2':{target:'http://127.0.0.1:47182',changeOrigin:true},
         '/w46-native-test':{target:'http://127.0.0.1:47182',changeOrigin:true}}}
};
