<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import { ArrowLeft, ArrowRight, Bot, ChevronDown, ChevronRight, CircleAlert, ClipboardCopy, FilePlus2, Filter, GitBranch, Globe2, LayoutGrid, LockKeyhole, MessageCircle, MoreHorizontal, PanelRight, RefreshCcw, Search, Send, ShieldAlert, ShieldCheck, Sparkles, Sun, Moon, X, Zap } from '@lucide/vue'
import { Button } from './components/oss/button'
import { Bubble, BubbleContent } from './components/oss/bubble'
import { Message, MessageContent } from './components/oss/message'
import { InputGroup, InputGroupInput, InputGroupTextarea } from './components/oss/input-group'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from './components/oss/context-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/oss/dialog'
import { ScrollArea } from './components/oss/scroll-area'
import { Popover, PopoverTrigger, PopoverContent } from './components/oss/popover'
import { allContacts, active, activeKey, ARMS, THEMES, state, key, displayName, currentMode, getDraft, currentDraft, candidates, filtered, paged, select, applyScope, resolveIdentity, setArm, reset, editPublic, adoptCandidate, quote, attach, clearQuote, clearFile, simulateSend, handleScenario, askPrivate, note, MOCK_EVENTS, byPeer, snapshot, HASHES } from './store'

const filePicker=ref<HTMLInputElement|null>(null)
const autopilotClose=ref<HTMLElement|null>(null)
const autopilotTrigger=ref<HTMLElement|null>(null)
const isPulse=computed(()=>state.arm==='CHAT-C-PULSE_MAIN'&&state.pulseOpen)
const isBC=computed(()=>state.arm==='CHAT-BC-FUSION')
const isA=computed(()=>state.arm==='CHAT-A-V25_VISUAL_NORMALIZED')
const isAdaptive=computed(()=>state.arm==='CHAT-B-ADAPTIVE_INBOX'||state.arm==='CHAT-BC-FUSION')
const visibleUnread=computed(()=>allContacts.filter(c=>(state.account==='ALL'||c.account===state.account)&&(state.channel==='ALL'||c.channel===state.channel)&&c.unread>0).length)
const candidateList=computed(()=>active.value?candidates(active.value):[])
const shownCandidates=computed(()=>!isA.value&&!state.suggestExpanded&&candidateList.value.length>1?candidateList.value.slice(0,1):candidateList.value)
const channelLabels:Record<string,string>={ALL:'全部渠道',FB_PERSONAL:'FB个人',FB_PAGE:'FB主页',WHATSAPP_PERSONAL:'WhatsApp',TELEGRAM_PERSONAL:'Telegram'}
const channelOrder=['ALL','FB_PERSONAL','FB_PAGE','WHATSAPP_PERSONAL','TELEGRAM_PERSONAL']
const accounts=['ALL','fixture-account-1','fixture-account-2']
const queue=[
 {title:'撤销授权',code:'GRANT_REVOKED',peer:'fake-peer-003',body:'账号资格模拟不可用，禁止发送',level:'P0'},
 {title:'Provider UNKNOWN',code:'UNKNOWN',peer:'fake-peer-117',body:'晚到ACK不可解释成已送达，禁止跨渠道重试',level:'P0'},
 {title:'授权过期',code:'GRANT_EXPIRED',peer:'fake-peer-004',body:'过期授权快照不得复用',level:'P0'},
 {title:'预算耗尽',code:'BUDGET_EXHAUSTED',peer:'fake-peer-007',body:'模拟预算为零，无实际模型费用',level:'P1'},
 {title:'WebSocket 离线',code:'WS_DISCONNECTED',peer:'fake-peer-001',body:'显示离线，不伪造Presence',level:'P1'},
 {title:'翻译失败',code:'TRANSLATION_FAILED',peer:'fake-peer-025',body:'原文保留，译文失败待离线重试',level:'P1'},
 {title:'绑定修订不符',code:'REBIND_STALE',peer:'fake-peer-001',body:'旧revision停止继续资格判断',level:'P0'},
 {title:'提示注入',code:'PROMPT_INJECTION',peer:'fake-peer-030',body:'仅文本显示，不提升为系统指令',level:'P0'}
]
const currentException=computed(()=>state.exceptions[activeKey.value]||'无异常')
const publicLocalRecords=computed(()=>state.localTimeline[activeKey.value]||[])
const currentArm=computed(()=>ARMS.find(a=>a.id===state.arm)!)
const selectFirst=()=>{if(filtered.value.length)select(filtered.value[0])}
function changeChannel(ch:string){applyScope(state.account,ch)}
function changeAccount(acc:string){applyScope(acc,state.channel)}
function toggleAutopilot(){state.pulseOpen=!state.pulseOpen}
function onAutopilotEscape(e:KeyboardEvent){if(e.key==='Escape'&&isBC.value&&state.pulseOpen){state.pulseOpen=false;e.preventDefault()}}
watch(()=>state.pulseOpen,async(open,wasOpen)=>{if(!isBC.value)return;await nextTick();if(open)(document.querySelector('.autopilot-pane button[aria-label="关闭托管中心"]') as HTMLButtonElement|null)?.focus();else if(wasOpen)(document.querySelector('.chat-actions button[aria-label="打开独立托管中心"]') as HTMLButtonElement|null)?.focus()})
function onPublicUpdate(v:string|number){if(!state.composerComposing)editPublic(String(v),'COMPOSER_INPUT')}
function onCompositionEnd(e:CompositionEvent){state.composerComposing=false;editPublic((e.target as HTMLTextAreaElement).value,'IME_COMMIT')}
function addAttachments(e:Event){attach((e.target as HTMLInputElement).files);(e.target as HTMLInputElement).value=''}
function onFileDrop(e:DragEvent){e.preventDefault();attach(e.dataTransfer?.files||null)}
function onPaste(e:ClipboardEvent){const names=Array.from(e.clipboardData?.files||[]);if(names.length)attach(e.clipboardData?.files||null);else note('PASTE into current CONTACT composer');}
function seekPeer(peer:string){const c=resolveIdentity(peer);if(c)select(c)}
function triggerQuote(){if(active.value)quote(active.value)}
function captureQuoteHotkey(e:KeyboardEvent){if(e.key==='F10'&&e.shiftKey&&(e.target as HTMLElement)?.closest?.('.message-context')){e.preventDefault();triggerQuote()}}
function toggleTheme(){state.appearance=state.appearance==='dark'?'light':'dark'}
function backToContacts(){state.mobileView='contacts';state.privateOpen=false}
function openPrivateWorkspace(){state.privateOpen=true;state.variantMenuOpen=false}
function chooseScenario(e:{code:string;peer:string}){handleScenario(e.code,e.peer); if(state.arm==='CHAT-C-PULSE_MAIN')state.pulseOpen=false}
function selectTaskContact(n:number){seekPeer('fake-peer-'+String(n).padStart(3,'0'))}
function onPrivateInput(v:string|number){state.privateDraft=String(v)}
function keyDownPublic(e:KeyboardEvent){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();simulateSend()}}
function keyDownPrivate(e:KeyboardEvent){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();askPrivate()}}
onMounted(async()=>{document.addEventListener('keydown',captureQuoteHotkey,true);document.addEventListener('keydown',onAutopilotEscape,true);note('REAL CLICKABLE OFFLINE HARNESS / W37 SYNTHETIC DATA LOADED');const q=new URLSearchParams(window.location.search);const arm=ARMS.find(a=>a.id===q.get('arm'));if(arm)setArm(arm.id);const peer=q.get('peer');if(peer&&resolveIdentity(peer))seekPeer(peer);const theme=THEMES.find(t=>t===q.get('theme'));if(theme)state.theme=theme;if(q.get('mode')==='light'||q.get('mode')==='dark')state.appearance=q.get('mode')!;if(q.get('private')==='1')state.privateOpen=true;if(q.get('pulse')==='1')state.pulseOpen=true;if(q.get('uat')==='1'){const u=await import('./browser-tests');await u.runBrowserUAT()}})
onUnmounted(()=>{document.removeEventListener('keydown',captureQuoteHotkey,true);document.removeEventListener('keydown',onAutopilotEscape,true)})
</script>

<template>
<div id="yance-prototype" class="shell" :data-theme="THEMES.indexOf(state.theme as any)" :data-mode="state.appearance" :data-arm="state.arm">
  <header class="topbar">
    <div class="brand"><div class="brandmark">言</div><div><strong>言策 <small>V2 LAB</small></strong><span>四方案真实交互试验 · 本地离线</span></div></div>
    <nav class="arm-switch" aria-label="切换实验方案">
      <Button v-for="v in ARMS" :key="v.id" size="sm" :variant="state.arm===v.id?'default':'ghost'" :aria-pressed="state.arm===v.id" @click="setArm(v.id)">{{v.label}}</Button>
    </nav>
    <div class="top-actions">
      <Button variant="outline" size="sm" class="global-private-entry" aria-label="打开私人闺蜜大脑模拟主工作区" @click="openPrivateWorkspace"><Bot :size="15"/><span class="responsive-hide">闺蜜大脑</span></Button>
      <Popover :open="state.variantMenuOpen" @update:open="v=>state.variantMenuOpen=v"><PopoverTrigger as-child><Button class="arm-menu" variant="outline" size="sm" aria-label="选择界面实验方案"><LayoutGrid :size="15"/>方案</Button></PopoverTrigger><PopoverContent align="end"><p class="eyebrow">离线四方案 / 仅实验</p><Button v-for="v in ARMS" :key="v.id" variant="ghost" class="wide" size="sm" @click="setArm(v.id);state.variantMenuOpen=false">{{v.label}}</Button></PopoverContent></Popover>
      <Popover :open="state.themeMenuOpen" @update:open="v=>state.themeMenuOpen=v"><PopoverTrigger as-child><Button variant="outline" size="sm" aria-label="选择主题"><Sparkles :size="15"/><span class="responsive-hide">{{state.theme}}</span><ChevronDown :size="12"/></Button></PopoverTrigger>
        <PopoverContent class="theme-menu" align="end"><p class="eyebrow">五主题 / 非生产试验色板</p><div class="theme-opts"><Button v-for="t in THEMES" :key="t" variant="ghost" size="sm" @click="state.theme=t;state.themeMenuOpen=false">{{t}}{{state.theme===t?' · ✓':''}}</Button></div></PopoverContent>
      </Popover>
      <Button variant="outline" size="icon-sm" :aria-label="state.appearance==='dark'?'切换浅色':'切换深色'" @click="toggleTheme"><Sun v-if="state.appearance==='dark'" :size="16"/><Moon v-else :size="16"/></Button>
      <Button variant="ghost" size="icon-sm" aria-label="重置所有实验状态" title="重置W37公共数据" @click="reset()"><RefreshCcw :size="15"/></Button>
    </div>
  </header>
  <div class="lab-strip"><ShieldCheck :size="13"/> SIMULATED_TEST_ONLY · 120虚构联系人 · 四渠道 · 无社交连接 / 无真实发送 / 无模型费用 · W37 SHA {{HASHES.fixture.slice(0,10)}}…</div>

  <section v-if="isPulse" class="pulse-main" data-test="pulse-main">
    <div class="pulse-heading">
      <div><p class="eyebrow">EXCEPTION-FIRST WORKSPACE</p><h1>Pulse 全屏托管中心 <span class="title-highlight">/ C</span></h1><p class="dim">从高风险异常切入，联系人仍可进入独立会话，不触发人工接管。</p></div>
      <Button variant="outline" @click="state.pulseOpen=false"><MessageCircle :size="16"/> 进入普通联系人会话 <ArrowRight :size="15"/></Button>
    </div>
    <div class="pulse-kpis"><div class="stat"><span>联系人</span><strong>120</strong><small>4个平台 · 全部模拟</small></div><div class="stat"><span>托管模式</span><strong>40</strong><small>A编辑不影响其他人</small></div><div class="stat"><span>安全事件脚本</span><strong>08+03</strong><small>全离线、不得外发</small></div><div class="stat"><span>真实发送</span><strong>0</strong><small>本实验硬性禁用</small></div></div>
    <div class="pulse-grid"><div class="pulse-panel"><div class="section-head"><h2>待检查异常</h2><span class="counter">8 场景</span></div>
      <div class="exception-grid"><article class="exception" v-for="q in queue" :key="q.code"><div class="exception-top"><span class="danger-dot"/><b>{{q.title}}</b><span class="danger-label">{{q.level}}</span></div><p>{{q.body}}</p><small>{{q.peer}} · {{byPeer(q.peer)?.channel}}</small><Button variant="outline" size="sm" @click="chooseScenario(q)">查看离线场景 <ChevronRight :size="13"/></Button></article></div>
    </div><aside class="pulse-side"><p class="eyebrow">QUICK CONTACT ACCESS</p><h3>普通会话始终可达</h3><div class="mini-contacts"><Button v-for="n in [1,4,7,25,30,40,120]" :key="n" variant="ghost" @click="selectTaskContact(n)"><span class="tiny-avatar">{{String(n).padStart(2,'0')}}</span><span>模拟联系人 {{String(n).padStart(3,'0')}}</span><ChevronRight :size="14"/></Button></div><Button variant="secondary" @click="state.privateOpen=true;state.pulseOpen=false"><Bot :size="16"/> 打开私人Agno模拟工作区</Button><p class="small-print">所有按钮执行本地状态操作。不连接渠道、真实AgentOS或外部Provider。</p></aside></div>
  </section>

  <main v-else class="workspace" :class="{'workspace-a':isA,'workspace-bc':isBC,'workspace-c':state.arm==='CHAT-C-PULSE_MAIN','mobile-show-contacts':state.mobileView==='contacts','mobile-show-chat':state.mobileView==='chat'}">
    <aside class="contact-pane" data-test="contact-list">
      <div class="pane-head"><div><p class="eyebrow">{{isA?'CLASSIC CONTACTS':'SMART INBOX'}}</p><h2>联系人 <span class="counter">{{filtered.length}}</span></h2></div><Button variant="ghost" size="icon-sm" aria-label="查看四平台与虚构账号说明" title="四平台和虚构账号" @click="state.dialog='所有账号均为fixture-account-1/2；四个渠道均为模拟数据。'"><Filter :size="16"/></Button></div>
      <InputGroup class="search-box"><Search :size="17"/><InputGroupInput aria-label="搜索联系人姓名、ID、消息原文或译文" :model-value="state.search" placeholder="搜索联系人 / 消息 / 身份…" @update:model-value="v=>state.search=String(v)"/></InputGroup>
      <div class="account-pills"><Button v-for="a in accounts" :key="a" size="xs" :variant="state.account===a?'secondary':'ghost'" @click="changeAccount(a)">{{a==='ALL'?'所有账号':a.replace('fixture-','').replace('account-','账号')}}</Button></div>
      <div class="channel-pills" role="group" aria-label="联系人渠道筛选"><Button v-for="ch in channelOrder" :key="ch" size="xs" :variant="state.channel===ch?'secondary':'ghost'" @click="changeChannel(ch)">{{channelLabels[ch]}}</Button></div>
      <div v-if="isAdaptive" class="inbox-pills" role="group" aria-label="模拟智能收件箱分类">
        <Button v-for="f in [{id:'ALL',label:'全部会话'},{id:'UNREAD',label:'有未读 '+visibleUnread},{id:'AUTO',label:'已托管'}]" :key="f.id" size="sm" :variant="state.inboxView===f.id?'secondary':'ghost'" @click="state.inboxView=f.id as typeof state.inboxView;state.pageSize=30">{{f.label}}</Button>
        <span>按冻结数据未读排序 · 无AI推断</span>
      </div>
      <ScrollArea class="contacts-scroll">
        <div class="contact-row" v-for="c in paged" :key="key(c)">
          <Button variant="ghost" class="contact-action" :class="{selected:activeKey===key(c)}" @click="select(c)" :aria-label="'打开'+displayName(c)+','+c.account+','+c.channel+','+c.peer_id+',revision'+c.binding_revision">
            <span class="avatar">{{c.peer_id.slice(-2)}}</span>
            <span class="contact-meta"><span class="contact-first"><strong>{{displayName(c)}}</strong><small>{{c.channel.replace('_PERSONAL','')}}</small></span>
              <span class="preview">{{c.last_message.zh}}</span><span class="original-preview">{{c.last_message.original}} · {{c.last_message.provider_mid}}</span><span class="key-row">{{c.account}} · {{c.peer_id}} · r{{c.binding_revision}}</span>
            </span><span class="contact-state"><span v-if="c.unread" class="unread">{{c.unread}}</span><small :class="{auto:currentMode(c)==='AUTO'}">{{currentMode(c)}}</small></span>
          </Button>
        </div>
        <div v-if="!paged.length" class="empty-message">没有匹配的虚构联系人。可清除筛选。</div>
        <div class="page-bottom"><span>{{paged.length}} / {{filtered.length}}</span><Button size="sm" variant="outline" :disabled="paged.length===filtered.length" @click="state.pageSize=Math.min(120,state.pageSize+25)">加载更多（25）</Button><Button variant="ghost" size="sm" @click="state.pageSize=120">查看全部120</Button></div>
      </ScrollArea>
    </aside>

    <section v-if="active" class="chat-pane" data-test="chat">
      <div class="chat-header">
        <Button class="mobile-contact-back" size="sm" variant="ghost" aria-label="返回联系人列表" @click="backToContacts"><ArrowLeft :size="15"/>联系人</Button>
        <div class="header-avatar">{{active.peer_id.slice(-2)}}</div>
        <div class="chat-person"><h2>{{displayName(active)}} <span class="verified">SYNTHETIC</span></h2><p>{{active.account}} · {{active.channel}} · {{active.peer_id}} · rev{{active.binding_revision}}</p><small><span class="neutral-dot"/> 在线状态 UNKNOWN · 未读 {{active.unread}}（查看不清零）· {{currentMode(active)}}</small></div>
        <div class="chat-actions">
          <Button size="sm" variant="outline" aria-label="打开或关闭私人Agno模拟工作区" @click="state.privateOpen=!state.privateOpen"><Bot :size="16"/><span class="responsive-hide">私人Agno</span></Button>
          <Button ref="autopilotTrigger" size="icon-sm" variant="ghost" :aria-label="isBC?(state.pulseOpen?'关闭独立托管中心':'打开独立托管中心'):'查看模拟异常'" :aria-expanded="isBC?state.pulseOpen:undefined" :title="isBC?'切换独立托管中心':'查看模拟异常'" @click="isBC?toggleAutopilot():state.dialog='模拟授权资格：'+currentMode(active)+'；无真实账号授权'"><ShieldAlert :size="17"/></Button>
          <Button v-if="state.arm==='CHAT-C-PULSE_MAIN'" size="sm" variant="ghost" @click="state.pulseOpen=true"><ArrowLeft :size="14"/> Pulse</Button>
        </div>
      </div>
      <div class="timeline" data-test="timeline">
        <div class="timeline-date">冻结模拟场景 · 2026-10-24</div>
        <div class="encryption-banner"><LockKeyhole :size="13"/> 不是真实聊天记录。点击仅操作本地fixture，不会发消息或标已读。</div>
        <ContextMenu><ContextMenuTrigger as-child>
          <div class="message-context" tabindex="0" role="button" aria-label="点击引用消息；右键打开菜单；Shift加F10引用" @keydown.enter.prevent="triggerQuote" @keydown.space.prevent="triggerQuote" @keydown="e=>{if(e.shiftKey&&e.key==='F10'){e.preventDefault();triggerQuote()}}">
            <Message align="start"><Bubble variant="default" align="start" class="source-bubble" @click="triggerQuote"><BubbleContent>
                <p class="msg-original">{{active.last_message.original}}</p><p class="msg-zh">{{active.last_message.zh}}</p>
              </BubbleContent></Bubble></Message>
            <div class="source-meta">SOURCE · {{active.last_message.provider_mid}} · {{active.last_message.translation_state}} · 只读</div>
          </div>
        </ContextMenuTrigger><ContextMenuContent class="menu-content"><ContextMenuItem @select="triggerQuote"><ClipboardCopy :size="15"/> 引用该消息</ContextMenuItem><ContextMenuSeparator/><ContextMenuSub><ContextMenuSubTrigger>来源核验</ContextMenuSubTrigger><ContextMenuSubContent><ContextMenuItem @select="state.dialog='K='+activeKey+'\nMID='+active.last_message.provider_mid">查看身份K / 原MID</ContextMenuItem></ContextMenuSubContent></ContextMenuSub></ContextMenuContent></ContextMenu>
        <div class="local-sent" v-for="r in publicLocalRecords" :key="r.id"><Message align="end"><Bubble align="end" variant="default" class="local-bubble"><BubbleContent>{{r.body||'[无文本草稿]'}}</BubbleContent></Bubble></Message><p class="source-meta end">仅本地预览 · {{r.status}} · 未真实发送</p></div>
      </div>

      <div class="suggestions" data-test="suggestions">
        <div class="section-head"><div><p class="eyebrow">REPLYBRAIN · OFFLINE CASES</p><h3>建议回复 <span class="counter">{{candidateList.length}} 条</span></h3></div><Button variant="ghost" size="sm" @click="state.dialog='所有候选均来自W34冻结的synthetic reply_cases：0/1/2/3不补位，不能发送。'"><ShieldCheck :size="14"/> 数据来源</Button></div>
        <div v-if="candidateList.length===0" class="no-candidate">当前联系人没有建议回复。不会自动补出虚构的三条卡片。</div>
        <div v-else class="suggestion-cards"><article class="suggest-card" v-for="(s,i) in shownCandidates" :key="s.id"><small>方案 {{i+1}} · {{s.id}}</small><p>{{s.text}}</p><Button variant="outline" size="sm" @click="adoptCandidate(s.text,s.id)">填入草稿 <ArrowRight :size="12"/></Button></article></div>
        <Button v-if="candidateList.length>1&&!isA" variant="ghost" size="sm" @click="state.suggestExpanded=!state.suggestExpanded">{{state.suggestExpanded?'收起比较':'展开完整 '+candidateList.length+' 条比较'}} <ChevronDown :size="13"/></Button>
      </div>
      <div class="composer-wrap" data-test="composer" @dragover.prevent @drop="onFileDrop">
        <div v-if="currentDraft.quote" class="quote-chip"><div><small>引用 · {{currentDraft.quote.mid}}</small><p>{{currentDraft.quote.zh}}</p></div><Button variant="ghost" size="icon-xs" aria-label="移除引用" @click="clearQuote"><X :size="13"/></Button></div>
        <div v-if="currentDraft.files.length" class="file-chips"><span v-for="(f,i) in currentDraft.files" :key="f.name+i" class="file-chip"><FilePlus2 :size="12"/> {{f.name}} <Button variant="ghost" size="icon-xs" :aria-label="'删除附件 '+f.name" @click="clearFile(i)"><X :size="11"/></Button></span></div>
        <div class="composer-box"><InputGroup class="composer-input"><InputGroupTextarea :model-value="currentDraft.text" placeholder="在当前联系人写草稿，输入才模拟人工接管…" aria-label="当前联系人私有草稿" @update:model-value="onPublicUpdate" @compositionstart="state.composerComposing=true" @compositionend="onCompositionEnd" @keydown="keyDownPublic" @paste="onPaste"/></InputGroup>
        <div class="composer-bar"><div><input ref="filePicker" type="file" multiple hidden @change="addAttachments"/><Button variant="ghost" size="sm" @click="filePicker?.click()"><FilePlus2 :size="16"/> 附件</Button><Button variant="ghost" size="sm" @click="triggerQuote"><ClipboardCopy :size="14"/> 引用</Button></div><div class="composer-status"><small>{{currentDraft.text.length}} 字 · {{currentMode(active)}}</small><Button size="sm" @click="simulateSend" :disabled="!currentDraft.text.trim()&&!currentDraft.files.length"><Send :size="14"/> 本地模拟 / 不发送</Button></div></div></div>
        <small class="composer-foot">唯一 CONTACT 草稿界面 · K = {{activeKey}} · 无Provider出站</small>
      </div>
    </section>

    <section v-else class="no-active-pane" data-test="no-active"><LockKeyhole :size="26"/><h2>当前筛选没有已选择联系人</h2><p>已保护聊天及Composer。请选择当前账号和渠道中的有效联系人，查看不会标已读、接管或发送。</p></section>
    <aside v-if="isBC&&state.pulseOpen" class="autopilot-pane" data-test="autopilot-center" role="dialog" aria-modal="false" aria-label="独立托管中心" tabindex="-1"><div class="right-head"><p class="eyebrow">AUTOPILOT CENTER</p><h2>独立托管中心 <Button ref="autopilotClose" variant="ghost" size="icon-sm" aria-label="关闭托管中心" @click="state.pulseOpen=false"><X :size="16"/></Button></h2><p>不会暂停其他AUTO联系人。</p></div><div class="exception-list"><article v-for="q in queue" :key="q.code"><div class="row-title"><CircleAlert :size="14"/><strong>{{q.title}}</strong></div><small>{{q.peer}} · {{q.level}}</small><p>{{q.body}}</p><Button variant="outline" size="sm" @click="chooseScenario(q)">查看</Button></article></div></aside>
    <aside v-else-if="active&&!state.privateOpen&&!isBC" class="insights-pane" data-test="insights"><div class="right-head"><p class="eyebrow">YANCE EXPERIMENT</p><h2>会话概览</h2><p>私人Agno工具回执与普通联系人文本必须隔离。</p></div><div class="insight-card"><div class="row-title"><ShieldCheck :size="15"/> 安全状态</div><p>读取回执：<b>UNVERIFIED</b></p><p>在线状态：<b>UNKNOWN</b></p><p>发送模式：<b>{{currentMode(active)}}</b></p><p>当前异常：<b>{{currentException}}</b></p></div><div class="insight-card"><p class="eyebrow">QUICK SCENARIO</p><Button v-for="q in queue.slice(0,4)" :key="q.code" variant="ghost" class="insight-option" @click="chooseScenario(q)">{{q.title}} <ChevronRight :size="14"/></Button></div><Button variant="secondary" class="wide" @click="state.privateOpen=true"><Bot :size="16"/> 私人Agno模拟工作区</Button></aside>
  </main>
  <section v-if="state.privateOpen" class="private-drawer" data-test="private-agno" role="region" aria-label="完整私人闺蜜大脑模拟工作区"><div class="private-head"><div class="row-title"><Bot :size="21"/><div><p class="eyebrow">SELF_PRIVATE / AGNO MOCK</p><h3>你的私人闺蜜大脑 · 独立主工作区（模拟）</h3></div></div><Button variant="ghost" size="icon-sm" aria-label="关闭私人Agno模拟工作区" @click="state.privateOpen=false"><X :size="17"/></Button></div><div class="private-status"><LockKeyhole :size="14"/> 独立私有输入域 · 不进入任何联系人Composer</div><div class="private-tabs"><span>Agent / Team <b>待接入</b></span><span>Skills / MCP <b>待接入</b></span><span>Runs / Trace <b>模拟</b></span><span>Memory / Learning <b>待接入</b></span><span>Approvals <b>待接入</b></span><span>Budget <b>0真实费用</b></span></div><div class="private-history"><div class="private-mock">欢迎进入独立Agno工作区。本面板展示离线假Run/Trace/Skills/MCP、模拟费用和回执，不与真实AgentOS通信。</div><div v-for="(m,i) in state.privateMessages" :key="i" class="private-message" :class="{you:m.role==='YOU'}"><small>{{m.role}}</small><p>{{m.content}}</p></div></div><div class="private-bottom"><InputGroup class="private-input"><InputGroupTextarea :model-value="state.privateDraft" @update:model-value="onPrivateInput" aria-label="私人Agno模拟提问" placeholder="向私人Agno模拟体提问，不会发给任何联系人…" @keydown="keyDownPrivate"/></InputGroup><Button size="sm" @click="askPrivate" :disabled="!state.privateDraft.trim()"><Send :size="14"/> 本地提问</Button></div></section>

  <Dialog :open="!!state.dialog" @update:open="v=>{if(!v)state.dialog=''}"><DialogContent class="status-dialog"><DialogHeader><DialogTitle>本地模拟状态</DialogTitle><DialogDescription>以下仅为离线测试反馈，不代表真实授权、发送或工具运行。</DialogDescription></DialogHeader><p class="status-body">{{state.dialog}}</p><Button @click="state.dialog=''">确认</Button></DialogContent></Dialog>
  <footer class="statusbar"><span><span class="status-dot"/> 仅127.0.0.1 · 离线合成数据</span><span>{{currentArm.sub}} · {{state.theme}} / {{state.appearance}} · reset {{state.resetCount}}</span><span>VIEW {{active?.peer_id||'NO_SELECTION'}} · 真实发送 0 · P4 HOLD</span></footer>
</div>
</template>
