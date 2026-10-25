// W46-only nonproduction integration build of the approved ORIGINAL B+C App.vue.
// Its tracked design/** source stays byte-identical, and the B+C app has ONE Composer.
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const here=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(here,'../..');
const root=join(repo,'design/nonproduction/approved-clickable-abc-bc');
const use=createRequire(join(root,'package.json'));
const vue=use('@vitejs/plugin-vue').default;
const tailwind=use('@tailwindcss/vite').default;
const nativeBackend='http://127.0.0.1:47181';
function replaceOnlyOriginalComposer(){
 return {name:'w46-original-bc-sole-composer',enforce:'pre',
 transformIndexHtml(html){
   // The original offline demo blocks all network by design. Allow ONLY same-origin
   // synthetic W24/W45 test routes via Vite's explicit loopback proxy.
   if(!html.includes("connect-src 'none'"))throw Error('B_C_CSP_BASE_CHANGED');
   return html.replace("connect-src 'none'","connect-src 'self'");
 },transform(code,id){
   if(!id.replaceAll('\\','/').endsWith('/design/nonproduction/approved-clickable-abc-bc/src/App.vue'))return;
   const intro='<script setup lang="ts">';
   const begin='      <div class="suggestions" data-test="suggestions">';
   const end='    </section>';
   const start=code.indexOf(begin),finish=code.indexOf(end,start);
   if(!code.includes(intro)||start<0||finish<0||start>=finish)throw Error('B_C_ORIGINAL_APP_CONTRACT_CHANGED');
   const extra=String.raw`
import BCNativeComposer from '../../../../apps/web/src/BCNativeComposer.vue'
import BCManagedStop from '../../../../apps/web/src/BCManagedStop.vue'
import BCProductWorkspaceCandidate from '../../../../apps/web/src/BCProductWorkspaceCandidate.vue'
import {createLoopbackManagedStopPort} from '../../../../apps/web/src/managed-stop.mjs'
import {createLoopbackTakeoverPort} from '../../../../apps/web/src/native-takeover-port.mjs'
const w46Port=createLoopbackTakeoverPort({baseUrl:window.location.origin,enabled:true,
  endpoints:{get:'/api/v2/identity-consent/takeover-state',post:'/api/v2/identity-consent/takeover'}})
const w46Identity=computed(()=>active.value?{
  tenant:active.value.tenant,account:active.value.account,channel:active.value.channel,
  peer_id:active.value.peer_id,binding_revision:active.value.binding_revision}:null)
const w46SourceMid=computed(()=>active.value?.last_message?.provider_mid||'')
// Browser synthetic laboratory only. No trusted production W09 STOP HTTP/IPC yet.
const w46StopPort=createLoopbackManagedStopPort({baseUrl:window.location.origin,enabled:true})
// W46 nonproduction only. W47 owns the actual runtime shell and signed routing.
const w46WorkspaceEnabled=new URLSearchParams(window.location.search).get('productDraft')==='1'
const w46Workspace=ref('CHAT')
const w46StopStates=ref<Record<string,string>>({})
const w46StopGlobalKey=(id:any)=>[id.tenant,id.account,id.channel].join('|')+'|GLOBAL'
const w46StopContactKey=(id:any)=>[id.tenant,id.account,id.channel,id.peer_id,id.binding_revision].join('|')+'|CONTACT'
function w46StopUpdate(event:any){
  if(!event?.identity||!['CONTACT','GLOBAL'].includes(event.scope))return
  const slot=event.scope==='GLOBAL'?w46StopGlobalKey(event.identity):w46StopContactKey(event.identity)
  w46StopStates.value={...w46StopStates.value,[slot]:event.status}
}
function w46ContactMode(c:any){
  const statuses=[w46StopStates.value[w46StopContactKey(c)],w46StopStates.value[w46StopGlobalKey(c)]]
  if(statuses.includes('COMMITTED'))return '已停止'
  if(statuses.includes('PENDING')||statuses.includes('STOPPING'))return '停止中'
  if(statuses.includes('UNAVAILABLE'))return '待核验'
  return currentMode(c)
}
const w46NativeMessage=ref<any|null>(null)
const w46DraftCandidatePort={
  async draftCandidate(identity:any,mid:string,candidateId:string){
    const reply=await fetch('/w46-native-test/draft',{method:'POST',
      headers:{'content-type':'application/json','X-Yance-Environment':'synthetic-only'},
      body:JSON.stringify({identity,mid,candidateId})})
    if(!reply.ok)throw Error('W45_DRAFT_HTTP_'+reply.status)
    return reply.json()
  }
}
watch([w46Identity,w46SourceMid],async([identity,mid],_,onCleanup)=>{
  w46NativeMessage.value=null
  if(!identity||!mid)return
  let cancelled=false;onCleanup(()=>{cancelled=true})
  try{
    const request='/w46-native-test/message?k='+encodeURIComponent([
      identity.tenant,identity.account,identity.channel,identity.peer_id,identity.binding_revision].join('|'))+
      '&mid='+encodeURIComponent(mid)
    const result=await fetch(request,{headers:{'X-Yance-Environment':'synthetic-only'}})
    if(!result.ok||cancelled)return
    const body=await result.json()
    if(!cancelled)w46NativeMessage.value=body
  }catch{w46NativeMessage.value=null}
},{immediate:true})
`;
   const original=code.slice(start,finish);
   const inserted=String.raw`      <BCNativeComposer v-if="isBC" data-test="composer" :identity="w46Identity"
        :source-mid="w46SourceMid" :native-message="w46NativeMessage"
        :draft-candidate-port="w46DraftCandidatePort" :takeover-port="w46Port"/>
      <template v-else>
`+original+String.raw`      </template>
`;
   const withScript=code.replace(intro,intro+extra);
   const i=withScript.indexOf(begin),j=withScript.indexOf(end,i);
   const transformed=withScript.slice(0,i)+inserted+withScript.slice(j);
   // Reuse existing CONTACT header control row, not an extra right panel.
   const anchor='<div class="chat-actions">';
   if(!transformed.includes(anchor))throw Error('B_C_HEADER_CONTROLS_CHANGED');
   const header=transformed.replace(anchor,anchor+'\n          <BCManagedStop v-if="isBC" :identity="w46Identity" :stop-port="w46StopPort" :appearance="state.appearance" @authority-change="w46StopUpdate"/>')
     .replaceAll('{{currentMode(c)}}','{{isBC?w46ContactMode(c):currentMode(c)}}')
     .replaceAll('{{currentMode(active)}}','{{isBC?w46ContactMode(active):currentMode(active)}}');
   const lab='<div class="lab-strip">';
   if(!header.includes(lab))throw Error('ORIGINAL_BC_LAB_STRIP_CHANGED');
   return header.replace(lab,`<BCProductWorkspaceCandidate v-if="isBC&&w46WorkspaceEnabled"
      :enabled="w46WorkspaceEnabled" :active-workspace="w46Workspace"
      :appearance="state.appearance" @select="w46Workspace=$event"/>
  <div v-if="!w46WorkspaceEnabled" class="lab-strip">`)
     .replace('<section v-if="isPulse"','<section v-if="!w46WorkspaceEnabled&&isPulse"')
     .replace('<main v-else class="workspace"','<main v-else v-show="!w46WorkspaceEnabled" class="workspace"');
 }};
}
export default {
 root,base:'./',plugins:[replaceOnlyOriginalComposer(),vue(),tailwind()],
 resolve:{alias:[
   {find:/^@\/registry\/bases\/reka\/ui\//,replacement:join(root,'src/components/oss/').replaceAll('\\','/')},
   {find:/^@\/lib\/utils$/,replacement:join(root,'src/lib/utils.ts').replaceAll('\\','/')},
   {find:/^@\//,replacement:join(root,'src/').replaceAll('\\','/')+'/'}]},
 server:{host:'127.0.0.1',port:4173,strictPort:true,proxy:{
   '/api/v2/identity-consent':nativeBackend,'/w46-native-test':nativeBackend
 }},
 preview:{host:'127.0.0.1',port:4174,strictPort:true,proxy:
   process.env.W46_R4_SAFE_PREVIEW==='1'?
   {'/api/v2':{target:'http://127.0.0.1:47182',changeOrigin:true},
    '/w46-native-test':nativeBackend}:
   {'/api/v2/identity-consent':nativeBackend,'/w46-native-test':nativeBackend}
 },
 build:{outDir:join(repo,'apps/web/.w46-test-dist'),emptyOutDir:true,sourcemap:false}
};
