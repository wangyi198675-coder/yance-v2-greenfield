<script setup>
import {computed,ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
// One authenticated W43 directory read. No new Agent, Sender or local expert registry.
const props=defineProps({fetchImpl:{type:Function,default:null}});
const emit=defineEmits(['close','navigate']);
const panel=ref(null),searchInput=ref(null),search=ref(''),filter=ref('all');
const phase=ref('loading'),experts=ref([]),position=ref({});
let readEpoch=0;
const descriptions=Object.freeze({
 'persona-natural-expression':'自然表达和人格规则',
 'german-natural-chat':'德国日常与 WhatsApp 聊天',
 'europe-language-style':'欧洲语言文化与自然表达',
 'relation-memory':'有来源的长期关系记忆',
 'chat-goal-planner':'聊天目标与任务规划',
 'reply-quality-growth':'回复质量与学习建议',
 'media-conversation':'图片、视频及语音对话',
 'system-health':'运行状态与系统检查',
 'oss-discovery':'只读查询言策现有功能目录',
 'safe-repair-upgrade':'隔离式安全修复和升级'
});
const glyphs=Object.freeze({
 'persona-natural-expression':'✒','german-natural-chat':'✧',
 'europe-language-style':'◎','relation-memory':'♡',
 'chat-goal-planner':'⌁','reply-quality-growth':'◇',
 'media-conversation':'▣','system-health':'⚙',
 'oss-discovery':'✦','safe-repair-upgrade':'⛭'
});
const found=computed(()=>experts.value.filter(e=>
 (filter.value!=='installed'||(e.installed&&e.registered))&&
 (!search.value.trim()||(e.label+' '+(descriptions[e.expertId]||''))
   .toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))));
const installedCount=computed(()=>experts.value.filter(e=>e.installed&&e.registered).length);
function verify(dto){
 if(dto?.ok!==true||dto.authoritative!==true||dto.source!=='W43_NATIVE_AGNO_EXPERT'||
 dto.status!=='NATIVE_EXPERT_DIRECTORY_READ'||dto.canSend!==false||
 dto.cataloguedCount!==10||dto.installedReadOnlyCount!==1||dto.registeredCount!==1||
 !Array.isArray(dto.experts)||dto.experts.length!==10||
 dto.experts.filter(e=>e.installed).length!==1||
 dto.experts.filter(e=>e.installed&&e.registered).length!==1||
 dto.experts.filter(e=>e.canInvoke).length>1||
 !dto.experts.every(e=>typeof e.expertId==='string'&&/^[a-z0-9-]{3,64}$/.test(e.expertId)&&
   typeof e.label==='string'&&typeof e.installed==='boolean'&&typeof e.registered==='boolean'&&
   typeof e.enabled==='boolean'&&typeof e.canInvoke==='boolean'&&
   (!e.canInvoke||(e.expertId==='oss-discovery'&&e.installed&&e.registered&&e.enabled&&
   e.availableMode==='READ_ONLY_STABLE252_INSPECTION'))))
  throw Error('EXPERT_SOURCE_NOT_VERIFIED');
 return dto.experts.map(e=>({
  expertId:e.expertId,label:e.label,installed:e.installed,registered:e.registered,
  enabled:e.enabled,canInvoke:e.canInvoke
 }));
}
async function load(){
 const ticket=++readEpoch;
 experts.value=[];phase.value='loading';
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),4500);
 try{
  const response=await (props.fetchImpl||globalThis.fetch)(
   '/api/v2/private-brain/experts',
   {method:'GET',credentials:'same-origin',headers:{accept:'application/json'},signal:controller.signal});
  if(!response.ok)throw Error('EXPERT_HTTP_UNAVAILABLE');
  const data=verify(await response.json());
  if(ticket!==readEpoch)return;
  experts.value=data;phase.value='ready';
 }catch{
  if(ticket===readEpoch)phase.value='unavailable';
 }finally{clearTimeout(timeout)}
}
function move(){
 const button=document.querySelector('[data-test="w46-composer-plus"]');
 if(!button)return;
 const r=button.getBoundingClientRect();
 const w=Math.min(496,window.innerWidth-24);
 const x=Math.min(Math.max(12,r.left-4),window.innerWidth-w-12);
 position.value={
  left:Math.round(x)+'px',
  bottom:Math.round(Math.max(12,window.innerHeight-r.top+8))+'px',
  width:Math.round(w)+'px',
  maxHeight:Math.round(Math.max(140,Math.min(690,r.top-26)))+'px'
 };
}
function toBrain(){emit('navigate','BRAIN')}
function keydown(e){
 if(e.key==='Escape'){e.stopPropagation();emit('close');return}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 if(document.activeElement===searchInput.value)return;
 const buttons=[...(panel.value?.querySelectorAll('button:not(:disabled)')||[])];
 if(!buttons.length)return;
 const idx=buttons.indexOf(document.activeElement);
 e.preventDefault();
 const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowDown'?
 (idx+1)%buttons.length:(idx<=0?buttons.length-1:idx-1);
 buttons[next].focus();
}
onMounted(async()=>{
 move();window.addEventListener('resize',move);
 window.addEventListener('scroll',move,true);
 await nextTick();searchInput.value?.focus();void load();
});
onBeforeUnmount(()=>{
 readEpoch++;window.removeEventListener('resize',move);
 window.removeEventListener('scroll',move,true);
});
</script>

<template>
 <Teleport to="body">
  <section ref="panel" class="bc-native-expert-picker bc-compose-popup"
    :style="position" data-test="w46-composer-experts" id="w46-contact-experts-menu"
    role="dialog" aria-label="选择专家" @keydown="keydown">
   <header class="expert-header">
    <div><small>言策 · 唯一闺蜜大脑</small><h2>选择专家</h2></div>
    <button type="button" class="expert-close" aria-label="关闭专家面板"
      data-test="w46-contact-expert-close" @click="emit('close')">×</button>
   </header>
   <label class="expert-search">
    <span aria-hidden="true">⌕</span>
    <input ref="searchInput" v-model="search" type="search"
      placeholder="搜索专家或能力…" aria-label="搜索专家" data-test="w46-expert-search"/>
   </label>
   <nav class="expert-filters" aria-label="筛选专家">
    <button type="button" :class="{selected:filter==='all'}" :aria-pressed="filter==='all'" @click="filter='all'">
     全部{{phase==='ready'?' · '+experts.length:''}}
    </button>
    <button type="button" :class="{selected:filter==='installed'}" :aria-pressed="filter==='installed'" @click="filter='installed'">
     已安装{{phase==='ready'?' · '+installedCount:''}}
    </button>
   </nav>
   <div class="expert-list">
    <p v-if="phase==='loading'" class="expert-empty" role="status">正在检查可用的专家能力…</p>
    <div v-else-if="phase==='unavailable'" class="expert-empty" role="status"
      data-test="w46-expert-source-unavailable">
     <strong>专家目录暂不可用</strong>
     <p>当前本机会话或专家服务尚未就绪，不会把设计中的专家显示为已安装。</p>
     <button type="button" @click="load">重新检查</button>
    </div>
    <template v-else>
     <p v-if="!found.length" class="expert-empty">没有匹配的专家</p>
     <article v-for="e in found" :key="e.expertId" class="expert-row"
       :class="{ready:e.installed&&e.registered}" :data-expert-id="e.expertId">
      <span class="expert-icon" aria-hidden="true">{{glyphs[e.expertId]||'✦'}}</span>
      <div class="expert-copy">
       <strong>{{e.label}}</strong>
       <small>{{descriptions[e.expertId]||'专业能力待验证'}}</small>
       <span v-if="e.installed&&e.registered" class="expert-state">
        {{e.enabled?'已安装 · 私人任务只读':'已安装 · 当前停用'}}
       </span>
       <span v-else class="expert-state unavailable">尚未接通</span>
      </div>
      <button v-if="e.installed&&e.registered" type="button"
       data-test="w46-expert-to-brain" class="expert-use" @click="toBrain">去使用</button>
      <span v-else class="expert-unavailable">待接通</span>
     </article>
    </template>
   </div>
   <footer class="expert-footer">
    <span>联系人专家绑定尚未开放，不能替代真实授权。</span>
    <button type="button" data-test="w46-expert-manage" @click="toBrain">闺蜜大脑 ›</button>
   </footer>
  </section>
 </Teleport>
</template>

<style scoped>
.bc-native-expert-picker{position:fixed!important;top:auto!important;right:auto!important;
 z-index:2200!important;display:flex!important;flex-direction:column;gap:0!important;
 box-sizing:border-box;overflow:hidden!important;padding:0!important;border:1px solid var(--border,#334248);
 border-radius:16px;background:var(--surface-raised,#172126);color:var(--ink,#edf2ed);
 box-shadow:0 22px 64px rgba(0,0,0,.55);font-family:inherit;text-align:left}
.expert-header{display:flex;align-items:center;justify-content:space-between;padding:17px 18px 12px;gap:12px}
.expert-header small{font-size:10px;color:var(--muted,#9cabb0)}
.expert-header h2{font-size:17px;line-height:1.2;margin:4px 0 0;color:var(--ink,#edf2ed)}
.expert-close{font-size:23px!important;line-height:1!important;display:grid;place-items:center;
 width:30px;height:30px;border:0!important;background:transparent!important;
 color:var(--muted,#9cabb0)!important;cursor:pointer}
.expert-search{margin:3px 16px 12px;display:flex;align-items:center;gap:9px;min-height:43px;
 padding:0 11px;border:1px solid var(--border,#334248);border-radius:11px;
 background:var(--surface,#202b30);color:var(--muted,#9cabb0)}
.expert-search:focus-within{border-color:var(--accent,#a3f65a);
 box-shadow:0 0 0 2px rgba(163,246,90,.13)}
.expert-search span{font-size:21px}
.expert-search input{flex:1;min-width:0;background:transparent;color:var(--ink,#fff);
 outline:0;border:0;font-size:13px;font-family:inherit}
.expert-search input::placeholder{color:var(--muted,#9cabb0)}
.expert-filters{display:flex;gap:8px;padding:0 16px 10px}
.expert-filters button{border:1px solid var(--border,#334248);background:transparent;
 border-radius:99px;padding:6px 13px;color:var(--muted,#9cabb0);cursor:pointer;font-size:11px}
.expert-filters button.selected{color:var(--ink,#fff);border-color:var(--accent,#a3f65a);
 background:rgba(163,246,90,.12)}
.expert-list{flex:1;min-height:0;overflow-y:auto;padding:0 12px 7px;
 scrollbar-width:thin;scrollbar-color:var(--border,#334248) transparent}
.expert-row{display:flex;align-items:center;gap:11px;min-height:65px;
 padding:9px 7px;border-bottom:1px solid var(--border,#334248);border-radius:9px}
.expert-row.ready{border:1px solid var(--accent,#a3f65a);background:rgba(163,246,90,.065)}
.expert-icon{flex:0 0 38px;width:38px;height:38px;display:grid;place-items:center;
 border-radius:11px;background:var(--surface,#202b30);border:1px solid var(--border,#334248);
 color:var(--accent,#a3f65a);font-size:20px}
.expert-copy{flex:1;min-width:0;display:grid;gap:3px}
.expert-copy strong{font-size:13px;overflow-wrap:anywhere}
.expert-copy small{font-size:11px;color:var(--muted,#9cabb0);line-height:1.45}
.expert-state{color:var(--accent,#a3f65a);font-size:10px}
.expert-state.unavailable{color:var(--muted,#9cabb0)}
.expert-use{flex:0 0 auto;border:0;border-radius:9px;padding:9px 11px;white-space:nowrap;
 cursor:pointer;background:var(--accent,#a3f65a);color:#15210c;font-size:11px;font-weight:700}
.expert-unavailable{font-size:10px;color:var(--muted,#9cabb0);white-space:nowrap;padding:6px}
.expert-empty{margin:0;padding:18px 8px;display:grid;gap:10px;
 color:var(--muted,#9cabb0);font-size:12px;line-height:1.6}
.expert-empty strong{color:var(--ink,#edf2ed);font-size:14px}
.expert-empty p{margin:0}.expert-empty button{justify-self:start;padding:8px 12px;
 border:1px solid var(--border,#334248);border-radius:8px;background:var(--surface,#202b30);color:var(--ink,#fff);cursor:pointer}
.expert-footer{display:flex;align-items:center;gap:8px;justify-content:space-between;
 padding:11px 16px;border-top:1px solid var(--border,#334248);background:var(--surface,#202b30)}
.expert-footer span{min-width:0;flex:1;font-size:10px;line-height:1.5;color:var(--muted,#9cabb0)}
.expert-footer button{flex:0 0 auto;border:0;background:transparent;color:var(--accent,#a3f65a);
 padding:7px 4px;font-size:11px;white-space:nowrap;cursor:pointer}
@media(max-width:430px){.expert-header{padding:12px 13px 8px}.expert-search{margin:4px 12px 9px}.expert-row{gap:7px;padding:8px 3px}.expert-icon{flex-basis:33px;width:33px;height:33px}.expert-footer{padding:9px 12px}}
</style>
