# W42｜PR97／376277C｜R4 Compact 二维码视觉RED独立定点复签

2026-10-27 · DESKTOP-029FH47 · W42原R3/R4设计Owner

**最终结论：DESIGN_DELTA_PASS（仅旧PR95两项视觉RED及相关动态状态）。**
不代表W46/W47原Owner安全签署、真实账号授权、W40正式UAT或发布通过。

## 1. 准确SHA与方法

- GitHub Draft PR #97: https://github.com/wangyi198675-coder/yance-v2-greenfield/pull/97
- 本轮联合源码准确SHA：376277cbc61fe8946e0d26aac163eea04cb50e05。
- 旧RED准确SHA：PR#95 7d5f3529d2c328d535ff00c9cb50daa94f2539e7，历史ACK为同级 W42_PR95_CHANNELS_R4_VISUAL_REVIEW_ACK.md。
- 原已批准方向：DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md 与 01_USER_APPROVED_CHANGELOG.md。无需重新审图、生成R5。
- PR97的最小delta只涉及 apps/web/src/BCProductWorkspaceCandidate.vue、BCChannelAccountSetup.vue 和原渠道测试一个文件；无第二授权SDK或MessageDelivery修改。
- **独立实测**：W42自行运行Windows Chrome操作W09提供的确切PR97已构建、隔离、可交互的实际Vue预览 http://127.0.0.1:44773/，不是HTML原型。本轮未另外编译第二套原生程序；PR97 HEAD、源修复与W09的编译回执已对应核查。
- 所有渠道status/setup GET均由浏览器层拦截，返回模拟原Owner契约；测试图是240×240、清晰写着“SYNTHETIC NOT A QR TEST ONLY”的**不可扫码PNG**，没有真实Baileys Session、账号授权、真人发送、付费API。阻止任何非GET API动作。
- 本轮Chrome定点结果：**44 PASS / 0 FAIL / 0 JavaScript页面错误 / 12 PNG / 0真实账号操作**。

## 2. RED-01 P0 430px二维码覆盖：PASS

Chrome窗口430×850，WhatsApp卡点击连接账号后由合成 WAITING_QR_SCAN 实际展开 Vue 内的二维码区：

| 真实DOM坐标或尺寸 | PR97实测 |
|---|---:|
| WhatsApp卡片高度 | 543.3px |
| WhatsApp卡片bottom | 1110.9px |
| 二维码bottom | 1043.1px |
| Telegram卡片top | 1120.9px |
| QR完整位于WA卡内 | true |
| WA QR与Telegram二维矩形重叠 | **false** |
| 页面水平溢出 | 0px |

旧PR95为WA卡高182px、二维码bottom960.5px、Telegram top677px、垂直重叠283.5px；该历史RED已经闭环。PR97中 .w46-r4-channel-grid 的 flex-shrink:0 / grid-auto-rows:max-content / align-content:start 与 .w46-channel 的 height:auto / overflow:visible 实际发挥作用。

新截图：W42_PR97_376277C_QR_EVIDENCE/PR97_430_02_QR_WAITING_SYNTHETIC.png（图片中二维码明确标注不可扫码）。

## 3. RED-02 P1 状态：PASS

- 当前二维码有效：状态 **等待扫码**；唯一主按钮 **重新获取二维码**。
- 官方授权步骤返回：状态 **等待授权**；唯一主按钮 **重新获取授权**；合法官方步骤链接仅展示、没有打开真实第三方授权。
- OFFLINE为未连接，ONLINE_VERIFIED只由原Owner有效回读产生，不把取得QR或HTTP200称为已连接。
- 第二次重新获取短有效期QR后成功显示等待扫码；到期时切换为 **二维码已过期** 且销毁旧二维码；再次点击可重新取得新二维码，恢复等待扫码。过期后的按钮当前显示“连接账号”，点击能重取，属于可选文案完善，不影响旧两项RED闭环。
- 测试收起卡内“连接详情与检查”，及全局“账号详情”，布局均不重叠。
- 离开渠道页进入聊天再返回时旧测试QR不遗留，状态恢复未连接，布局正常。
- 限定：当前Vue没有“单独收起二维码”按钮；本轮“收起”检验对应现存详情折叠与离开渠道页后清理，绝不虚称独立QR收起功能存在。

新截图包括：
- PR97_430_03_QR_RENEWED_SHORT_EXPIRY.png
- PR97_430_04_QR_EXPIRED.png
- PR97_430_05_QR_REACQUIRED.png
- PR97_430_06_DETAILS_COLLAPSED.png
- PR97_430_07_OFFICIAL_AUTH_WAITING.png
- PR97_430_08_RETURN_ACCOUNTS.png

## 4. 950px和1360px响应式简验：PASS

| 窗口 | WA卡高度 | QR bottom | WA卡bottom | QR与TG二维重叠 | 水平溢出 |
|---|---:|---:|---:|---|---:|
| 950×620 | 552.3px | 836.8px | 905.6px | false | 0px |
| 1360×850 | 571.8px | 610.0px | 678.8px | false | 0px |

950、1360宽度下WA与Telegram横向并列，TG top比QR bottom早不构成重叠；检验是二维可视矩形相交、QR在自身WA卡内、页面没有水平溢出。43px工具栏及四卡状态均保留，滚动后QR仍可完整查看。

截图：PR97_950_01_IDLE_VUE.png、PR97_950_02_QR_WAITING_SYNTHETIC.png、PR97_1360_01_IDLE_VUE.png、PR97_1360_02_QR_WAITING_SYNTHETIC.png。

## 5. 共享MasterController证据与后续门禁

本回执同级证据目录：
COORD_AGGREGATE/W42_PR97_376277C_QR_EVIDENCE/

- W42_PR97_376277C_CHROME_QR_DELTA_METRICS.json：44项Chrome定点判断、全部DOM坐标、12张PNG文件名与逐文件SHA256、状态/安全日志。
- W42_PR97_376277C_INDEPENDENT_CHROME_QA.cjs：独立浏览器复测源，安全拦截原生授权API，合成不可扫码图。
- 共12张真实Chrome截图，含过期、重新获取、展开和收起后布局、官方授权等待、回到未授权空态。

**结论：DESIGN_DELTA_PASS。** W09-3可正式关闭PR95两项R4视觉RED，进入下一道W46原Vue源码Owner签署、W47原构建Owner签署、W40/W04独立验收及W09-3受控发布门禁。此ACK本身**不授权合并、发布、固定44767切换或真实用户账号连接**。

NONPRODUCTION_VISUAL_QA / NO_REAL_AUTH / NO_SEND / NO_PAID_API / NO_SOURCE_EDIT / NO_DEPLOY
