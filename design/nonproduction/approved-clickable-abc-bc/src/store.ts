import { reactive, computed, nextTick } from 'vue'
import fixture from './data/fixture.json'
import effectiveFixture from './data/effective-fixture.json'
import collisionFixture from './data/w37-colliding-peer-negative.json'
import overlay from './data/overlay.json'
import sidecar from './data/sidecar.json'

export type Contact = (typeof fixture.contacts)[number]
export type Arm = 'CHAT-A-V25_VISUAL_NORMALIZED' | 'CHAT-B-ADAPTIVE_INBOX' | 'CHAT-C-PULSE_MAIN' | 'CHAT-BC-FUSION'
export type LocalQuote = { k:string; mid:string; original:string; zh:string }
export const ARMS: { id:Arm; label:string; sub:string }[] = [
 {id:'CHAT-A-V25_VISUAL_NORMALIZED',label:'A · V2.5 标准化',sub:'Classic workspace'},
 {id:'CHAT-B-ADAPTIVE_INBOX',label:'B · 自适应会话',sub:'Adaptive inbox'},
 {id:'CHAT-C-PULSE_MAIN',label:'C · 全屏 Pulse',sub:'Exception-first'},
 {id:'CHAT-BC-FUSION',label:'B+C · 融合版',sub:'Inbox + Autopilot'}
]
export const THEMES=['Obsidian Lime','Cosmic Sunset','Ocean Electric','Amber Ember','Opal Prism'] as const
export const HASHES = Object.freeze({fixture:'5b9a05df788fe5fab41b6b2033fb895cd3650fb573345856650cfeb24ef9c99c',overlay:'4ed9607d0d65833ab9a5ead3513fdb3b9d03c27e85959997f0125b759071c824',sidecar:'deed37219749242ef853418103fbad902c547089e723233671ed04a7e90af4dc',effective:'6198539f936ac636cd24ec812456557e5d9c6509cdf9c6c63856f4f061699af9',collision:'23163b8fe673360c2fee9b2d7627d2781319154a522424e126e89e41b8481570'})
const originalContacts=Object.freeze(effectiveFixture.contacts.map(c=>Object.freeze(c)))
export const key=(c:Contact)=>[c.tenant,c.account,c.channel,c.peer_id,c.binding_revision].join('|')
type Draft={text:string;quote:LocalQuote|null;files:{name:string;size:number}[]}
const getFresh=()=>({
 arm:ARMS[1].id as Arm,theme:'Obsidian Lime',appearance:'dark',themeMenuOpen:false,selected:key(originalContacts[0]),
 search:'',channel:'ALL',account:'ALL',pageSize:30,pulseOpen:false,privateOpen:false,
 dialog:'',suggestExpanded:false,composerComposing:false,privateDraft:'',
 drafts:{} as Record<string,Draft>,mode:{} as Record<string,string>,
 exceptions:{} as Record<string,string>,
 notes:[] as string[],
 privateMessages:[] as {role:'YOU'|'AGNO MOCK';content:string;time:string}[],
 localTimeline:{} as Record<string,{id:string;body:string;status:string;origin:'SIMULATED_LOCAL_ONLY'}[]>,
 resetCount:0,
})
export const state=reactive(getFresh())
export const allContacts=originalContacts as Contact[]
export const findByKIn=(contacts:readonly Contact[],identityK:string)=>contacts.find(c=>key(c)===identityK)
export const getByK=(identityK:string)=>findByKIn(allContacts,identityK)
export const uniqueByPeerIn=(contacts:readonly Contact[],peer:string)=>{const matches=contacts.filter(c=>c.peer_id===peer);return matches.length===1?matches[0]:undefined}
export const byPeer=(peer:string)=>{const contact=uniqueByPeerIn(allContacts,peer);if(!contact)throw Error('PEER_AMBIGUOUS_OR_MISSING_FULL_K_REQUIRED');return contact}
export const resolveIdentity=(input:string)=>{const full=getByK(input);if(full)return full;const matches=allContacts.filter(c=>c.peer_id===input);return matches.length===1?matches[0]:undefined}
export const active=computed(()=>{const c=getByK(state.selected);return c&&filtered.value.some(v=>key(v)===key(c))?c:null})
export const activeKey=computed(()=>active.value?key(active.value):'')
export const currentMode=(c:Contact)=>state.mode[key(c)]||c.mode
export const getDraft=(c:Contact):Draft=>{
 const k=key(c);if(!state.drafts[k])state.drafts[k]={text:'',quote:null,files:[]};return state.drafts[k]
}
const emptyDraft:Draft={text:'',quote:null,files:[]}
export const currentDraft=computed(()=>active.value?getDraft(active.value):emptyDraft)
export const candidates=(c:Contact)=>overlay.reply_cases.find(x=>x.peer_id===c.peer_id)?.candidates||[]
export const displayName=(c:Contact)=>c.peer_id==='fake-peer-003'||c.peer_id==='fake-peer-117'?'同名演示联系人':c.display_name
export const filtered=computed(()=>{
 const q=state.search.toLowerCase().trim()
 return allContacts.filter(c=>
   (state.channel==='ALL'||c.channel===state.channel)&&
   (state.account==='ALL'||c.account===state.account)&&
   (!q||[displayName(c),c.peer_id,c.account,c.channel,c.last_message.original,c.last_message.zh].some(v=>v.toLowerCase().includes(q)))
 )
})
export const paged=computed(()=>filtered.value.slice(0,state.pageSize))
export function select(c:Contact){if(!filtered.value.some(x=>key(x)===key(c))){note('BLOCK OUT_OF_SCOPE '+key(c));return false}state.selected=key(c);state.suggestExpanded=false;state.pulseOpen=state.arm==='CHAT-C-PULSE_MAIN'?false:state.pulseOpen;note('VIEW '+key(c)+' – no takeover / no read ack');return true}
export function applyScope(account:string,channel:string){state.account=account;state.channel=channel;state.pageSize=30;const c=getByK(state.selected);if(!c||!filtered.value.some(x=>key(x)===key(c))){const replacement=filtered.value[0];state.selected=replacement?key(replacement):'';note('SCOPE_CHANGE_SAFE '+(replacement?key(replacement):'NO_SELECTION')+'; no read ack/takeover/send')}}
export function setArm(arm:Arm){state.arm=arm;state.pulseOpen=arm==='CHAT-C-PULSE_MAIN';state.privateOpen=false;note('SWITCH ARM '+arm+'; data unchanged')}
export function reset(arm:Arm=state.arm){
 const n=state.resetCount+1;Object.assign(state,getFresh());state.resetCount=n;state.arm=arm;state.pulseOpen=arm==='CHAT-C-PULSE_MAIN';note('RESET frozen W37 seed; all contact-local state cleared')
}
export function editPublic(text:string,source='TEXT'){
 const c=active.value;if(!c)return;const k=key(c);getDraft(c).text=text
 if(currentMode(c)!=='HUMAN'){state.mode[k]='HUMAN';note('SIMULATED TAKEOVER '+source+' '+k+'; all other peers unchanged')}
}
export function adoptCandidate(text:string,id:string){const c=active.value;if(!c)return;getDraft(c).text=text;note('CANDIDATE '+id+' copied to local CONTACT draft only')}
export function quote(c:Contact){getDraft(c).quote={k:key(c),mid:c.last_message.provider_mid,original:c.last_message.original,zh:c.last_message.zh};note('QUOTE '+key(c)+'/'+c.last_message.provider_mid)}
export function attach(files:FileList|null){if(!files)return;const c=active.value;if(!c)return;getDraft(c).files.push(...[...files].map(f=>({name:f.name,size:f.size})));if(files.length&&currentMode(c)!=='HUMAN'){state.mode[key(c)]='HUMAN'};note('LOCAL ATTACHMENT METADATA ONLY '+key(c))}
export function clearQuote(){if(active.value)getDraft(active.value).quote=null}
export function clearFile(i:number){if(active.value)getDraft(active.value).files.splice(i,1)}
export function simulateSend(){
 const c=active.value;if(!c){note('BLOCK NO_ACTIVE_CONTACT SEND');return}const k=key(c)
 let status=state.exceptions[k]||'SIMULATED_NO_SEND'
 if(['GRANT_REVOKED','GRANT_EXPIRED','BUDGET_EXHAUSTED','ACCOUNT_DISABLED','REBIND_STALE'].includes(status))status='NO_SEND_'+status
 if(status==='UNKNOWN')status='UNKNOWN_NO_RETRY_NOT_DELIVERED'
 state.localTimeline[k]||=[]
 state.localTimeline[k].push({id:'local-'+(state.localTimeline[k].length+1),body:getDraft(c).text,status,origin:'SIMULATED_LOCAL_ONLY'})
 note('PROVIDER_SEND_BLOCKED '+k+' status='+status)
 state.dialog='本地预览记录已生成；没有发送给任何真人或Provider。\n'+status
}
export function setException(contactK:string,code:string){const c=resolveIdentity(contactK);if(!c){note('BLOCK AMBIGUOUS SCENARIO '+contactK);return false}state.exceptions[key(c)]=code;note('SIMULATED EVENT '+code+' '+key(c));return true}
export function handleScenario(code:string,contactK:string){const c=resolveIdentity(contactK);if(!c){state.dialog='无法确定联系人完整身份K；模拟事件拒绝';return}if(!filtered.value.some(x=>key(x)===key(c))){state.dialog='目标账号不在当前筛选范围内；未更改聊天及Composer';return}setException(key(c),code);select(c);state.dialog='离线事件：'+code+' / '+key(c)+'。不自动重试、不伪造送达或授权。'}
export function askPrivate(){
 const q=state.privateDraft.trim();if(!q)return
 state.privateMessages.push({role:'YOU',content:q,time:'offline'})
 state.privateMessages.push({role:'AGNO MOCK',content:'[SIMULATED_TEST_ONLY] 本地模拟 Run/Trace：收到指令。没有实际工具调用、关系记忆写入、API请求或费用。',time:'offline'})
 state.privateDraft='';note('PRIVATE WORKSPACE LOCAL ONLY; no CONTACT composer mutation')
}
export function note(s:string){state.notes.unshift(s);if(state.notes.length>60)state.notes.length=60}
export const MOCK_EVENTS=sidecar.added_synthetic_events.map(x=>({id:x.id,kind:x.kind}))
export const COLLISION_ROWS=collisionFixture.rows
export const snapshot=()=>({
 source:HASHES,seed:sidecar.scenario_seed,
 identities:allContacts.map(c=>({k:key(c),mid:c.last_message.provider_mid,original:c.last_message.original,zh:c.last_message.zh,presence:c.presence,read:c.read_verification})),
 replyCases:overlay.reply_cases.map(x=>({peer:x.peer_id,ids:x.candidates.map(z=>z.id),text:x.candidates.map(z=>z.text)})),
 sidecarEvents:sidecar.added_synthetic_events.map(x=>x.id),
 state:{arm:state.arm,selected:state.selected,modes:{...state.mode},drafts:JSON.parse(JSON.stringify(state.drafts)),exceptions:{...state.exceptions},notes:[...state.notes]},
 })
if(import.meta.env.DEV) (window as any).__YANCE_P3_OFFLINE={state,allContacts,key,getByK,byPeer,resolveIdentity,select,applyScope,reset,setArm,editPublic,quote,adoptCandidate,simulateSend,setException,snapshot,overlay,sidecar}
