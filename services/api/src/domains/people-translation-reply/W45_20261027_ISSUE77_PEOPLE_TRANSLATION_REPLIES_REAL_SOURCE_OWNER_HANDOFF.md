# W45｜2026-10-27｜Issue #77｜联系人＋原文/中文译文＋Agno候选原Owner业务接口交接

**严格范围：** 仅 `services/api/src/domains/people-translation-reply/**`。原基线 `5de72077fff557a1bdd7079ce2df3a00953f78f9`。未改 W46 Vue、W47 runtime、W43 Agno、W24/W25源码、44767环境或另一套消息库/发送器。本报告是W45技术Owner接口回执，不是W09-2独立安全/用户Opera Web PASS。

## 从源审计实读的现实状态

已读取 `COORD_AGGREGATE/W09_2_20261027_P0_44767_NINE_WORKSPACES_PLACEHOLDER_REAL_SOURCE_AUDIT_TO_W46_W47.md`、GitHub Issue #77。固定 44767 安装的真实R4候选PEOPLE只有计数卡片，没有消息/翻译/建议全功能联线。W47原 `GET /api/v2/contacts` 需要原W54 NATIVE_FIRST_PARTY 当前登录、W24已验证账号/联系人；只输出sanitized `{accountRef,channel,peerRef,bindingRevision,displayName}`，**不会提供完整 K**。W47原 `GET /api/v2/messages?identityKey=<W24 full K selector>` 需W54当前身份、W24 full K与 READ_INBOUND Consent、W25原生持久入站记录；输出`{identityKey,mid,original,direction:'INBOUND',providerSource,delivery:'NOT_REQUESTED'}`，无真实Provider账号时不得承认消息。W47当前 `GET /api/v2/translations` 未获当前用户授权时返回401且尚未接W45业务数据。W43原Agno是唯一模型Owner；W45只有翻译DTO来源门禁、真实模型结果解析及0..3草稿候选，不负责起Agent或网络发送。

已在44767**只读**实际请求：`GET /api/v2/runtime/health` HTTP200，`GET /api/v2/contacts` HTTP401，`GET /api/v2/translations` HTTP401（均未提供私人登录凭据）；不能把401归咎于代码无法返回真实信息，也不能把等待本人授权改造成伪在线。

## 本轮新增源码：native-people-read.mjs

`createNativePeopleReadModel({readW24Contacts,resolveW24Contact,readW25Inbound,readW45Translation,attestW45Translation,readW43ReplyCandidates,attestW43Run,revalidateW24})` 返回**只读**业务接口；全部回调必须由W09独立签署的W47/W24/W25/W43业务编排注入，绝不能直接从浏览器输入决定。

1. `await model.listContacts({principal})`: `principal`是W54经W47授权的server-native Principal，至少 `{verified:true,source:'W54_NATIVE_CURRENT_USER',principalRef,installationRef,revocationGeneration}`；业务只接受W24 Owner `{status:'AUTHORIZED',principalRef,contacts:[{identity:{tenant,account,channel,peer_id,binding_revision},displayName,w24CurrentKVerified:true,principalRef}]}`，会再次调用 `revalidateW24` 防登录/epoch改变。**实际返回** `{status:'READY',contacts:[{identity,displayName,status:'AUTHORIZED',canSend:false}],authoritative:true,canSend:false}`。未授权返回 `{status:'WAITING_USER_AUTH',contacts:[],messages:[],canSend:false,authoritative:false}`，缺原生接口返回 `NOT_WIRED`，绝不自动制造联系人。

2. `await model.getThread({principal,identity})`: `identity`必须是W24当前5段K并经 `resolveW24Contact` 对该Principal核实 `{status:'AUTHORIZED',source:'W24_CURRENT_K',principalRef,identity,w24CurrentKVerified:true,readInboundConsent:true,accountEpoch,consentEpoch}`；随后原W25 `readW25Inbound({principal,identity,consent,max:250})` 接受原生行 `{id:<64-char SHA256>,k:{tenantId,accountId,channel,peerId,bindingRevision},providerMid,original,source}`。source仅取 `mautrix-meta | pancake | baileys | tdlib-json`。每条 `k`必须严格同一full K，`providerMid`去重，任何错账号/联系人/K/来源整批拒绝。最后再次 `revalidateW24` 避免长时等待后把已撤权的私信返回。

3. 翻译仅委托现有W45翻译源回读 `readW45Translation({principal,identity,mid,originalSha256,targetLanguage:'zh-CN'})`，必须返回旧W45 `TRANSLATED` DTO，`provenance.kind=LOCAL_ENGINE或AGNO_NATIVE_TRANSLATION`、准确原文inputSha、来源MID、Provider、RequestId，再由独立Server-only `attestW45Translation` 回读真实引擎执行证据 `{verified:true,source:'W45_ORIGINAL_TRANSLATION_EXECUTION',identity,sourceMid,originalSha256,translatedSha256,provider,requestId}`。缺回执、伪造引擎、无翻译服务=> `{status:'UNAVAILABLE',text:null,provenance:null}`，不填演示中文；测试fixture必不可冒充实际供应商引擎。

4. AI建议只能委托 `readW43ReplyCandidates({principal,identity,mid,originalSha256,translation})` 读取W43原Agno已完成的、来源固定至同MID的Run；`attestW43Run`必须由W43 server-native/持久记录证明 `{verified:true,issuer:'W43_NATIVE_AGNO',nativePersisted:true,identity,sourceMid,runId,sessionId,provider,modelId,originalSha256}`。同一MID必须匹配原文SHA，使用译文作为来源则必须匹配已验证译文SHA，建议数组 **0–3原样**、每条 `sources: [{mid,part:'ORIGINAL'|'TRANSLATION'}]`。失败返回 `{status:'RUN_UNAVAILABLE'|'SOURCE_UNVERIFIED',candidates:[],run_id:null,session_id:null}`；成功建议仍 `DRAFT_ONLY`/`quality_qualified:false`。W45实际旧`service.draftCandidate`保持唯一B+C `INSERT_DRAFT_ONLY`，无`send`方法。

5. 返回线程示例**仅为接口字段描述，绝不是当前用户真实消息**：`{status:'READY',authoritative:true,identity,canSend:false,delivery:'NOT_REQUESTED',message_count:N,messages:[{mid,original,original_sha256,providerSource,nativeInboundId,identity,translation:{status,text,source_language,target_language,provenance},suggestions:{status,candidates,run_id,session_id}}]}`。没有已授权的消息时 `messages:[]`, `message_count:0`。未授权统一 `WAITING_USER_AUTH`，与原生接口缺失 `NOT_WIRED`严格区分。

## 已完成与未完成边界

原W45继承59项Node定向测试，新增独立18项合成Owner业务读取/关联/跨账号测试：同一K/MID关联，A→B→C→A切换，错 MID/K、W25伪造行、W24撤权、原文哈希、译文来源缺失、W43 Run缺失、DRAFT_ONLY、未授权和完全零模板。本次所有fixture都明确是合法隔离虚构测试数据，不是本人渠道或云端付费模型；Node执行真正W45业务函数，不能算真人Provider回读。

**当前主P0仍由W09-2协调Owner接入：** (a) W24 Owner提供可验证完整K/当前READ_INBOUND Consent（现有W47 contacts仅有隐藏K的只读列表）；(b) W25 Owner签出原持久入站按K读取口并由W47接入；(c) W45现有真实翻译服务须有运行引擎+可验证回执，而当前localhost:5000未监听；(d) W43原生持久Agno Run真实服务端 attestor 需接现有W47安全会话并得当前用户授权；(e) W47将W45原业务结果挂载原 `/api/v2/contacts` / `/api/v2/messages` / `/api/v2/translations` 或独立经Owner批准的原API扩展，W46现有B+C使用，W09唯一负责44767用户Opera+Chrome操作验收。无本人四渠道授权=WAITING_USER_AUTH；不能提供真实联系人或真人消息。

**发布门禁：** W45 Source PASS ≠ 44767 Web PASS。真人账号连接=0，未经授权不能外发或假装已签。用户浏览器中每个按钮→实际HTTP→原Owner真实回执→持久状态→读回才可关闭Issue #77对应工作区；目前W45代码仅提供可供W09-2集成的业务输入输出和Owner严格来源验证。

## 2026-10-27 同轮真实本地Qwen3 Agno独立实验（与Owner测试分开）

实际复用W45既有 `w43-live-synthetic-lab.mjs` / W43 Agno SDK 3.1.10 PIN `d0987e9c64b937c923b3d32bda7bd05f86a638ba`，只读复用现有受保护llama.cpp `127.0.0.1:11605`。实验变量只持有原受保护API Key的本地文件路径，未打印密钥值、未启动或修改模型进程，未登录真人账号、未收费或外发。所有数据为独立的虚构K/MID合成输入。

| 虚构原文 | 原生Agno实际翻译 | 翻译Run ID | 回复Run ID | 结果 |
|---|---|---|---|---|
| 你好，最近怎么样？ | Hello, how have you been lately? | `d3c74de8-814d-4bed-acfb-9607377e1a1a` | SDK回复失败 | 0候选 |
| Hello, how are you? | 你好，最近怎么样？ | `96613bcb-5647-4758-9128-1dab187d15a3` | `f53b6053-ff3d-4909-b4b9-c426934e04b0` | 模型JSON结构错误，0 |
| Guten Morgen! | 早上好！ | `75c8ab1b-332a-42c0-858a-d36f2c2ce571` | `51c37525-979e-4a59-b07c-5a291182a1bd` | 原文复读，0 |
| Cześć, jak się masz? | 你好，最近怎么样？ | `c30d9d9a-9b7e-4350-9059-a5dd888b56be` | `38022b38-3adf-4687-b168-93ae6e0ccef8` | 实际生成“Cześć! Jestem dobrze, a ty?”；来源JSON合格1草稿但波兰语不够地道，质量HOLD |

原实验进程exit0仅代表准确完成诊断；结果为 `real_runs_completed:3`（成功完成翻译+回复配对的组数），`candidate_total:1`，`quality_qualified:false`，`real_accounts:false`，`paid_calls:false`，`live_sends:0`。四组翻译Run真实存在，但未经过独立双语质量认证。

这些旧W45/43本地真实Run **没有**本人的合法渠道授权、W25真人入站或44767端到端Web证据，绝不可冒充联系人工作区PASS；W09-2仍须集成真实Owner读取接口后验收用户Opera与Chrome。
