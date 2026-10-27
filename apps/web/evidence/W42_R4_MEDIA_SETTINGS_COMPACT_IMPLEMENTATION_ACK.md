# W42｜R4 Compact MEDIA + SETTINGS 设计实施规格与本人独立签署

2026-10-27 · DESKTOP-029FH47 · 原R3/R4高保真设计Owner W42

**结果：DESIGN_REVIEW_ACK / R4_MEDIA_SETTINGS_COMPACT_SPEC_READY / NATIVE_CONSUMER_HOLD / NO_DEPLOY**

## 一、设计继承与资产

用户已经批准R4 Compact，不重新画R5、不重新审批。设计基准：DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md 与 01_USER_APPROVED_CHANGELOG.md；原高保真 OPEN_YANCE_V2_R4_TARGETED.html，SHA256 4d95254bf39281173b0756f723a512111471187f201c40479599b6a6b46878e4。

已实际读取W40以下真实原R4截图：
- P3-W40-R3R4-VS-LIVE44767-20261027/SBS_media_R4_1360.png
- SBS_media_R4_430.png
- SBS_settings_R4_1360.png
- PAIR_settings_R4_VS_LIVE_DRAFT_430.png

沿用R4已批准可编辑源 YANCE_R4_COMPACT_APPROVED_W42_HIFI_IMPLEMENTATION_SPEC.html，原SHA256 37fd85d5da3635cf133d09425d9fb8d1d6a71416198eca3d01e4364617de4c16。

**本次新增可点击独立高保真源**：
DESIGN_APPROVED_20261027_R4_COMPACT_V1/W42_MEDIA_SETTINGS_COMPACT_20261027/YANCE_R4_APPROVED_MEDIA_SETTINGS_COMPACT_W42.html
**SHA256 5377dc68b70ea0aa5cd35e7a90ef26213aea350228e89db9b53321e0933345ef**。

只新增MEDIA、替换单独SETTINGS面板；CHAT/BRAIN/EXPERTS/PERSONA/HOSTING原内容不改变。源增量分开保存为W42_MEDIA_SETTINGS_PAGES_FRAGMENT.html、W42_MEDIA_SETTINGS_COMPACT_DELTA.css、W42_MEDIA_SETTINGS_COMPACT_INTERACTIONS.js、可重放装配脚本W42_BUILD_FROM_APPROVED_R4.cjs。

直接预览完整52张PNG：W42_MEDIA_SETTINGS_VISUAL_PREVIEW_INDEX.html，SHA256 d9e6a72e0381c9389b2976ce7ea0fec7b6e401c713771d8eee3728b8db8f9321。

## 二、MEDIA精准视觉/交互规格

**几何**：全局48px唯一顶栏，MEDIA工作区次工具栏43px（窄屏42px）。不恢复原R4页面大标题和长期技术横幅。1360px MEDIA左侧资源主体+右侧320px属性预览；950px右侧约265px；430/360/320px上下堆叠，滚动互不遮挡；不得出现新的永久多余侧栏。

**主体**：Tab “媒体库 / 附件预览 / 能力状态”；来源Select“全部已授权账号/Messenger/Page/WhatsApp/Telegram”、授权范围内搜索胶囊、全部/图片/视频/音频筛选。列表列头“文件/类型、大小、上传/存储、操作”；无账号时仍保留完整列表结构与清楚的NO_REAL_AUTH空态，禁止显示虚构文件和假上传成功。

**预览**：图片PNG/JPEG/WebP、视频MP4/WebM、音频WAV/MP3/Ogg三个受控预览类型；无权时抽象图标和禁用操作而非假样片。每个真实文件显示MIME、字节大小、真实上传/存储状态、本人账号/渠道/peer来源和授权范围，错误与恢复动作按需展开。真实内容只能使用受控W23 GET，撤权、删除或切换账户需清理缓存和revoke ObjectURL。

**能力**：普通W23文件附件、AI图片/视频生成、TTS/ASR、RTC必须分开。原W23只支持附件字节，图片≤8MiB、视频≤48MiB、音频≤16MiB；生成类Provider未配置均不可启用。未签TTS/RTC不能借普通音频播放假冒成功。

**原生Owner**：W23 PersistentMediaAssets + createWebMediaHttpHandler。现有API合同 GET /api/v2/media/capabilities；POST /api/v2/media/upload-sessions；PUT /api/v2/media/{asset_id}/content；GET /api/v2/media/{asset_id} 和 /content；DELETE /api/v2/media/{asset_id}。W47必须使用现有W47 Session、W24五段K、W44 Grant以及W55现有安全持久密钥、同源CSRF鉴权；非授权则401/403、未挂载则真实503、大小MIME错误需准确反映。不能自建第二媒体Store、手填K或新SDK。原W23的主体范围媒体库列举/分页能力尚未确证，W47须先核查；缺失时仅由W23原Owner补最小接口，不造文件系统假资源。

**当前c28事实**：MEDIA当前落入BCProductWorkspaceCandidate.vue里的w46-blank，W47尚未挂载W23，BCNativeComposer.vue仅给附件动作name/size元数据。用户尚未合法绑定真人社交K，所以真实上传READ/SEND都属于HOLD；但本次规格要求合法空态MEDIA页仍必须呈现。

## 三、SETTINGS九个独立面板与接口权威

| 分类 | 独立主控件与状态 | 必须复用的原Vue或接口 |
|---|---|---|
| 概览 | 闺蜜大脑、唯一CONTACT Composer与主题入口；不做假数据统计 | BCProductWorkspaceCandidate.vue、现有B+C/PRIVATE路由 |
| 账号与授权 | 四平台官方连接、已授权多账号；ChatGPT身份与套餐/API费用许可分离 | BCChannelAccountSetup.vue + W24/原各渠道Owner |
| 本地AI | 本地模型健康、当前实际模型、收费来源同意 | BCPrivateBrainWorkspace.vue、BCNativeCloudKeySettings.vue；W47 /api/v2/private-brain/model-config |
| 翻译 | 目标语言、翻译供应商健康、原文/译文/来源、持久缓存 | W45 /api/v2/translations；未接通503时不可假存储 |
| 媒体 | W23普通附件规格、Host状态、生成Provider与MEDIA入口 | W23/W47 GET /api/v2/media/capabilities；目前Host未挂 |
| 主题 | 五正式冻结ID的品牌渐变及light/dark；单套组件变量 | 现有App.vue主题事件；未证实时不得伪造服务端持久化 |
| 通知 | Web通知许可、Windows Tauri原生Toast、双音与音量配置 | 原通知Owner / 浏览器权限；不在加载时自动请求 |
| 隐私 | 本机受保护身份、联系人K范围、撤权/过期和数据隔离 | W24/W44/W47有效授权和版本CAS；危险操作无权禁用 |
| 诊断 | Web/API版本、会话权限、媒体Host、REVOKED/EXPIRED/BUDGET/PENDING/SUCCESS/ERROR/CONFLICT/UNKNOWN/RECOVERY、导出 | BCNativeHostSession.vue + /version.json 和 /api/v2/runtime/health 真读回 |

**九个分类必须是九份不同的业务内容**，不得每一分类再复制同一组Web/API状态卡。诊断详情只放诊断页。桌面侧分类栏宽约196px（950px约174px），430/360/320px用44px原生Select切九类，可由触控/键盘完成。所有组件正式Vue中复用shadcn-vue/Reka的现有Button/Select/Tabs/Dialog/Sheet；Standalone HTML仅供设计查验，不是生产源码。

## 四、视觉令牌、五主题与响应式QA

正式冻结主题：Obsidian Lime / 曜石荧光、Cosmic Sunset / 星云落日、Ocean Electric / 深海电光、Amber Ember / 熔岩琥珀、Opal Prism / 冰瓷幻彩；每套light/dark，共10态。使用已经批准的原R4 CSS变量，不复制十套组件。选中Tab品牌光边、卡片轻微玻璃层次、Composer/搜索微光、disabled原因清晰；支持reduced-motion，不加持续重负载动画。

Windows Chrome实际自测：**113 PASS / 0 FAIL，0 JS页面错误，0外部网络请求，52张PNG**。真实打开本次增量HTML而不是一张扁平图；覆盖1360×850、950×620、430×850、360×740、320×680；MEDIA三Tab与图片/视频/音频预览；SETTINGS九个分类按不同内容切换；五主题十态。截图与SHA清单：PNG_WINDOWS_CHROME/ 及 W42_MEDIA_SETTINGS_IMAGE_MANIFEST.json；逐项QA：W42_MEDIA_SETTINGS_WINDOWS_CHROME_QA.json。测试证明**设计可实施、视觉与交互闭环**，不证明目前固定44767已经消费W23原生或九类真实设置。

## 五、准确W46/W47/W09-3接线与签署

**W46 原Vue Owner**：在现BCProductWorkspaceCandidate.vue的MEDIA通用空态入口接BCMediaWorkspace.vue（或等效最小Owner增量），SETTINGS接BCSettingsWorkspace.vue九个真实分组，复用原BCNativeComposer.vue现有ATTACH/DROP/PASTE和原组件；附件传真实原生File字节，不得第二发送器。只要没有真实5-part K或W47 Host未挂就显示本设计NO_REAL_AUTH/503状态，不能假成功。现有CHAT/BRAIN/托管及R4成熟能力全部保留。

**W47 原Host Owner**：验证真实W23 media handler、W24/W44身份资格及现有安全密钥，挂载原路由且保持原session/CSRF签署。如果资产listing不存在仅交W23原Owner最小scope分页申请。缺真实授权时返回准确401/403/503，绝不造Vault、硬编码私钥或账户。

**W09-3 唯一整合Owner**：W42 DESIGN_REVIEW_ACK可以成为本次MEDIA+SETTINGS UI实施门禁的设计签署证据；真正的 MEDIA_SETTINGS_SOURCE_INTEGRATED_SIGNED_VERIFIED 还需W46/W47准确源码SHA和Owner权限，QA44767_MEDIA_SETTINGS_RELEASED_VERIFIED还需受控构建、双SHA回读、真实Chrome/Opera与原生API核验。无合法真实账户K时REAL_ACCOUNT_MEDIA_UPLOAD_HOLD独立保留，不能宣称USER_MEDIA_COMPLETE。不得覆盖当前c28固定44767或正式44751。

### W42 本人签署

**DESIGN_REVIEW_ACK：PASS，范围仅限已批准R4媒体与九设置面板的增量高保真、交互规范、五主题明暗、320–1360px实图及真实接口边界映射。**

不代签W46正式源码、W47 API宿主、真实授权上传、W40最终独立UAT或W09受控部署。

NONPRODUCTION_DESIGN / NO_REAL_AUTH / NO_SEND / NO_PAID_API / NO_SOURCE_EDIT / NO_DEPLOY
