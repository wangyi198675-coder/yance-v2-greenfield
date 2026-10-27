<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {mediaCapabilitiesRead,createW23BrowserMediaClient,isAcceptedFile} from './w23-media-browser-consumer.mjs';
const props=defineProps({fetchImpl:{type:Function,default:null},active:{type:Boolean,default:false},mediaAuthorityPort:{type:Object,default:null}});
const request=(u,o)=> (props.fetchImpl||globalThis.fetch)(u,o);
const capabilities=ref(null),capState=ref('not-checked'),message=ref(''),busy=ref(false);
const files=ref([]),selected=ref(null),filter=ref('all'),source=ref('all'),search=ref('');
const previewUrl=ref(''),previewError=ref(''),uploadFile=ref(null);
let epoch=0,alive=true;
const port=computed(()=>props.mediaAuthorityPort?.currentScope?createW23BrowserMediaClient({fetchImpl:request,scopePort:props.mediaAuthorityPort}):null);
const canUpload=computed(()=>capState.value==='ready'&&!!port.value&&!busy.value);
const filtered=computed(()=>files.value.filter(x=>(filter.value==='all'||x.kind===filter.value)&&
 (source.value==='all'||x.k?.channel===source.value)&&
 (!search.value||x.original_name.toLowerCase().includes(search.value.trim().toLowerCase()))));
const byteSize=n=>!Number.isFinite(n)?'—':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
function clearPreview(){if(previewUrl.value)URL.revokeObjectURL(previewUrl.value);previewUrl.value='';previewError.value=''}
function clearScoped(){epoch++;clearPreview();files.value=[];selected.value=null;uploadFile.value=null}
function readable(e){const x=String(e?.message||e||'');return /401/.test(x)?'401：本机会话未授权':/403/.test(x)?'403：权限被拒绝或已撤销':
 /409/.test(x)?'409：版本变化、文件已删除或上传会话过期':
 /503/.test(x)?'503：原W23附件接口尚未由W47挂载':
 '媒体操作未获得服务端确认：'+x.slice(0,100)}
async function refresh(){
 const ticket=++epoch;busy.value=true;capState.value='checking';message.value='';
 const priorIds=files.value.map(x=>x.asset_id);
 clearPreview();selected.value=null;files.value=[]; // never display stale assets while revalidating authority.
 try{
  const dto=await mediaCapabilitiesRead(request);
  if(!alive||ticket!==epoch)return;
  capabilities.value=dto;capState.value='ready';
  if(port.value&&priorIds.length){
   const checked=await Promise.allSettled(priorIds.map(id=>port.value.metadata(id)));
   if(!alive||ticket!==epoch)return;
   files.value=checked.filter(x=>x.status==='fulfilled').map(x=>x.value);
  }
  message.value=port.value?'真实附件能力已回读。只有当前合法账号K的已授权媒体才可操作。':
   'W23附件能力已回读，但当前联系人K／同意与Grant尚未获得W47签署，上传及库读取不可用。';
 }catch(e){if(alive&&ticket===epoch){capabilities.value=null;capState.value='unavailable';message.value=readable(e)}}
 finally{if(alive&&ticket===epoch)busy.value=false}
}
watch(()=>props.active,yes=>{if(yes)void refresh();else clearScoped()},{immediate:true});
onBeforeUnmount(()=>{alive=false;clearScoped()});
async function upload(){
 const file=uploadFile.value;if(!file||!canUpload.value||!isAcceptedFile(file))return;
 const rev=epoch;busy.value=true;message.value='正在等待 W23 二进制保存及元数据回读';
 try{
  const received=await port.value.uploadFile(file,{purpose:'contact_draft'});
  if(!alive||rev!==epoch)return;
  files.value=[received,...files.value.filter(x=>x.asset_id!==received.asset_id)];
  selected.value=received;message.value='真实上传成功：W23服务端已重新读取并核实文件哈希';
  await preview(received);
 }catch(e){if(rev===epoch)message.value=readable(e)}
 finally{if(rev===epoch){busy.value=false;uploadFile.value=null}}
}
async function preview(item){
 if(!item||!port.value)return;
 clearPreview();previewError.value='正在读取原始字节';
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
  message.value='原W23字节已读取并提供下载，没有上传到公共CDN';
 }catch(e){message.value=readable(e)}finally{busy.value=false}
}
async function remove(){
 if(!selected.value||!port.value||busy.value)return;
 busy.value=true;const id=selected.value.asset_id;
 try{
  await port.value.remove(id);
  clearPreview();files.value=files.value.filter(x=>x.asset_id!==id);selected.value=null;
  message.value='W23已确认文件撤销，随后GET确认不能再读取';
 }catch(e){message.value=readable(e)}finally{busy.value=false}
}
function picked(e){const file=e.target.files?.[0];e.target.value='';
 uploadFile.value=isAcceptedFile(file)?file:null;
 if(file&&!uploadFile.value)message.value='该文件格式或大小不符合W23原生安全限制';
}
</script>
<template>
 <section class="bc-media-workspace" data-test="w46-media-library" aria-label="媒体库">
  <header class="bc-media-toolbar" data-test="w46-media-toolbar">
   <div><strong>媒体库</strong><small>已授权来源 · 原W23加密附件</small></div>
   <button type="button" data-test="media-refresh" :disabled="busy" @click="refresh">刷新媒体权限</button>
  </header>
  <div class="bc-media-columns">
   <section class="bc-media-pane" data-test="w46-media-items">
    <div class="bc-media-head"><strong>附件资料</strong><span>已验证 {{files.length}} 条</span></div>
    <div class="bc-media-filter">
     <button v-for="f in [{id:'all',name:'全部'},{id:'image',name:'图片'},{id:'video',name:'视频'},{id:'audio',name:'音频'}]" :key="f.id"
      type="button" :data-test="'media-filter-'+f.id" :aria-pressed="filter===f.id" @click="filter=f.id">{{f.name}}</button>
    </div>
    <label>筛选平台来源
     <select v-model="source" data-test="media-source">
      <option value="all">全部已授权来源</option>
      <option value="FB_PERSONAL">Facebook个人</option><option value="FB_PAGE">Facebook Page</option>
      <option value="WHATSAPP_PERSONAL">WhatsApp</option><option value="TELEGRAM_PERSONAL">Telegram</option>
     </select>
    </label>
    <input v-model="search" data-test="media-search" aria-label="搜索已授权文件名" placeholder="搜索文件名" />
    <div v-if="!filtered.length" class="bc-media-empty" data-test="media-authoritative-empty">
     <strong>尚无可验证的附件</strong>
     <p>不会以素材占位图冒充账户文件。W23当前没有已签署的账号范围媒体列表分页，因此刷新不恢复虚构图片。</p>
     <small>选择真实联系人并获得W24身份K、W44持续有效Grant和W47接线后，方可读取本人附件。</small>
    </div>
    <button v-for="item in filtered" :key="item.asset_id" type="button" class="bc-media-file" data-test="media-asset"
     @click="preview(item)">
     <strong>{{item.original_name}}</strong><small>{{item.k?.channel}} · {{item.kind}} · {{item.mime}} · {{byteSize(item.byte_size)}} · {{item.status}}</small>
    </button>
    <label class="bc-media-upload">上传原生附件<input data-test="media-file-input" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/wav,audio/mpeg,audio/ogg"
     :disabled="!canUpload" @change="picked"/></label>
    <button type="button" data-test="media-upload" :disabled="!canUpload||!uploadFile" @click="upload">上传真实文件字节并校验回读</button>
   </section>
   <section class="bc-media-pane" data-test="w46-media-preview">
    <div class="bc-media-head"><strong>附件预览</strong><span>{{selected?.status||'无已授权选择'}}</span></div>
    <div class="bc-media-preview">
     <img v-if="previewUrl&&selected?.kind==='image'" :src="previewUrl" alt="从W23授权字节读取的图片"/>
     <video v-else-if="previewUrl&&selected?.kind==='video'" :src="previewUrl" controls preload="metadata"/>
     <audio v-else-if="previewUrl&&selected?.kind==='audio'" :src="previewUrl" controls preload="metadata"/>
     <p v-else>{{previewError||'选择当前授权文件后，由W23重新读取真实二进制字节进行预览。'}}</p>
    </div>
    <p v-if="selected">{{selected.original_name}} · {{selected.mime}} · {{byteSize(selected.byte_size)}}</p>
    <div class="bc-media-actions"><button type="button" data-test="media-download" :disabled="!selected||busy" @click="download">下载原文件</button>
     <button type="button" data-test="media-delete" :disabled="!selected||busy" @click="remove">删除（需原生授权）</button></div>
   </section>
   <aside class="bc-media-pane" data-test="w46-media-capabilities">
    <div class="bc-media-head"><strong>能力状态</strong><span>{{capState==='ready'?'原生回读':'未接通'}}</span></div>
    <p role="status" data-test="media-capability-state">{{message||'正在核实W23附件资格'}}</p>
    <div v-if="capabilities">
     <strong>本机加密存储</strong><p>{{capabilities.attachment_store}}</p>
     <strong>允许的媒体类型</strong>
     <p v-for="item in capabilities.accepted" :key="item.mime">{{item.kind}} · {{item.mime}} · 最大{{byteSize(item.max_bytes)}}</p>
     <strong>其它Provider</strong>
     <p>图片生成：{{capabilities.media_generation.image}}<br/>视频生成：{{capabilities.media_generation.video}}<br/>TTS：{{capabilities.media_generation.tts}}</p>
    </div>
    <p v-else>当前API不能确认加密附件服务，媒体操作继续禁用。没有创建新媒体Provider或存储系统。</p>
    <small>本地会话不等于社交账号许可；真实授权变化、403/409、上传失败或删除后自动清理预览。</small>
   </aside>
  </div>
 </section>
</template>
<style scoped>
.bc-media-workspace{display:grid;gap:12px;min-width:0;min-height:0;height:100%;padding:12px clamp(10px,2vw,24px);overflow-y:auto;align-content:start;color:var(--ink)}
.bc-media-toolbar,.bc-media-head{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}
.bc-media-toolbar strong{font-size:17px}.bc-media-toolbar small{display:block;color:var(--muted);font-size:11px}
.bc-media-columns{display:grid;grid-template-columns:minmax(220px,1.35fr) minmax(230px,1.4fr) minmax(185px,.9fr);gap:12px;min-width:0}
.bc-media-pane{display:grid;align-content:start;gap:12px;border:1px solid var(--border);background:var(--bg2);border-radius:14px;padding:14px;min-width:0}
.bc-media-head span,.bc-media-pane small{color:var(--muted);font-size:11px}
.bc-media-pane button,.bc-media-pane select,.bc-media-pane input:not([type=file]),.bc-media-toolbar button{font:inherit;min-width:0;padding:8px 10px;background:var(--surface-soft);color:var(--ink);border:1px solid var(--border);border-radius:9px}
.bc-media-pane button:disabled,.bc-media-pane input:disabled{opacity:.55;cursor:not-allowed}
.bc-media-filter,.bc-media-actions{display:flex;flex-wrap:wrap;gap:5px}
.bc-media-filter [aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.bc-media-pane label{display:grid;gap:7px;font-size:11px;color:var(--muted)}
.bc-media-upload input{max-width:100%;font-size:11px}
.bc-media-empty,.bc-media-preview{min-height:140px;display:grid;align-content:center;gap:9px;padding:13px;border:1px dashed var(--border);border-radius:13px}
.bc-media-empty p,.bc-media-preview p{font-size:12px;line-height:1.5;color:var(--muted);overflow-wrap:anywhere}
.bc-media-preview img,.bc-media-preview video{width:100%;max-height:290px;object-fit:contain}
.bc-media-preview audio{max-width:100%;width:100%}
.bc-media-file{text-align:left;display:grid;gap:4px;overflow-wrap:anywhere}
.bc-media-pane p{overflow-wrap:anywhere}
@media(max-width:1100px){.bc-media-columns{grid-template-columns:repeat(2,minmax(0,1fr))}.bc-media-columns aside{grid-column:1/-1}}
@media(max-width:720px){.bc-media-columns{grid-template-columns:minmax(0,1fr)}.bc-media-columns aside{grid-column:auto}.bc-media-workspace{padding:10px}.bc-media-pane{padding:12px}}
</style>
