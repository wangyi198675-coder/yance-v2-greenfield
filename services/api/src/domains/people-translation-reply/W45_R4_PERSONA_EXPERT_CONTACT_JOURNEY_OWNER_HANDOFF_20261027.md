# W45 → W09-3 / W43 / W47 / W46｜用户已批准R4紧凑设计：Persona / CONTACT目标 / 专家 / 0–3真实策略 / 反馈
日期：2026-10-27。原W45源基线 `8870f677dbd23a04d6e7fda8f5cad32f9e1ecaee`，严格改动只在 `services/api/src/domains/people-translation-reply/**`。本文件是**W45原Owner候选业务DTO与隔离测试回执**，不是Persona DB Owner签署、不是用户44767运行验收。适用唯一正式Agno、唯一B+C Composer，仍保持W24/W25唯一真账号/授权/真人外发。

## 已实际读取的用户批准规则
- `COORD_AGGREGATE/DESIGN_APPROVED_20261027_R4_COMPACT_V1/00_START_HERE.md`、`01_USER_APPROVED_CHANGELOG.md`：R4紧凑导航、两行Smart Inbox、搜索胶囊、五主题、Persona Studio与Tools专家/Composer“＋→专家”进入实施；HTML点击仅设计样例。
- `COORD_AGGREGATE/PERSONA_EXPERT_CONTACT_JOURNEY_AUDIT.md`：原PersonaPolicy、GlobalStyleRule、PersonFact、FeedbackEvidence尚未有实际唯一持久Owner。阶段2源合同 `03_统一记忆成长与真人回复质量契约.md` 的真正本人事实、获批准规则和CONTACT事实分离继续有效。
- `W09_3_20261027_USER_APPROVED_R4_COMPACT_UI_AND_NATIVE_E2E_IMPLEMENTATION_DISPATCH.md` 原本明确由W09-3裁定**唯一Persona DB/Rule版本Owner**，原W43负责Agno，W45负责真人回复的薄DTO，W24负责身份/学习Consent，W25只负责消息与ACK。
- 已向Issue #77提供真实Owner选择申请（ID `6433944214`）；截至本W45增量写入时，**本轮未取得正式Persona持久权威Owner的本人ACK、数据库位置、读写契约或签署SHA**。本轮不私建第二记忆/事实/规则库，也不在W44 Grant表中塞学习信息。

## 实际新增源接口（业务而非另一台服务）
`persona-contact-journey.mjs` export `createPersonaContactJourney(ports)`，提供两个方法：
1. `await onVerifiedInbound({principal,identity,mid,replyLanguage})`：仅由W47原HTTP/渠道合法调用完成W25**已持久化**入站之后触发；未获得真实User/Channel授权返回 `WAITING_USER_AUTH`；缺Persona原Owner返回 `PERSONA_AUTHORITY_NOT_WIRED`，**不调用模型**；W43源缺失返回 `W43_NATIVE_CONTACT_RUN_NOT_WIRED`、零候选；不接入W25真人发送。
2. `await recordFeedback({principal,identity,mid,originalSha256,candidateId,action,eventId,expectedRevision,details?,w25Ack?})`：六种原动作 `SELECT/EDIT/REJECT/ADOPT/SEND_ACK/DO_NOT_LEARN` 完整区分。缺正式Persona存储Owner的read/write ports返回 `PERSISTENCE_UNAVAILABLE, persisted:false`。签出的read/write port必须提交后按eventId、actor、MID、originalSha、action、learning eligibility**重新读回**，否则报 `PERSONA_FEEDBACK_DURABLE_READBACK_REQUIRED`；即使有合法反馈也只报 `RECORDED_NOT_LEARNED`，绝不在输入时训练/触发Agno记忆更新。

### 第1步：W24当前五段K及W25来源
- `principal={verified:true,source:'W54_NATIVE_CURRENT_USER',principalRef,installationRef,revocationGeneration}`（必须服务端当前身份，非浏览器自己提供）。`identity={tenant,account,channel,peer_id,binding_revision}`由原W24唯一判断；CHANNEL仅四平台，不能因为“同名”合并A和B。
- `readW24Current({principal,identity,operation:'READ_INBOUND'})` 原生Owner提供 `{issuer:'W24_IDENTITY_CONSENT',status:'AUTHORIZED',readInboundConsent:true,principalRef,identity,accountEpoch,consentEpoch}`（epoch正整数）。未本人授权时合法返回 `{status:'WAITING_USER_AUTH'}`，绝不虚构联系人。
- `readW25PersistedInbound({principal,identity,mid,authority})` 返回由W25真实原生SQLite/渠道Owner attest的 `{issuer:'W25_ORIGINAL_INBOUND',status:'INBOUND_PERSISTED',identity,mid,original,originalSha256,recordId:<64hex>,providerSource:'mautrix-meta|pancake|baileys|tdlib-json'}`。K/MID/原文SHA/持久ID/Provider全校验，**入站事件未被W25持久确认绝不触发Agno**。W47需映射原W25现有native read，而不是再造消息表。

### 第2步：唯一Persona关系事实规则权威，只读投影
`readPersonaCurrent({principal,identity,operation:'READ_PERSONA_CONTEXT'})` **待Persona DB唯一Owner正式签署**，建议最小业务DTO：
`{issuer:'PERSONA_NATIVE_OWNER',status:'ACTIVE',principalRef,identity,policy:{personaId,version,scope:'SELF_APPROVED',approved:true,active:true,revokedAt:null},contextRevision,languagePolicy:{replyLanguage:'de|pl|en|zh-CN',source:'USER_EXPLICIT|CURRENT_INBOUND_LANGUAGE|VERIFIED_CONTACT_HISTORY',revision},factRefs:['approved-person-fact-id'],relationship:null|{stage,revision,longTermGoal,currentGoal,sourceFactRefs},experts:[{expertId,version,installed:true,enabled:true,issuer:'W43_NATIVE_EXPERT_REGISTRY'}]}`。
- 本人PersonaPolicy仅经本人核准，不能把CONTACT事实写成本人事实；联系人关系目标必须有当前有效`sourceFactRefs`，来自当前K投影并已核准。Persona状态/版本/语言源、可用专家均来自权威Owner和W43真实安装，而非候选JSON；0/10专家安装时就传 `experts:[]`，不得造10个。
- 任何`readPersonaCurrent`为禁用/撤回/过期/不同K或版本未批准，**阻断调用W43模型**，不得以Agno History冒充规则。
- W24 `PERSISTENT_LEARNING`仅适用于判定反馈后续`eligible`；不把它当“保存Persona已完成”。经W09-3签署前，原生Persona读取Port缺失是**真实P0 HOLD**。

### 第3步：W45原文/译文来源→W43原SDK CONTACT Run
- `readW45Translation({principal,identity,mid,originalSha256,targetLanguage:'zh-CN'})` 仅消费旧W45有真实执行回执的 `TRANSLATED` 和完整 `provenance:{kind:'LOCAL_ENGINE|AGNO_NATIVE_TRANSLATION',synthetic:false,source_mid,input_sha256,provider,request_id}`，必须再由既有签署引擎`attestW45Translation`确认；缺失时`{status:'UNAVAILABLE',text:null}`，**不传虚构中文**进W43模型。
- 新的 `scope` 精确包含 `principalRef,identity,persona:{personaId,version},contextRevision,relationship, factRefs, experts:[{expertId,version}],sourceMid,originalSha256,translationSha256,replyLanguage,idempotencyKey`。W43真实执行口 `runW43Contact({principal,scope,original,verifiedTranslation})` 必须沿原Agno AgentOS/SqliteDb/原Request ledger；**无新Agent/新SQL**。idempotencyKey由fullK、MID、原文SHA、Persona/关系revision确定；跨Worker去重由W43原持久Run ledger负责，W45不声称跨进程去重能力。
- W43 native receipt必须明确 `{status:'AGNO_RUN_COMPLETED',engine:'OFFICIAL_AGNO_SDK',outbound:'DISABLED',identity,sourceMid,originalSha256,personaVersion,contextRevision,experts:[{expertId,version}],runId,sessionId,modelProvider,modelId,candidates:[...]}` 并有独立 `attestW43ContactRun` 的实际persisted Run/idempotencyKey证明。不能用浏览器提交的runId自证模型来源；未签W43端口**不得真实运行付费模型或宣称已触发**。
- 每个候选 `{id,text,strategyId:'DIRECT_ANSWER|WARM_SUPPORT|BOUNDARY|LIGHT_HUMOR|NATURAL_CLOSE|OTHER',sources:[{mid,part:'ORIGINAL'|'TRANSLATION'}]}`，零至三条必须是**实际W43生成结果**。禁止相同strategyId、相同自然文本、错MID/未验证译文；超过一条必须还有**独立模型/人工语义差异回执** `attestSemanticDiversity`，否则仅放行已收到的第一条真实草稿且显示`UNVERIFIED_REDUCED_TO_ONE`，从不补模板。成功仍 `action:'DRAFT_ONLY',delivery:'NOT_REQUESTED',quality_qualified:false,quality:'NATIVE_LANGUAGE_HUMAN_REVIEW_PENDING'`，只能交原B+C Composer。
- 同一K/MID一边调用W43另一边撤权、改目标/Persona版本/语言规则/专家绑定时，读后复核W24当前状态与Persona快照；不一致整批拒绝并停止显示旧Run/候选。

### 第4步：反馈事件从操作到唯一持久Owner
- `recordFeedback`先验证W24当前K、W25原MID/SHA、`attestW43CandidateSource`属于该contact的真实Run候选；ACTION各自独立eventId/revision，不以Adopt等于Send。
- 只有`SEND_ACK`需要由W25原唯一Outbound/Provider ACK回读`attestW25SendAck`；只点击发送、pending/unknown/本地草稿不准标发送成功。
- `readW24LearningConsent`原Owner返回当前PERSISTENT_LEARNING Consent。只有许可时REJECT/EDIT/ADOPT/SEND_ACK可能`eligible:true`，`SELECT`或`DO_NOT_LEARN`从不 eligible；**eligible 仍不表示真正模型训练、已批准规则或已改变人格**。独立Persona DB Owner之后执行人工审查、批准规则revision与撤回、冷重启读回；W45不持久或自动学习。
- 缺权威Feedback Store不允许回报“已保存”；W47需要将读/写接口挂原 `/api/v2`，W46 Persona Studio/唯一Composer必须点击→W47→Owner→读回显示真实revision。任何未实现入口明确HOLD。

## 独立回复/翻译质量：实证与缺口分离
1. 本次Node构造**隔离合法虚构数据**，实际运行W45新增`persona-contact-journey.test.mjs`：W24 K及真实Owner调用结构、错误MID/原文SHA、A/B/C不同帐号/peer隔离、政策撤权/版本/目标/语言变化、已安装专家绑定不匹配、独立语义评价缺失多候选只能留一条、非原文来源译文UNAVAILABLE、六类反馈持久读回、真实W25 SEND_ACK拒绝假证明。测试fixture中`PERSONA_NATIVE_OWNER/W43/W25`端口是**合成可信callback**，不表示对应Owner当前实际提供了生产接口。
2. W45原有本地llama.cpp+真实Agno合成实验（2026-10-27先前实测）：4种语言的真实翻译Run，中文组reply Run失败；英文组JSON不完整0条；德文组仅复读原文0条；波兰组实际一句 `Cześć! Jestem dobrze, a ty?`，虽来源可验证但波兰语用法不够自然，`quality_qualified:false`。这些真实SDK数据存原 `W45_20261027_ISSUE77_PEOPLE_TRANSLATION_REPLIES_REAL_SOURCE_OWNER_HANDOFF.md`，不冒充本轮真人平台消息或双人盲测。
3. **真人母语质量仍需独立真人评审；本轮不伪造自然度通过。** 阶段2合同要求原/译文忠实度、对方母语/文化、策略独立性、直接回答、边界、CONTACT事实防臆造、A/B二十轮+冷重启、撤销规则后旧人格停止应用。波兰语/德语/英语/中文等应有经许可的双语/母语样本、实际W43源Run+W45质量盲审回执；否则 `NATIVE_LANGUAGE_HUMAN_REVIEW_PENDING`。实际model policy不自动给出质量PASS。

## 下一跳Owner：最小差异，谁改什么
- **W09-3（决策）**：须正式确认**一个**PersonFact/PersonaPolicy/GlobalStyleRule/FeedbackEvidence的已有原生DB Owner、仓库路径、DB schema/REV、版本签署ACK。已向Issue#77发Owner申请评论ID`6433944214`，**未取得签署答复前P0 HOLD**。请勿让W45自建第二库，不要将W43 SQLite Session称Persona真值，也不用重做已批R4布局。
- **W43（Agno/专家Owner）**：在原AgentOS/SqliteDb/Request ledger上提供`runW43Contact`和`attestW43ContactRun`，传当前Persona policy/version、事实引用、CONTACT关系阶段/当前目标/语言策略、有效expertId+version，并从真实W43 Run提取策略ID；登记真专家生效状态而不是候选JSON。独立语义多样性/母语质量来源协同W45 QA，不允许简单地自称“策略不同”。
- **W47（API Owner）**：W24 current fullK+学习Consent、W25 persisted inbound+真实send ACK、Persona Owner current projection+持久反馈、W45翻译证明/W43 Run端口，作为原本机可信回调组合；经当前用户/渠道授权后调用`onVerifiedInbound`、`recordFeedback`，并能READBACK。未知凭据不开放HTTP外发。
- **W46（Vue/Composer Owner）**：消费原B+C CONTACT数据，R4紧凑界面Persona Studio版本/暂停/恢复/反馈操作、Composer“＋→专家”、明确的A/B当前目标与三策略候选；无真Owner回执标不可用，不能用静态专家卡或原PRIVATE History假称长久学习。
- **W24/W25/W44（既有Owner）**：不改原资格模型。K、Consent PERSISTENT_LEARNING和W25 ACK交旧签Owner；W44托管只影响AUTO和预算，不等于Persona批准。未获用户社交授权保持WAITING_USER_AUTH。不得对真人自动发送、付费使用或越权学习。

## 真实门禁与未完成
- 新源/Node测试通过只能标**W45_SOURCE_TEST_PASS**；接口里要求的`issuer:'PERSONA_NATIVE_OWNER'`是**待签拟议权威契约**，W09不能在HTTP JSON里自制签名字符串使其通过。未存在/未注入的端口仍是HOLD；不能报告已真实持久Persona、10专家已安装、联系人自动真实触发、3条已经语义签署、双母语自然度PASS、44767页面UAT通过。
- 旧正式44751不可改。固定44767只能由W09-3按真实SHA受控更新；W45这轮不部署、不改W43/W46/W47/W24/W25/W44、也不新建模型/学习库。
