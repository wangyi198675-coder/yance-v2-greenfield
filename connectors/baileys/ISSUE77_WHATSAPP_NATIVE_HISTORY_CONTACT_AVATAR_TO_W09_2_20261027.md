# W28 → W09-2｜2026-10-27 P0 WhatsApp真实联系人、原生历史、头像：Owner定点修复交接

规则：`docs/PROJECT_HIGHEST_EXECUTION_RULE.md`。只改原`connectors/baileys/**`，继承PR #80 / W09-2 PR #85真实`baileys@7.0.0-rc14`，不重做SDK/W25发送器/账号Vault，未经本人授权绝不扫码或真人收发。

## 本轮源码已修改（不是已部署）
- `native-worker.mjs`：把原`messaging-history.set`的`contacts[] + chats[] + messages[]`全部消费；只对W24已核验或由**现有W24生命周期接口**正式绑定成功的Peer处理。联系人原生事件经可注入`identity.bindObservedPeer`、`identity.recordVerifiedPeer`真实落原W24存储才计持久回执，不新建W28联系人DB；仅内存Set不得冒充永久保存。
- 在W24**已有**用户同意读取历史后，授权结果须传`historyReadApproved:true`，W28才允许原Baileys Socket `syncFullHistory:true`请求上游支持的历史。未授权仍false，不擅自读取旧聊天。
- 历史入站/已发消息按原生`key.id`/remoteJid/真实fromMe/方向/timestamp/文本或媒介类别、`syncType`/`chunkOrder`、W24 5-part K，交原W25独占`inbound.acceptHistory`。W28不调用`sendMessage`、不私建Message数据库、不把历史已发消息误判为新入站或ACK。不信任在内存批次里自行去重：必须由W25现有事务按K+MID/方向去重。缺失或拒绝W25存储时`HOLD_W25_HISTORY_IMPORT`，不能声称历史已恢复。
- 实际 SDK 历史事件可能早于W24自有JID/LID完成核验：仅对已批准历史授权最多缓存8批、每批至多300条；等待本次账号核验后按顺序提交原W25。溢出保留`HOLD_EARLY_HISTORY_OVERFLOW`而不假报完全恢复。来自原Baileys的`messaging-history.status`只报告官方进度，绝不把它冒充W25数据库持久化完成。
- 头像：`worker.readAvatar({remoteJid})`必须同一在线SDK、当前W24真实账户/Peer、`avatarReadApproved:true`，调用原Baileys的`sock.profilePictureUrl(jid,'preview',5000)`，返回前再次校验同一绑定/撤权；只认可HTTPS官方whatsapp.net域，未授权或无头像不伪造。
- 原W28 `createBaileysNativeSetupController.readAvatar`通过既有W54原生session验权；`createBaileysNativeSetupHttpHandler`可供**原W47挂载**新`GET /api/v2/providers/whatsapp-personal/native/avatar?remoteJid=<urlencoded>`，不提供第二服务器、页面或账号登录系统。
- 本轮测试`native-history-avatar.test.mjs`和原HTTP测试验证W25双向历史事件、原生来源、联系人W24回执、头像跨账号、失效权限、历史没授权、缺W25接口提前失败、SDK批次越界保持HOLD和无session HTTP。Windows Node24、原`npm ci`依赖未变，`npm test` **56/56 PASS**。模拟账号及历史均是隔离fixture，**无真实社交登录**。

## 仍待真正跨Owner接线（禁止报USER_DELIVERED）
1. W25原有`services/api/src/domains/message-delivery/native-channel-owners.mjs`仅公开`baileys.acceptInbound`和`recordReceipt`；W25现有`native-inbound.mjs`仅原入站，不存在历史**双向**`acceptHistory`。**W25原Owner必须最小扩展原持久MessageDelivery历史导入口**：严格校验W24当前账号/Peer/Consent、原SDK事件真实性、fromMe、唯一MID、时间、双向旧消息、重启可见，返回`{persisted:true}`或`{duplicate:true}`。不得复用`acceptInbound`写旧已发送或建第二发送器。
2. W24原Owner把已有`createW24OfficialAccountLifecycle.bindApprovedPeer/readApprovedPeer`及W44真实授权映射成上述W28 `identity.bindObservedPeer`、`recordVerifiedPeer`；W47将既有W24读取联系人原接口挂回`GET /api/v2/contacts`。W24授权来自用户既有真实账号/读消息许可，**不新增逐条审批或终端配对**。
3. W47原网关加载W28当前`createBaileysNativeSetupHttpHandler`及新avatar动作，已存在原W54本机session/原W55保护Signal登录，W46原B+C联系人真实头像与已有时间线消费同一W24/W25身份，不在W28新建UI。
4. W09-2只合当前源Owner本次差异到最新运行PR #85，使用固定44767真实Web、API、Opera/Chrome逐按钮验证：用户扫码→真账号JID→联系人和头像→双向历史→刷新/重启持久化→撤权/跨账号隔离；真实授权未到时状态保持WAITING_USER_AUTH，禁止伪造在线、数据及实际发送。

## 固定44767原样实测（本轮只读）
- `GET /version.json` HTTP200：`source_sha=7d63a4a764e9a5e9647865a00f48f692318226cb`（**Web**），`api_source_sha=89a6594596122d80f541a204d93a535aa0889229`（**API**），不同源，请W09-2分别核验。
- `GET /api/v2/runtime/health` HTTP200、`runtimeSha=89a6594596122d80f541a204d93a535aa0889229`、`trustedSession:false`、`countsAuthoritative:false`。
- `GET /api/v2/providers/whatsapp-personal/native/status` **404**；`GET /api/v2/providers/whatsapp-personal/native/avatar?... ` **404**。本次W28原生SDK与HTTP代码尚未由W47发布到用户固定地址。
- `GET /api/v2/contacts` **401**、`GET /api/v2/messages` **401**（无可信本机用户会话的真实返回，不能声称已经读到真人数据，也不等于已经证明底层接口有Bug）。
- W28无WhatsApp账号扫码、无真实用户联系人/头像、无真人消息/收费调用。合并/CI和真实浏览器验收请以最新HEAD复验，不能引用旧W28 44测试结果冒充用户验收。

**交付级别：W28_NATIVE_HISTORY_AVATAR_OWNER_SOURCE_PASS（待独立复核）；W25_HISTORY_PERSISTENCE_PORT_HOLD / W24_CONTACT_OWNER_BIND_HOLD / W47_WEB_NATIVE_ROUTE_404 / W46_VISIBLE_AVATAR_HISTORY_HOLD / USER_WHATSAPP_WAITING_USER_AUTH / NO_DEPLOY。**

## GitHub正式CI触发后的真实W28竞态定点修复（非改测试掩盖失败）

第一轮准确PR #80原HEAD `922b8172dd6e599ef25c903071af37dde8ca337d` Actions run `40436484216` completed/failure。已读取GitHub `native-node-contracts` job `121966238954`真实日志：依赖实际加载正常，唯一已证失败是上游QR事件变为可用后，`qrcode.toDataURL`尚在异步渲染，初次GET `readQr` 抛出`SDK_QR_NOT_AVAILABLE`。这是授权界面真实竞态，不是缺Baileys包。只在原W28 `native-authorization-setup.mjs` 的QR读取动作加入最长500ms的受限等待：**仅**SDK `WAITING_QR_SCAN && qrAvailable`时等待真实PNG内存回调；无SDK二维码立即拒绝，过期/撤权/跨Principal仍阻断，不生成模拟码。新增原测试`native-authorization-setup.test.mjs`的立即读取正向回归，Windows完整`npm test` 56/56 PASS、0 FAIL。正式CI仅以新提交真实run为准，未通过不得报告CI绿。
