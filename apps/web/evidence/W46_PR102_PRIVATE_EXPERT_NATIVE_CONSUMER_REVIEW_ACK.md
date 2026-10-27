# W46_PR102_PRIVATE_EXPERT_NATIVE_CONSUMER_REVIEW_ACK
日期：2026-10-27
签署身份：W46 原B＋C/唯一PRIVATE Brain Vue Owner；本机 DESKTOP-029FH47
**最终结论：W46_UI_NATIVE_DIRECTORY_OWNER_REVIEW_ACK_PASS / EXPERT_POST_TO_AGNO_RUN_TRACE_E2E_RED（W47原桥接器）；不得标记整个专家功能REVIEW_ACK_PASS。**
此文是已执行源码、构建、浏览器、HTTP结果，并非待办方案。

## 唯一准确源码／Git
- W09-3 PR#102原联合父：`5730d390861865126e4a4748d05a92aafad5f917`
- W46本人最小修复 CLEAN HEAD：`cdfea6313c0b17cb1a641f2b376f51fd586b49d2`，独立Branch `owner/w46-pr102-expert-consumer-20261027` 已push，Draft PR#104 https://github.com/wangyi198675-coder/yance-v2-greenfield/pull/104 ，基于准确PR#102联合Branch，GitHub mergeable=true；本机worktree CLEAN，git diff --check PASS。
- 精确本轮源码改动：`apps/web/src/BCPrivateBrainWorkspace.vue`、`apps/web/tests/w09-r4-approved-visual-fidelity.test.mjs`（PR#102动态目录代替旧禁用文字后同步断言）、`apps/web/tests/w46-pr102-native-expert-consumer.test.mjs`（新增五条规则/身份/Trace/模型/CONTACT禁发回归）。**无第三个Composer、发送器、专家目录静态替换后门或服务端更改**。

## 五原Vue最终Git blob（只有PRIVATE Brain变化）
|原Owner Vue|准确HEAD git blob|
|---|---|
|BCProductWorkspaceCandidate.vue|`44db3a1fb7af6929543fe97a0da4312afee31e2e`|
|BCLiveChatWorkspace.vue|`9a553bb72480d516e2394d12278f40b15f0649b5`|
|BCChannelAccountSetup.vue|`f8fbfea417a9293d48fb10fc3976c0f1d38424f6`|
|BCNativeComposer.vue|`ba846b3f8acaa84fe4f7bccdcd75874df5dbc7fd`|
|BCPrivateBrainWorkspace.vue|`b89129629899dd110a1c6c9d1b0560207696f477`|
原W46 PR97及PR99已验收的弹层/键盘/Esc/点击外部/焦点恢复/模型费用确认/PRIVATE Agno History/原W24身份/W25 MessageDelivery/五主题并未重复开发。

## 本轮W46真实Vue消费
1. 用户打开唯一PRIVATE Brain「＋专家」，当前PRIVATE session有效时发 **GET /api/v2/private-brain/experts**。只认`authoritative:true,source:W43_NATIVE_AGNO_EXPERT,status:NATIVE_EXPERT_DIRECTORY_READ,canSend:false`，目录必须准确10、安装1、注册1，并逐项检查`registered,installed,enabled,canInvoke,availableMode`。禁把原设计十个名称写死或把其余9类假启用。
2. `oss-discovery` 是唯一已安装的原W43 **READ_ONLY_STABLE252_INSPECTION**；用户需明确点选该专家、填写有效原W43 Stable ID、勾选「仅THIS_TASK只读＋可能模型费用」后，且服务端PRIVATE当前模型配置/资格有效，才可提交。确认动作前重新 **GET目录** 和 **GET model-config**，匹配原已选模型。
3. 唯一写入是此明确同意后的原W47 **POST /api/v2/private-brain/experts/oss-discovery/turn**，body严格`{requestId,stableId,threadId:'personal',usageScope:'THIS_TASK'}`，使用原会话CSRF。成功POST还不算成功：必须再次GET `/api/v2/private-brain/runs/{runId}?threadId=personal`及`/runs/{runId}/trace?threadId=personal`，严格验证同一runId、原W43 Authority、COMPLETED、原persisted Tool、真实Trace后才显示认证回执；失败只显示服务端不可用，不在聊天历史插虚构回答。
4. 与CONTACT三模式隔离：不修改原CONTACT Composer、HUMAN/ASSISTED/AUTO disabled、K/Grant/budget/epoch限制、IME/草稿/引用/人工接管/消息发送；PRIVATE当前Qwen已选不代表联系人托管资格。

## W46源码/浏览器/UI验收——PASS
- 原Web Node全套 **130 tests／126 PASS／4环境SKIP／0 FAIL**；原W46 Vite实际构建 **2682 modules PASS**，git diff --check和工作树CLEAN。
- GitHub精确新SHA `cdfea6313c0b17cb1a641f2b376f51fd586b49d2` Hosted Run `40514258133` 已现场查到 `completed/success`，六个mandatory jobs（contracts-security、frontend-chromium-synthetic、native-node-contracts、agno-python-native、synthetic-m0-contract、nonproduction-merge-gate）**6/6 SUCCESS**。这证明源码CI合格，不解除下面的真实W47 POST503 RED。
- 与固定旧44767真正PRIVATE session/History关联，但API新专家路径被**定向透传到真实W47隔离HTTP实现+原W43 Python进程，使用明确标记的 synthetic W54 test principal 与单独临时SQLite**，不是把假的模型目录写到浏览器中。Windows真实Chrome/隔离Opera `430/950/1360` 均 GET `/private-brain/experts` HTTP200，服务端实际返回10、installed1/canInvoke1、其余9禁用、0横溢及pageerror，原PRIVATE历史六条不丢。
- 专家菜单可向上弹出、滚动，保留Esc/外部关闭；用户点击原`oss-discovery`前POST禁用，必须填Stable ID并勾选授权。无完整W24真实CONTACT K，430 CONTACT真实Composer操作继续HOLD，不用隐藏DOM的click冒充。
- Chrome/Opera 430/950/1360各完整五主题×深浅10态，共 **60/60 viewport-theme states无横向溢出**；原Theme token未改。
- 证据目录：`C:\Users\1\Documents\YanceV2\W09_2_WEB_FIRST_20261027_QA`：`W46_PR102_ISOLATED_NATIVE_EXPERT_BROWSER.json`, `W46_PR102_ISOLATED_NATIVE_EXPERT_OPERA.json`, `W46_PR102_ISOLATED_NATIVE_DEBUG2_BROWSER.json`, `W46_PR102_FIVE_THEME_RESULTS.json`, `W46_PR102_EXPERT_{CHROME,OPERA}_{430,950,1360}.png`, `W46_PR102_THEME_{CHROME,OPERA}_{430,950,1360}.png`，可重跑脚本`w46_pr102_isolated_native_browser.cjs`、`w46_pr102_opera_native_directory.cjs`、`w46_pr102_five_theme_browser.cjs`。

## W47 HTTP未授权负例——PASS；端到端真正只读Run——RED
- 真正 W47 `private-expert-native.integration.test.mjs` 按联合源码设置安装的原W43 Python及当前原Agno根，独立执行 **1/1 PASS, 0 SKIP**：未登录GET 401，错误Origin 403，缺CSRF POST 403，未装专家 409，停用专家不得Run，未配置模型专家Run 503，联系人mode/model缺W24/W44真实K+grant 503，撤权401；0付费/0社交发送。原Agno SQLite GET目录10/1/9和偏好enable POST→GET确实发生。
- 原W43独立本地Qwen测试 `services/agentos/eval_expert_private_port_real.py` 在本机确实完成真实单StableID只读专家、持久化原Agno Run`2746cf29-bf18-6bbf-3536-ad9e67f8e73e`、tool status`SDK_TOOL_RESULT_PERSISTED`、`traceCount=1`、4 spans，模型qwen3:8b，测试resolver明确**SYNTHETIC**，不是用户真人授权。
- **阻断复现：** 用真正W47 `createPrivateNativeExpertHttp`、原W43 Python bridge、隔离W54 synthetic current user principal、原本地qwen3:8b在Chrome1360真实按钮「选择专家→StableID A01→确认THIS_TASK」触发原`GET /experts`200、二次GET200、`POST /experts/oss-discovery/turn` **HTTP503 `W43_EXPERT_NATIVE_UNAVAILABLE`**。W46没有假造POST成功或Run/Trace。额外包装器仅记录W47内部无密钥错误码 `W43_PYTHON_VERIFIER_PROTOCOL_INVALID`。
- **精确源码原因：** `services/agentos/private_principal_port.py`原生`expert_turn`内部调用`native_run`再读已完成Run，该内部验证合法提出`PRIVATE_HISTORY`。但`services/api/runtime/private-python-port.mjs`当前Python VERIFY消息判断对`method==='expertTurn'`仅接受`PRIVATE_TURN`，因此在嵌套`native_run`原生readback阶段协议失配直接503。**这是W47桥接器原Owner缺陷，不属于W46前端。**
- **W47最小定点修复要求：** 保持当前principal、CSRF、W54/W55 current Session、revision、revocation、收费确认和原W25不可逆发送限制，只在`expertTurn`过程允许来自原W43真实执行链的已认证嵌套`PRIVATE_HISTORY` recheck；覆盖假Origin/过期/撤销/错误VERIFY顺序或重复并发、UNKNOWN不重试、跨Session Trace等负例。不能直接将所有VERIFY放行、不能伪造Run、不能把已进入UNKNOWN的同requestId再POST。由W47本人修复后必须重跑**用户点击POST→同Run GET→Trace GET**成功案例再变更本 RED。
- **真实业务资格：** CONTACT W24完整K、W44真实Grant与CAS、W47联系人模型预算API依然HOLD。PRIVATE专家合法受限用户授权在新的固定正式44767未上线前也不能宣称USER_DELIVERED。

## W09-3/W47交接
- W46 Vue Owner源码合格，可按PR#104精确3文件增量吸收；**由于W47 native expertTurn HTTP503，本项端到端验收明确RED，禁止发布“专家已能用”的宣传或切换44767。**
- W47原Owner先修本报告桥接层协议，再按原23来源W46/W47签署canonicalAck及protected Vite strict签署进行实际源码构建，源头SHA一致／新联合GitHub mandatory6/6与受控浏览器重测后W09-3负责唯一44767发布。W09-3当前旧Web/API `e9333d5969d07b26369448bad13e89ff79442431` 健康，旧44751/main/Windows均未改。
**准确状态：`W46_OWNER_VUE_SOURCE_DIRECTORY_UI_PASS / W47_NATIVE_EXPERT_TURN_BRIDGE_RED / EXPERT_RUN_TRACE_HTTP_E2E_RED / REAL_CONTACT_K_W44_MODE_HOLD / PROTECTED_W47_SIGNED_BUILD_HOLD / QA44767_NO_DEPLOY`.**
