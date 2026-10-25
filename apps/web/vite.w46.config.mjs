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
import {createLoopbackTakeoverPort} from '../../../../apps/web/src/native-takeover-port.mjs'
const w46Port=createLoopbackTakeoverPort({baseUrl:window.location.origin,enabled:true,
  endpoints:{get:'/api/v2/identity-consent/takeover-state',post:'/api/v2/identity-consent/takeover'}})
const w46Identity=computed(()=>active.value?{
  tenant:active.value.tenant,account:active.value.account,channel:active.value.channel,
  peer_id:active.value.peer_id,binding_revision:active.value.binding_revision}:null)
const w46SourceMid=computed(()=>active.value?.last_message?.provider_mid||'')
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
   return withScript.slice(0,i)+inserted+withScript.slice(j);
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
 preview:{host:'127.0.0.1',port:4174,strictPort:true,proxy:{
   '/api/v2/identity-consent':nativeBackend,'/w46-native-test':nativeBackend
 }},
 build:{outDir:join(repo,'apps/web/.w46-test-dist'),emptyOutDir:true,sourcemap:false}
};
