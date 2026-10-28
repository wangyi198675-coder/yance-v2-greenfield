# W46｜PR#99 CHAT/PRIVATE紧凑弹出菜单原Vue最终Owner复签
日期：2026-10-27
## 签署结论
**W46_POPOVER_UI_AND_PRIVATE_NATIVE_INSPECTION_OWNER_REVIEW_ACK_PASS**。
**CONTACT真实模型选择／W44三模式CAS／W43专家执行资格接入仍为跨Owner HOLD；不声称真人社交或收费能力闭环。**
- W09-3原PR#99 HEAD、直接父：`ef02da82b1a7ebb97090af9cfdfb54e295c1457b`
- 本轮W46精确CLEAN HEAD：`2765a7600e1562df658cad67faab371fee243ea2`
- 分支：`owner/w46-pr99-contextual-menu-final-20261027`，Draft PR#101 https://github.com/wangyi198675-coder/yance-v2-greenfield/pull/101 ，base PR#99独立integration分支。
- Git HEAD及worktree本机已校验一致，`git status --porcelain`为空，`git diff --check`PASS。
- 原Owner身份：言策 W46，原B＋C Vue组件 Owner，本次独立复审W09已有候选后仅在原两Vue最小增量，不重建Composer/Agent/DB/SDK。
- 源码改动**仅3项**：`apps/web/src/BCNativeComposer.vue`、`apps/web/src/BCPrivateBrainWorkspace.vue`、`apps/web/tests/w46-pr99-contextual-popover.test.mjs`。无第三个Composer、第二个发送器、重开W43/W25或者新渠道授权系统。

## 当前准确五Vue Git blob（原W46 PR97范围继承）
|Vue组件|最终HEAD blob|本轮变化|
|---|---|---|
|BCProductWorkspaceCandidate.vue|`44db3a1fb7af6929543fe97a0da4312afee31e2e`|未修改，继承PR97原W46 ACK|
|BCLiveChatWorkspace.vue|`9a553bb72480d516e2394d12278f40b15f0649b5`|未修改，保留唯一CONTACT宿主与null K|
|BCChannelAccountSetup.vue|`f8fbfea417a9293d48fb10fc3976c0f1d38424f6`|未修改，继承QR/WAITING Owner签署|
|BCNativeComposer.vue|`ba846b3f8acaa84fe4f7bccdcd75874df5dbc7fd`|W46仅紧凑弹层与键盘行为|
|BCPrivateBrainWorkspace.vue|`2247e83d0925642bf3b82433c76be6adf49395cc`|W46菜单统一＋复用W47真实只读工具／Run／Trace|

既有正式复签 `COORD_AGGREGATE/W46_PR97_376277C_FIVE_VUE_OWNER_REVIEW_ACK.md`（PR97）和PR95渠道ACK全部继承；原B+C／Agno／W24／W25／W43源合同不重复编写。

## 本轮新增W46源码实际签署范围

**原单一 CONTACT Composer**
- 「＋专家」「模型」「人工／辅助／自动」分别打开紧凑输入框上方的`role=menu`浮层，互斥只显示一个；顶部不再展开大块10专家目录。
- Esc关闭并返回触发按钮焦点；外部pointerdown关闭；ArrowUp/Down、Home/End在菜单内可操作控件循环、移除DOM监听器；ARIA `aria-haspopup`、`aria-expanded`、`aria-controls`对应真实可见菜单。
- 原设计专家10项仍全部disabled，直到W47暴露W43真实`expert_directory`包含installed/enabled/scope/authorization的签署DTO。原native`oss-discovery`有installed但只能合法PRIVATE THIS_TASK只读，**不能拿Python注册假装CONTACT已授权**。
- CONTACT「模型」不是PRIVATE模型，仍disabled，并明确要求合法W24身份K、当前ChannelAccount、密钥预算及W47模型资格真实读写；没有新加假的`/api/...contact-model`URL。
- HUMAN/ASSISTED/AUTO只显示菜单，三项均disabled；W44有效`effectiveGrant/bindingRevision/epoch` CAS契约未取得时绝不触发POST或假报成功。浏览／焦点／选择联系人不触发人工接管；原IME、粘贴、附件、草稿隔离、`sourceQuote`和原W25不可逆发送边界保持。
- 正常桌面950/1360实际浏览器点击可见、浮层宽315px且不出视口、关闭与互斥已验证；**430无授权真实联系人K，聊天移动页原唯一Composer物理隐藏，无法合法实点；`CONTACT_430_AUTHORIZED_UI_HOLD`，不能将脚本元素click冒充通过**。

**原独立PRIVATE Brain**
- 专家／模型／工具三个浮层互斥使用Esc、外部关闭、上下/Home/End、焦点恢复及卸载清理；原模型选择`selectedProvider,selectedModelId`与W47本机`model-config/selection`保留，云端模型仅切换时`confirmPaidCost:true`并POST后GET，后续对话无逐轮费用复选。
- `tools`菜单开启时，持有有效原W47 PRIVATE Session才调用原same-origin **GET** `/api/v2/private-brain/tools`和`/api/v2/private-brain/runs?threadId=personal&limit=10`。必须回`authoritative:true`＋`source:W43_NATIVE_AGNO_SDK`＋`canSend:false`＋合法数组等才显示；否则只显示真实不可用，不显示假工具/Run。
- 对有来源Run单击`查看 Trace`，经原同一PRIVATE Session执行**GET** `/api/v2/private-brain/runs/{runId}/trace?threadId=personal`。校验当前ID、scope/source/authority、`noTraceFabricated:true`、安全数量后仅显示真实Trace条数；错误或403/409/503均fail-closed。
- 未新增任何Agno发送、工具自动执行、CONTACT权限、收费调用或真人消息。原`verifiedTurn/verifiedHistory`、History/Run私有边界全部保留。

## 独立测试/真实页面点击→HTTP→回读
1. 原W46全套 Node：**125 tests / 121 PASS / 4环境SKIP / 0 FAIL**（新增5条菜单/权限/原生GET/source guard回归），新W46 Vite Config：**2682 modules PASS**。W47正式strict signed source build和新GitHub Hosted CI仍按其准确SHA复核，不借旧PR99 CI。
2. W46 Chrome + 独立Opera、430/950/1360六档实际安装浏览器使用新Vue构建资源+现有同源API（没部署）`W46_PR99_REAL_BROWSER_RESULTS.json`：桌面CONTACT三个菜单都是真正可见且位于视口内；互斥、Esc、外部点击关闭，PRIVATE三个菜单六档可点击，0横向溢出/0 pageerror/0业务写入。430 CONTACT须本人已授权真实联系人才能验证，继续HOLD。
3. 五正式主题×深浅共10态，Chrome+隔离Opera各430/950/1360合计六档，每档10个真实DOM主题状态，共**60/60状态无水平溢出**；`W46_PR99_FIVE_THEME_RESULTS.json`、对应六张菜单截图。没有修改原主题Token和移动布局。
4. **真实目前固定44767本机API链**（仅Chrome隔离覆盖HTML/JS为W46编译版，原44767运行Web/API进程与SHA未动）：原PRIVATE自动启动一次本机Session POST200、GET`/api/v2/private-brain/model-catalog`200、`/api/v2/local-session/status`200、`/api/v2/private-brain/model-config`200、`/api/v2/private-brain/history`200、`/api/v2/private-brain/cloud-keys`200。界面实际模型 `LLAMACPP_LOCAL_QWEN3_8B_FREE / qwen3:8b`可选择，History原三轮六条保留。
5. **点击「工具」真实GET** `/api/v2/private-brain/tools`200＋`/runs`200；真实W43返回**3个注册只读工具／3条有来源Run**。点击第一条「查看 Trace」真实GET `/runs/bbbf4ab7-81d9-4058-2d0c-233d3040e523/trace?threadId=personal` **HTTP200**；Vue显示`NATIVE_TRACES_FOUND`、**1条有来源Trace**。证据`W46_PR99_REAL_44767_API_PROBE.json`、`W46_PR99_REAL_44767_PRIVATE.png`（测试未重发任何Agno模型提问，不计费）。
6. QA证据目录：`C:\Users\1\Documents\YanceV2\W09_2_WEB_FIRST_20261027_QA`；脚本`w46_pr99_context_popup_real_browser.cjs`、`w46_pr99_five_theme_browser.cjs`、`w46_pr99_real_44767_api_probe.cjs`及上列JSON/PNG。

## 明确交给原W47/W44/W43的最小DTO阻断（不猜URL）

|未接功能|唯一真实Owner契约要求|W46当前处理|
|---|---|---|
|PRIVATE专家目录／授权运行|W43已存在原`native_experts.py` Port；W47 same-origin PRIVATE Directory GET 返回`expertId,installed,enabled,allowedScope,currentSession,canInvoke,authVersion`等真实字段，限定read-only THIS_TASK；合法专家Run需单独签署费用/CSRF/epoch及POST/GET回读|全部禁用，不把10个设计候选冒充安装|
|CONTACT独立模型|W47基于W24完整K/账号/绑定修订、W44有效当前预算/权限和W55真实密钥的model-catalog/selection GET/POST/GET，型号变化资格再回读|按钮可开只读菜单，选项禁用；PRIVATE模型没有继承给联系人|
|HUMAN/ASSISTED/AUTO|W44原effectiveGrant+epoch/bindingRevision读写接口给W47，严格按当前联系人身份CAS、撤权、过期和409；POST后GET同epoch才显示成功，AUTO必须明确本人持续授权，HUMAN单联系人接管不阻碍其它托管|三模式禁用，不虚构客户端成功|
|手机430px有K真实联系人弹层|W24/W47实际授权联系人K与安全沙箱可用，再由W46／W04在真实手机宽联系人对话进行本次菜单弹层测试|当前`HOLD_NO_LEGAL_CONTACT_K`，不覆盖真实社交账号|

## 发布门禁及W09-3交接
- 本轮未运行本人合法社交授权、二维码扫码、真人发信、收费云模型推理，没有修改PRIVATE原历史或真人草稿持久化。
- W47必须根据本Owner ACK按原**23个ownerFiles白名单**与`expectedOwnerSha/canonicalAck`校验准确Git blob，正式签署Web Vite；新PR#101准确SHA **2765a760** Hosted Run **40505104204** 已实际 completed/success，六项 mandatory **6/6 SUCCESS**（frontend-chromium-synthetic、synthetic-m0-contract、agno-python-native、native-node-contracts、contracts-security、nonproduction-merge-gate），附加 w30/exact-head-backfill 亦SUCCESS；不能借W09原ef02CI代替。
- W09-3继承当前 PR#99＋W46 PR#101精确3文件增量；真实W43/W44/W47新接口成熟之前仍禁用不足资格的按钮。唯一非生产 `44767`当前Web/API均为旧正式SHA `e9333d5969d07b26369448bad13e89ff79442431`，未经最终Owner/CI/API+Web同SHA不得替换；旧44751、main、Windows不动。
**最终回执状态：`W46_OWNER_POPOVER_UI_AND_PRIVATE_TOOLS_RUN_TRACE_ACK_PASS / CONTACT_MODE_MODEL_EXPERT_HTTP_W47_W44_HOLD / CONTACT_430_AUTHORIZED_INTERACTION_HOLD / W47_STRICT_BUILD_PENDING / QA44767_OLD_HEALTHY_NO_DEPLOY`。**
