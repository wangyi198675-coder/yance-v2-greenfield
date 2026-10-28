# W25 → W47/W46/W09-3｜2026-10-27 已批准R4唯一CONTACT Composer历史契约

## 原Owner可调用接口

继续使用原始 W25 `MessageDelivery` 及从 `index.mjs` 导出的 `createW25NativeInboundPort`，不得创建另一个Sender/Outbox/消息数据库或将本地历史自动导入Agno AUTO执行队列。

`const native = createW25NativeInboundPort({delivery,verifyNativeSource,readW24Identity,checkPrivateInboundConsent})`

- `native.acceptInbound({k,source,sourceEventId,providerMid,original,synthetic:false})`：**仅真实实时入站**，沿用W24当前五段K/epoch和来源证明。实时入站后接历史如出现相同K+MID，仅作为重复消息；是否触发合法建议/自动托管仍由W43/W44/W45另行授予权限，W25读取/历史导入**不会**发起任务。
- `native.acceptHistory({k,source,sourceEventId,providerMid,original,synthetic:false,isHistory:true,fromMe:boolean,providerTimestampMs?:number})`：**仅经过官方上游SDK的历史回读**。必须具有原生Owner `verifyNativeSource` 返回的相同完整K/Provider来源/epoch，加 `historyReadback:true,fromMe:boolean`；当 `fromMe:true` 还必须证明 `selfAccountVerified:true`，不能仅相信浏览器 DTO。可选消息时间必须为真实SDK独立证明的 `verified.providerTimestampMs`，且与事件一致；无证据只记录本地接收时间并标记兜底。全部历史调用结果 `triggerReply:false,createsSendIntent:false,providerAckVerified:false`，保证恢复不回复、不产生新的发送尝试。
- `native.listHistory({k,nativePrincipalId,limit:50})`：返回本联系人已授权历史（限额1–250），按真实Provider时间优先、否则本地时间；顺序从旧到新。**包括本人已发 `fromMe:true,direction:'OUTBOUND'` 和对方入站 `fromMe:false,direction:'INBOUND'`**。完整K包含tenantId/accountId/channel/peerId/bindingRevision（string）；即使空结果也必须当前W24严格身份与 `READ_HISTORY` 用户私密权限通过，每一行又单独回读W24/current Consent。
- `native.getInbound({id,nativePrincipalId})`：按单条ID原W24及单条私人授权读回，历史行使用 `READ_HISTORY` 而不是只验证账号已连接。
- `native.listSendStatus({k,nativePrincipalId,limit:50})`：只读查原 `send_intents` 与 `outbox_attempts`，按五段K隔离，检查W24与 `READ_SEND_STATUS` 用户许可。返回 `intentId,businessMessageId,mode,state,denialCode,attemptId,attemptState,providerMid,updatedAt,isDraft:false,canAutoRetry:false`。所有状态来自唯一W25 Outbox，不能把草稿或历史 `fromMe:true` 误认已发；`UNKNOWN` 绝不自动重发。

`listHistory()` 的每条历史 DTO 提供 `id,k,source,sourceEventId,providerMid,original,fromMe,direction,isHistory,triggerReply:false,messageAt,timeSource,receivedAt,deliveryState`。上游已发历史的 `deliveryState:'PROVIDER_HISTORY_UNRECONCILED'` **不等同**于经过W25验证的 ACK；未有原始sendIntent、真实签名Provider确认/收据时，不得显示“发送成功”。普通入站为 `NOT_REQUESTED`。

## SQLite兼容和安全

增量在**同一个原W25 SQLite `inbound_messages`**表上幂等迁移 `from_me,is_history,message_at` 三列；旧行默认为 `from_me=0,is_history=0,message_at=0`，保持历史消息与Outbox原有数据。迁移在 `delivery.tx` 写锁内序列化，跨Windows进程不额外生成发信或第二库。按K＋Provider MID唯一，事件ID不可跨消息重用；直播已存在同一K/MID，官方历史回读可以携不同历史事件ID去重而不重发。若内容或方向冲突，仍拒绝。

**注意：现有SQLite原文存储没有宣称生产级磁盘加密。** 真人历史读取/落库及ChatGPT收费仍须用户已获合法账号及私人数据许可、W24/W47实际运行身份、现有安全和数据加密审查；SDK正在运行≠社交账号上线。所有代码定向测试使用非生产Owner回调，不是平台外发或真实Provider回执。

## W47原API修正位置（W47本人修改，不抢源码）

当前 `services/api/runtime/native-message-reads.mjs` 的 GET `/api/v2/messages?identityKey=<五段W24K>` 只从 `readW25OriginalInbound` 消费源，并**硬编码 `direction:'INBOUND',delivery:'NOT_REQUESTED'`**。W47在原受信W54当前Session/W24当前K前提下，把这条只读Port接到W25 `listHistory`，按条映射 `direction,fromMe,isHistory,messageAt,timeSource`。如需发送状态，复用原W25 `listSendStatus`，不得提供会重发UNKNOWN的HTTP快捷动作。保留原 401/403/409/503 身份/CORS/失效控制，返回同源no-store JSON；前端传 `identityKey` 只是定位，不是证明。W47若已有真实端点也必须先合并所需源，不能拿静态R4图或合成消息当真联系人。

## W46唯一Composer消费范围（W46本人修改，不抢源码）

只消费W47当前可信五段K和消息DTO。本人已发历史显示右侧，联系人入站左侧，AI建议只是可编辑草稿；草稿未入W25 SendIntent前不能显示已发。SendIntent `UNKNOWN` 不能触发重试或“发送成功”。选择/查看联系人A不触发人工接管；只有A真实编辑/粘贴/语音/文件/发送时才使用原W24/W44 TAKEOVER，不能全局暂停B/C。旧R4搜索、置顶、归档和未读计数不能通过本历史入站凭空造状态或规则。

## 验收阶段

W25源码测试：原40+历史9等，`node --test services/api/src/domains/message-delivery/*.test.mjs` **56/56 PASS**（新Owner提交前本机Windows Node24）。真实上游Provider授权连接、真人MID的方向/时间/回执及W47 HTTP／W46 Vue联合UAT仍需原Owner/用户授权；当前阶段仅W25源码SOURCE_PASS，不代表USER_DELIVERED。旧44751禁止改动。目标协调W09-3。
