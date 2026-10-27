# W26 Facebook Personal｜R4批准Chat＋账号设置原生Port｜2026-10-27

**以R4新批准设计源为准**：`DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md` → `01_USER_APPROVED_CHANGELOG.md` → `YANCE_CONTACT_SIDEBAR_DESIGN_SPEC_20261027.md`。Owner范围严格限于 `connectors/mautrix-meta/native/**`。不改W46主UI、W47原API、W24身份DB或W25唯一历史/发送器。

## SDK和真实本机原生状态
- 官方 [mautrix/meta](https://github.com/mautrix/meta) **v0.2610.0 / v26.10**，上游Git `3c16226686c71af64df294df0803791685064e0b`，已下载真实二进制SHA256 `17b8fd89ee8bb71796b9406aad37fd871110efbb22ace26801034dab9c5a3843`；隔离WSL2中真实Bridge和官方Tuwunel Matrix Server服务仍需实时检查。
- 上游桥[bridgev2官方Provisioning v3定义](https://github.com/mautrix/go/blob/v0.32.0/bridgev2/matrix/provisioning.yaml) `GET /v3/whoami` 原生登录项有 `id/name/state{state_event,timestamp}/profile{name,username,avatar}/space_room`。本轮直接在W26映射这些已存在字段，**没有自研Facebook协议**。
- `GET http://127.0.0.1:29321/api/v2/providers/fb-personal/status` 仅提供公开、可核验的上游程序状态。**它的WAITING_USER_AUTH不能单独代表当前用户Account是否已授权**。私有账号必须依赖下列有效Matrix用户令牌和官方Bridge Whoami。
- `GET /api/v2/providers/fb-personal/setup`、`/connect`：W47在原R4菜单或账号设置通过已有可信当前用户操作提供；用户点击才运行上游官方mautrix-manager。普通用户主界面应在R4 Chat与设置内，不常驻技术授权工作台。账号真实密码/SSO/Cookie均由上游原生程序、用户本人处理。

## W47必须消费的原生真实只读端点
**所有私有接口仅限本机127.0.0.1:29321；Matrix Bearer只能留在W47本机受信native custody，不能塞进浏览器/网页query、log或前端。** 当前W26端口不签发W47 Principal或W24 K。

1. `GET /api/v2/providers/fb-personal/account/status` + `Authorization: Bearer <Matrix-native-user-token>`：W26先通过Tuwunel `/_matrix/client/v3/account/whoami`验证用户，再读取官方Bridge `/_matrix/provision/v3/whoami`。本轮补齐每个原生登录 `loginId,displayName,bridgeState,stateTimestamp,profile:{displayName,username,avatarMXC},matrixSpaceRoomId`；另有 `connectedCount`、`WAITING_USER_AUTH/UPSTREAM_CONNECTED_W24_BINDING_PENDING/UPSTREAM_NOT_CONNECTED`、`canSend:false`。**`loginId`仍是官方opaque桥登录ID，不能默认为Facebook UID**；`profile.avatarMXC`只来自上游profile.avatar，不能按用户名生成假头像。
2. `GET /api/v2/providers/fb-personal/peer/hints` + 同一有效Matrix Bearer：本轮新接官方SDK账号个人`space_room`并调用Tuwunel Matrix原生`GET /_matrix/client/v3/rooms/{spaceRoomId}/state`，只保留由固定官方Bridge bot发出的、格式合规的 `m.space.child` Matrix房间引用。**这仅是候选Matrix room IDs，不是Provider native peer ID，也没有完成W24 Peer归属证明。** 输出`realPeers:null,peerOwnershipVerified:false,candidateRoomIDsAreNotProviderPeerIDs:true,requireW24PeerProof:true,canSend:false`。无真实已连接账号返回 `WAITING_USER_AUTH` 且 `rooms:null/realPeers:null`；不可把未知冒充空联系人列表。
3. `GET /api/v2/providers/fb-personal/auth/flows`：仅认证后调用原官方`/_matrix/provision/v3/login/flows`；W46应由用户明确点击W47现有可信launch action开始官方Manager交互，不得自动登录。
4. `POST /api/v2/providers/fb-personal/auth/revoke`：原已存在的严格本人确认+逐账号归属检查+`W24/W44`预先持久化撤权epoch Port；本轮不重复实现DB。没有`authorizeDurableRevocation`，必须保持不可用。用户如在官方Manager直接Logout，W47/W24/W25必须从上游login状态失效触发W24撤权并在W25 PRE_NETWORK再验证；当前这条跨Owner事件通知尚**HOLD**。

## W24/W25/Ghost Avatar和历史的最小原生边界（不可冒称已接好）
- 上游 `mautrix-meta/pkg/connector/userinfo.go` 已通过 `GetContactsFullTask` 和 `wrapAvatar()` 获取原生用户资料/头像；Bridge提供Matrix ghost/portal，需由W24**独立验证**上游平台Peer ID/归属，把已证实关系签为唯一完整K `{tenant,account,channel,peer_id,binding_revision}`。W26 `peer/hints`只辅助房间交叉定位，不得授权或把Matrix room ID伪装原生Peer ID。
- 历史复用上游 `mautrix-meta/pkg/connector/history.go` / `login_history.go`（含Messenger加密历史PIN与Backfill）；**不复制历史、不读PIN或重造存储**。经W24当前READ_INBOUND同意后，W25既有唯一`acceptHistory(k,providerMID,fromMe,...)`接SDK回填、历史幂等、重启。W26本轮不实现第二套history DB。
- 头像资料来自已授权账号`profile.avatarMXC`，联系人ghost头像须由原SDK/Matrix原生事件经W24 K认证后投影；W47不能不经验证把任意MXC外链URL当联系人头像。
- W45中文翻译/W43 Agno同样由W47接在W24/W25已验证事件之后，W26不启动AI、不生成真人回复。**任何真人发送只经W25原唯一不可逆边界。**
- W47当前R4 `native-provider-gateway.mjs` 仅公开`/status`和`/setup`，还没有通过可信Native Principal映射私有Matrix Bearer到W26`/account/status`或`/peer/hints`。W09-3请分派**本文件精确Native Port接线**给W47/W24本人，不把UI样例当真授权。

## 安全与现实HOLD
- `REAL_FB_PERSONAL_USER_AUTH: WAITING_USER_AUTH`，原已撤销账号绝不能自动恢复或从旧V1复制cookie。
- `W47_NATIVE_CURRENT_USER_TO_MATRIX_OWNER_PROOF: HOLD`；`W24_VERIFIED_PLATFORM_PEER_AND_K: HOLD`；`W25_CANONICAL_HISTORY_READ/ACCEPT: HOLD`；`W46_R4_PLUS_MENU_AND_SETTINGS_REAL_CLICK: W46_OWNER_HOLD`；`AGPL/META_TERMS: LEGAL_HOLD`。
- 当前测试中的合成登录/空间数据只用于**安全契约负例**，不代表真实FB账号/联系人或历史成功。真实没有本人授权，`realPeers:null`、不发送真人消息、不可开启托管、不覆盖固定44767/44751。
