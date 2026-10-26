<script setup>
import {ref,watch,computed,onMounted,onBeforeUnmount} from 'vue';
import {Button} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/button';
import {ScrollArea} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/scroll-area';
import {Bubble,BubbleContent} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/bubble';
import {Message} from '../../../design/nonproduction/approved-clickable-abc-bc/src/components/oss/message';
import BCNativeComposer from './BCNativeComposer.vue';
import {createTrustedTakeoverPort} from './native-takeover-port.mjs';
import {readLiveContacts,readLiveTimeline,explainNativeFailure} from './live-chat-source.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null}});
const api=computed(()=>props.fetchImpl||globalThis.fetch);
const state=ref('checking'),error=ref(''),contacts=ref([]),accounts=ref(0),chosen=ref(null);
const timeline=ref([]),timelineState=ref('none'),timelineError=ref('');
const search=ref(''),channel=ref('ALL'),account=ref('ALL');
let currentRevision=0,sourceRevision=0,mounted=true;
const selected=computed(()=>contacts.value.find(c=>c.identityKey===chosen.value?.identityKey)||null);
const channels=Object.freeze([
 {id:'ALL',label:'全部渠道'},
 {id:'FB_PERSONAL',label:'Facebook'},
 {id:'FB_PAGE',label:'Page'},
 {id:'WHATSAPP_PERSONAL',label:'WhatsApp'},
 {id:'TELEGRAM_PERSONAL',label:'Telegram'}
]);
const filtered=computed(()=>{
 const q=search.value.trim().toLowerCase();
 return contacts.value.filter(c=>(channel.value==='ALL'||c.identity.channel===channel.value)&&
  (account.value==='ALL'||c.identity.account===account.value)&&
  (!q||[c.displayName,c.identity.account,c.identity.peer_id].some(s=>String(s).toLowerCase().includes(q))));
});
const accountIds=computed(()=>['ALL',...new Set(contacts.value.map(c=>c.identity.account))]);
const canShowData=computed(()=>state.value==='ready'&&accounts.value>0);
async function refresh(){
 const rev=++currentRevision;sourceRevision++;
 state.value='checking';error.value='';chosen.value=null;timeline.value=[];contacts.value=[];accounts.value=0;
 try{
  const snap=await readLiveContacts({fetchImpl:api.value});
  if(!mounted||rev!==currentRevision)return;
  contacts.value=snap.contacts;
  accounts.value=snap.connectedAccountCount;
  state.value=snap.trustedSession?
   (snap.connectedAccountCount?'ready':'waiting-auth'):'waiting-session';
 }catch(e){
  if(!mounted||rev!==currentRevision)return;
  state.value='unavailable';error.value=explainNativeFailure(e);
 }
}
async function chooseContact(contact){
 if(state.value!=='ready'||!contacts.value.some(c=>c.identityKey===contact.identityKey))return;
 const ticket=++sourceRevision;
 chosen.value=contact;timeline.value=[];timelineState.value='checking';timelineError.value='';
 try{
  const result=await readLiveTimeline({fetchImpl:api.value,contact});
  if(!mounted||ticket!==sourceRevision||chosen.value?.identityKey!==contact.identityKey)return;
  timeline.value=result.messages;timelineState.value='ready';
 }catch(e){
  if(!mounted||ticket!==sourceRevision)return;
  timelineState.value='blocked';timelineError.value=explainNativeFailure(e);
 }
}
const newestInbound=computed(()=>[...timeline.value].reverse().find(x=>x.direction==='INBOUND')||null);
// W47/W24 are the only Actors and authority. This client cannot grant itself
// takeover or W25 send privilege; current installed W47 denies before any POST.
const trustedTakeoverPort=createTrustedTakeoverPort({
 fetchImpl:(url,init)=>api.value(url,init)
});
const lastNativeMessage=computed(()=>{
 const s=selected.value,m=newestInbound.value;
 return s&&m&&m.identityKey===s.identityKey?{
  identityKey:s.identityKey,mid:m.mid,original:m.original,zh:m.zh,
  translationStatus:m.translationRunId?'SOURCE_UNREVIEWED':'PENDING',
  delivery:'NOT_REQUESTED',canSend:false,suggestions:[]
 }:null;
});
onMounted(refresh);
onBeforeUnmount(()=>{mounted=false;currentRevision++;sourceRevision++;contacts.value=[];timeline.value=[]});
</script>
<template>
 <section class="bc-real-chat" data-test="w46-real-chat" aria-label="B＋C 实际联系人与聊天工作台">
  <aside class="contact-pane bc-real-list" data-test="w46-real-contacts">
   <div class="pane-head">
    <div><small>四渠道 · 当前账号</small><h2>联系人 <span class="counter">{{contacts.length}}</span></h2></div>
    <Button size="sm" variant="outline" data-test="w46-reload-contacts" :disabled="state==='checking'" @click="refresh">刷新真实联系人</Button>
   </div>
   <p role="status" data-test="w46-read-authority">
    {{state==='checking'?'正在读取本机真实账户与联系人':
      state==='waiting-session'?'尚未取得可信本机应用会话':
      state==='waiting-auth'?'WAITING_USER_AUTH · 尚未完成渠道官方授权':
      state==='unavailable'?'平台原生接口尚未接通':
      '已从服务端读取当前账号与联系人'}}
   </p>
   <p v-if="error" role="alert" data-test="w46-contacts-error">{{error}}</p>
   <small>服务器验证的账户 {{accounts}} · 实际联系人 {{contacts.length}} · 未授权不会加载演示联系人</small>
   <template v-if="canShowData">
    <label>搜索身份／联系人<input v-model="search" type="search" data-test="w46-search" placeholder="搜索当前真实联系人"/></label>
    <div class="bc-real-filters">
     <Button v-for="ch in channels" :key="ch.id" size="xs"
      :variant="channel===ch.id?'secondary':'ghost'" @click="channel=ch.id">{{ch.label}}</Button>
    </div>
    <label>账号
     <select v-model="account" data-test="w46-account-scope">
      <option v-for="id in accountIds" :key="id" :value="id">{{id==='ALL'?'当前全部已验证账号':id}}</option>
     </select>
    </label>
    <ScrollArea class="bc-real-scroll">
     <Button v-for="c in filtered" :key="c.identityKey" variant="ghost"
       class="bc-real-contact" :aria-pressed="chosen?.identityKey===c.identityKey"
       :data-contact-k="c.identityKey" @click="chooseContact(c)">
      <span class="avatar">{{c.displayName.slice(0,1)}}</span>
      <span><strong>{{c.displayName}}</strong><small>{{c.identity.channel}} · {{c.identity.account}}</small></span>
      <small v-if="c.unread">未读 {{c.unread}}</small>
     </Button>
     <p v-if="!filtered.length">没有匹配的当前授权联系人</p>
    </ScrollArea>
   </template>
   <p v-else data-test="w46-contact-waiting">
    四个平台须通过各自已安装的 mautrix-meta、Pancake、Baileys 或 TDLib 正式授权流程。当前没有可查看的真实联系人。
   </p>
  </aside>
  <div class="bc-real-conversation" data-test="w46-live-timeline">
   <template v-if="selected">
    <header class="chat-header"><div class="header-avatar">{{selected.displayName.slice(0,1)}}</div>
     <div class="chat-person"><h2>{{selected.displayName}}</h2>
      <small>{{selected.identity.channel}} · {{selected.identity.account}} · 当前身份绑定 {{selected.identity.binding_revision}}</small>
     </div>
     <Button size="sm" variant="outline" @click="chooseContact(selected)">从原生服务刷新消息</Button>
    </header>
    <p v-if="timelineState==='checking'">正在读取实际来源消息</p>
    <p v-if="timelineState==='blocked'" role="alert" data-test="w46-messages-error">{{timelineError}}</p>
    <ScrollArea class="bc-real-timeline">
     <p v-if="timelineState==='ready'&&!timeline.length">该联系人没有已取得授权的真实消息</p>
     <div v-for="m in timeline" :key="m.mid" class="bc-real-message" :data-mid="m.mid">
      <Message :align="m.direction==='OUTBOUND'?'end':'start'">
       <Bubble :align="m.direction==='OUTBOUND'?'end':'start'" variant="default">
        <BubbleContent><p>{{m.original}}</p><p v-if="m.zh">{{m.zh}}</p></BubbleContent>
       </Bubble>
      </Message>
      <small>MID {{m.mid}} · {{m.providerSource}} · {{m.translationRunId?'译文来源Run '+m.translationRunId:'未验证中文译文'}}</small>
     </div>
    </ScrollArea>
    <BCNativeComposer :identity="selected.identity" :native-message="lastNativeMessage"
      :source-mid="newestInbound?.mid||''" :takeover-port="trustedTakeoverPort"/>
   </template>
   <div v-else class="bc-real-no-contact" data-test="w46-empty-chat">
    <h2>尚未选择真实联系人</h2>
    <p>连接你本人的平台账号后，从左侧选择联系人。查看或切换不会接管，也不会发送消息。</p>
    <p>当前 W47 服务器尚未提供真实授权的联系人、消息及 W25 发信资格；因此聊天内容保持空白，绝不载入冻结的虚构对话。</p>
   </div>
  </div>
 </section>
</template>
<style scoped>
.bc-real-chat{min-width:0;min-height:0;display:grid;grid-template-columns:minmax(240px,32%) minmax(0,1fr);gap:0;border:1px solid var(--w46-edge,#777);border-radius:12px;overflow:hidden;height:100%}
.bc-real-list{display:flex;flex-direction:column;gap:12px;min-height:0;padding:14px;border-right:1px solid var(--w46-edge,#777)}
.bc-real-list label{display:grid;gap:6px}.bc-real-list input,.bc-real-list select{width:100%;color:inherit;background:transparent;border:1px solid var(--w46-edge,#777);border-radius:7px;padding:8px}
.bc-real-filters{display:flex;gap:4px;flex-wrap:wrap}.bc-real-scroll{min-height:0;flex:1 1 auto}
.bc-real-contact{display:flex;align-items:center;text-align:left;width:100%;gap:10px;justify-content:start;min-width:0;overflow-wrap:anywhere}
.bc-real-contact span:nth-child(2){display:grid;gap:3px;min-width:0}.bc-real-contact small{font-size:11px;opacity:.7}
.bc-real-conversation{display:flex;flex-direction:column;min-height:0;min-width:0}
.bc-real-timeline{flex:1 1 auto;min-height:50px;padding:12px}
.bc-real-message{margin-bottom:16px}.bc-real-message p{white-space:pre-wrap;overflow-wrap:anywhere}
.bc-real-message small{font-size:11px;opacity:.75;overflow-wrap:anywhere}
.bc-real-no-contact{display:grid;align-content:center;justify-items:center;gap:12px;padding:25px;text-align:center;flex:1}
.bc-real-no-contact h2{font-size:18px}.bc-real-no-contact p{max-width:410px;opacity:.78}
.chat-header{padding:14px;border-bottom:1px solid var(--w46-edge,#777);display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.chat-person{min-width:0;flex:1}.chat-person h2{font-size:17px;font-weight:600}
@media(max-width:720px){.bc-real-chat{grid-template-columns:1fr;grid-template-rows:minmax(170px,40%) minmax(240px,60%)}
.bc-real-list{border-right:0;border-bottom:1px solid var(--w46-edge,#777)}}
</style>
