# W29 → W09-2｜Issue #77｜Telegram官方TDLib JSON真实授权入口原Owner接口交接
日期：2026-10-27；设备：DESKTOP-029FH47；本轮只修改 connectors/tdlib-json/**。没有修改W46/W47或任何发布端口。

## 权威已有SDK（保留，不重新开发）
- 真正官方TDLib JSON v1.8.69，Git源码完整SHA `ea3f69ce11aef458bfbb09869b809ede4447486f`，BSL-1.0许可；现有真实Win64 `tdjson.dll` SHA256 `ae286549e2abc071acf67a3423468e8a5a8b488b4cdc368d6f203b2bf1d355e0`。
- 本轮只针对原C# `native/TDJsonHost.cs`增量：收到真正SDK `updateAuthorizationState`时，在**W29现有Host的私有stdin/stdout**同时返回完整官方AuthorizationState details，需由W47原Owner实际挂载。二维码来源仅可能是官方 `authorizationStateWaitOtherDeviceConfirmation.link`；不使用假二维码、随机URL或生成Telegram协议。
- 原 `src/native-tdjson.mjs` 增量：记录实际native auth state（启动未收到官方状态时为authorizationStateStarting）；`authorizationStateReady`自动向原TDLib发**只读getMe**，平台账号ID须经过原W24 `onNativeAccountIdentity`证实后才标 `accountIdentityVerified:true`。授权撤销/过期切掉旧K，QR/验证码/密码信息仅凭W47现有可信session通过 `readPrivateAccountState` 回读，公共状态不返回秘密。用户主动退出后等待真实 `authorizationStateClosed`，并把清理已授权会话传给W24/W55 `onNativeAccountRevoked`，未收到原Owner可验证持久撤销不得显示removalConfirmed。
- 新增 `src/native-telegram-auth-flow.mjs` 导出 `createW29TelegramAuthorizationPort({runtimeDir,controller,loadApprovedNativeConfig})`，它**仅为模块接口，无HTTP Listener/新登录系统/第二发送器**，供W47已有provider gateway最小接入。

## 给W47/W46的真实调用契约——接口已写在W29，不等于W47已经挂载
- `port.setup()`：可在现有同源GET /api/v2/providers/telegram-personal/setup调用，仅检查官方DLL/manifest实际哈希，返回 `nativeSdkInstalled:true, nextAction:'USER_CLICK_CONNECT',actualQrReady:false,connected:null（公开配置不推断真实用户状态）,canSend:false`；**不启动用户账号登录**。
- `port.connect({sessionHandle,gestureId})`：仅在本人真实点击「连接Telegram」后，W47复用已有first-party session/POST边界，用原W54/W47 `attestUserGesture`+W24 `findAuthorizedAccount`创建当次授权中的**临时账号意图**（尚无getMe账号ID），W55新获授权账号的CredentialRef、隔离新数据库路径；禁止扫描、自动恢复用户移除的V1凭据。启动官方 `TDJsonHost.exe --worker`，客户端直接调用官方td_create_client_id/td_send/td_receive；返回stage=AUTH_IN_PROGRESS，绝不直接ONLINE。
- `port.state({sessionHandle,gestureId})`：W47已有first-party session权限经 `attestReadSession` 校验后读实际官方state。未知/未登录为 `WAITING_USER_AUTH`；只有W24核验官方getMe及持久账户版本后才 `ONLINE_VERIFIED`；即使online，`canSend:false`，真人发信仍需W25原边界。仅经授权私人回读返回官方QR link、实际 `codeInfo`、passwordHint，不得在普通公开GET返回二维码token。
- `port.act({sessionHandle,gestureId,action,data})`：根据**已经由真实TDLib返回**的状态，只允许动作：`configure` → 原W55/用户新授批准 `setTdlibParameters` 全官方1.8.69参数；`phone`→`setAuthenticationPhoneNumber`；`qr`→`requestQrCodeAuthentication(other_user_ids:[])`；`code`→`checkAuthenticationCode`；`password`→`checkAuthenticationPassword`；`email`/`emailCode`；`register`（只有用户知情时）。无任何W29 `sendMessage`入口。官方二维码链接只在SDK实际 `authorizationStateWaitOtherDeviceConfirmation` 后回读。
- `port.disconnect({sessionHandle,gestureId,removeAccount:true})` → 官方 `logOut`，先 `LOGOUT_PENDING`，等本SDK实际closed以及W24/W55持久失效才能回 `removalConfirmed:true`；普通`removeAccount:false`只关闭本进程，不能假报Telegram账号已在平台退出。再次连接必须本人**再次点击**并用原受保护新会话，禁止自动登录已移除的旧账号。

## W47原Owner最小接线（需其原生Owner自己编辑）
从 `connectors/tdlib-json/src/native-tdjson.mjs` 导入 `nativeTDJsonController`，注入现有W47/W54已可信的`attestUserGesture`、`attestReadSession`及W24/W55/W25既有验证/事件回调；从 `src/native-telegram-auth-flow.mjs` 导入 `createW29TelegramAuthorizationPort` 并将以上owner方法接到**原W47 gateway**的真实同源GET/POST。W46只用**原有账户页**的点击事件和官方QR链接（使用现有成熟二维码渲染控件），不能增加第二个Telegram帐号页。与他人原生源码隔离，W29不越权修改。
需要现有W54/W47第一方可信session用于真人账号操作，但根据用户最高规则§2A不得让普通Web使用增加终端配对码/繁复认证。用户真正Telegram登录本身仍必须明确操作。W25独占发送和ACK，W24/W44独占真实K、epoch和Consent。

## 本机测试与验收边界
- 本轮C#已成功重新编译成Win64原生host，保持官方tdjson.dll SHA完全不变；新Host SHA与测试运行时manifest在本机独立W29 runtime记录，不将任何密钥、聊天数据或二进制提交GitHub。
- 同一实际Windows SDK在**未登录用户**时真实`td_execute`和原生`td_create_client_id/td_send/td_receive`回报`authorizationStateWaitTdlibParameters`、源version1.8.69，真实Worker可进程启动/停止。
- 本轮新增用户授权流程单测使用**显式模拟控制器**仅验证接口动作映射和拒绝；只有单独标记的实际Windows native test才是真正SDK回执，绝不把mock的tg://login样例冒充真实用户二维码。
- **由于用户没有亲自提交Telegram API ID/hash、手机号或扫码授权：真实二维码生成、用户本人登录、会话持久化重启、真实平台getMe/联系人/ACK未执行，仍`WAITING_USER_AUTH`。**
- **W47现有线上 /setup 仍是 `OFFICIAL_SETUP_REQUIRED` 文档回执；本W29 Owner源码完成不代表现有44767按钮已经联通。未拿W47/W46正式接口调用和真实Opera点击成功证据之前，Issue #77 Telegram 用户界面门禁继续`NOT_WIRED / HOLD`。**
- 无真人消息发送、无自动托管、无API费用、无旧账号恢复、无V1源码复用、无main/44751/44767发布。
- W29正式Owner CLEAN SHA和GitHub新Draft PR需以实际commit/push后同目录或交接评论的Git回读为准。

结论：`W29_REAL_NATIVE_AUTH_OWNER_INTERFACE_SOURCE_PASS` / `W29_OFFICIAL_SDK_OFFLINE_STATE_PASS` / `W47_USER_CLICK_BINDING_HOLD` / `REAL_TELEGRAM_ACCOUNT_WAITING_USER_AUTH`。
