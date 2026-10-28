# W46 → W09-2/W43/W47/W54/W55｜最高规则私人AI零配对体验最小Owner接线｜2026-10-26

**严格基线**：已实读 `C:\Users\1\Documents\YanceV2\Worktrees\W09_PROJECT_HIGHEST_POLICY_20261026\docs\PROJECT_HIGHEST_EXECUTION_RULE.md` 正式全文（§§1-9）及 Issue #61 最新W09-2纠偏；基线联合 `e352180cba665b56b35822fa2aff2c7525360016`，从该 SHA 创建 W46 独立工作树 `C:\Users\1\Documents\YanceV2\Worktrees\W46_PRIVATE_SIMPLE_AI_RULE_20261026`，分支 `w46/normal-private-ai-no-pair-20261026`。修改仅 W46 原有 `apps/web/**`，不改其他Owner、旧版、main或正式44751。

## 本人已完成且实测的W46最小差异

- **没有普通用户登录/配对 UI**：原唯一 BRAIN 工作区保留 `BCPrivateBrainWorkspace.vue` 且移除 `BCNativeHostSession` 视觉占位；这个既有 Windows 原生身份/IPC诊断组件原样重用在已有 SETTINGS → diagnostics，**未删除W54 native保护**。CHAT → BRAIN → CHAT 原Layout、唯一Composer、唯一Agno Brain全部不重做。
- 普通 PRIVATE 在W47返回 no-session/unpaired 或401时，直接显示简洁 `设置AI模型`，自动展开既有 OpenRouter、OpenAI API、本地可选Qwen3三种来源，**不再显示 terminal pair、64位配对码、人工“可信登录”指令、WebView2设备验证或WinCred安装命令**。本地Qwen3没安装也不阻断云端选择；三种来源均来自现有W47 PUBLIC目录，不冒充已配置模型。
- 原 PRIVATE Session过期时同源重新GET服务端，**不要求用户重新pair**；成功创建后依旧保持原 `GET model-config`、`POST model-selection` +独立再次GET、`POST Agno turn`/验真Run及History刷新恢复，复用原W43的一份Agno/History，未新增Memory数据库、模型SDK或模拟回答。云端Key仍不得明文进入浏览器、localStorage、URL、JS bundle或日志。
- W46将原私人AI404/401/503界面错误改为普通本机服务提示，未改变任何HTTP/Agno失败行为。社交账号仍需本人授权；已有W24/W44/W25、撤权、去重、Outbox/UNKNOWN和真人外发不变。

## 已实际执行的验收（分口径）

- Windows Node v24 `node --test apps/web/tests/*.test.mjs` **119/119 PASS / 0 FAIL / 0 SKIP**（保留先前116合同 + 新增3条最高规则 UI SOURCE测试）。原B+C冻结OSS参考 `npm test` **15/15 PASS**；Vite v7.3.7 编译 **2679 modules PASS**，原B+C所有OSS包/lock保持不变。
- 真正安装的Windows Chrome against nonproduction current Vue build `http://127.0.0.1:4191/?arm=CHAT-BC-FUSION&productDraft=1` → 现有W47 stage48191 API：**320×680、430×850、950×620、1360×900 4/4 PASS**；实际点BRAIN、模型设置展开/三平台可见、刷新再进入BRAIN、返回原CHAT。真实Chrome DOM恰好一个PRIVATE、原生Windows身份诊断不出现在BRAIN、无terminal pair/64位口令、无synthetic contacts/historical fake messages、模型发送不可用、无Key密码输入框、0 JS pageerror、0非GET HTTP、无模型调用/付费/社交外发。页面宽度均无水平溢出。
- 实际Chrome原始HTTP请求表在 `apps/web/evidence/W46_PRIVATE_SIMPLE_NO_PAIR_REAL_CHROME_UAT.json`，四张当次真实截图 `W46_PRIVATE_SIMPLE_20261026_{320,430,950,1360}_ACTUAL_CHROME.png`，可重演脚本 `apps/web/tests/w46-private-simple-no-pair-chrome.cjs`。
- **严格区别源码运行版本：** W46 Vue 源为本次由e352继承的Owner增量；该Chrome测试所连W47实时stage为48191旧联合API SHA `894c25643cdde8af2307c8d8396dad96c39471eb`，因为W09 e352同源独立Windows验收环境未保持API listener在该端口。这个证据证明真浏览器真实W47缺乏私人Session时的UI安全负例和三来源目录展示，**不能冒充同版本 e352 的已签Agno私人正向调用**。不会捏造Key、模型、用户问答、历史。

## 当前真正源码缺口——按最高规则停止过度认证、不把工作返给用户

**已确认e352真实 server.mjs**：`operatorMode` 仍只有人工 `pair` 入口，默认 `createLocalSessionAuthority(...approvePairing:null)`，`/local-session/first-party` 没有W54实际自动回调，`createPrivateModelHttp` 和 `createPrivateBrainHttp` 未注入本人原生W43 runtime/原生History或W55受保护Key，源码注释注明它们未接通。因此用户尚不能完成真正OpenRouter/OpenAI/本地Agno PRIVATE两轮及重启历史恢复。**这是W47/W54/W55/W43唯一现有Owner原生运行接缝，不是继续让W46添加“可信登录”页面解决的问题。**
- W54/W47最小复用：正常启动后，已批准的**当前本机运行W47 HTTP进程＋原B+C同源**由应用自动完成必要内部请求，避免任何普通用户配对流程；不通过网页自报 Actor/localhost 端口授予社交权限，不新增企业身份中心/签名发行平台。
- W55复用现有WinCred/DPAPI、W54 Tauri原生受控命令，让用户**主动**简单填写自己的OpenRouter/OpenAI Key，安全保存/轮换/撤销，不让Key出现在HTTP JSON或前端静态包；后台只有原Agno执行器可以使用本机受控Key；无需新增Vault。
- W43/W47复用原Agno AgentOS、Session/History/Tools与ModelID；本地Qwen3有则可用，云端有Key即可用；真实Turn历史回读不改变联系人发送资格。至少两轮真实已授权私聊+模型切换后历史保留+重启恢复才是正向PASS。
- W46已经绑定原W47真实 `model-catalog`、`model-config`、`model-selection`、`turn`、`history`，W47/W54/W55接口接通后无需开发第二套PRIVATE控件或修改原Composer。需要此阶段真Key、真实费用之前用户本人作选择；没有任何授权时保留发送禁用状态。

## 不可虚报的状态

**W46_NO_PAIR_PRIVATE_UI_SOURCE_AND_WINDOWS_CHROME_PASS**。普通无模型/无Session状态能正常打开并看到简单三来源设置；实际本地模型聊天 A、用户云Key的Agno多轮和History B、W54自动本机会话/Key UI原生正向、四平台真实本人授权仍 **HOLD**。**不是 USER_DELIVERED**、不覆盖44751、不收费、不登录任何真实社交账号、不外发。
