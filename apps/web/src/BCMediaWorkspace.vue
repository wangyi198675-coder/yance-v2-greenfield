<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {mediaCapabilitiesRead,createW23BrowserMediaClient,isAcceptedFile} from './w23-media-browser-consumer.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null},active:{type:Boolean,default:false},mediaAuthorityPort:{type:Object,default:null}});
const request=(u,o)=>(props.fetchImpl||globalThis.fetch)(u,o);
const capabilities=ref(null),capState=ref('not-checked'),message=ref(''),busy=ref(false);
const files=ref([]),selected=ref(null),filter=ref('all'),source=ref('all'),search=ref('');
const previewUrl=ref(''),previewError=ref(''),uploadFile=ref(null),filtersOpen=ref(false),capabilityDetails=ref(null);
const thumbs=ref({});let epoch=0,alive=true,thumbRequests=0;
const thumbPending=new Set(),thumbQueue=[];let thumbBusy=0;
const port=computed(()=>props.mediaAuthorityPort?.currentScope?createW23BrowserMediaClient({fetchImpl:request,scopePort:props.mediaAuthorityPort}):null);
const canUpload=computed(()=>capState.value==='ready'&&!!port.value&&!busy.value);
const filtered=computed(()=>files.value.filter(x=>(filter.value==='all'||x.kind===filter.value)&&
 (source.value==='all'||x.k?.channel===source.value)&&
 (!search.value||x.original_name.toLowerCase().includes(search.value.trim().toLowerCase()))));
const byteSize=n=>!Number.isFinite(n)?'—':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const fileType=x=>x.kind==='image'?'图片':x.kind==='video'?'视频':x.kind==='audio'?'音频':'文件';
const timeLabel=x=>x.created_at?new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(new Date(x.created_at)):'';
const statusCopy=computed(()=>!port.value?'未授权的账号媒体不可查看':capState.value==='ready'?'已连接原生媒体读取接口':capState.value==='checking'?'正在核验媒体权限':'媒体服务暂不可用');
function clearPreview(){if(previewUrl.value)URL.revokeObjectURL(previewUrl.value);previewUrl.value='';previewError.value=''}
function clearThumbs(){Object.values(thumbs.value).forEach(url=>URL.revokeObjectURL(url));thumbs.value={};thumbQueue.length=0;thumbPending.clear();thumbRequests=0}
function clearScoped(){epoch++;clearPreview();clearThumbs();files.value=[];selected.value=null;uploadFile.value=null}
function readable(e){const x=String(e?.message||e||'');return /401/.test(x)?'本机会话尚未建立':
 /403/.test(x)?'当前媒体访问权限已被拒绝或撤销':
 /409/.test(x)?'媒体状态已变化，请刷新':
 /503/.test(x)?'原生媒体接口暂不可用':
 '媒体操作未获得服务端确认：'+x.slice(0,100)}
async function refresh(){
 const ticket=++epoch;busy.value=true;capState.value='checking';message.value='';
 const priorIds=files.value.map(x=>x.asset_id);
 clearPreview();clearThumbs();selected.value=null;files.value=[];
 try{
  const dto=await mediaCapabilitiesRead(request);
  if(!alive||ticket!==epoch)return;
  capabilities.value=dto;capState.value='ready';
  if(port.value&&priorIds.length){
   const checked=await Promise.allSettled(priorIds.map(id=>port.value.metadata(id)));
   if(!alive||ticket!==epoch)return;
   files.value=checked.filter(x=>x.status==='fulfilled').map(x=>x.value);
  }
  message.value=port.value?'已核实当前原生媒体访问范围。':
   '媒体服务已经回读，但当前没有获授权的联系人账号范围，不能列出私人文件。';
 }catch(e){if(alive&&ticket===epoch){capabilities.value=null;capState.value='unavailable';message.value=readable(e)}}
 finally{if(alive&&ticket===epoch)busy.value=false}
}
watch(()=>props.active,yes=>{if(yes)void refresh();else clearScoped()},{immediate:true});
watch(()=>props.mediaAuthorityPort,()=>{if(props.active)void refresh()});
onBeforeUnmount(()=>{alive=false;clearScoped()});
async function upload(){
 const file=uploadFile.value;if(!file||!canUpload.value||!isAcceptedFile(file))return;
 const rev=epoch;busy.value=true;message.value='正在核实文件字节和服务端保存结果…';
 try{
  const received=await port.value.uploadFile(file,{purpose:'contact_draft'});
  if(!alive||rev!==epoch)return;
  files.value=[received,...files.value.filter(x=>x.asset_id!==received.asset_id)];
  selected.value=received;message.value='附件已保存，W23服务端元数据与哈希已回读';
  await preview(received);
 }catch(e){if(rev===epoch)message.value=readable(e)}
 finally{if(rev===epoch){busy.value=false;uploadFile.value=null}}
}
async function preview(item){
 if(!item||!port.value)return;
 clearPreview();previewError.value='正在核实并读取媒体字节…';
 const rev=epoch;
 try{
  const x=await port.value.binary(item.asset_id);
  if(!alive||rev!==epoch)return;
  previewUrl.value=URL.createObjectURL(x.bytes);selected.value=x.item;previewError.value='';
 }catch(e){if(rev===epoch){selected.value=null;previewError.value=readable(e)}}
}
async function download(){
 if(!selected.value||!port.value)return;
 busy.value=true;
 try{
  const result=await port.value.binary(selected.value.asset_id);
  const url=URL.createObjectURL(result.bytes);
  const link=document.createElement('a');link.href=url;link.download=result.item.original_name;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  message.value='已读取授权的原始字节并提供下载';
 }catch(e){message.value=readable(e)}finally{busy.value=false}
}
async function remove(){
 if(!selected.value||!port.value||busy.value)return;
 busy.value=true;const id=selected.value.asset_id;
 try{
  await port.value.remove(id);
  clearPreview();const url=thumbs.value[id];if(url)URL.revokeObjectURL(url);
  const next={...thumbs.value};delete next[id];thumbs.value=next;
  files.value=files.value.filter(x=>x.asset_id!==id);selected.value=null;
  message.value='W23已确认删除且再次读取被拒绝';
 }catch(e){message.value=readable(e)}finally{busy.value=false}
}
function picked(e){const file=e.target.files?.[0];e.target.value='';
 uploadFile.value=isAcceptedFile(file)?file:null;
 if(file&&!uploadFile.value)message.value='该文件格式或大小不符合W23原生限制';
}
function enqueueThumb(item){
 if(!port.value||item?.kind!=='image'||!item.asset_id||thumbs.value[item.asset_id]||
    thumbPending.has(item.asset_id)||thumbRequests>=16)return;
 thumbPending.add(item.asset_id);thumbQueue.push({item,rev:epoch});thumbRequests++;pumpThumbs();
}
function pumpThumbs(){
 while(thumbBusy<2&&thumbQueue.length){
  const {item,rev}=thumbQueue.shift();thumbBusy++;
  Promise.resolve().then(()=>port.value?.binary(item.asset_id)).then(x=>{
   if(!x||!alive||rev!==epoch)return;
   const url=URL.createObjectURL(x.bytes);thumbs.value={...thumbs.value,[item.asset_id]:url};
  }).catch(()=>{}).finally(()=>{thumbBusy--;thumbPending.delete(item.asset_id);pumpThumbs()});
 }
}
let observer=null;
const vMediaThumb={
 mounted(el,binding){
  el.__yanceMedia=binding.value;
  if(!('IntersectionObserver' in globalThis)){enqueueThumb(binding.value);return}
  if(!observer)observer=new IntersectionObserver(records=>{
   for(const record of records)if(record.isIntersecting){
    enqueueThumb(record.target.__yanceMedia);observer?.unobserve(record.target);
   }
  },{rootMargin:'100px'});
  observer.observe(el);
 },
 updated(el,binding){el.__yanceMedia=binding.value},
 beforeUnmount(el){observer?.unobserve(el)}
};
function closePreview(){clearPreview();selected.value=null}
function toggleCapabilityDetails(){if(capabilityDetails.value)capabilityDetails.value.open=!capabilityDetails.value.open}
function onPreviewKey(e){if(e.key==='Escape')closePreview()}
</script>
<template>
 <section class="bc-media-workspace" data-test="w46-media-library" aria-label="媒体库">
  <header class="bc-gallery-toolbar" data-test="w46-media-toolbar">
   <div class="bc-gallery-title"><strong>媒体库</strong><span v-if="files.length">{{files.length}} 项</span></div>
   <div class="bc-gallery-tools">
    <label class="bc-gallery-search">
     <span aria-hidden="true">⌕</span>
     <input v-model="search" data-test="media-search" aria-label="搜索已授权文件名" placeholder="搜索已授权文件名…" />
    </label>
    <button type="button" class="bc-icon-btn" data-test="media-refresh" :disabled="busy" title="刷新媒体" aria-label="刷新媒体" @click="refresh">↻</button>
   </div>
  </header>
  <div class="bc-gallery-types">
   <div class="bc-gallery-chips" aria-label="媒体类型">
    <button v-for="f in [{id:'all',name:'全部'},{id:'image',name:'图片'},{id:'video',name:'视频'},{id:'audio',name:'语音'}]"
     :key="f.id" type="button" :data-test="'media-filter-'+f.id" :aria-pressed="filter===f.id"
     @click="filter=f.id">{{f.name}}</button>
   </div>
   <button type="button" class="bc-filter-toggle" data-test="media-filter-toggle" :aria-expanded="filtersOpen"
    @click="filtersOpen=!filtersOpen"><span aria-hidden="true">☷</span> 筛选</button>
  </div>
  <div v-if="filtersOpen" class="bc-gallery-filter-panel">
   <label>平台来源
    <select v-model="source" data-test="media-source">
     <option value="all">全部已授权来源</option>
     <option value="FB_PERSONAL">Facebook个人</option><option value="FB_PAGE">Facebook Page</option>
     <option value="WHATSAPP_PERSONAL">WhatsApp</option><option value="TELEGRAM_PERSONAL">Telegram</option>
    </select>
   </label>
   <button type="button" @click="source='all';filter='all';search=''">清除筛选</button>
  </div>

  <main class="bc-gallery-main" data-test="w46-media-items">
   <div v-if="!filtered.length" class="bc-gallery-empty" data-test="media-authoritative-empty">
    <div class="bc-gallery-empty-mark" aria-hidden="true"><span>▧</span><span class="bc-gallery-small-spark">✦</span></div>
    <strong>{{files.length?'没有符合筛选条件的媒体':port?'这里还没有可展示的媒体':'连接账号后查看聊天媒体'}}</strong>
    <p v-if="files.length">试试清除筛选，或更换来源和媒体类型。</p>
    <p v-else-if="!port">当前没有已授权联系人媒体，不能展示其他账号的素材。</p>
    <p v-else>只有当前有权访问的真实文件才会出现在这里。分页目录接入前不会显示虚构的图库。</p>
    <small v-if="!port">{{capState==='ready'?'W23附件能力已回读，但当前没有有效联系人K与Grant。':'当前尚未确认W23附件能力，也没有有效联系人K与Grant。'}} W23原生分页仍需W47接入。</small>
    <button v-if="files.length" type="button" class="bc-gallery-clear" @click="filter='all';source='all';search=''">清除筛选</button>
   </div>
   <div v-else class="bc-gallery-grid" data-test="media-asset-grid">
    <button v-for="item in filtered" :key="item.asset_id" v-media-thumb="item" type="button"
     class="bc-gallery-tile bc-media-file" data-test="media-asset"
     :aria-label="'预览 '+item.original_name" @click="preview(item)">
     <img v-if="thumbs[item.asset_id]" :src="thumbs[item.asset_id]" :alt="item.original_name" loading="lazy"/>
     <span v-else class="bc-gallery-placeholder" aria-hidden="true">{{item.kind==='image'?'▧':item.kind==='video'?'▶':item.kind==='audio'?'♫':'▤'}}</span>
     <span class="bc-gallery-tile-caption"><strong>{{item.original_name}}</strong><small>{{fileType(item)}} · {{byteSize(item.byte_size)}} {{timeLabel(item)}}</small></span>
    </button>
   </div>
  </main>

  <footer class="bc-gallery-footer">
   <div class="bc-gallery-foot-status" role="status" data-test="media-capability-state"><span class="bc-gallery-status-dot" :class="{ready:!!port&&capState==='ready'}"></span>{{statusCopy}}</div>
   <div class="bc-gallery-foot-actions">
    <label class="bc-gallery-upload" :class="{disabled:!canUpload}">
     ＋ 添加附件
     <input data-test="media-file-input" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/wav,audio/mpeg,audio/ogg"
      :disabled="!canUpload" @change="picked"/>
    </label>
    <button type="button" data-test="media-upload" :disabled="!canUpload||!uploadFile" @click="upload">上传</button>
    <button type="button" class="bc-gallery-tech-toggle" data-test="media-capabilities-toggle" @click="toggleCapabilityDetails">能力详情</button>
   </div>
  </footer>
  <details ref="capabilityDetails" class="bc-gallery-capabilities" data-test="w46-media-capabilities">
   <summary>授权与媒体能力详情</summary>
   <p>{{message||'正在核实原生W23媒体能力'}}</p>
   <div v-if="capabilities">
    <strong>附件存储</strong><p>{{capabilities.attachment_store}}</p>
    <strong>文件格式</strong><p v-for="item in capabilities.accepted" :key="item.mime">{{item.kind}} · {{item.mime}} · 最大{{byteSize(item.max_bytes)}}</p>
    <strong>未配置的生成Provider</strong>
    <p>图片：{{capabilities.media_generation.image}} · 视频：{{capabilities.media_generation.video}} · TTS：{{capabilities.media_generation.tts}}</p>
   </div>
   <p v-else>当前接口未返回合格媒体能力，文件操作已禁用。</p>
  </details>
  <div v-if="selected" class="bc-gallery-preview-overlay" data-test="w46-media-preview" @keydown="onPreviewKey" @click.self="closePreview">
   <section class="bc-gallery-preview-dialog" role="dialog" aria-modal="true" aria-label="媒体预览" tabindex="-1">
    <header>
     <strong :title="selected.original_name">{{selected.original_name}}</strong>
     <button type="button" aria-label="关闭预览" data-test="media-close-preview" autofocus @click="closePreview">×</button>
    </header>
    <div class="bc-gallery-preview-stage">
     <img v-if="previewUrl&&selected.kind==='image'" :src="previewUrl" alt="原生W23授权媒体图片"/>
     <video v-else-if="previewUrl&&selected.kind==='video'" :src="previewUrl" controls preload="metadata"/>
     <audio v-else-if="previewUrl&&selected.kind==='audio'" :src="previewUrl" controls preload="metadata"/>
     <p v-else>{{previewError||'正在读取真实授权文件…'}}</p>
    </div>
    <footer>
     <div><strong>{{fileType(selected)}}</strong><span>{{selected.mime}} · {{byteSize(selected.byte_size)}}</span></div>
     <div class="bc-media-actions">
      <button type="button" data-test="media-download" :disabled="busy" @click="download">下载原文件</button>
      <button type="button" data-test="media-delete" :disabled="busy" @click="remove">删除</button>
     </div>
    </footer>
   </section>
  </div>
 </section>
</template>
<style scoped>
.bc-media-workspace{height:100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--ink);isolation:isolate}
.bc-gallery-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;flex-shrink:0;padding:8px clamp(12px,2vw,24px);border-bottom:1px solid var(--border)}
.bc-gallery-title{display:flex;align-items:baseline;gap:10px;white-space:nowrap}.bc-gallery-title strong{font-size:19px;letter-spacing:-.035em;font-weight:760}.bc-gallery-title span{font-size:12px;color:var(--muted)}
.bc-gallery-tools{display:flex;align-items:center;gap:9px;flex:0 1 470px;min-width:0}
.bc-gallery-search{display:flex;align-items:center;gap:8px;flex:1;min-width:0;min-height:39px;border:1px solid var(--border);border-radius:999px;padding:0 13px;background:var(--surface-soft);color:var(--muted);transition:border-color .16s,box-shadow .16s}
.bc-gallery-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 25%,transparent),0 0 21px color-mix(in srgb,var(--accent) 12%,transparent)}
.bc-gallery-search span{font-size:19px}.bc-gallery-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:12px}.bc-gallery-search input::placeholder{color:var(--muted)}
.bc-icon-btn{width:38px;height:38px;flex-shrink:0;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);color:var(--ink);font-size:23px;cursor:pointer}
.bc-gallery-types{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px clamp(12px,2vw,24px);min-height:48px;flex-shrink:0}
.bc-gallery-chips{display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none}.bc-gallery-chips::-webkit-scrollbar{display:none}
.bc-gallery-chips button,.bc-filter-toggle,.bc-gallery-filter-panel button{font:inherit;font-size:12px;white-space:nowrap;border:1px solid transparent;border-radius:999px;background:var(--surface-soft);color:var(--muted);padding:8px 13px;cursor:pointer}
.bc-gallery-chips button[aria-pressed=true]{background:var(--accent);color:var(--accentInk);font-weight:740;box-shadow:0 3px 17px color-mix(in srgb,var(--accent) 17%,transparent)}
.bc-filter-toggle{border-color:var(--border);color:var(--ink)}.bc-filter-toggle[aria-expanded=true]{border-color:var(--accent)}
.bc-gallery-filter-panel{display:flex;align-items:end;gap:12px;flex-shrink:0;padding:9px clamp(12px,2vw,24px);border-bottom:1px solid var(--border);background:var(--bg2)}
.bc-gallery-filter-panel label{display:grid;gap:5px;font-size:11px;color:var(--muted)}.bc-gallery-filter-panel select{background:var(--surface-soft);border:1px solid var(--border);border-radius:9px;padding:8px;color:var(--ink);min-width:0}
.bc-gallery-main{flex:1;min-height:0;overflow-y:auto;padding:10px clamp(12px,2vw,24px) 22px;scrollbar-width:thin}
.bc-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:13px;align-content:start}
.bc-gallery-tile{position:relative;display:block;overflow:hidden;isolation:isolate;aspect-ratio:1 / 1.06;padding:0;text-align:left;border:1px solid var(--border);border-radius:16px;background:var(--bg2);cursor:pointer;box-shadow:0 7px 24px #00000018;transition:transform .18s,box-shadow .18s,border-color .18s}
.bc-gallery-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s}
.bc-gallery-tile:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 15px 36px #00000038,0 0 22px color-mix(in srgb,var(--accent) 16%,transparent)}
.bc-gallery-tile:hover img{transform:scale(1.04)}.bc-gallery-tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bc-gallery-placeholder{display:grid;place-items:center;width:100%;height:100%;font-size:51px;color:var(--muted);background:radial-gradient(circle at 30% 12%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 67%),var(--bg2)}
.bc-gallery-tile-caption{position:absolute;inset:auto 0 0;padding:25px 12px 10px;background:linear-gradient(transparent,#0a1014dc);display:grid;gap:4px;color:#f8fdfb}
.bc-gallery-tile-caption strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bc-gallery-tile-caption small{font-size:10px;color:#c0ceca}
.bc-gallery-empty{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:min(470px,100%);height:100%;max-width:480px;margin:auto;gap:14px;text-align:center;padding:20px}
.bc-gallery-empty-mark{position:relative;display:grid;place-items:center;width:88px;height:88px;border-radius:25px;background:radial-gradient(circle at 40% 25%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 70%),var(--bg2);border:1px solid var(--border);box-shadow:0 13px 60px color-mix(in srgb,var(--accent) 10%,transparent);font-size:39px;color:var(--accent)}
.bc-gallery-small-spark{position:absolute;right:-6px;top:-12px;font-size:18px}.bc-gallery-empty strong{font-size:18px;font-weight:750}.bc-gallery-empty p{font-size:13px;line-height:1.6;color:var(--muted);margin:0}.bc-gallery-empty small{font-size:11px;line-height:1.6;color:var(--muted);max-width:390px}
.bc-gallery-clear{border:1px solid var(--accent);background:var(--surface-soft);padding:9px 16px;border-radius:999px;color:var(--ink);cursor:pointer}
.bc-gallery-footer{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px clamp(12px,2vw,24px);border-top:1px solid var(--border);background:var(--bg2)}
.bc-gallery-foot-status{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;min-width:0}.bc-gallery-status-dot{width:7px;height:7px;flex-shrink:0;background:var(--muted);border-radius:50%}.bc-gallery-status-dot.ready{background:var(--accent);box-shadow:0 0 9px var(--accent)}
.bc-gallery-foot-actions{display:flex;align-items:center;gap:7px;flex-shrink:0}
.bc-gallery-upload,.bc-gallery-foot-actions button{font:inherit;cursor:pointer;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft);padding:8px 11px;color:var(--ink);font-size:11px;white-space:nowrap}
.bc-gallery-upload{position:relative}.bc-gallery-upload input{position:absolute;opacity:0;inset:0;max-width:100%;cursor:pointer}.bc-gallery-upload.disabled{opacity:.5;cursor:not-allowed}.bc-gallery-upload.disabled input{cursor:not-allowed}
.bc-gallery-foot-actions button:disabled{opacity:.45;cursor:not-allowed}.bc-gallery-tech-toggle{color:var(--muted)!important}
.bc-gallery-capabilities{flex:0 0 auto;padding:0 clamp(12px,2vw,24px);max-height:180px;overflow-y:auto;background:var(--bg2);border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
.bc-gallery-capabilities:not([open]){display:none}.bc-gallery-capabilities summary{padding:8px 0;cursor:pointer}.bc-gallery-capabilities p{margin:5px 0 9px;line-height:1.6}
.bc-gallery-preview-overlay{position:absolute;inset:0;z-index:35;display:grid;place-items:center;padding:26px;background:#020507cf;backdrop-filter:blur(12px)}
.bc-gallery-preview-dialog{display:flex;flex-direction:column;width:min(1100px,100%);height:min(820px,100%);background:var(--bg2);border:1px solid var(--border);border-radius:18px;overflow:hidden;box-shadow:0 20px 75px #0009}
.bc-gallery-preview-dialog>header,.bc-gallery-preview-dialog>footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;min-height:52px}
.bc-gallery-preview-dialog>header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bc-gallery-preview-dialog>header button{font-size:25px;width:32px;height:32px;border:0;color:var(--ink);background:var(--surface-soft);border-radius:9px;cursor:pointer}
.bc-gallery-preview-stage{flex:1;min-height:0;display:grid;place-items:center;background:#060a0c;padding:14px;color:#d5e0dc}.bc-gallery-preview-stage img,.bc-gallery-preview-stage video{width:100%;height:100%;object-fit:contain}.bc-gallery-preview-stage audio{width:min(550px,100%)}
.bc-gallery-preview-dialog>footer{border-top:1px solid var(--border)}.bc-gallery-preview-dialog>footer div:first-child{display:grid;gap:3px;min-width:0}.bc-gallery-preview-dialog>footer strong{font-size:12px}.bc-gallery-preview-dialog>footer span{font-size:11px;color:var(--muted)}
.bc-media-actions{display:flex;gap:8px}.bc-media-actions button{padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--surface-soft);color:var(--ink);cursor:pointer;font:inherit;font-size:12px}.bc-media-actions button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:950px){.bc-gallery-grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px}}
@media(max-width:600px){.bc-gallery-toolbar{min-height:52px}.bc-gallery-title strong{font-size:15px}.bc-gallery-types{gap:6px;padding-block:7px}.bc-gallery-chips button{padding:7px 10px}.bc-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.bc-gallery-tile{border-radius:12px}.bc-gallery-footer{flex-wrap:wrap}.bc-gallery-foot-status{flex-basis:100%}.bc-gallery-preview-overlay{padding:0}.bc-gallery-preview-dialog{border-radius:0}.bc-gallery-tech-toggle{display:none}}
@media(max-width:360px){.bc-gallery-title span{display:none}.bc-gallery-grid{gap:7px}.bc-gallery-foot-actions{width:100%;justify-content:flex-end}.bc-gallery-search input{font-size:11px}}
@media(prefers-reduced-motion:reduce){.bc-gallery-tile,.bc-gallery-tile img,.bc-gallery-search{transition:none!important}.bc-gallery-tile:hover,.bc-gallery-tile:hover img{transform:none!important}}
</style>