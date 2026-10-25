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
    transform(code,id){
      const file=id.replaceAll('\\','/');
      if(file.endsWith('/approved-clickable-abc-bc/src/store.ts')){
        const exact='const originalContacts=Object.freeze(effectiveFixture.contacts.map(c=>Object.freeze(c)))';
        failUnless(code,exact);
        code=code.replace(exact,'const originalContacts=reactive([] as Contact[])');
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
