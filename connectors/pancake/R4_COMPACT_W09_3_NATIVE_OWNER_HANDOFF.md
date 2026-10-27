# W27 → W09-3｜2026-10-27 用户确认 R4 Compact V1｜FB_PAGE Pancake 原生数据薄接缝

## 用户确认的新设计入口

依据 Windows **原始本地文件**（不是旧演示图或UI占位）：

- `COORD_AGGREGATE/DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md`
- `01_USER_APPROVED_CHANGELOG.md`
- `YANCE_CONTACT_SIDEBAR_DESIGN_SPEC_20261027.md`

用户已确认：聊天区+菜单/账户设置发起连接，不长期显示技术工作台；未授权时“连接账号”作为真实操作，不制造Contacts/消息/未读数；40px头像、W24当前同一K、原唯一Composer/W25 Outbox与Agno不变。W46负责Compact视觉和Vue行为，W47负责HTTP/本机Session/原生注入，**W27只负责Facebook Page/Pancake官方API读取和W24严格关联**。

## 现成 SDK/服务与不可重做之项

- Pancake正式生产是托管SaaS，**不是公开Pancake Messenger核心源码可本机安装的开源SDK**。实际公开接口是`https://pages.fm`的REST及Webhook。原`official-rest.mjs`的Pancake HTTPS GET授权/分页/消息、`official-inbound.mjs`的已认证Rest回读、`native-authorization.mjs`的用户点击/官方登录和W55原生凭据录入Port、`official-avatar.mjs`已存在，**本轮没有重写这些模块，也没有读取账号旧Key**。
- 受控Chatwoot Cloud保持只读备用：`chatwoot-cloud-readonly.mjs`。没有第二Sender或自动主备切换。
- 新增**唯一薄胶水** `r4-native-page-read.mjs` 及对应测试；不额外编写任何Page存储、W25 History/SDK、登录窗口、UI组件。

## 可以直接调用的原生入口

```js
import {createPancakeNativeR4ReadPort} from './connectors/pancake/r4-native-page-read.mjs';
import {createPancakeOfficialRest} from './connectors/pancake/official-rest.mjs';
import {createOfficialPancakeAvatarResolver} from './connectors/pancake/official-avatar.mjs';
import {createW27FacebookPageActionPort,
  createFacebookPageNativeAuthorization,createChatwootStandbyAuthorization}
  from './connectors/pancake/native-authorization.mjs';

// W47/W54真正 Native Session、W24现有当前Account/Peer/K来源，
// W55保护的短期本人重新录入 Token 租约由原Owner注入，无外部浏览器自报身份。
const rest=createPancakeOfficialRest({
 resolveTrustedSession,resolveChannelBinding,credentialLease
});
const avatar=createOfficialPancakeAvatarResolver({
 resolveTrustedNativeSession,resolveCurrentW24PagePeer
});
const w27=createPancakeNativeR4ReadPort({
 resolveCurrentW24Page, // 不可用HTTP传来的字符串替代，当前W24+W54核验Page、epoch
 pancakeRest:rest,
 resolveCurrentW24Peer, // 同一当前W24 K、Page-scoped PSID、Consent、revision
 readPageAvatar:({pageId,psid})=>avatar.readAuthorizedAvatar({pageId,psid}),
 acceptHistoryToW25 // Optional: W25 原Owner还没有已签接缝时传null
});
await w27.accountStatus();
await w27.readContacts({since,until,pageNumber:1,pageSize:50});
await w27.readInboxConversations({lastConversationId});
await w27.readHistory({pageScopedPsid,currentCount:0});
await w27.readAvatar({pageScopedPsid});
await w27.persistHistoryToOriginalW25({pageScopedPsid});
```

以前已经实现的`createW27FacebookPageActionPort().invoke`用户授权操作无需修改：

| 责任 | 原调用 | R4显示层需求 |
|---|---|---|
| 本人点击连接 | `PANCAKE START` | 必须真W54本人click证明，打开Pancake官网、启动W55受保护输入，不展示长期技术工作台 |
| 已授权Page选择 | `PANCAKE PAGES / BIND` | 官方GET Page、本人选择、W24写入有效Account及Meta Page归属与回读 |
| 连接状态 | `PANCAKE STATUS / REFRESH` + `w27.accountStatus()` | **区分** WAITING_USER_AUTH / PAGE_API_CONNECTED_READ_ONLY / PROVIDER_UNAVAILABLE / REVOKED；Page REST成功不等于已验证Messenger ONLINE；未达到W24+W54+Meta真人证明绝不显示ONLINE |
| 撤权与重连 | `PANCAKE REVOKE / RECONNECT` | 先原W24失效再W55清理，重连必须本人再次登录/输入新Token，绝不恢复旧账号 |
| Chatwoot受控备用 | `CHATWOOT_CLOUD START/BIND/STATUS/REVOKE/RECONNECT` | 仅官方FB Page Inbox同Page路由合法时标STANDBY_READ_ONLY，未经W25 ownerEpoch/UNKNOWN资格绝不双活发送 |

## W27薄接缝返回的真实数据与必要拒绝

1. `accountStatus()`：用原W24当前Page绑定及Pancake受保护Page Token执行官方GET `/users`；只在签署Page/账号/Token且真实GET成功时报 `PAGE_API_CONNECTED_READ_ONLY`，不自称Meta ONLINE。缺授权`WAITING_USER_AUTH`；网络/服务故障`PROVIDER_UNAVAILABLE`，不误导用户重新登录。
2. `readContacts({since,until,pageNumber,pageSize})`：Pancake官方GET `/page_customers` 返回psid、customer_id、name；W27**只用该Page的psid定位**，逐条经同一W24真实签名Peer/K筛选，UI只得到原W24`accountRef/peerRef/bindingRevision/displayName/contactRef`，且返回前逐人重验撤权；`customer_id`全局ID、未经W24验证的供应商姓名/客户地址、token均不向UI泄露，也不以`can_inbox`增加发送权。
3. `readInboxConversations`：从官方v2只读INBOX会话；OpenAPI明定INBOX的`conversation.id`即PSID（COMMENT与LIVESTREAM不是私人聊天），逐条W24绑定，返回真实snippet、seen、timestamp、contactRef。**unreadCount:null**（`seen`布尔不是精准未读计数）；不制造置顶/标签/归档数据。
4. `readHistory({pageScopedPsid})`：先W24核验Page与该PSID绑定，用官方REST读取其Inbox线程；逐条核验conversationId和Page、发送者是已验证PSID还是当前Page（可能存在供应商员工UUID等不确定方向时不纳入），输出真实`providerMid, original_message, direction, fromMe, attachmentMetadata`和原W24`identityKey`。移除/隐藏或重复MID不进入；**providerMID不冒充Meta MID**，不把供应商富文本HTML当HTML渲染。未知/未证明的消息保守跳过，不可声称历史100%完整。
5. `persistHistoryToOriginalW25`：**只有原W25提供签署的`acceptHistoryToW25({channel,provider,accountRef,channelAccountId,peerRef,bindingRevision,identityKey,source,messages})`，并返回`{accepted:true,receiptId}`时**调用。没有该正式端口返回503 `W25_ORIGINAL_ACCEPT_HISTORY_PORT_MISSING`，不建自己的数据库、不复制W25不可逆发送。W25自己仍需验证有效K、去重、同联系人MID及重启恢复/撤权。
6. `readAvatar({pageScopedPsid})`：复用既有W27正式头像只读Resolver（官方Pancake GET→301`content.pancake.vn`），前后重验W24 Page/Peer，失败返回NO_AVATAR由W46默认字母/占位，不凭PSID直接绕过W24检索。

### W24精确最小注入返回契约

`resolveCurrentW24Page()`只能从可信本地原生上下文返回：

```js
{channel:'FB_PAGE',provider:'PANCAKE',status:'ACTIVE',
 verifiedByW24:true,verifiedByNativeSession:true,principalId,accountRef,
 channelAccountId,pancakePageId,metaPageId,bindingRevision,
 accountRevocationEpoch,consentEpoch}
```

`resolveCurrentW24Peer({channel,provider,principalId,channelAccountId,
 accountRef,metaPageId,pancakePageId,pageScopedPsid,bindingRevision,
 accountRevocationEpoch,consentEpoch})`返回：

```js
{verifiedByW24:true,consentCurrent:true,revoked:false,
 channel:'FB_PAGE',provider:'PANCAKE',principalId,accountRef,channelAccountId,
 pancakePageId,metaPageId,pageScopedPsid,bindingRevision,
 accountRevocationEpoch,consentEpoch,canonicalK,peerRef,displayName}
```

**上述只是 W27 所需要的最小消费 DTO，不得伪装为原W24已支持同名函数。** W24原`createW24OfficialAccountLifecycle`需要当前Meta Page管理员归属、可信原生Session及W44事务Commit；W47/W24 Owner必须把现有真实签署结果映射为此DTO。没有真实社交凭据、Page管理员权属与W24/W54/WinCred proof时必须返回拒绝、不可伪造绑定。

## Windows实机回读与安全状态

在 DESKTOP-029FH47 读取`http://127.0.0.1:44767/version.json`：当前Web/API `5e890fb0b14437f0c35324f4a30c42edc831a183`，`trustedSession:false`。健康接口仍`connectedAccountCount:null,countsAuthoritative:false,realContacts:null,canSend:false`，`/api/v2/providers/fb-page/setup`仍只返回 `OFFICIAL_SETUP_REQUIRED`与`https://pages.fm/`，未接W27用户点击ActionPort。`fb-page/status`未经Session真实 HTTP401。**因此本机没有用户已授权的真实Page身份/Peer/头像/历史MID回执**，测试mock不得当成本人登录。
- 无真实用户Page Token，不调用其真实`/page_customers`、`/messages`，不读取真实人头像或任何旧Token，不触发出站。
- 本轮仍保持Pancake主、Chatwoot受控备用、不改变已确认R4页面UI、正式44751。
- W27提交只修改`connectors/pancake/**`，保留原95项合同/安全负例，新测试验证官方数据+W24关联、撤权与W25历史接缝。**SOURCE_PASS 不等于 USER_DELIVERED。**

## W09-3下一步不可重复开发的Owner分工

W47：现有`/setup`消费已完成的W27 ActionPort（不用新登录/另造Iframe）；本机认证、source-of-truth W24 Peer+Page与REST只读接口注册；W46：R4菜单“连接账号”调用该原生接口而不是纯说明链接，普通列表使用经过W24证明的Contact、Avatar、历史（拒绝伪造unread=0）；W55：合法W55本机受保护社交User+Page Token录入、epoch隔离与撤权；W24：当Page本人签约/Token审核后原生Page+PSID/currentK原子写入与读回；W25：真实`acceptHistory`持久接口仍HOLD，必须由原Owner加，不允许W27替其实现。W09-3负责整合源码、CI与固定44767受控更新、Opera/Chrome真实本人账号验收，不因“模拟测试PASS”自动发布。

**当前唯一外部用户步骤（只在安全录入入口可用后进行）**：本人从Pancake Page设置→Tools创建/使用本人Page Token，并在W55原生凭据窗口录入。用户以前已经撤销的旧账号/Token不得恢复或读取，不能在ChatGPT聊天中索取Token。
