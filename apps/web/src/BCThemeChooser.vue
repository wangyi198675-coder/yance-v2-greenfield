<script setup>
import {computed} from 'vue';
const props=defineProps({
 theme:{type:String,default:'Obsidian Lime'},
 appearance:{type:String,default:'dark'}
});
const emit=defineEmits(['cycle-theme','toggle-appearance']);
const palettes=Object.freeze([
 {name:'Obsidian Lime',zh:'黑曜青柠',accent:'#caff63',bg:'#0c1112',surface:'#182127',ink:'#edf5ef',lightBg:'#f7f9fa',lightSurface:'#eef2f4',lightInk:'#1c2b31'},
 {name:'Cosmic Sunset',zh:'星河落日',accent:'#ffa071',bg:'#150d23',surface:'#2a1d36',ink:'#fff0eb',lightBg:'#fdf8fc',lightSurface:'#f4e9f4',lightInk:'#3e283d'},
 {name:'Ocean Electric',zh:'电光海洋',accent:'#62d8f2',bg:'#09141f',surface:'#183246',ink:'#eaf8ff',lightBg:'#f5fbfe',lightSurface:'#e3f4fb',lightInk:'#15344b'},
 {name:'Amber Ember',zh:'琥珀暖焰',accent:'#ffc065',bg:'#1b1310',surface:'#35261d',ink:'#fff1e0',lightBg:'#fffaf5',lightSurface:'#faf0e2',lightInk:'#462f20'},
 {name:'Opal Prism',zh:'欧泊棱镜',accent:'#ceb9ff',bg:'#111427',surface:'#2b2a45',ink:'#f6f1ff',lightBg:'#fcfaff',lightSurface:'#f0ebfa',lightInk:'#312844'}
]);
const current=computed(()=>palettes.find(p=>p.name===props.theme)||palettes[0]);
function themeStyle(item){
 return {
  '--preview-bg':props.appearance==='light'?item.lightBg:item.bg,
  '--preview-surface':props.appearance==='light'?item.lightSurface:item.surface,
  '--preview-ink':props.appearance==='light'?item.lightInk:item.ink,
  '--preview-accent':item.accent
 };
}
function chooseTheme(name){
 const at=palettes.findIndex(p=>p.name===props.theme),next=palettes.findIndex(p=>p.name===name);
 if(at<0||next<0||at===next)return;
 // The existing App root exposes only a cycle action. Calling it synchronously
 // the needed number of times preserves its single authoritative reactive theme.
 const steps=(next-at+palettes.length)%palettes.length;
 for(let i=0;i<steps;i++)emit('cycle-theme');
}
function chooseMode(mode){
 if((mode==='dark'||mode==='light')&&mode!==props.appearance)emit('toggle-appearance');
}
</script>

<template>
 <article class="theme-page" data-test="settings-panel-theme" aria-label="外观与主题">
  <section class="theme-hero">
   <div class="hero-top">
    <div>
     <span class="overline">PERSONALIZE YOUR SPACE</span>
     <h3>让言策，符合你的风格</h3>
     <p>选择喜欢的颜色和明暗外观，当前页面立即预览。</p>
    </div>
    <span class="live-tag">● 即时生效</span>
   </div>
   <div class="current">
    <span class="current-swatch" :style="{background:current.accent}" aria-hidden="true"></span>
    <div><small>当前使用</small>
     <strong data-test="settings-current-theme">{{theme}}</strong>
     <span>{{current.zh}} · <span data-test="settings-current-mode">{{appearance==='dark'?'深色':'浅色'}}</span></span>
    </div>
    <span class="applied">已应用</span>
   </div>
  </section>
  <section class="theme-section">
   <div class="section-heading"><div><h4>外观模式</h4><p>根据使用环境选择舒适的明暗对比。</p></div></div>
   <div class="mode-grid" role="group" aria-label="外观模式选择">
    <button type="button" data-test="settings-appearance-dark" :class="{selected:appearance==='dark'}"
     :aria-pressed="appearance==='dark'" @click="chooseMode('dark')">
     <span class="mode-icon">☾</span><span class="mode-copy"><strong>深色模式</strong><small>柔和暗色，适合夜间</small></span>
     <span v-if="appearance==='dark'" class="chosen-mark">✓</span>
    </button>
    <button type="button" data-test="settings-appearance-light" :class="{selected:appearance==='light'}"
     :aria-pressed="appearance==='light'" @click="chooseMode('light')">
     <span class="mode-icon">☼</span><span class="mode-copy"><strong>浅色模式</strong><small>清爽明亮，适合日间</small></span>
     <span v-if="appearance==='light'" class="chosen-mark">✓</span>
    </button>
   </div>
  </section>
  <section class="theme-section">
   <div class="section-heading">
    <div><h4>主题配色</h4><p>五款现有主题，点击即可切换。</p></div>
    <span class="theme-count">5 款主题</span>
   </div>
   <div class="theme-gallery" data-test="settings-theme-gallery">
    <button v-for="item in palettes" :key="item.name" type="button"
     class="theme-card" :class="{selected:theme===item.name}" :aria-pressed="theme===item.name"
     :data-theme-name="item.name" :data-test="'settings-theme-'+item.name.replaceAll(' ','-').toLowerCase()"
     @click="chooseTheme(item.name)">
     <span class="preview" :style="themeStyle(item)" aria-hidden="true">
      <span class="preview-top"><span class="preview-logo"></span><span class="preview-title"></span><span class="preview-action"></span></span>
      <span class="preview-body">
       <span class="preview-side"><i></i><i></i><i></i></span>
       <span class="preview-chat"><i></i><i></i><i></i><i></i></span>
      </span>
     </span>
     <span class="card-footer">
      <span class="swatch" :style="{background:item.accent}" aria-hidden="true"></span>
      <span class="card-name"><strong>{{item.zh}}</strong><small>{{item.name}}</small></span>
      <span class="selected-label" :class="{active:theme===item.name}">{{theme===item.name?'✓ 已选':'选择'}}</span>
     </span>
    </button>
   </div>
  </section>
  <footer class="theme-foot">
   <p>使用言策原有主题配色，不改变聊天记录、联系人授权或 AI 模型。</p>
   <div class="compat-actions">
    <button type="button" data-test="settings-cycle-theme" @click="emit('cycle-theme')">下一个主题</button>
    <button type="button" data-test="settings-toggle-appearance" @click="emit('toggle-appearance')">切换深浅模式</button>
   </div>
  </footer>
 </article>
</template>

<style scoped>
.theme-page{display:grid;gap:25px;min-width:0;width:100%;max-width:1120px;padding-bottom:12px;color:var(--ink)}
.theme-hero{display:grid;gap:19px;border:1px solid var(--border);border-radius:16px;padding:24px 25px;background:linear-gradient(120deg,rgba(var(--accent-rgb),.09),transparent 65%),var(--surface-soft)}
.hero-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
.overline{display:block;font-size:10px;letter-spacing:.10em;color:var(--accent);margin-bottom:8px}
.hero-top h3{font-size:22px;line-height:1.2;margin:0 0 8px;font-weight:700}
.hero-top p{font-size:13px;color:var(--muted);line-height:1.5;margin:0}
.live-tag{white-space:nowrap;font-size:11px;color:var(--accent);border:1px solid rgba(var(--accent-rgb),.28);background:rgba(var(--accent-rgb),.08);border-radius:99px;padding:6px 10px}
.current{display:flex;align-items:center;gap:13px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--bg2)}
.current-swatch{flex:0 0 39px;width:39px;height:39px;border-radius:13px;box-shadow:0 0 0 5px rgba(var(--accent-rgb),.08)}
.current>div{display:grid;gap:4px;flex:1;min-width:0}
.current small{font-size:10px;color:var(--muted)}.current strong{font-size:15px}
.current div>span{font-size:11px;color:var(--muted)}.applied{font-size:10px;color:var(--accent);white-space:nowrap}
.theme-section{display:grid;gap:13px}
.section-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}
.section-heading h4{font-size:16px;font-weight:700;margin:0 0 5px}
.section-heading p{font-size:12px;color:var(--muted);line-height:1.5;margin:0}
.theme-count{font-size:11px;color:var(--muted);white-space:nowrap}
.mode-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mode-grid button{min-width:0;display:flex;align-items:center;text-align:left;gap:13px;padding:15px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);color:var(--ink);cursor:pointer}
.mode-grid button.selected{border-color:var(--accent);background:rgba(var(--accent-rgb),.085)}
.mode-icon{display:grid;place-items:center;flex:0 0 45px;width:45px;height:45px;border:1px solid var(--border);border-radius:12px;font-size:27px;background:var(--bg2);color:var(--accent)}
.mode-copy{display:grid;gap:6px;flex:1;min-width:0}.mode-copy strong{font-size:13px}
.mode-copy small{font-size:11px;color:var(--muted)}.chosen-mark{color:var(--accent);font-size:17px}
.theme-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.theme-card{display:grid;gap:0;overflow:hidden;text-align:left;min-width:0;padding:0;border:1px solid var(--border);border-radius:13px;background:var(--surface-soft);color:var(--ink);cursor:pointer;transition:transform .12s,border-color .12s}
.theme-card:hover{transform:translateY(-2px);border-color:var(--accent)}
.theme-card.selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),0 3px 18px rgba(var(--accent-rgb),.08)}
.preview{display:grid;height:128px;overflow:hidden;background:var(--preview-bg);color:var(--preview-ink);padding:11px}
.preview-top{display:flex;align-items:center;gap:6px;height:21px;padding-bottom:7px;border-bottom:1px solid var(--preview-surface)}
.preview-logo{height:13px;width:13px;background:var(--preview-accent);border-radius:4px}
.preview-title{height:4px;width:45px;border-radius:20px;background:var(--preview-ink);opacity:.42}
.preview-action{margin-left:auto;width:7px;height:7px;border:1px solid var(--preview-accent);border-radius:50%}
.preview-body{display:flex;gap:10px;padding-top:9px;min-height:0}
.preview-side{display:flex;flex-direction:column;gap:7px;flex:0 0 25%;border-radius:5px;background:var(--preview-surface);padding:8px 5px}
.preview-side i{height:6px;border-radius:4px;background:var(--preview-ink);opacity:.25}
.preview-side i:nth-child(2){background:var(--preview-accent);opacity:1}
.preview-chat{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:1;padding:9px 5px;background:var(--preview-surface);border-radius:6px}
.preview-chat i{height:9px;width:64%;border-radius:5px;background:var(--preview-ink);opacity:.17}
.preview-chat i:nth-child(2){width:83%;align-self:flex-start}
.preview-chat i:nth-child(3){width:50%;background:var(--preview-accent);opacity:.88}
.preview-chat i:nth-child(4){width:73%;align-self:flex-start}
.card-footer{display:flex;align-items:center;gap:10px;min-width:0;padding:12px 11px}
.swatch{flex:0 0 23px;width:23px;height:23px;border:3px solid rgba(120,120,120,.15);border-radius:50%}
.card-name{display:grid;gap:4px;min-width:0;flex:1}.card-name strong{font-size:12px}
.card-name small{font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.selected-label{white-space:nowrap;font-size:10px;color:var(--muted)}.selected-label.active{color:var(--accent);font-weight:700}
.theme-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--border);padding-top:13px}
.theme-foot p{color:var(--muted);font-size:11px;line-height:1.5;margin:0;max-width:510px}
.compat-actions{display:flex;gap:7px}
.compat-actions button{border:1px solid var(--border);border-radius:8px;padding:7px 9px;background:var(--surface-soft);color:var(--muted);cursor:pointer;font-size:10px}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:1200px){.theme-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:850px){.mode-grid{grid-template-columns:1fr}.theme-gallery{grid-template-columns:1fr}.preview{height:135px}}
@media(max-width:720px){.theme-hero{padding:17px 15px}.hero-top{display:grid;gap:8px}.theme-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:450px){.theme-gallery{grid-template-columns:1fr}.hero-top h3{font-size:19px}.live-tag{justify-self:start}}
@media(prefers-reduced-motion:reduce){.theme-card{transition:none}}
</style>
