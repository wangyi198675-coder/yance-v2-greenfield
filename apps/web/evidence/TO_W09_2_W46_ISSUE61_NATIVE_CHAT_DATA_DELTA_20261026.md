# W46 → W09-2 / W47 / W24 / W25 / W26–W29 / W45 | 2026-10-26 | Issue #61 原 B+C 真API CHAT最小接线

**签署限定：W46_REAL_CHAT_READ_SOURCE_BUILD_CHROME_PASS / UPSTREAM_PROCESS_MISSING / REAL_CONTACT_AUTH_HOLD / REAL_AGNO_MODEL_HOLD / REAL_PROVIDER_SEND_HOLD / NO_44751_DEPLOY**

## Authority and correct status

- 已实读 Issue #61 最新“所有 Owner 最高自主执行”及 `docs/PROJECT_HIGHEST_EXECUTION_RULE.md`；原本地协同阶段联合 `bb1be7bf070ceff39681b081b04754a4b4e34cc3`。本W46独立新工作树 `C:\Users\1\Documents\YanceV2\Worktrees\W46_ISSUE61_REAL_READ_UI_20261026`，分支 `w46/issue61-native-readonly-ui-20261026`；全部修改在 `apps/web/**`，不覆盖W09原工作树、44762、44751、main或旧版工程。
- 正式目前运行隔离Web `http://127.0.0.1:44762/version.json` 的精确`source_sha=bb1be7bf070ceff39681b081b04754a4b4e34cc3`；其现有原生API监听48187。实测 `GET /api/v2/runtime/health`: `trustedSession:false,connectedAccountCount:0,realContacts:0,realMessageCount:0,canSend:false`；`GET /api/v2/contacts`：`{ok:true,authoritative:true,contacts:[],source:'NONE_CONNECTED',connectedAccountCount:0,canSend:false}`；`GET /api/v2/messages`：401。这个W47 `services/api/runtime/server.mjs`是明确固定无Provider读写门禁，四渠道真实进程尚未启动，**W46不能前端制造真实联系人**。
- 原旧版只能对照需求语义，不导入V1源码或撤销凭据。原 B+C/唯一 PRIVATE Brain 原生Owner源码全部继承；没有第二个LLM/Agent/Memory/MessageDelivery。

## Actually implemented W46 within original Vue3 / Reka UI B+C

1. 在现有 `BCProductWorkspaceCandidate.vue` 唯一CHAT区接入 `BCLiveChatWorkspace.vue`，重用原OSS `ScrollArea`、`Message`、`Bubble`、`Button` 和**原唯一 `BCNativeComposer.vue`**。导航、BRAIN、其余工作区、五主题、SVG均不重设计。活动CHAT与其他工作区只由原有9分类切换，不触发人工接管。
2. W46 `live-chat-source.mjs` **实际 fetch W47正式同源** `GET /api/v2/runtime/health` + `GET /api/v2/contacts`，验证真实会话、`canSend:false`、权威来源、真实五元Identity K、`accountAuthorized:true`、隔离账号、唯一K、拒绝`SYNTHETIC_TEST_ONLY/fixture-/fake-`，每次“刷新真实联系人”真正重新GET；无授权显示`WAITING_USER_AUTH`且账号0/联系人0，不载入120条模拟联系。
3. 选择真实来源联系人后才 `GET /api/v2/messages?identityKey=<encoded full K>`，严格要求同K/MID/上游source/direction，翻译必须来自同MID同K的Run，错误语言/来源拒绝。当前API明确401，UI显示授权错误而不伪造历史。选联系人只是GET，**不会TAKEOVER/发信/标已读**。
4. 原 `BCNativeComposer.vue`（同一W46唯一Composer）现在可以保存*真实K*对应的本地未发送草稿；旧实验 `synthetic()` firewall保留用于原Fixture测试。W46增加 `createTrustedTakeoverPort`，在**真实用户编辑**时先调用 W47 `GET /api/v2/local-session/status`，没有有效`paired/CSRF/expiry`坚决不发接管POST；服务端资格齐全才按原W24 `GET takeover-state → POST expectedIdentityKey/expectedEpoch/expectedAccountRevocationEpoch/expectedConsentEpoch → GET同K HUMAN新epoch`。任何无授权/409/422返回 BLOCKED，**无W25外发端口，原发送器依然唯一且禁用**。目前账号0，此正向路径只能测试合约/负例，不得声称真人操作成功。
5. W46 `vite.w46.config.mjs` nonproduction owner候选启用CHAT时，**不挂载原冻结W37 120条虚构联系人的`main.workspace`**；直接复用CHAT空间的真实数据源组件。非生产原冻结设计文件 `design/**`保持字节完全未修改；当不运行产品候选时仍保持原实验原件以便历史追溯，不能作为真实产品展示。
6. W46 owner-only本机API代理支持测试显式`W46_NATIVE_API_PORT=48187`（严格127.0.0.1），非生产验证时只连已有 W09真正 staging runtime。当前App的 PRIVATE Brain已消费真正W47 Agno模型目录/配置/Turn/History端口，受信会话缺失时禁止消息模型假回复。
7. PEOPLE、ACCOUNTS、AUTOPILOT、PERSONA、TASKS、MEDIA目前服务端没有完整已签真实Owner API/Provider进程，旧静态UI继续显示准确未授权/能力不可用；W46不能将入口文字冒充可运行上游。

## Exact actual evidence / user click to actual API to UI

- Windows Node v24: `node --test apps/web/tests/*.test.mjs` **104/104 PASS、0 SKIP、0 FAIL**（设置真实 W47/W24/W44/W45 Owner环境，保留旧Native HTTP安全回归；本轮新增 live-chat DTO + 3 trusted W47-W24 Session/CSRF negative/positive-port contract tests）。旧 B+C `npm test` 原15项仍依赖历史冻结设计但不用于宣称真实联系人；本轮未重做。
- Windows Vite v7.3.7 **2673 transformed modules / BUILD PASS**，仅 `apps/web/.w46-test-dist` 隔离产物，Vue3 3.5.44、Reka UI 2.11.0、TanStack Vue Virtual 3.13.47、@lucide/vue 1.55.0 复用锁定包，原OSS UI没有自研替换控件。具体组件包许可证应沿正式上游lock/notice逐一复核，不冒充四渠道Worker已安装。
- 真实Windows Google Chrome nonproduction `http://127.0.0.1:4174/?arm=CHAT-BC-FUSION&productDraft=1`，API确实由当前W09监听48187提供：**320×680／430×850／950×620／1360×900四档PASS**；实际点击「刷新真实联系人」触发新GET，再切换BRAIN/ACCOUNTS/PEOPLE/CHAT、刷新恢复，UI显示`尚未取得可信本机应用会话`，0真K、0可发信草稿、0冻结模拟联系人、0模拟消息、0外发请求、0收费模型请求、0JS pageerror，横向无溢出。四张实际Chrome：`apps/web/evidence/W46_ISSUE61_REAL_CHROME_{320,430,950,1360}.png`；网络请求与操作详见 `W46_ISSUE61_REAL_CHROME_UAT.json`。此证据只能签**真实API只读负例/界面通路**，不是上游用户正向验收。
- 本次实际Chrome测试用的JS脚本 `apps/web/tests/w46-issue61-real-chrome.cjs` 和纯合约 `live-chat-source.test.mjs` 在Own worktree；从不发送模拟真人消息/调用收费API。

## Cross-owner direct minimally actionable interfaces (Issue #61)

W47 + W26/27/28/29须将现有W47 `server.mjs` 固定空统计/空contacts/401messages替换成**受签真实Provider/Identity Owner只读桥**，不需要另建协议栈。最低实际消费：
- 实时`GET /api/v2/runtime/health`及`GET /api/v2/contacts` 由已启动SDK/bridge+账户身份签发：`{ok:true,authoritative:true,canSend:false,connectedAccountCount:N,source:'VERIFIED_NATIVE_CONNECTOR',contacts:[{tenant,account,channel,peer_id,binding_revision,identityKey,accountAuthorized:true,displayName,unread}]}`，未授权返回真实0。不得直接信任来自网页JSON的Actor。
- `GET /api/v2/messages?identityKey=<urlencoded K>` 要检查服务器session＋当前ChannelAccount/K绑定及本人授权、仅返回当前K真实上游MID：`{ok:true,authoritative:true,canSend:false,identityKey:K,messages:[{identityKey:K,mid,original,direction:'INBOUND'|'OUTBOUND',providerSource,translation?:{identityKey:K,sourceMid:mid,zh,runId,qualityQualified:false}}]}`。K应由服务端派生/确认，不信任浏览器传来的可视名称。尚无身份，直接401。真实W45建议0–3和W25发信必经另一已有原生Owner链，不通过这个GET发消息。
- 提供经过用户动作启动的四个平台**真实官方授权入口/状态接口**（由W26-29完成真实上游SDK、license/worker PID），W46才能从ACCOUNTS页显示“可授权”而不是永远 disabled；不要凭Browser自己拼OAuth链接/短信码/QR。W47-W54给普通应用原生可信session/W55用户Key native保护；这些都是已有独立Owner实际工作。
- W47 / W24应在当前现有身份GET/POST接口上实际绑定已签当前session/CSRF与四字段CAS；W46已准备安全消费端。W44预算托管/撤销真实GET、W43 Agno Tools/History、W45真实翻译建议/W25 W25 Outbox要沿原Owner签署能力，在无运行上游前不可凭界面伪造。

**W46阶段：SOURCE_PASS + W46真实Chrome只读负例 PASS，不是`INTEGRATED_STAGING_PASS`或`USER_DELIVERED`。只有社交账号本人登录/扫码、数据/发送/自动托管授权、本人付费Key/费用、正式44751发布需用户最后决定，其余原生安装与端口Owner自行继续。**
