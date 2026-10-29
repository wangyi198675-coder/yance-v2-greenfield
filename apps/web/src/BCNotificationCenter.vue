<script setup>
import {computed,ref,watch,onMounted} from 'vue';
import {Monitor,Bell,RefreshCw,Play,Sparkles,Check,AlertCircle} from '../../../design/nonproduction/approved-clickable-abc-bc/node_modules/@lucide/vue/dist/esm/lucide-vue.mjs';
import {
 createW05NativeNotificationPort,readAgnoNotificationEnabled,setAgnoNotificationEnabled
} from './w05-native-notification-port.mjs';
import {readW05AudioPreference,writeW05AudioPreference,playW05DoubleTone} from './w05-notification-audio.mjs';

const props=defineProps({permission:{type:String,default:'unsupported'}});
const emit=defineEmits(['request-permission']);
const browserPermission=ref(props.permission);
const browserSupported=computed(()=>typeof window!=='undefined'&&'Notification' in window);
const browserGranted=computed(()=>browserSupported.value&&browserPermission.value==='granted');
const browserLabel=computed(()=>({
 granted:'已允许',denied:'已禁止',default:'未授权',unsupported:'不支持',unknown:'未确认'
})[browserPermission.value]||'未确认');
const native=createW05NativeNotificationPort();
const nativeStatus=ref(native.available?'checking':'unavailable');
const nativeBusy=ref(false);
const nativeFeedback=ref('');
const nativeLabel=computed(()=>({
 granted:'已允许',denied:'已禁止',default:'未授权',checking:'正在检查',unavailable:'不可用'
})[nativeStatus.value]||'未确认');
const testPending=ref(false),lastTest=ref('');
const agnoEnabled=ref(readAgnoNotificationEnabled()),preferenceFeedback=ref('');
const sound=ref(readW05AudioPreference()),soundResult=ref('');
function setSound(next){
 if(writeW05AudioPreference(next)){
  sound.value=readW05AudioPreference();soundResult.value='声音设置已保存';
 }else soundResult.value='声音设置无法保存';
}
async function previewSound(){
 const result=await playW05DoubleTone({preference:sound.value});
 soundResult.value=result.played?'双音试听已提交':result.reason==='MUTED'?'已静音': '无法播放，请检查浏览器声音权限';
}
watch(()=>props.permission,p=>{browserPermission.value=p;lastTest.value=''});
async function inspectNative(){
 if(!native.available)return;
 try{nativeStatus.value=await native.permission()}
 catch{nativeStatus.value='unavailable'}
}
async function refreshPermissions(){
 browserPermission.value=browserSupported.value?window.Notification.permission:'unsupported';
 lastTest.value='';nativeFeedback.value='';
 await inspectNative();
}
onMounted(()=>{void refreshPermissions()});
function requestBrowserPermission(){
 if(browserPermission.value!=='default'||!browserSupported.value)return;
 emit('request-permission');
}
function testBrowser(){
 if(!browserGranted.value||testPending.value)return;
 testPending.value=true;
 try{
  const test=new window.Notification('言策 · 通知测试',{
   body:'这是本机测试提醒，不会向任何联系人发送信息。',
   tag:'yance-local-test-notification',silent:true
  });
  test.onerror=()=>{lastTest.value='通知显示失败，请检查系统通知权限。'};
  lastTest.value='测试已提交，请查看系统通知中心。';
 }catch{lastTest.value='测试失败，请检查浏览器或系统通知权限。'}
 finally{testPending.value=false}
}
async function allowNative(){
 if(nativeBusy.value||nativeStatus.value!=='default')return;
 nativeBusy.value=true;nativeFeedback.value='';
 try{nativeStatus.value=await native.askPermission()}
 catch{nativeStatus.value='unavailable';nativeFeedback.value='Windows 授权失败。'}
 finally{nativeBusy.value=false}
}
async function testNative(){
 if(nativeBusy.value||nativeStatus.value!=='granted')return;
 nativeBusy.value=true;nativeFeedback.value='';
 try{
  const receipt=await native.nativeTest();
  nativeFeedback.value=receipt.submitted===true?'已提交，请查看 Windows 通知中心。':'未能提交。';
 }catch{nativeFeedback.value='测试失败，请检查系统通知权限。'}
 finally{nativeBusy.value=false}
}
function toggleAgno(){
 const next=!agnoEnabled.value;
 if(setAgnoNotificationEnabled(next)){
  agnoEnabled.value=next;preferenceFeedback.value='';
 }else preferenceFeedback.value='无法保存当前浏览器设置，请检查存储权限。';
}
</script>

<template>
 <article class="nc-center" data-test="settings-panel-notify" aria-label="通知中心">
  <header class="nc-top">
   <div>
    <h3>提醒设置</h3>
    <p>管理此设备的通知</p>
   </div>
   <button type="button" class="nc-refresh" data-test="notify-refresh-permission"
    @click="refreshPermissions"><RefreshCw :size="15"/> 刷新权限</button>
  </header>

  <div class="nc-grid">
   <section class="nc-card nc-primary" data-test="notify-browser-method">
    <div class="nc-card-head">
     <div class="nc-symbol"><Monitor :size="20"/></div>
     <span class="nc-chip" :class="browserGranted?'nc-chip-ready':'nc-chip-neutral'"
      data-test="settings-notification-permission">{{browserLabel}}</span>
    </div>
    <div class="nc-card-copy">
     <h4>浏览器通知</h4>
     <p>消息提醒与闺蜜大脑任务完成提示</p>
    </div>
    <div class="nc-actions">
     <button v-if="browserPermission==='default'" type="button" class="nc-button nc-button-main"
      data-test="settings-request-notifications" @click="requestBrowserPermission">
      <Bell :size="15"/> 允许通知
     </button>
     <button v-else-if="browserPermission==='granted'" type="button" class="nc-button nc-button-muted"
      data-test="settings-request-notifications" disabled><Check :size="15"/> 已授权</button>
     <button v-else type="button" class="nc-button nc-button-muted" disabled
      data-test="settings-request-notifications">无法授权</button>
     <button type="button" class="nc-button nc-button-secondary" data-test="notify-test-browser"
      :disabled="!browserGranted||testPending" @click="testBrowser"><Play :size="14"/> 发送测试</button>
    </div>
    <p v-if="browserPermission==='denied'" class="nc-hint">
     <AlertCircle :size="14"/> 请在浏览器网站权限中重新允许通知。
    </p>
    <p v-if="lastTest" class="nc-feedback" role="status" data-test="notify-browser-test-status">{{lastTest}}</p>
   </section>

   <section v-if="native.available" class="nc-card" data-test="notify-windows-method">
    <div class="nc-card-head">
     <div class="nc-symbol nc-symbol-blue"><Bell :size="20"/></div>
     <span class="nc-chip" :class="nativeStatus==='granted'?'nc-chip-ready':'nc-chip-neutral'"
      data-test="notify-native-readback">{{nativeLabel}}</span>
    </div>
    <div class="nc-card-copy"><h4>Windows 通知</h4><p>系统桌面提醒</p></div>
    <div class="nc-actions">
     <button v-if="nativeStatus==='default'" type="button" class="nc-button nc-button-main"
      data-test="notify-native-authorize" :disabled="nativeBusy" @click="allowNative">允许通知</button>
     <button v-else type="button" class="nc-button nc-button-muted"
      data-test="notify-native-authorize" disabled>{{nativeStatus==='granted'?'已授权':'系统权限不可用'}}</button>
     <button type="button" class="nc-button nc-button-secondary" data-test="notify-native-test"
      :disabled="nativeStatus!=='granted'||nativeBusy" @click="testNative"><Play :size="14"/> 发送测试</button>
    </div>
    <p v-if="nativeFeedback" class="nc-feedback" role="status" data-test="notify-native-feedback">{{nativeFeedback}}</p>
   </section>

   <section class="nc-card" data-test="notify-w05-sound">
    <div class="nc-card-head"><div class="nc-symbol"><Bell :size="20"/></div>
     <span class="nc-chip nc-chip-neutral">此浏览器</span></div>
    <div class="nc-card-copy"><h4>消息提示音</h4>
     <p>沿用 W05 清晰短促双音，接到新消息时只播放一次。</p></div>
    <div class="nc-task-row">
     <span>开启提示音</span>
     <button type="button" class="nc-switch" role="switch" data-test="notify-sound-toggle"
      :aria-checked="sound.enabled" aria-label="开启消息提示音"
      @click="setSound({...sound,enabled:!sound.enabled})"><span></span></button>
    </div>
    <label class="nc-hint" for="w05-notify-volume">提示音量 {{sound.volume}}%</label>
    <input id="w05-notify-volume" type="range" min="0" max="100" step="5"
     data-test="notify-volume" :value="sound.volume"
     @input="setSound({...sound,volume:Number($event.target.value)})"/>
    <div class="nc-actions">
     <button type="button" class="nc-button nc-button-secondary"
      data-test="notify-play-sound" @click="previewSound"><Play :size="14"/> 试听双音</button>
    </div>
    <p v-if="soundResult" class="nc-feedback" data-test="notify-audio-feedback" role="status">{{soundResult}}</p>
   </section>

   <section class="nc-card nc-task" data-test="notify-agno-pref">
    <div class="nc-card-head">
     <div class="nc-symbol nc-symbol-ai"><Sparkles :size="20"/></div>
     <span class="nc-chip nc-chip-neutral">此设备</span>
    </div>
    <div class="nc-task-row">
     <div><h4>闺蜜大脑任务提醒</h4><p>完成任务后，在后台显示提醒</p></div>
     <button type="button" class="nc-switch" role="switch" :aria-checked="agnoEnabled"
      aria-label="闺蜜大脑任务完成提醒" data-test="notify-agno-toggle" @click="toggleAgno">
      <span></span>
     </button>
    </div>
    <p v-if="preferenceFeedback" class="nc-feedback" role="alert">{{preferenceFeedback}}</p>
   </section>
  </div>
 </article>
</template>

<style scoped>
.nc-center{min-width:0;color:var(--ink);display:grid;gap:18px;padding:0 0 10px}
.nc-top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.nc-top h3{font-size:17px;font-weight:750;letter-spacing:-.025em;margin:0}
.nc-top p{font-size:11px;color:var(--muted);margin:5px 0 0}
.nc-refresh{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--surface-soft);border:1px solid var(--border);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;transition:background .15s}
.nc-refresh:hover{background:rgba(var(--accent-rgb),.1)}
.nc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}
.nc-card{min-width:0;border:1px solid var(--border);border-radius:16px;padding:18px;background:linear-gradient(140deg,rgba(var(--accent-rgb),.055),transparent 58%),var(--surface-soft);display:flex;flex-direction:column;gap:16px;box-shadow:0 7px 22px rgba(0,0,0,.055)}
.nc-primary{border-color:rgba(var(--accent-rgb),.36)}
.nc-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.nc-symbol{display:grid;place-items:center;color:var(--accent);background:rgba(var(--accent-rgb),.13);border:1px solid rgba(var(--accent-rgb),.19);border-radius:12px;width:44px;height:44px}
.nc-symbol-blue{color:#8bc9fd;background:rgba(91,172,237,.1);border-color:rgba(91,172,237,.2)}
.nc-symbol-ai{color:var(--accent);background:rgba(var(--accent-rgb),.12)}
.nc-chip{font-size:10px;border:1px solid var(--border);border-radius:20px;padding:5px 10px;white-space:nowrap}
.nc-chip-ready{color:var(--accent);background:rgba(var(--accent-rgb),.1);border-color:rgba(var(--accent-rgb),.36)}
.nc-chip-neutral{color:var(--muted)}
.nc-card-copy h4,.nc-task-row h4{margin:0;font-size:15px;font-weight:740;letter-spacing:-.025em}
.nc-card-copy p,.nc-task-row p{font-size:11px;color:var(--muted);margin:6px 0 0;line-height:1.55}
.nc-actions{margin-top:auto;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.nc-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;min-height:36px;padding:8px 13px;border:1px solid var(--border);border-radius:9px;font:inherit;font-size:11px;font-weight:650;cursor:pointer}
.nc-button-main{background:var(--accent)!important;border-color:var(--accent)!important;color:var(--bg)!important}
.nc-button-secondary,.nc-button-muted{background:var(--surface)!important;color:var(--ink)!important}
.nc-button:disabled{cursor:not-allowed;opacity:.48!important}
.nc-task{gap:15px}
.nc-task-row{display:flex;align-items:center;gap:14px;justify-content:space-between}
.nc-task-row>div{min-width:0}
.nc-switch{width:46px;height:26px;border:1px solid var(--border);padding:3px;border-radius:999px;background:var(--surface);cursor:pointer;flex:0 0 auto;display:flex;align-items:center;transition:background .18s}
.nc-switch[aria-checked="true"]{background:var(--accent);border-color:var(--accent)}
.nc-switch span{width:18px;height:18px;display:block;background:var(--ink);border-radius:100%;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.22)}
.nc-switch[aria-checked="true"] span{transform:translateX(19px);background:var(--bg)}
.nc-hint,.nc-feedback{margin:0;font-size:11px;line-height:1.5;color:var(--muted)}
.nc-hint{display:flex;gap:6px;align-items:flex-start}
.nc-feedback{border-radius:9px;border:1px solid rgba(var(--accent-rgb),.25);padding:9px 10px;background:rgba(var(--accent-rgb),.06)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media(max-width:780px){.nc-grid{grid-template-columns:1fr}.nc-card{padding:16px}}
@media(max-width:400px){.nc-top{align-items:flex-start}.nc-refresh{padding:8px 9px}.nc-card{padding:14px}}
@media(prefers-reduced-motion:reduce){.nc-center *, .nc-center :before,.nc-center :after{animation:none!important;transition:none!important}}
</style>
