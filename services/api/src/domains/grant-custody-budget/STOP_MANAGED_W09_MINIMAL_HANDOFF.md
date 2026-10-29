# W44 -> W09: 私人开源版「停止自动托管」最小接入契约

## 版本与边界
以 W09 集成 SHA a96722fb7b01bdeda3b9c182e6bf2382a5484050、W44 源码 174a2c4582a476e6b563599144bdaed6450544b0 为既有基线。仅改 W44 原目录。
不新增 Agent 开关服务、数据库、Outbox、发送器或人工审批队列。W25 独立安全复核保留；本轮没有真人账号连接/外发/部署。

## 已有 W44 原生 API（原样复用）
实例为 W09 已接入的严格持久模式 openEligibilityStore({requireDurableIdentity:true,...})。
- readIdentityAuthority({actor,identity:K})：持久 Account + Peer + epoch 的同库快照。读取后不得把浏览器参数当成可信 Actor。
- readMutationFence({actor,identity:K,scope:'CONTACT'|'GLOBAL'})：获取上次 generation 和 PENDING 状态。
- requestMutationFence({actor,identity:K,scope,kind:'REVOKE_GRANT',expectedGeneration,expectedBindingRevision,expectedAccountEpoch,expectedConsentEpoch,expectedCustodyEpoch,idempotencyKey,payload:{grantScope:scope,...trustedServerFields}})：必须第一步持久写入 PENDING 围栏，阻止同范围新发送。CONTACT = 特定 full K；GLOBAL = 同一个 tenant/account/channel 的所有联系人。
- finalizeMutationFence({actor,requestId,generation,ownerValidatedMutation:sameTypedPayload})：须等待对应 W25 ARMED/UNKNOWN 原 attempt 经可信证据结算，无 active lease 才 COMMITTED，原 W44 grant 中生成 CONTACT 拒绝 tombstone 或 GLOBAL deny；不能错误解冻待停止发送。
- mutationResult({actor,requestId})：跨进程/重启查询 PENDING 或 COMMITTED；重复 idempotency key 返回原 requestId。W09 Web/Windows 只依服务端结果显示准确状态。

**新增唯一源码防线**：REQUEST 阶段强制 payload.grantScope === scope，拒绝 CONTACT 围栏意外申请 GLOBAL 授权撤销（STOP_SCOPE_MISMATCH）。不允许前端传未经验证的 scope、Actor 或 grantScope 替代服务端确定值。

## W09 停止按钮/后台行为（需要 W09 接入，W44 不修改其源码）
1. 收到用户主动点击停止：服务端解析账号、contact K、Actor 和期望范围，调用 readIdentityAuthority 与 readMutationFence，使用完整 K 和新 idempotency key 做原生 REVOKE_GRANT request。必须先写持久 PENDING，**然后**才允许调整独立 Agent 状态。禁止直接先切 Agent active=false 再回复「已停止」。
2. 尝试 finalize。若 result.status=PENDING（尤其 reason ACTIVE_SEND_MUST_SETTLE_FIRST），HTTP/API 返回准确 requestId/generation/status；界面显示「停止中」，不显示「全部停止成功」。新入站托管资格立即被 W44 barrier 拒绝。
3. 如果 result.status=COMMITTED，随后再读 mutationResult 确认后才显示「已停止」。Agent 单独 active 状态不能成为是否真正停止的唯一判据；W44 grant/epoch 才是自动发送授权围栏。
4. W25 原 Outbox 对 ARMED/UNKNOWN 的终态确认仍为唯一真相。UNKNOWN 不盲重试、不归还费用、不清除 W44 lease；待已验证 ACK 或明确未发送证据后原地重试 finalize。重启后根据 requestId 再查 mutationResult；不得从界面本地布尔值推断完成。
5. 只停止 A 用 CONTACT，B/C 的独立合法托管继续运行。全局停止针对当前账号/渠道用 GLOBAL，覆盖该账号对应的 A/B/C，不擅自扩大至其他账号。
6. W09 不得发明新的 stop 平台服务；在原有用户动作 handler 中复用 W24 可信 Actor/原生 proof validator、W44 接口和 W25 保留的终态回执。

## W44 实际定向证据
node --test services/api/src/domains/grant-custody-budget/stop-managed.test.mjs

6/6 PASS：停止先于 ARM、ARMED 先于停止并返回 PENDING、UNKNOWN 隔离、A 联系人/B-C 独立、GLOBAL 账户联系人覆盖、CONTACT/ GLOBAL scope mismatch 安全拒绝、SQLite 关闭重开后请求 ID/generation/PENDING/COMMITTED 恢复。
这是非生产 SQLite+假数据 W44 安全边界测试，不是 W09 UI 停止按钮已接入，也不是 W25 本轮发送测试重跑。
旧 W44 25 项及 W25 独立发送回归已继承、未重建。

P0 剩余：W09 必须实际接入上述 stop 事务流程，并与 W25 原不可逆边界做联合安全复核；没有接入前不宣称点击停止已经真实安全闭环。
