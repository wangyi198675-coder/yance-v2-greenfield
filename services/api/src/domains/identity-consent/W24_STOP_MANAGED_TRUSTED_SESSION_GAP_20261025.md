# W24 → W09-2: STOP 托管真实登录会话入口核查 / 最小缺失接口

**结论：HOLD_NO_TRUSTED_STOP_HTTP_IPC。不能将合成授权当作真人用户授权。**
检查时间：2026-10-25；远程主机：DESKTOP-029FH47。
仅针对私人开源 V2，不建议新增登录系统、Agent、发送器、数据库、企业级角色审批机制。

## 1. 本轮已精确读取的源码

| Owner/集成 | 本轮所读真实 SHA |
|---|---|
| W09-2 | `5bc11f2a75d616b55459131e34e501eb58d79400` |
| W24 | `1459268eebe4a1a1585e4a7f61bd45adcba7ca8c` |
| W44 | `66a70a15af885274b74c0124d0e914924579bebf` |
| W46 | `acef02492b897e75244569de93389064cd96ce76` |

当前V2项目实际跟踪文件：
- `apps/windows/.gitkeep`：**没有**可复用的Windows IPC/login/session handler、Tauri Rust后端或OS用户到授权账号绑定逻辑。
- `services/api/.gitkeep` 及 `services/api/src/domains/**`：仅有独立domain与合成HTTP适配模块；**没有**已装配的真实API服务器/登录Session Resolver/受保护停止托管route。检查了提交跟踪文件及API/web源代码关键字。
- `apps/web/src/managed-stop.mjs`：真实W46 UI仅要求已认证port的 `read(identity,scope)` 与 `requestStop(identity,scope)`。未注入时 `UNAVAILABLE`，不声称「已停止」。
- `apps/web/src/managed-stop.mjs:95`：现有 `createLoopbackManagedStopPort` 硬编码 `/w46-native-test/managed-stop`，`credentials:'omit'` + `X-Yance-Environment:'synthetic-only'`；**这不是认证**。
- `apps/web/tests/w46-local-integration-server.mjs:44,88`：只有设置 `W46_STOP_TEST_LAB=SYNTHETIC_ONLY` 时，临时测试HTTP才提供 `/w46-native-test/managed-stop`。不能作为正式停止入口。
- `apps/web/evidence/W46_STOP_MANAGED_OWNER_HANDOFF.md`：W46 Owner明确标注 `HOLD_NO_TRUSTED_STOP_HTTP_IPC`，Chrome截图里的Actor为 `fake-owner-1`。
- `services/api/src/domains/identity-consent/takeover-http.mjs`：`resolveTrustedContext(req)` 只是**必须注入**的server依赖，不负责创建/认证登录会话，也不能在Stop复用fake handler。
- `services/api/src/domains/file-attachment/http.mjs`：`resolveIdentity(req)`同样只是可注入hook，无真实实现/会话验证证据。
- `services/api/src/domains/identity-consent/identity-consent.mjs:11`：完整K的租户硬限制 `SYNTHETIC_TEST_ONLY`。
- `services/api/src/domains/grant-custody-budget/index.mjs:16,64` 和 `authority-db.mjs:56`：源代码要求 `SYNTHETIC_TEST_ONLY`、fixture账号和 `fake-` Actor。不可将真人账号强行拼成这些值冒充授权。
- `services/api/src/domains/grant-custody-budget/STOP_MANAGED_W09_MINIMAL_HANDOFF.md`：既有STOP `REVOKE_GRANT`事务契约完整，无须重建。

**不能声称存在真实可调用GET/POST endpoint，也不能声称有真实Windows登录或真人授权验证PASS。**

## 2. 缺失的唯一最小运行时连接点（W09-2 原运行时Owner接续）

请W09-2先落实一个真实、可复用的Windows应用/原API会话入口。最低限度由该入口在服务端确定：
`{principal_id,tenant,currentAccount,currentChannel,allowedPeerBinding,sessionRevision}`，
其中登录会话凭据必须在该原生/后端验证，不能来自浏览器自述的 Actor、令牌身份声明或 `X-Yance-Environment` 标记。
会话撤销、账号解绑或联系人权限变化时必须重新校验。

在**同一已认证应用handler**内提供W46的以下两个方法（仅为**建议的接口契约，不是现存路由**）：
- `GET managedStopState(selectedContactLocator,requestedScope)`：
  从已验证会话取得 Actor/绑定的tenant+account+channel；CONTACT只可查同账号合法Peer完整K；GLOBAL只能查当前已认证账号/channel。向W24严格持久服务、W44 `readIdentityAuthority` 及 `readMutationFence` 查询，优先根据持久 `requestId` 调 `mutationResult`。输出W46已支持的
  `{authoritative:true,identityKey,scope,status:'ACTIVE'|'UNQUALIFIED'|'PENDING'|'COMMITTED',canSend:false,generation,requestId?}`；
  无有效session/K/授权时401/403；缺权威回读时503/UNAVAILABLE，不能返回伪造COMMITTED。
- `POST requestManagedStop(selectedContactLocator,requestedScope)`：
  **拒绝**客户端提供/覆盖Actor、tenant、account、binding_revision、epoch、grantScope、idempotencyKey和授权证明。scope为用户明确请求的CONTACT/GLOBAL，但服务器根据当前已认证账号/通道重新授权范围。取W44准确epoch及generation，构造服务端可信typed
  `{grantScope:validatedScope}`，使用既有 `requestMutationFence({kind:'REVOKE_GRANT',...})` 写入持久PENDING，随后调用
  `finalizeMutationFence`，再用 `mutationResult` 和W44当前拒绝tombstone/有效资格二次回读。ARMED/UNKNOWN时仅返回PENDING，绝不「已停止」。

这两个方法必须由**实际已有、已启动的可信HTTP/IPC listener Owner**注入W46 `createManagedStopController({port})`；不能只写函数工厂、临时test server或新fake Actor。没有此运行时，保持W46客户端 `UNAVAILABLE`。

既有 W44 的当前合成Actor及租户检查也仍不支持正式真实用户；必须由W24/W44 Owner在获得真正会话与用户身份映射证据后共同审核最小生产身份适配，绝不能删除合成安全约束后默认放行。此项不是W24单独添加URL能解决的。

## 3. 作用域、PENDING 和 W25真实边界

- CONTACT A：服务端验证full K并写CONTACT `REVOKE_GRANT`围栏，B/C不得因A被停止而丧失各自有效AUTO。
- GLOBAL：只限同一认证tenant/account/channel内的联系人；跨账号、跨渠道永不继承。
- 先W44 PENDING后允许任何相关Agent状态变更；不得先停Agent后放行W25。
- W25未ARM：STOP可COMMITTED后服务端再次确认；已ARM/UNKNOWN：STOP保持PENDING，W25原始intent与收件人锁、预算/lease保持，绝不重发或退款。原始W25 verified terminal evidence后同requestId再次finalize。
- POST成功不代表停止成功；客户端自己显示COMMITTED必须GET再次读同K+scope+requestId+generation。
- 禁止生产自动发送；没有真正session原生绑定和W25最后边界复签不得启用。

## 4. 本轮实际只读测试（不改W46/W44/W25源码）

在W09集成工作树真实执行：
- `node --test apps/web/tests/managed-stop.test.mjs`：**10/10 PASS**，其中真实无port时UNAVAILABLE、伪造COMMITTED/409/网络失败不得乐观宣告成功、客户端绝不携带Actor。
- `node --test services/api/src/domains/grant-custody-budget/stop-managed.test.mjs`：**6/6 PASS**，真实合成SQLite围栏CONTACT/GLOBAL、ARMED/PENDING、版本冲突与重启恢复。
- 已检查W09/W44/W46实际Git SHA、跟踪文件、运行时缺失位置、W46测试端点及W24/W44合成身份限制。

**真实登录会话授权测试：NOT EXECUTABLE/NOT PASS——缺少被测可信session/runtime endpoint。**
不是「16项生产授权验收通过」，也不继承W09先前CI作为本缺失接口的证明。

## 5. 交接 / 最小Owner边界

W09-2：确认实际Windows或API运行时Owner，提供现有或新增的可信session resolver和注入位置；认证真实用户后调用上述已有W24/W44 API并把port交给W46，不得改造W46界面。
W24：只复用既有full K、身份/Consent校验；没有可信session时拒绝标记真实授权完成。
W44：保留 `REVOKE_GRANT` 原生SQL事务、generation/UNKNOWN/预算，不因界面点击而清理PENDING。
W25：在最终合并SHA对ARMED、UNKNOWN和真实不可逆边界独立复签。
W46：原UI无需重画；现有Port严格校验PENDING/COMMITTED请求回执和回读。
私人开源项目无需企业RBAC或多级审批流程。

**交付状态：W24真实会话入口核查完成、必要缺口准确定位；真实停止托管接线HOLD，自动发送仍关闭。**
