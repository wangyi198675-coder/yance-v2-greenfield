# W46 → W09-2｜R4 Vue 非生产候选 Owner 交接（2026-10-25）

状态：W46_CANDIDATE_SOURCE_BUILD_CHROME_PASS / W47_RUNTIME_OWNER_ONLY / R4_VISUAL_DIFF_HOLD / R2_USER_NAV_APPROVAL_PENDING / NO_DEPLOY / NO_REAL_SEND。

## 签署来源与 Owner 边界

- W46 原唯一 CONTACT Composer、人工接管与停止托管基线 SHA：acef02492b897e75244569de93389064cd96ce76。本轮未修改 BCNativeComposer.vue、BCManagedStop.vue、composer-bridge.mjs、managed-stop.mjs。
- W09-2 PR #32 SHA：0423d7d347c2538e8ca9804dca1c2fc2baf1760b。
- 本机已实际读取 W09_20261025_W46_W47_R4_VUE_SHELL_FILE_OWNERSHIP_ARB_NONPROD_ONLY.md 及 W09_20261025_W40_R4_171PASS_DESIGN_DELTA_SIGNOFF_NEXT_SOURCE_KICKOFF.md。
- R4 设计原件 OPEN_YANCE_V2_LATEST.html，本机独立复算 SHA256：4d95254bf39281173b0756f723a512111471187f201c40479599b6a6b46878e4，与 W40 已签 171/171 设计门禁一致。但 W40 的设计测试不等于这次 Vue 视觉差异 PASS。
- W37 实际读取 STABLE252_WORKSPACE_COMPONENT_AGNO_R2_REVIEW_DELTA.csv，252 行唯一 Stable ID 已逐行保留。R2 最终导航仍待用户批准。
- 本次仅修改本人的 apps/web/src/**、apps/web/tests/**、apps/web/evidence/** 与 apps/web/vite.w46.config.mjs。没有修改 W47 的 apps/web/runtime/vite.w47.config.mjs、services/api/runtime/server.mjs、历史 design/**、Agno、W25 或数据库。
- 精确候选 Git HEAD 请以交接文件所在独立非生产分支最新 commit 和 PR 为准，不在正文自嵌 SHA 导致循环哈希。

## 修改文件清单与源码合同

1. apps/web/src/BCProductWorkspaceCandidate.vue：使用现有 Vue 与 Button/shadcn-vue 组件，新增九工作区候选导航 CHAT/BRAIN/AUTOPILOT/ACCOUNTS/PEOPLE/PERSONA/TASKS/MEDIA/SETTINGS。CHAT 是未授权空态；保留而不重建唯一 B+C CONTACT Composer 和 PRIVATE Brain 原有组件。所有操作缺权限均禁用。
2. apps/web/src/BCBrandIcon.vue 和 r4-brand-paths.mjs：四个 SVG path 原样提取自 SHA256 已签 R4 原件；Messenger、Facebook Page、WhatsApp、Telegram 没有再使用临时字母/符号冒充。真实服务授权数仍为 0。
3. apps/web/src/product-workspace-contract.mjs：仅 GET W47 已存在的 /api/v2/runtime/health、/api/v2/runtime/capabilities、/api/v2/contacts；强制服务权威回读、canSend=false 和 externalEffects=false，trustedSession=false 时禁止真人联系人进入页面。无 POST/OAuth/发信/收费模型。九设置项取自 R4：general/accounts/model/translate/media/theme/notify/privacy/diagnostics。撤权 REVOKED、过期 AUTH_EXPIRED、预算不足 BUDGET_INSUFFICIENT 仅显示禁用规则，绝不冒充已发生真实故障。
4. apps/web/vite.w46.config.mjs：只在非生产查询参数 ?arm=CHAT-BC-FUSION&productDraft=1 下打开候选；W46_R4_SAFE_PREVIEW=1 只用于本机 Chrome 将 GET API 转到原 W47 47182。正常原 B+C 项目显示和原发送禁用机制不变。
5. apps/web/evidence/W46_R4_CANDIDATE_STABLE252.json：严格追溯 W37 252 行，保留原 ID、R2 primary workspace/原子组件、原 Native API、W09 owner review 状态。映射候选数：CHAT 71、BRAIN 14、AUTOPILOT 20、ACCOUNTS 20、PEOPLE 31、PERSONA 24、TASKS 5、MEDIA 26、SETTINGS 41，合计 252。所有行 ui_r4_owner_approved=false、ui_live_route_approved=false，不冒充 W37 用户导航批准。
6. apps/web/tests/product-workspace-contract.test.mjs 和 w46-r4-candidate-browser.cjs：接口拒绝测试、已签品牌与 252 数据完整性、原 B+C 非生产浏览器实际操作及多分辨率、无外发负例。

## 实际验收

- DESKTOP-029FH47 Node：apps/web/tests/*.test.mjs 全部 61/61 PASS，0 FAIL/0 SKIP；继承原 B+C npm test 15/15 PASS。
- 实际 Vite 完整构建：2667 modules transformed，PASS；没有覆盖原设计目录或添加第二 App/Composer。
- 实际 Windows 安装 Chrome（headless），加载此候选真实 Vue 编译结果而非 R4 HTML：九工作区点击 PASS；12 档物理视窗 320/360/375/430/500/720/920/950/1050/1100/1101/1360 无水平溢出；移动 9 设置分类原生 select 全部可达；五主题 × 明暗 10 状态切换 PASS。
- 四个 SVG 内部 path 长度与已签原件严格一致；账号 0、联系人 0、可信会话 false、禁用发信；点击期间 W47 API mutation 0、浏览器 JS error 0、模型费用调用 0。
- 证据：W46_R4_CANDIDATE_BROWSER_UAT.json、W46_R4_CANDIDATE_STABLE252.json；七张真实 Chrome 截图 W46_R4_CANDIDATE_CHROME_1360_ACCOUNTS.png / _320_SETTINGS.png / _360_MENU.png / _430_SETTINGS.png / _430_FAILCLOSED.png / _430_AUTOPILOT.png / _THEME_4_DARK.png（完整前缀见 evidence 文件列表）。
- 这里的 Chrome PASS 只验证非生产候选功能，不是 W40 对新 Vue 像素差异、浏览器 110%/125% Zoom、Windows WebView2 或真人授权。

## W47 最小运行接缝（W46 不替 W47 改）

W47 自有 apps/web/runtime/vite.w47.config.mjs 已在同一 checkout 引用 apps/web/vite.w46.config.mjs，原生只读 API/联系人在 47182；因此仅需由 W47 审阅并增加一次受控的非生产工作区候选激活路由/feature gate，默认关闭，严禁浏览器 query 作为正式认证凭据。W47 自行评估现有 W47 Vue App/store transform 与 W46 候选 transform 的顺序和单一 Shell 不变量，继续采用本机 GET-only health/capabilities/contacts 数据，彻底禁止历史 W37 synthetic contacts 进入用户产品视图。不需要 W46 扩展权限，不需要新增 API 写入口。W47 的产物应是 TO_W09_2_W47_R4_READONLY_RUNTIME_JOIN.md 和准确 W47 SHA、原生 HTTP 回读、Chrome 证据及失败负例。W09 只在隔离草稿树合入，重新跑全部 CI，不继承旧 PR #32 七绿。

## 剩余 HOLD

R2 用户正式导航批准、W40 新 Vue R4 差异/110%-125% Zoom、W47 正式 Shell Source Join、真实本机可信 Principal/Consent、ChatGPT 官方身份/套餐/计费授权、W24/W44/W25 完整发送资格、四渠道 Provider ACK、Windows WebView2 已安装验收、精确新 SHA CI 7/7 和最终发布，全为 HOLD。

结论：W46 自有非生产 R4 Vue 候选 SOURCE/BUILD/CHROME 可交审；不是已经正式接线成功的 V2 产品，不可合入 main、不可更新正式 4399、不可真人发信。
