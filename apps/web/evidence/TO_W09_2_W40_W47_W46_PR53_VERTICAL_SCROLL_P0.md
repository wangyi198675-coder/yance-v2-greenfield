# W46 → W09-2 / W40 / W47｜PR #53 真实 Vue 非 CHAT 纵向滚动 P0 Owner 增量交接（2026-10-25）

**W46_SOURCE_CHROME_SCROLL_FIX_PASS（Owner 限定）／W40_INDEPENDENT_R4_REVIEW_PENDING／W47_EXACT_SHA_REPIN_PENDING／WEBVIEW2_HOLD／REAL_AUTH_HOLD／NO_DEPLOY／NO_SEND。**

## 一、基线和原始 RED（确实读取的证据）

- 当前 PR #53 非生产集成准确 SHA：`860e99c8e3a69d11e34e721c9b6f746732d42abc`，已在 DESKTOP-029FH47 的 `W09_R4_OWNER_JOIN_20261025` 原工作树核实；本人只读，未动 W09/W47/设计源。
- W46 上一版准确 SHA：`b50201b444ee500b55df8ca869d5164fa0c14149`，本轮仅在现有 W46 `w46/r4-vue-nonprod-candidate-20261025` 分支增量修复。新 SHA 由本文件同一最新 Git HEAD 和 W09-2 GitHub 回执给出，避免交接文件自引用。
- W47 Owner 原生 Runtime SHA：`7ff387adf2007744117b706d72a57c6055b04177`。
- 实际读取 W40 原始独立报告 `INDEPENDENT_REVIEW_RECEIPTS/P3-W40-PR53-860-REAL-VUE-ZOOM-20261025/W40_PR53_860_R4_REAL_VUE_VISUAL_ZOOM_INDEPENDENT_ACK.md`、`W40_PR53_860_ACTIONABLE_DEFECTS.json`、`audit_vertical_scroll.cjs`、`audit_native_zoom_vertical.cjs`。签名原缺陷 `PR53-W40-P0-01`：15 常规场景里 7 个滚动不可达，原生 110%/125% 下 6/6 不可达；旧 Shell `100dvh + overflow:hidden`，原新 Vue 没有自己受限的 scrollport，320×680 账号页 ChatGPT 按钮 bottom=952px。
- W40 其他原报告中的 169/169 基础、10/10 主题、80/80 原生缩放基础检查，仅为它们自己的既有统计，不与本轮的 15+6 滚动验证混为一个测试总体。

## 二、准确最小源码变更（没有修改旧 CHAT 或 Shell 剪裁）

唯一实际 Vue 源修改：`apps/web/src/BCProductWorkspaceCandidate.vue`。本次不改 `apps/web/vite.w46.config.mjs`、`BCNativeComposer.vue`、`BCManagedStop.vue`、W47 `apps/web/runtime/vite.w47.config.mjs`、`design/nonproduction/approved-clickable-abc-bc/src/style.css`、W24/W44/W25、Agno 或数据库。

1. 针对 `.w46-product-candidate:not([data-active-workspace='CHAT'])`，设置 `flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden`，仅限非 CHAT 工作区。
2. 顶部状态/九分类导航为独立的 `flex:0 0 auto`，在内层滚动时依然可见；不去掉旧 `.shell` / `.workspace` 的全局剪裁，CHAT 和唯一 CONTACT Composer 不受影响。
3. `.w46-candidate-content` 改为真正受限高度的 `flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;scroll-behavior:auto;touch-action:pan-y`，保留必要底部 padding，滚轮和触屏不会越过窗口硬剪裁。
4. 加入 `tabindex=0`、`role=region`、当前工作区中文 `aria-label` 与 `:focus-visible`，原生键盘 Home/End 可达；工作区切换 `await nextTick()` 后只重置候选 contentScroller.scrollTop，不操作 CONTACT Composer、Agent 或服务端授权。
5. 原 W46 `v-show` 恢复 CHAT 的逻辑、唯一原 `main.workspace` DOM、不触发 TAKEOVER 的被动导航、安全空态全部继承，未回滚。

## 三、真实 Windows Chrome 精确 P0 验收

**构建**：真正 W46 Owner 新源码 + PR #53 的 `apps/web/runtime/vite.w47.config.mjs` **原生只读 gate** 导入到 W46 自有测试构建 `apps/web/tests/w46-r4-chat-w47-source-vite.config.mjs`，Vite **2663 个模块构建 PASS**。该测试 adapter 仅允许显式非生产候选可视开关，不改变原 W47 获取真实账号/API 的拒绝规则，不是正式 W47 SHA 签署/发布构建。

**Node 回归**：`node --test apps/web/tests/*.test.mjs` **66/66 PASS、0 fail、0 skipped**（原 W46 64 + 两条滚动 Owner 守卫）。原 B+C `npm test` **15/15 PASS**。原既有 Chrome 九工作区／12 宽度／九设置／十主题、CHAT 往返、503 权限失败/草稿合同均重新执行 PASS。

**W40 五窗口 × 三页面实测**：`apps/web/tests/w46-r4-vertical-scroll-real-chrome.cjs` 在 Windows 已安装 Chrome headless 真页面上，用真实 mouse.wheel（1457）和原生键盘 Home/End 验证 **15/15 全部可达**，包含 W40 原来 RED 的 7 个组合：`950×620 ACCOUNTS`、`430×850 AUTOPILOT`、`360×740 ACCOUNTS/AUTOPILOT`、`320×680 ACCOUNTS/AUTOPILOT/SETTINGS`。真实 `scrollTop>0`、目标 `getBoundingClientRect.bottom<=innerHeight`，顶部导航保持位置不变、横向无溢出、旧 shell overflow=hidden、CHAT 后返仍是原 DOM 且无虚构联系人。关键数据：320×680 的 ChatGPT 授权按钮从 bottom=952 滚至 591；360×740 AUTOPILOT bottom=1027 滚至 615；320×680 SETTINGS bottom=696 滚至 598。

**真正 Chrome 原生缩放六场景**：`apps/web/tests/w46-r4-vertical-native-zoom.cjs` 使用独立 Windows Chrome userDataDir 的真实 Chromium partition zoom preference，并以 `devicePixelRatio` 独立验证：110%=1.1000000238、125%=1.25。Chrome 实际外框 1360/950/430（小宽受真实 Windows Chrome 516px 最小外框约束，不宣称实际缩到 CSS320）。**6/6 真缩放账号页 W40 原始不可达条件现在可通过滚轮/键盘 End 到达**。比如 110% physical430 CSS width=455、viewportH579，按钮 bottom816→507；125% physical430 CSS width=400、viewportH510，bottom898→421。**0 API POST、0 发送、0 已授权联系人/账号、0 Chrome JS Error**。

真实 Chrome 截图：
- `W46_R4_VERTICAL_FIX_ACCOUNTS_320_BOTTOM.png`、`W46_R4_VERTICAL_FIX_AUTOPILOT_360_BOTTOM.png`、`W46_R4_VERTICAL_FIX_ACCOUNTS_950_BOTTOM.png`
- `W46_R4_VERTICAL_FIX_NATIVE_110_OUTER_430.png`、`..._110_OUTER_950.png`、`..._125_OUTER_430.png`、`..._125_OUTER_950.png`
- 可复核 machine JSON `W46_R4_VERTICAL_SCROLL_REAL_CHROME.json` 和 `W46_R4_VERTICAL_NATIVE_ZOOM_REAL_CHROME.json`，包含每场景 before/after/keyboard、CSS 窗口尺寸和真实 dpr。

## 四、下一步签署边界／严格 HOLD

- W09-2：仅在原 PR #53 **隔离 Draft** 做最小新 W46 Owner SHA cherry-pick / source reconcile，不能直接修改 main／4399 正式预览；对新 W46 Component blob 和整体 SHA 做精确版本门禁回读，重新执行 7/7 新 HEAD GitHub CI，不继承 PR #53 旧签名。待 W47 本人接受其 runtime SHA / 原 Gate Owner 白名单。
- W47：独立复签 CHAT `main.workspace` 始终原 DOM、唯一 CONTACT Composer、W47 API 的 `trustedSession=false` 真实 0 联系人及 `canSend=false`，工作区滚动切换不触发 takeover/外发。W46 不直接修改 W47 源。
- W40：针对新的 PR #53 HEAD 运行自己现有的 `audit_vertical_scroll.cjs` 和 `audit_native_zoom_vertical.cjs`，再次实际核实 `/version.json` 与编译 JS SHA256，独立签署 P0 修复。**本 W46 OWNER PASS 不能冒充 W40 独立 `VUE_UI_DELTA_PASS`**。
- W37 R2 导航和 R4 高保真密度差异：`DESIGN_CONTRACT_HOLD`，等用户/W09-2 决定，不顺手重设。
- `WINDOWS_WEBVIEW2_HOLD`、`REAL_AUTH_HOLD`、`W24_W44_W25_SEND_QUALIFICATION_HOLD`：没有合法联系人 K、当前授权 epoch 或真人 provider 会话，不能模拟授权来拿 PASS，也没有真实外发。
- 此前 W40 169/169、10/10、80/80 仅有旧 SHA 证据；完全 Vue RELEASE 需 W40/W47/W09 按新 SHA 再签。

**范围签署：W46 P0 scrollable NON-CHAT Vue view + Windows Chrome wheel/keyboard/native Zoom 21/21 scenarios PASS；待新 PR #53 集成与 W40 独立重签后才能解除产品层 VUE_UI_DELTA_RED。**
