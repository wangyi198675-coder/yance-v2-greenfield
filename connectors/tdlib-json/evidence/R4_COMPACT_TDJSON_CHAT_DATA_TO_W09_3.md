# W29 → W09-3｜2026-10-27 新R4紧凑聊天设计｜Telegram TDLib JSON原生聊天数据最小Port

## 设计权威及执行范围
- 已严格依次读取 DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md、01_USER_APPROVED_CHANGELOG.md、YANCE_CONTACT_SIDEBAR_DESIGN_SPEC_20261027.md，以及W09-3实施派工。
- 最新认可：聊天区两行Smart Inbox、＋连接社交账号、菜单/账号设置授权，不再常驻技术性授权工作台。现有W46负责Vue展现，W47负责原同源API/W54授权接线。W29只改 connectors/tdlib-json/**。
- 不复刻V1，不重新造SDK/账号库/第二Sender。保留原Issue #61/#77官方TDLib 1.8.69实现、手机号/官方QR/验证码/2FA/退出授权入口及授权负例。

## 真实SDK及源码范围
- 上游官方: https://github.com/tdlib/td.git, 1.8.69, pinned Git SHA ea3f69ce11aef458bfbb09869b809ede4447486f，BSL-1.0。
- 实际Windows x64官方 tdjson.dll SHA256 ae286549e2abc071acf67a3423468e8a5a8b488b4cdc368d6f203b2bf1d355e0；本轮重新编译W29 TDJsonHost.exe SHA256 863989aeb5cf35eb9724b055563581319f7d37b8ca3fa65a57387513c0776f32，其他运行依赖完整SHA在runtime/tdjson-native-manifest.json（不提交二进制/任何密钥到Git）。
- 在独立 W29_R4_COMPACT_TDJSON_DATA_20261027 worktree，原W29 Issue #77 SHA a5adc290f6ca9410a62cd28ec45dfb3cec0167f2 上仅对W29文件增量开发。
- native/TDJsonHost.cs 只增加官方 getMessage/getUserProfilePhotos/getFile/downloadFile 读取白名单及未授权拒绝；原td_create_client_id/td_send/td_receive/td_execute、token/授权事件无改造。
- src/native-tdjson.mjs 原生requestRead({sessionHandle,query}): TDLib唯一worker + @extra 精确请求关联，W47受信本机会话读取前后两次检查，真实授权后才能读取；撤销、进程关闭、超时中断未完成读取；禁止任何sendMessage/新增IPC监听。

## W47 API＋W24/W25唯一原生接线Ports
从 src/native-telegram-chat-data.mjs 导入 createW29TelegramChatDataPort({
  controller, verifyW24Account, verifyW24Peer, verifyW24Contact,
  onW25HistoryBatch, onW47AvatarFile
})。controller 为原nativeTDJsonController实例（先复用 src/native-telegram-auth-flow.mjs的user-click连接/real auth）；所有回调由相应原Owner提供。禁止将浏览器自述的account/peer或未验证的路径当权限。
- listChats({sessionHandle,limit=40})：官方getChats(chatListMain)＋getChat；仅返回W24验证的现有K，真实unread_count，真实Telegram聊天ID、标题、last MID、avatarAvailable。不能构造假的未读/置顶/归档或跨渠道同名合并。未知Peer必须交原W24完成合法用户账号绑定，而不是W29生成第二套K。
- listContacts({sessionHandle})：官方getContacts/getUser；需W24当前账号CONTACTS同意及每个联系人K核验，仅公开姓名/用户ID/username及头像存在性，不输出phone_number、未授权好友或假数据。
- readHistory({sessionHandle,chatId,fromMessageId,limit})：官方getChatHistory，W24 HISTORY权限和同一个K，精确TDLib int53 MID。真实messages **只传给原W25 onW25HistoryBatch**，等其既有acceptHistory持久幂等ACK（accepted:true）后才返回deliveredToW25；W29不建历史DB、不代替W25清理/dedupe。
- readChatAvatar({sessionHandle,chatId,requestDownload})：官方getChat.photo.small，明确用户请求时仅用官方downloadFile同步等待实际下载完成，再传本机TDLib file记录给原W47 onW47AvatarFile，返原有assetRef。未下载完返回HOLD；不能编造图片URL或向浏览器泄露原生TDLib本地路径。
- 原W24/44撤权立即使新读失败，异步结果回读前必须二次检查原W47会话和账号ID。W25仍独占所有真人发送/ACK；此Port没有任何sendMessage路径。

## 实际Windows运行证据（不是假账号）
- 本机实际HTTP读回 http://127.0.0.1:44767/version.json 当前Web/API SHA都为5e890fb0b14437f0c35324f4a30c42edc831a183，canSend=false,trustedSession=false；该运行站点尚未部署本W29源码。
- TDJsonHost.exe --probe：真实官方 td_execute 调用成功退出0；--probe-state：官方TDLib真实authorizationStateWaitTdlibParameters，未提供任何账户API Key、手机号、扫码或旧会话。
- Windows真实TDLib worker禁止未登录帐号的5种私人SDK操作：getChats、getChatHistory、getContacts、getUserProfilePhotos、downloadFile，5/5正确拒绝且官方待授权状态回读；实际进程PID 37404一次记录，源码仅本地isolated运行。
- 运行YANCE_W29_EXPECT_NATIVE=1的定向原生＋Port测试共37/37 PASS，0 FAIL，0 SKIP；其中真正官方DLL/Worker/未授权拒绝为实机，W24/W25/W47授权后人员与历史DTO测试为明确Fixture，**非真人联系人、历史、头像或平台ACK**。

## W09-3唯一待集成和验收事项
1. W47原Owner：将原W29 Issue#77五方法授权Port接入现有同源已批准first-party账户API，供W46的聊天区＋和账号设置点击触发；没有真实用户操作仅返回WAITING_USER_AUTH。不要让未签真人身份的公共GET产生QR。
2. W24原Owner：用户真正官方getMe后的ChannelAccount、chatID/UserID→真实Peer K、binding_revision、撤权epoch及CONTACTS/HISTORY/AVATAR同意；未签不可显示未绑定联系人。
3. W25原Owner：原有acceptHistory(k,mid,fromMe...)持久接口/幂等结果，接onW25HistoryBatch；无有效原生历史接口时单独标 HISTORY_PERSISTENCE_HOLD，不能用W29临时Store。
4. W47原Owner：复用已有附件/媒体路径提供onW47AvatarFile、assetRef，只有SDK真实文件完成后才能返给W46头像；无Provider文件时标 AVATAR_SOURCE_HOLD。
5. W46原Owner：按已批准的R4两行Smart Inbox＋菜单/账号设置显示原生授权状态、平台联系人、历史与真正头像；禁用或隐藏未证实菜单项，无权威未读数不造0。
6. W09-3在独立集成分支接收准确W29 SHA、同44767受控Web/API更新后，真实Chrome/Opera按用户点击逐流程验收。未经用户同意不覆盖正式44751、不触发账号扫码/登录/发送或付费。

**真实产品分类：W29_SOURCE_PORT_PASS / OFFICIAL_WINDOWS_NATIVE_DLL_PASS / UNAUTHORIZED_SDK_NEGATIVE_PASS；W47_W46_44767_JOIN_HOLD；PERSONAL_TELEGRAM_LOGIN_WAITING_USER_AUTH；W24_REAL_PEER_AND_W25_HISTORY_HOLD；NO_SEND_NO_DEPLOY。**
