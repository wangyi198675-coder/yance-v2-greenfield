<script setup>
import {computed,ref,watch} from 'vue';
import {
 BellRing,Monitor,Volume2,Moon,ShieldCheck,Activity,MessageSquare,
 Bell,CheckCircle2,AlertCircle,Clock3,LockKeyhole,Play,Settings2,
 Sparkles,ArrowUpRight,Radio,VolumeX,UserRoundCheck
} from '../../../design/nonproduction/approved-clickable-abc-bc/node_modules/@lucide/vue/dist/esm/lucide-vue.mjs';

const props=defineProps({
 permission:{type:String,default:'unsupported'},
 platform:{type:String,default:'web'}
});
const emit=defineEmits(['request-permission']);
const lastTest=ref('');
const testPending=ref(false);
const browserSupported=computed(()=>typeof window!=='undefined'&&'Notification' in window);
const browserGranted=computed(()=>browserSupported.value&&props.permission==='granted');
const browserLabel=computed(()=>({
 granted:'已允许',denied:'已阻止',default:'等待授权',
 unsupported:'当前浏览器不支持',unknown:'无法确认'
})[props.permission]||'未确认');
const permissionHint=computed(()=>props.permission==='denied'
 ? '浏览器已阻止通知，请在浏览器的网站权限中调整。'
 : props.permission==='granted'
 ? '当前网站具备通知显示权限，实际送达仍由浏览器与操作系统决定。'
 : props.permission==='default'
 ? '授权只会在你主动点击按钮后向浏览器提出申请。'
 : '当前环境尚无法使用浏览器系统通知。');
watch(()=>props.permission,()=>{lastTest.value=''});
function testNativeBrowser(){
 // Explicit user-initiated test of the browser's built-in notification API.
 // No synthetic success, no OS Toast impersonation, no send to real contacts.
 if(!browserGranted.value||testPending.value)return;
 testPending.value=true;
 try{
  const test=new window.Notification('言策 · 通知测试',{
   body:'这是一条本机浏览器通知测试，不会向联系人发送消息。',
   tag:'yance-local-test-notification',
   silent:true
  });
  test.onerror=()=>{lastTest.value='浏览器未能显示测试通知，请检查系统通知设置。'};
  lastTest.value='已向浏览器提交测试通知。请检查系统通知中心确认是否显示。';
 }catch{
  lastTest.value='浏览器拒绝创建通知，请检查浏览器与系统权限。';
 }finally{testPending.value=false}
}
</script>

<template>
 <article class="nc-center" data-test="settings-panel-notify" aria-label="通知中心">
  <div class="nc-hero">
   <div class="nc-hero-art" aria-hidden="true"><div class="nc-halo"><BellRing :size="36" :stroke-width="1.6"/></div><div class="nc-orbit"></div></div>
   <div class="nc-hero-content">
    <div class="nc-eyebrow"><span class="nc-eyebrow-line"></span> PREFERENCES / NOTIFICATIONS</div>
    <h3>让每一条重要消息，都恰好被听见。</h3>
    <p>管理聊天提醒、桌面通知、声音与专注模式。所有权限及连接状态来自真实运行环境。</p>
    <div class="nc-hero-tags">
     <span class="nc-pill"><ShieldCheck :size="13"/> 本机优先</span>
     <span class="nc-pill"><Sparkles :size="13"/> 五主题视觉</span>
     <span class="nc-pill"><LockKeyhole :size="13"/> 不影响自动托管</span>
    </div>
   </div>
  </div>
  <section class="nc-section" aria-label="通知发送渠道">
   <header class="nc-heading"><div><div class="nc-index">01 / CHANNELS</div><h4>通知方式</h4><p>网页版与 Windows 原生提醒相互独立。</p></div><span class="nc-quiet">实时权限状态</span></header>
   <div class="nc-methods">
    <section class="nc-method nc-browser" data-test="notify-browser-method">
     <div class="nc-method-head">
      <span class="nc-icon"><Monitor :size="21" :stroke-width="1.8"/></span>
      <span class="nc-status" :class="browserGranted?'nc-ready':'nc-wait'" data-test="settings-notification-permission">{{browserLabel}}</span>
     </div>
     <strong>浏览器通知</strong>
     <p>{{permissionHint}}</p>
     <div class="nc-method-actions">
      <button type="button" class="nc-action-primary" data-test="settings-request-notifications"
       :disabled="permission!=='default'" @click="emit('request-permission')">
       {{permission==='default'?'授权浏览器通知':permission==='granted'?'已获浏览器权限':permission==='denied'?'浏览器已阻止':'当前不可申请'}}
       <ArrowUpRight :size="13"/>
      </button>
      <button type="button" class="nc-action-ghost" data-test="notify-test-browser"
       :disabled="!browserGranted||testPending" @click="testNativeBrowser"><Play :size="14"/> 测试</button>
     </div>
    </section>
    <section class="nc-method" data-test="notify-windows-method">
     <div class="nc-method-head"><span class="nc-icon nc-blue"><Bell :size="21" :stroke-width="1.8"/></span><span class="nc-status nc-wait">待实机核验</span></div>
     <strong>Windows 桌面通知</strong>
     <p>继续使用言策现有的 Tauri 原生 Toast 与 WebSocket／REST。当前网页不能代表 Windows 安装版的实际通知状态。</p>
     <div class="nc-method-actions"><span class="nc-readonly"><ShieldCheck :size="14"/> 使用原生 W05 通知链路</span></div>
    </section>
   </div>
   <p v-if="lastTest" class="nc-feedback" role="status" data-test="notify-browser-test-status">{{lastTest}}</p>
  </section>
  <div class="nc-two">
   <section class="nc-group" aria-label="消息提醒偏好">
    <div class="nc-group-title"><div class="nc-group-icon"><MessageSquare :size="19"/></div>
     <div><h4>消息提醒</h4><p>按消息类型决定重要程度</p></div><span class="nc-offline">待接入</span>
    </div>
    <div class="nc-setting nc-placeholder"><div class="nc-setting-icon"><BellRing :size="16"/></div><div><strong>新消息提醒</strong><p>全部消息 / 重要消息 / 静音</p></div><span class="nc-setting-state">待接入</span></div>
    <div class="nc-setting nc-placeholder"><div class="nc-setting-icon"><UserRoundCheck :size="16"/></div><div><strong>联系人单独提醒</strong><p>按真实授权联系人设置例外</p></div><span class="nc-setting-state">待接入</span></div>
    <div class="nc-setting nc-placeholder"><div class="nc-setting-icon"><ShieldCheck :size="16"/></div><div><strong>通知预览与隐私</strong><p>头像、姓名、摘要及锁屏隐藏</p></div><span class="nc-setting-state">待接入</span></div>
    <div class="nc-group-note"><LockKeyhole :size="13"/> 此处不创建新的消息订阅器，等待原消息通知设置接口。</div>
   </section>
   <section class="nc-group" aria-label="声音与提示音">
    <div class="nc-group-title"><div class="nc-group-icon"><Volume2 :size="19"/></div>
     <div><h4>声音与节奏</h4><p>清晰短促，避免重复打扰</p></div><span class="nc-offline">待实机</span>
    </div>
    <div class="nc-sound">
     <div class="nc-sound-wave" aria-hidden="true"><i v-for="i in 19" :key="i" :style="{height:(8+(i*11%24))+'px'}"></i></div>
     <div class="nc-sound-info"><strong>原生双音提示</strong><small>保留原 W05 声音方案</small></div>
     <span class="nc-sound-mark"><VolumeX :size="16"/></span>
    </div>
    <div class="nc-volume"><div class="nc-volume-top"><span>提示音音量</span><span>等待 W05 实际读回</span></div>
     <input type="range" min="0" max="100" value="60" disabled aria-label="提示音音量：原生设置暂未连接" data-test="notify-volume-native-unavailable"/>
    </div>
    <div class="nc-setting nc-placeholder"><div class="nc-setting-icon"><Activity :size="16"/></div><div><strong>重复消息去重</strong><p>按实际消息 MID、账号和事件检查</p></div><span class="nc-setting-state">待接入</span></div>
    <div class="nc-group-note"><LockKeyhole :size="13"/> 不使用 WebAudio 另造一套声音；试听需原原生接口。</div>
   </section>
  </div>
  <div class="nc-two">
   <section class="nc-group nc-focus" aria-label="专注与勿扰">
    <div class="nc-group-title"><div class="nc-group-icon"><Moon :size="19"/></div><div><h4>专注与免打扰</h4><p>只静音提醒，不暂停 AI 托管</p></div><span class="nc-offline">待接入</span></div>
    <div class="nc-setting"><div class="nc-setting-icon"><Clock3 :size="17"/></div><div><strong>勿扰时间</strong><p>定时静音 · 单独保留紧急事件</p></div><span class="nc-setting-state">待接入</span></div>
    <div class="nc-focus-notice"><ShieldCheck :size="16"/> 人工接管联系人 A，不会中断托管中的 B、C；免打扰也不会停止已有托管任务。</div>
   </section>
   <section class="nc-group nc-agno" aria-label="智能体运行提醒">
    <div class="nc-group-title"><div class="nc-group-icon"><Sparkles :size="19"/></div><div><h4>闺蜜大脑事件</h4><p>复用 Agno 原生 Run 事件与 Hook</p></div><span class="nc-offline">待订阅</span></div>
    <div class="nc-events"><span><CheckCircle2 :size="14"/> 任务完成</span><span><AlertCircle :size="14"/> 需要接管</span><span><Activity :size="14"/> 运行失败</span></div>
    <div class="nc-group-note"><Radio :size="13"/> Agno 有事件钩子，但此页面尚无已核实的通知订阅，绝不模拟推送成功。</div>
   </section>
  </div>
  <section class="nc-footer">
   <div class="nc-footer-icon"><Settings2 :size="19"/></div>
   <div><strong>通知诊断</strong><p>浏览器权限：{{browserLabel}} · Windows 原生：待验证 · Agno 事件订阅：待接入</p></div>
   <span class="nc-footer-label">真实状态</span>
  </section>
 </article>
</template>

<style scoped>
.nc-center{display:grid;gap:23px;min-width:0;align-content:start;padding:0 0 12px;color:var(--ink);--nc-accent:var(--accent);--nc-glow:rgba(var(--accent-rgb),.19)}
.nc-hero{position:relative;min-height:181px;display:flex;align-items:center;overflow:hidden;padding:24px 25px;border:1px solid rgba(var(--accent-rgb),.34);border-radius:19px;background:radial-gradient(ellipse at 91% 17%,rgba(var(--accent-rgb),.24),transparent 57%),linear-gradient(112deg,rgba(var(--accent-rgb),.12),rgba(var(--wow-three,100,100,250),.07) 65%),var(--surface-soft);box-shadow:0 14px 43px rgba(0,0,0,.10),inset 0 1px rgba(255,255,255,.09)}
.nc-hero:after{content:'';position:absolute;width:540px;height:190px;right:-190px;bottom:-160px;background:radial-gradient(ellipse,rgba(var(--accent-rgb),.32),transparent 70%);filter:blur(28px);pointer-events:none}
.nc-hero-content{position:relative;z-index:1;max-width:640px}
.nc-eyebrow{display:flex;align-items:center;gap:9px;letter-spacing:.14em;font-size:10px;font-weight:750;color:var(--accent)}
.nc-eyebrow-line{width:20px;height:2px;border-radius:2px;background:var(--accent)}
.nc-hero h3{font-size:clamp(20px,2vw,25px);line-height:1.36;letter-spacing:-.045em;font-weight:800;margin:12px 0 9px}
.nc-hero p{max-width:515px;color:var(--muted);font-size:12px;line-height:1.75;margin:0}
.nc-hero-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:16px}
.nc-pill{display:inline-flex;gap:5px;align-items:center;border:1px solid rgba(var(--accent-rgb),.23);border-radius:99px;padding:6px 9px;background:rgba(var(--accent-rgb),.07);font-size:10px;white-space:nowrap}
.nc-hero-art{position:absolute;right:75px;top:39px;width:115px;height:115px;display:grid;place-items:center;opacity:.87}
.nc-halo{display:grid;place-items:center;width:73px;height:73px;border-radius:24px;background:linear-gradient(140deg,rgba(var(--accent-rgb),.37),rgba(var(--accent-rgb),.08));color:var(--accent);border:1px solid rgba(var(--accent-rgb),.55);box-shadow:0 0 38px rgba(var(--accent-rgb),.32),inset 0 1px rgba(255,255,255,.16);transform:rotate(-9deg)}
.nc-orbit{position:absolute;width:135px;height:135px;border-radius:50%;border:1px solid rgba(var(--accent-rgb),.15);transform:rotate(-25deg) scaleX(1.3);pointer-events:none}
.nc-section{display:grid;gap:13px}
.nc-heading{display:flex;justify-content:space-between;align-items:end;gap:12px}
.nc-index{font-weight:700;color:var(--accent);letter-spacing:.11em;font-size:9px;margin-bottom:5px}
.nc-heading h4,.nc-group-title h4{margin:0;font-size:16px;letter-spacing:-.03em}
.nc-heading p,.nc-group-title p{font-size:11px;color:var(--muted);line-height:1.55;margin:5px 0 0}
.nc-quiet{font-size:10px;color:var(--muted);white-space:nowrap}
.nc-methods,.nc-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
.nc-method,.nc-group{min-width:0;display:grid;align-content:start;gap:13px;border:1px solid var(--border);border-radius:16px;padding:17px 18px;background:linear-gradient(140deg,rgba(var(--accent-rgb),.06),transparent 49%),var(--surface-soft);box-shadow:0 8px 28px rgba(0,0,0,.05),inset 0 1px rgba(255,255,255,.035)}
.nc-method{min-height:188px}
.nc-browser{border-color:rgba(var(--accent-rgb),.4)}
.nc-method-head{display:flex;justify-content:space-between;align-items:flex-start;gap:9px}
.nc-icon,.nc-group-icon,.nc-footer-icon{display:grid;place-items:center;flex:0 0 auto;background:rgba(var(--accent-rgb),.14);border:1px solid rgba(var(--accent-rgb),.24);border-radius:13px;width:42px;height:42px;color:var(--accent)}
.nc-blue{color:#72c8ff;background:rgba(91,172,237,.12);border-color:rgba(91,172,237,.25)}
.nc-status,.nc-offline{font-size:10px;white-space:nowrap;padding:5px 8px;border:1px solid var(--border);border-radius:999px;color:var(--muted)}
.nc-ready{color:var(--accent);border-color:rgba(var(--accent-rgb),.4);background:rgba(var(--accent-rgb),.1)}
.nc-wait{color:var(--muted)}
.nc-method>strong{font-size:15px;letter-spacing:-.02em}
.nc-method>p{color:var(--muted);font-size:11px;line-height:1.75;margin:-7px 0 0;min-height:39px}
.nc-method-actions{display:flex;align-items:center;gap:8px;margin-top:auto;flex-wrap:wrap}
.nc-action-primary,.nc-action-ghost{display:flex;align-items:center;justify-content:center;gap:7px;min-height:33px;border-radius:9px;padding:8px 12px;font:inherit;font-size:11px;cursor:pointer}
.nc-action-primary{background:var(--accent)!important;color:var(--bg)!important;border:1px solid var(--accent)!important;font-weight:700}
.nc-action-ghost{background:var(--surface)!important;color:var(--ink)!important;border:1px solid var(--border)!important}
.nc-action-primary:disabled,.nc-action-ghost:disabled{opacity:.5!important;cursor:not-allowed}
.nc-readonly{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:10px;padding:7px 0}
.nc-feedback{font-size:11px;color:var(--accent);padding:12px;border:1px solid rgba(var(--accent-rgb),.22);background:rgba(var(--accent-rgb),.07);border-radius:10px}
.nc-group{gap:0;padding:17px}
.nc-group-title{display:flex;align-items:center;gap:11px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.nc-group-title h4{font-size:14px}
.nc-group-title p{font-size:10px}
.nc-group-icon{width:37px;height:37px;border-radius:11px}
.nc-group-title>div:nth-child(2){flex:1;min-width:0}
.nc-offline{padding:4px 7px}
.nc-setting{display:flex;align-items:center;gap:12px;min-width:0;padding:13px 2px;border-bottom:1px solid var(--border)}
.nc-setting>div:nth-child(2){flex:1;min-width:0}
.nc-setting-icon{display:grid;place-items:center;width:30px;height:30px;flex:0 0 30px;border-radius:9px;background:rgba(var(--accent-rgb),.07);color:var(--muted)}
.nc-setting strong{font-size:11px;display:block;font-weight:700}
.nc-setting p{font-size:10px;line-height:1.5;margin:5px 0 0;color:var(--muted)}
.nc-setting-state{font-size:9px;white-space:nowrap;color:var(--muted)}
.nc-group-note{font-size:10px;color:var(--muted);line-height:1.7;display:flex;align-items:flex-start;gap:6px;padding-top:14px}
.nc-group-note svg{flex:0 0 auto;margin-top:2px}
.nc-sound{display:flex;align-items:center;gap:12px;border:1px solid rgba(var(--accent-rgb),.15);border-radius:11px;padding:11px;margin-top:14px;background:linear-gradient(95deg,rgba(var(--accent-rgb),.08),transparent)}
.nc-sound-wave{display:flex;align-items:center;justify-content:center;gap:3px;width:99px;min-width:99px;height:44px;border-radius:9px;background:rgba(var(--accent-rgb),.09)}
.nc-sound-wave i{width:3px;border-radius:4px;background:var(--accent);opacity:.68}
.nc-sound-info{display:grid;gap:5px;flex:1}.nc-sound-info strong{font-size:11px}.nc-sound-info small{color:var(--muted);font-size:10px}
.nc-sound-mark{color:var(--muted)}
.nc-volume{display:grid;gap:9px;padding:16px 2px 12px}
.nc-volume-top{display:flex;justify-content:space-between;gap:8px;font-size:11px}
.nc-volume-top span:nth-child(2){font-size:9px;color:var(--muted)}
.nc-volume input{width:100%;accent-color:var(--accent);opacity:.45;cursor:not-allowed}
.nc-focus,.nc-agno{min-height:184px}
.nc-focus-notice{display:flex;align-items:flex-start;gap:8px;color:var(--muted);font-size:10px;line-height:1.7;padding:13px;background:rgba(var(--accent-rgb),.055);border-radius:11px;margin-top:12px}
.nc-focus-notice svg{color:var(--accent);flex:0 0 auto}
.nc-events{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}
.nc-events span{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font-size:10px;background:var(--surface);color:var(--muted)}
.nc-footer{display:flex;align-items:center;gap:11px;flex-wrap:wrap;border:1px solid var(--border);border-radius:13px;padding:15px 17px;background:var(--surface-soft)}
.nc-footer-icon{width:36px;height:36px}
.nc-footer>div:nth-child(2){display:grid;gap:5px;flex:1;min-width:0}.nc-footer strong{font-size:12px}
.nc-footer p{color:var(--muted);font-size:10px;line-height:1.6;margin:0}.nc-footer-label{font-size:10px;color:var(--accent)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:1080px){.nc-hero-art{right:24px;opacity:.5}.nc-hero-content{max-width:540px}}
@media(max-width:850px){.nc-methods,.nc-two{grid-template-columns:1fr}.nc-hero{min-height:160px}.nc-hero-art{right:20px;top:35px;transform:scale(.77);opacity:.38}}
@media(max-width:450px){.nc-hero{padding:20px 16px}.nc-method,.nc-group{padding:14px}.nc-hero-art{right:-30px;opacity:.24}.nc-hero h3{font-size:19px}.nc-heading{align-items:start}.nc-quiet{display:none}.nc-method-actions{gap:6px}.nc-action-primary{padding:7px 9px}}
@media(prefers-reduced-motion:reduce){.nc-center *, .nc-center :before,.nc-center :after{animation:none!important;transition:none!important}}
</style>
