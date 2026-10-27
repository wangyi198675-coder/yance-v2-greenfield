# W24 → W09-2｜真实本机Principal / ChannelAccount / CONTACT可信上下文资格签收

**最终状态：NATIVE_AUTH_INTERFACE_HOLD**
**TRUSTED_CONTACT_CONTRACT_READY：未成立。**
日期：2026-10-26。授权Windows设备：`DESKTOP-029FH47`。仅私人开源言策V2，无真人社交账号接入、无登录、无发送、无付费模型、无main修改。

## 1. 准确基线与W09正式回执

首先阅读（原件）：
`C:\Users\1\Documents\YanceV2\Phase3_OSS_Worktrees_20261024\DISPATCH\P2_AUDIT_ONLY_20261024\COORD_AGGREGATE\W09_20261026_PR53_88DED_W47_W40_FINAL_DELTA_SIGNOFF_FORMAL_HOLD.md`。

- W09-2 PR53 nested Vue Head：`88ded0166ebbaa7556e347d2522efa063c19cf40`，本机 `Worktrees/W09_R4_OWNER_JOIN_20261025` 实核一致。
- W09-2 PR32 当前隔离集成：`0423d7d347c2538e8ca9804dca1c2fc2baf1760b`，未改动。
- W24本轮开始的原生Owner：`c7580a8d5dbafd1c2c5e959bfeb9f4dc9d4f5750`，`Worktrees/W24_IDENTITY_CONSENT_M1_20261025`。
- W44源：`66a70a15af885274b74c0124d0e914924579bebf`；W25源：`7f6fabd9f35d3cf3c27bd661d9627db731ec9ae7`。
- W46最新签署Owner：`5ad548d2a7b2e202411cb1cfa7d13118556b34ad`；W47真实本机API Owner：`7ff387adf2007744117b706d72a57c6055b04177`。
- W09正式回执：W46/W47/W40源码及Chrome安全显示复签；PR53**嵌套6项CI** PASS，不得冒充main-base PR32准确HEAD完整七项；真实用户授权、CONTACT、Windows WebView2安装、生产仍HOLD。不得重复UI/Composer/runtime工作。

## 2. 真实本机Principal和平台身份资格核查

**发现本机可运行的W47 HTTP传输，尚未发现真实、可信且已装配的用户会话。**

权威实现：`services/api/runtime/server.mjs`；真实运行在`127.0.0.1:47182`。本轮对已运行进程只做GET；返回的实际运行SHA为`7ff387adf2007744117b706d72a57c6055b04177`。

- `GET /api/v2/runtime/health` → HTTP 200，`trustedSession:false`，`connectedAccountCount:0`，`realContacts:0`，`canSend:false`，`externalEffects:false`。
- `GET /api/v2/runtime/capabilities` → HTTP 200，`takeover.connected:false`、`managedStop.connected:false`，二者原因为`NO_TRUSTED_LOCAL_SESSION_OR_PLATFORM_BINDING`；sender disabled。
- `GET /api/v2/contacts` → HTTP 200，`contacts:[]`、`source:'NONE_CONNECTED'`，非120个合成fixtures。
- `GET /api/v2/identity-consent/takeover-state` → HTTP 401；`GET /api/v2/managed-stop` → HTTP 401。
- W47运行时仅验证loopback / Host / Origin / Fetch-Site。**这些是访问面防护，不是用户身份认证**。无真实会话凭据校验、OS到用户Principal绑定、独立合法ChannelAccount授权证明及当前Peer ownership映射。
- `apps/windows/.gitkeep`依旧不是安装的Windows/Tauri IPC认证层，不能用系统登录名、设备可访问、Origin、客户端token字段或本机端口本身充当合法社交账号主体。
- W24 `identity-consent.mjs` 的`canonicalK`把tenant限定`SYNTHETIC_TEST_ONLY`；`durable-identity.mjs`要求`fake-` Actor；W44 `grant-custody-budget/index.mjs`要求fixture账号/fake Peer，`authority-db.mjs`只接`fake-`Actor。**现有严格SQLite是非生产授权机理证据，不能把真实账号映射成fake记录假装已经授权**。
- 未发现正式ChannelAccount—平台实际账号凭据持有人—原始Peer/会话联系人绑定校验来源；W26–W29平台适配或其对应已授权持久存储Owner必须独立确认。GitHub授权可以访问仓库，不等于本机言策用户或社交平台授权。

**资格判断：现成原生W24/W44 API可复用，但真实CONTACT的入口证据缺失；禁止签署 READY。**

## 3. 最小原生GET CONTACT可信上下文接口契约（建议，尚未实现）

复用W47现有`GET /api/v2/identity-consent/takeover-state`及`GET /api/v2/contacts`，由W47真实运行时在进程内、经已验证会话与已验证ChannelAccount/Peer解析出`trustedContext`，然后委托W24原生service，而不是开发第二个身份数据库/登录服务器。

**必需服务端原生输入，不接受浏览器自证：**

- `principal`：服务端已认证的稳定`principalId`、可撤销`sessionRevision`和实际来源；每次操作校验当前会话有效、注销/撤权未发生。不得用客户端传来的`actor`、`principal_id`、cookie文本或自造signed标志直接赋权。
- `channelAccount`：会话允许访问的真实平台账号主键、`tenant`、`account`、`channel`、绑定证明/权属引用、`binding_revision`、当前活跃性和`accountRevocationEpoch`；服务端从经授权的平台绑定记录查得；禁止由GET参数直接构成归属证明。
- `peer`：属此账号/渠道的合法联系人ID、Peer绑定证明/版本及当前bound状态；选择联系人只能作为**定位符**，后端必须再次验证Peer所属账号和完整K。`K={tenant,account,channel,peer_id,binding_revision}`由后端确认且使用W24 `canonicalK/assertCurrent` 严格比对，旧K必须拒绝。
- `consent`：W44`readIdentityAuthority({actor,identity:K})`的持久`consentEpoch`、有效Consent的`consent_id/purpose/operation/expires_at/status/consent_revision`；GET公开最小版本/状态，不回传私有proofRef或平台凭据。
- `custody`：W44 `inspection(K)`的`mode:'AUTO'|'HUMAN'`与`custodyEpoch`；对应W24现有GET字段`identity,identityKey,binding_revision,accountRevocationEpoch,consentEpoch,mode,epoch,accountActive,canTakeover,canSend:false,status:'NATIVE_TAKEOVER_STATE'`。缺任何权威项拒绝（401/403/409/503），不可填零/fixture。
- `authorization`：W44最新有效`grant` scope与revision/epoch、`expiresAt`、`spent/reserved/budgetLimit/availableUnits`以及`readMutationFence(K,CONTACT)`、`readMutationFence(K,GLOBAL)`的generation/PENDING/activeLease，必要时W43 Agent有效性与route版本；该状态**只是内部资格与只读摘要**，不是许可前端发送。正式发送资格必须由W25在ADMISSION和PRE_NETWORK再次查验。
- 防隐私外泄：仅把原W46已需的GET响应字段给客户端，完整Principal、原始授权凭据、证明ref、预算明细如不需要前端不可泄露；`canSend:false`在无真实授权或未签W25边界时必须恒定。

**当前不满足以上前提：该建议契约尚无合法的真实K/Principal可输入，不能声称已存在200真实CONTACT GET。**

## 4. 已有W24 TAKEOVER与W46唯一Composer原生接缝

源：
- `identity-consent/takeover.mjs`：`createNativeTakeoverService({identityConsent,custodyStore,authorizeTakeover})`；`GET /api/v2/identity-consent/takeover-state`只读；`POST /api/v2/identity-consent/takeover`真实编辑时才允许。
- `identity-consent/takeover-http.mjs`：`createNativeTakeoverHttpHandler({service,resolveTrustedContext})`的`resolveTrustedContext`是**需可信运行时Owner注入的接口依赖，不是已存在的认证实现**。当前W47对此路由返回401。
- `apps/web/src/composer-bridge.mjs`：`choose`选择联系人、`inspect`GET状态、`quote/adoptCandidate`修改草稿均不POST接管；`userAction`只在`TYPE/IME_COMMIT/PASTE/ATTACH/DROP/VOICE/SEND_ATTEMPT`才按真实K执行GET→CAS POST→GET。
- 四项CAS：`expectedIdentityKey`、`expectedEpoch`（W44 custody epoch）、`expectedAccountRevocationEpoch`、`expectedConsentEpoch`。来自浏览器的expected字段只作**CAS一致性条件**，不能作授权证据；服务端必须由可信session、W24、W44重新回读独立判断。
- W24严格模式 `HUMAN_TAKEOVER`以W44 `requestMutationFence/finalizeMutationFence/mutationResult`提交CONTACT事务，再GET确认同K的HUMAN且epoch +1。ARMED→PENDING（不可显示已接管），UNKNOWN无资格盲重发；错误CAS 409、缺字段422。
- CONTACT A的人工接管不能使B/C变HUMAN；仅A的AUTO受其CONTACT fence影响。
- 没有合法CONTACT时，W47`GET`401、W46唯一Composer不制造联系人或开启发送；本轮不允许补fixture伪造READY。

## 5. W44 STOP / 授权预算与W25唯一发送器

**授权与停止**：
- `grant-custody-budget/index.mjs`的`openEligibilityStore({requireDurableIdentity:true,...})`是唯一W44持久源。
- `readIdentityAuthority`读取Account/Peer/Consent+revision；`readMutationFence`读取scope+generation；`requestMutationFence({kind:'REVOKE_GRANT',scope,payload:{grantScope:scope},...serverCAS})`必须**先持久写入PENDING**；之后`finalizeMutationFence`和`mutationResult`才允许确认COMMITTED。
- `apps/web/src/managed-stop.mjs`预留`read`/`requestStop`；W47已经有`/api/v2/managed-stop`路由壳，但当前全部401。测试`/w46-native-test/managed-stop`不是认证接口；不可复用其fake Actor为真实用户。
- CONTACT仅影响A的full K；GLOBAL仅限同一认证tenant/account/channel的全部联系人。前端送出的scope仅表达意图，由服务端账号绑定与Peer所有权批准；不能升级跨账号/channel授权。
- **Fail Closed条件**：无session/Owner proof、失效/过期Consent、ChannelAccount撤权或Peer rebinding/旧K、过期或撤销Grant、HUMAN custody、PENDING撤权、Agent/route失效、预算不足、W25 ARM/UNKNOWN，全部不得得到新AUTO发送资格；过期与预算由W44 `qualify/inspection`和W24 `evaluate`配合判断。
- W25真实原生入口 `message-delivery/index.mjs: MessageDelivery({eligibility,sink,receiptVerifier})`，接缝为`createW25EligibilityPort`的`eligibility.check({k,mode,phase:'ADMISSION'|'PRE_NETWORK',intentId,businessMessageId})`及W44`reserve/enterBoundary/armSend/settleBoundary`。W25唯一Outbox和真实Provider ACK待Owner验收，不建第二个Sender。
- 先停止请求PENDING可阻断新ARM；若原先已ARMED或UNKNOWN，停止请求保持PENDING，保留W25原始intent、预算和lease，禁止假报COMMITTED、重复发送/退款。只有W25同一attempt可信终态证据才可settle原事务。
- **UI和本机只读API不能单独签发W25发送资格**。W09 PR53页面展示正确并非已认证可以发消息。

## 6. 本轮实际核验、分母与证据

在真实`DESKTOP-029FH47`，读取上述W09正式回执、W24/W44/W25/W46/W47原生源码及跨Owner契约。**本轮仅GET运行中W47、本机只读检查和原始测试文件（不启动新provider、不做真人操作）。**

| 来源 | 实际结果 | 正确含义 |
|---|---|---|
| W47运行中的localhost:47182五个GET | 200健康；200能力；200空联系人；401接管GET；401停止GET | 真实传输存在，真实登录Principal/CONTACT不可用 |
| `node --test identity-consent.test.mjs`（W09 88ded source） | **28/28 PASS** | 旧W24合成身份契约，非真实会话 |
| `node --test stop-managed.test.mjs`（W09 88ded source） | **6/6 PASS** | W44原生合成SQLite STOP安全围栏 |
| `node --test services/api/runtime/server.test.mjs` | **5/5 PASS** | W47真实运行中no-auth fail-closed，只读API可靠 |
| W09指定回执 | PR53嵌套**6/6 CI PASS**、W46/W47/W40独立来源复签 | 不等于正式PR32七项或真实用户授权 |
| 真实本机Principal→ChannelAccount→Peer证明/CONTACT GET | **NO EVIDENCE / NOT TESTABLE** | P0 HOLD，不得生成假的trustedSession或fake联系人 |

本轮实际重新运行共**39/39非生产测试PASS**，与5项HTTP读取分开计数；不将继承的201/201、W46 53/53或嵌套6项CI混进本轮测试分母。

## 7. 给W09-2的最小原生Owner变更申请（非实施，严格禁止伪造授权）

**唯一阻断：W47已有本机API运行时，但尚未连接真实可信本机Principal、平台账号授权及Peer绑定。**

1. **W47既有`services/api/runtime/server.mjs`运行时Owner**：在已经存在的单一V2原生应用/API入口复用受保护的OS/app会话及本机用户授权源，提供真正`resolveTrustedLocalPrincipal(req)`，验证session有效性、当前principal/撤销版本和调用来源；该方法目前**未实现**。loopback、Origin和HTTP header不视为登录。禁止第二套账号系统。
2. **对应Channel connector/凭据Owner（W26–W29，经W09确认实际责任）**：提供合法已授权ChannelAccount的owner/binding revision和当前Peer身份/绑定证明；不得恢复旧V1账号/凭据，或从合成fixture生成真实联系人；未取得合法用户授权一律不可连接。
3. **W24 Owner**：在真实可信session和平台归属证据可验证之后，最小适配`canonicalK/assertCurrent/readConsentEpoch`的真实tenant/account/peer身份格式，保持账户重绑revision与持久epoch，外部证明须同步纯校验；不能直接删除`SYNTHETIC_TEST_ONLY`门槛放行未授权用户。
4. **W44 Owner**：与W24共同确认真实actor/tenant权限入口最小生产适配，保留单一SQLite授权事务、READ/CAS/预算/STOP/UNKNOWN原子围栏，不接受fake Actor作为真实身份证据。
5. **W09-2集成Owner**：将真实session resolver和合法平台account/Peer map注入现有W24 `resolveTrustedContext`、W44`authorizeMutation`、W46已有`managed-stop` port及W25`createW25EligibilityPort`，不改W46 UI/Composer，也不自行发明发送器/Agent；联合源码SHA安全复签后再申请真实测试。
6. **W25 Owner**：实际不可逆发送边界、授权失效与budget、ARM/UNKNOWN及可信Provider ACK独立签署。当前未获批准，不进行真人发送/付费模型。

**最小验收回执门槛**：合法本机Principal+撤销证据、唯一合法ChannelAccount+Peer绑定、GET同K稳定epoch、未经授权的跨账号访问401/403、旧K/旧epoch 409、A输入接管A且B/C AUTO、GLOBAL限同账号、过期撤权预算不足均拒绝、W25 UNKNOWN HOLD。任何缺失均保持`NATIVE_AUTH_INTERFACE_HOLD`及`canSend:false`。

## 8. W24 Owner ACK的准确范围

**W24_SOURCE_CONTRACT_AUDIT_ACK：只读安全核验与最小Owner变更需求已完成。**
签的是已有W24/W44合成原生接口能否作为未来真实CONTACT授权的**可复用模块**，不是签`TRUSTED_CONTACT_CONTRACT_READY`，不是真实本机Principal身份证明，不是独立SEC/生产部署批准。

未改W09 PR53/PR32、W46、W47、W40、W44、W25源码；未修改main、未新增本机登录、未建立fake授权、未连接真实账号、未执行真人消息发送。真实AUTO SEND继续关闭。

**最终唯一状态：`NATIVE_AUTH_INTERFACE_HOLD`。**
