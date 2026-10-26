# W28 → W09-2｜Issue #77 WhatsApp Baileys Native Authorization OWNER ACK

Date: 2026-10-27. Owner: W28, ONLY `connectors/baileys/**`. This is incremental to existing genuine `baileys@7.0.0-rc14` and original `native-worker.mjs` from #62; **no reimplementation, no synthetic replacement, no W46/W47 edits**. No account login, QR scan or actual send occurred.

## Current W28 native authorization entrypoint (not yet mounted by W47)

- Factory: `createBaileysNativeSetupController({createWorker,verifyNativeSession})` exported by `native-authorization-setup.mjs`.
- Inject original Owner worker using `createWorker: observed => createNativeBaileysWorker({authorization,authStore,identity,inbound,observed})`. Do not instantiate two SDK sockets for a single signed ChannelAccount. `observed.onQr` is emitted by **real Baileys `connection.update.qr`** only, then `createBaileysPairingViewPort` renders it with pinned open-source `qrcode`; there is NO generated/sample QR in production code.
- `verifyNativeSession({nativeSession,operation,channel:'WHATSAPP_PERSONAL'})` must verify a **server-derived current W54 first-party native session** each call, returning `{verified:true,kind:'NATIVE_FIRST_PARTY',principalRef,installationRef,sessionRef,revocationGeneration}`. The original W47 resolver, not a browser-supplied header or request body, owns this.
- Methods: `readStatus({nativeSession})`, `beginPairing({nativeSession,accountLocator})`, `readQr({nativeSession})`, `disconnect({nativeSession})`, `revoke({nativeSession})`, `reconnect({nativeSession,accountLocator})`.
- Binding: W24/W44 `authorization.authorizeStart({userAction,accountLocator})` must issue verified principal/grant/consent/expected `tenantId,accountId,bindingRevision,accountRevocationEpoch` and `platformPermitted,userConsented,principalVerified` from original Owner signed proof. For first enrollment, use `enrollmentApproved:true` while `accountVerified:false` until actual SDK open and W24 verifies native self JID/LID. For reconnect, BOTH `restoreApproved:true` and `accountVerified:true` are mandatory. The original Owner must forbid old removed accounts. Actual `identity.resolveAccount` is verified **after** SDK `connection='open'` before `ONLINE`.
- W55 native protected Signal auth `authStore.open({binding,userAction})` must return persistent encrypted/Baileys-compatible `{state:{creds,keys:{get,set}},saveCreds}`, and `authStore.revoke({binding})` must destroy current protected account keys/reconnect grants. W28 does NOT store keys, plaintext session or `useMultiFileAuthState`.
- `revoke` immediately fences Worker, including concurrent `authorizeStart` and attempts after previous `disconnect`; no same-instance reconnect after revoke. `disconnect` clears QR and socket, preserves only a non-secret account binding reference so a later authenticated user **can still revoke** the existing protected keys. Cold restart always `WAITING_USER_AUTH`; explicit W47/W24/W55 approval required before new Socket.
- `readStatus` returns `state:WAITING_USER_AUTH/STARTING_NATIVE_SDK/WAITING_QR_SCAN/ONLINE/HOLD_IDENTITY/DISCONNECTED/REVOKED` based on real SDK events and current W24 eligibility; `account` with true native self JID/LID, ChannelAccount, revision and account epoch ONLY after native `open` + W24 account proof. Every response `canSend:false`; W25 sole Outbox and Send authority.
- `readQr` returns short-lived in-memory `imageDataUrl,expiresAt,generation`, ONLY when original SDK produced its native QR and current W54 principal/renderer agrees. Returns `SDK_QR_NOT_AVAILABLE` before SDK event, after expiry, disconnect or revoke. No fake data and no QR in status/log/files.

### Ready-to-mount ORIGINAL W47 HTTP adapter (not a new server)

`createBaileysNativeSetupHttpHandler({controller,resolveSignedNativeSession})` from `native-authorization-http.mjs`, with the existing W47 `req/res/url` interface; no `createServer()`, no new port, auth system or UI. **W47 must explicitly mount it** after its current first-party signed Session, Host/Origin/Same-Site/CSRF protections. `resolveSignedNativeSession({request,operation})` must return `{nativeSession,originVerified:true,csrfVerified:true,rendererVerified:true}` based on W47/W54 native server checks (not browser headers).

| Operation | W47-route to mount | Result |
| --- | --- | --- |
| GET current | `/api/v2/providers/whatsapp-personal/native/status` | Actual SDK status; no authenticated account => `WAITING_USER_AUTH`, `canSend:false` |
| POST connect button | `/api/v2/providers/whatsapp-personal/native/authorize` body `{accountLocator}` | W24 approved first enrollment → calls ORIGINAL Baileys `makeWASocket`; status `STARTING_NATIVE_SDK`, no fake QR |
| GET QR | `/api/v2/providers/whatsapp-personal/native/qr` | Actual native QR PNG only when real SDK emitted `connection.update.qr`, otherwise 409 |
| POST disconnect | `/api/v2/providers/whatsapp-personal/native/disconnect` | Close socket, preserve protected account for explicit future reconnect/revoke |
| POST revoke | `/api/v2/providers/whatsapp-personal/native/revoke` | Fence then W55 secret revoke, no auto recovery |
| POST reconnect | `/api/v2/providers/whatsapp-personal/native/reconnect` body `{accountLocator}` | Only signed explicit resume + W24 binding + W55 existing protected authority |

All responses are no-store JSON, fail closed without correct native W54 session, origin/CSRF/renderer proof and no user-supplied `authorized`, `principal`, `cookie` or `QR` accepted in body. The original W46 Accounts pane must call these six W47-mounted routes with user click/first-party session; W28 neither modifies W46/W47 nor claims existing `GET /setup` is a working native pairing route.

## Windows real tests and scope

- Actual installed Node 24.18.0, npm 11.16.0: `npm ci --ignore-scripts --no-audit --no-fund` passes with retained `package-lock.json` and official Baileys 7.0.0-rc14.
- `npm test`: **44 PASS, 0 FAIL** after explicit new real loopback route semantics and SourceSDK-injected Socket/event tests; original 16 fake regressions preserved. Includes: signed session and cross-principal/epoch checks, raw native SDK QR only, verifier-based JID/LID identity after open, cold restart with denied implicit resume, disconnect then revoke protected session, concurrent revoke during `authorizeStart` (zero sockets), second click cannot orphan QR, real HTTP GET/POST body and no-session denials.
- `node sdk-smoke.mjs` real module import = `realSdkModuleLoaded:true;realSocketOpened:false;realAccountConnected:false;state:WAITING_USER_AUTH;canSend:false`. **These tests are deterministic offline SDK/port tests**; they do not establish a platform connection, true QR, user-visible UI or actual account revocation from W55.

## W09-2 / W47 exact join, non-overlapping Owner work

W09-2 may import these W28 exports after independent W28 source review; only W47 mounts the handler and selects original trusted session+CSRF authorizer. Only W46 mounts existing Accounts click/QR renderer. W55 must implement/reuse a genuinely secure persisted Signal KeyStore; W24+W44 bind signed local Principal, legal account enrollment, live K/Peer and revocation epoch; W25 exclusively sends/settles native ACK and enforces PRE_NETWORK. No duplicate backend, Vault, Outbox or UI.

**Remaining**: actual WhatsApp/Meta platform legal permission; user's explicit new account pairing; W47+W54 actual first-party session mapping; W55 real protected Baileys mutable Signal store; W24+W44 current Principal/ChannelAccount/Peer proof; W47 route mount/W46 click; live Baileys Socket/QR/JID/LID/restart/ACK readback and independent SEC. No authority to restore removed accounts, send messages, turn on managed replies or overwrite 44767/44751.

**Status: `W28_NATIVE_SETUP_SOURCE_PASS` candidate / `REAL_USER_PAIRING_WAITING_USER_AUTH` / `W47_W46_MOUNT_HOLD` / `PROVIDER_AUTH_BINDING_HOLD` / `NO_DEPLOY`.** Avoid calling actual UI/online `USER_DELIVERED`.

## 2026-10-27｜P0纠偏：联系人、历史消息、WhatsApp头像实际未闭环（W09-2必须纳入最新发布门禁）

**本次仅源码与固定44767真实HTTP只读核验，未触碰用户账号/凭据/旧版/真人发送。W28自身实际逻辑基线：`dfcc1fc910b77fa6728bdc763b9c9849111589eb`（本条为报告补充，不是新功能代码）。**

### 实际核验证据：三项均非 USER_DELIVERED

| 能力 | 当前状态 | 精确依据 |
| --- | --- | --- |
| 真人联系人及Peer列表 | **P0 HOLD / NOT_WIRED** | W28 `native-worker.mjs` 在 `contacts.upsert/update`、`chats.upsert/update`、`messaging-history.set` 中仅执行 `identity.resolvePeer` 并将通过的Peer加入**内存** `verifiedContacts` Set/计数；没有持久联系人、W24绑定创建或服务端可读联系人列表；`W24`原Owner已设计真实账号/Peer生命周期，但没有合法社交账号/W44真实登记完成与44767同源接线证据。 |
| 历史聊天消息与重启恢复 | **P0 HOLD / FUNCTIONAL GAP** | 真实安装 `baileys@7.0.0-rc14` 的 `node_modules/baileys/lib/Types/Events.d.ts` 明确官方 `messaging-history.set` 包含 `chats:Chat[]`、`contacts:Contact[]`、`messages:WAMessage[]`，可附 `syncType/progress/chunkOrder`；但W28源码**只遍历 `payload.contacts` 然后 return，完全忽略 `payload.messages/chats`**。Socket初始化为 `syncFullHistory:false`；这不是全量历史同步已完成的证明。另有 `messages.upsert` 处理**新入站**消息并转给注入的 `W25.inbound.acceptInbound`，不能冒充历史补录或数据库持久化/时间线恢复。 |
| WhatsApp真实头像 | **P0 HOLD / NOT_IMPLEMENTED** | 实际上游 `node_modules/baileys/lib/Socket/chats.d.ts` 定义 `profilePictureUrl(jid,type?,timeoutMs?)`，但W28 `native-worker.mjs` **未调用此官方接口、没有头像来源/过期/隐私/撤权/跨账号只读Port**；现存W46 `BCLiveChatWorkspace.vue`联系人与聊天标题都用 `displayName.slice(0,1)` 首字代替照片，不是平台头像。W27 FB Page另有头像候选PR #83，不能代签 WhatsApp。 |
| 登录 → 网关 → UI | **P0 HOLD / NOT_WIRED** | 对用户固定`http://127.0.0.1:44767`实际GET：`/api/v2/runtime/health` 200 `runtimeSha:82de109abad35a1595ef5333d8beff0629b13211`，`trustedSession:false`、`countsAuthoritative:false`、`canSend:false`；`/api/v2/providers/whatsapp-personal/setup` 200但`nextAction:OFFICIAL_SETUP_REQUIRED`；W28新`/api/v2/providers/whatsapp-personal/native/status` **404**；`/api/v2/contacts` **401**、`/api/v2/messages` **401**（当前无合法会话，不能把401算作功能损坏或真实数据已加载）。 |

### W28必须自行补齐的最小原生接口（新的P0 Owner行动项，非仅等扫码）

1. **原Baileys上游历史事件真正接入**：复用`messaging-history.set`官方`messages[]/chats[]/contacts[]`及`messaging-history.status`，区分“首次同步/增量/历史尚不完整/明确结束”；保留精确platform MID/remoteJid/timestamp/fromMe/direction/media类型、`syncType/chunkOrder`、账号/Peer及W24授权来源；不能丢历史消息，也不能简单将`syncFullHistory`改成true就谎称恢复全部记录，须依上游真实支持和用户许可、实际导入回读验收。
2. **联系人账户隔离**：W28仅提供经过W24当前ChannelAccount/Peer核验的真实联系人的原生事件/身份/更新时间Port；W24/W44处理持久K/Consent/epoch及联系人库，W28不能自建一套数据库或借fake IDs。W47读取授权联系人必须返回同一当前原生身份，不得用内存count替代。
3. **官方真实头像读口**：仅在同一W54签名会话、W24合法实际Peer、未撤权当前epoch下，由Baileys官方`sock.profilePictureUrl(verifiedPeerJid,'preview')`安全按需只读；禁止猜测URL、日志/外传个人头像；无图/403、失效/跨账号时清除/回退。对应头像缓存、服务端返回/安全代理和W46现有头像显示按原Owner边界接入。
4. **W25唯一时间线**：W28向W25已有真实授权入口提供历史与增量的去重所需 `(tenant, account, WHATSAPP_PERSONAL, peer_id, binding_revision, providerMid)` 与时间戳/方向/媒介；W25原Owner负责事务落盘、历史幂等、重启恢复、晚到ACK/UNKNOWN和PRE_NETWORK，不得新建第二套消息存储/发送系统。
5. **权限与验收**：W09-2联合W24/W25/W46/W47/W55在固定44767形成“用户本人合法扫码→官方账号SELF JID/LID身份→真实联系人列表→历史双向消息按MID顺序→原头像→刷新/冷启动恢复→多账号撤权隔离”的实际浏览器+DB回读。未获得用户账号时，在可完成的离线Owner接口/真实SDK注入测试之外，标`WAITING_USER_AUTH`，**不得宣称ONLINE或联系人/头像/历史已恢复**。

### 原Owner签署/发布阻断

- W28已有Issue #77源码PR #80 SHA`dfcc1fc910b77fa6728bdc763b9c9849111589eb`（原生授权/扫码/状态/撤权）本机44/44离线测试通过，**不包含上述历史和头像闭环**。Github正式run `40389404114`仍为FAIL，W30依赖安装修复子PR #64的结果不能替代#80。
- W24相关Owner已有真实Peer生命周期源码/测试但未证明44767真人Peer；W25、W46、W47、W55原Owner必须按准确现有接口独立接线并反馈SHA。W28不改其源码，W09-2负责最终真实发布和44767验收，不触碰44751。
- **发布结论**：`WHATSAPP_CONTACTS_P0_RED / WHATSAPP_HISTORY_P0_RED / WHATSAPP_AVATAR_P0_RED / REAL_PAIRING_WEB404 / WEB44767_USER_UAT_HOLD / NO_DEPLOY / WAITING_USER_AUTH`。这是对旧报告的强制纠偏，覆盖任何仅凭Socket/SDK import、44项离线测试便声称联系人/历史/头像闭环的旧说法。
