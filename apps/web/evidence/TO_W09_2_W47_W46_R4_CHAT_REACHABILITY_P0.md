# W46 → W09-2 + W47｜PR #53 集成后 CHAT 可达性 P0 最小修复（2026-10-25）

## 结论
**W46_CHAT_VISIBILITY_SOURCE_BUILD_CHROME_PASS / REAL_AUTHORIZED_CONTACT_HOLD / W09_W47_SIGNED_SHA_RENEWAL_REQUIRED / NO_DEPLOY / NO_REAL_SEND**

本文件随 W46 新提交 Git SHA 固化，无自引用。准确 Owner 源码基线为 `370ee569c3ec1eb78b01361c6b3ae34db9f0ae6c`；实际接收的 W09-2 PR #53 当时 HEAD `755f075979471a71f14d135f18809cf9c94f44b7`；W47 Runtime 原生 SHA `7ff387adf2007744117b706d72a57c6055b04177`。独立分支 `w46/r4-vue-nonprod-candidate-20261025`，原唯一 Composer PR #21 / main / 4399 / W47 Runtime 源码均未直接修改。

## 原因与实际最小修改
P0 原因有**两个同时生效的遮蔽条件**：
1. `apps/web/vite.w46.config.mjs` 原来把源 `<main v-else class="workspace">` 转换为 `<main v-else v-show="!w46WorkspaceEnabled">`，一旦开启候选，切回 CHAT 也始终隐藏原 B+C 主体；
2. `apps/web/src/BCProductWorkspaceCandidate.vue` 原样式 `#yance-prototype:has(> .w46-product-candidate) main.workspace{display:none!important}`，又以全局 `!important` 抹掉任何普通 `v-show` 恢复。

Owner 最小修复：
- 唯一原 `main.workspace` 改由 `v-show="!w46WorkspaceEnabled||w46Workspace==='CHAT'"` 控制。**始终使用同一原 main 的 DOM 节点**，而非 `v-if` 卸载/重装。
- 候选根加入 `:data-active-workspace="activeWorkspace"`，CSS 仅在非 CHAT 时 `!important` 隐藏原 main；CHAT 不再被 CSS 二次遮蔽。
- CHAT 状态隐藏候选自己的多余大内容卡片，使 B+C 真正重回页面第一可见聊天主体，而不是将原聊天工作台推到一个屏幕后。
- 仅增量更新 `apps/web/tests/w46-r4-candidate-browser.cjs` 的历史“CHAT 始终隐藏”断言、添加 `w46-r4-chat-reachability.test.mjs`、`w46-r4-chat-reachability-browser.cjs` 与 W46 专用 test-only `w46-r4-chat-w47-source-vite.config.mjs`，原 Composer、W24/W44/W45 接口、Agno 和 W25 **零修改**。

## 完整实测与边界
- Windows Node24：**64/64 W46 tests PASS**（原 61 + 3 CHAT reachability/draft synthetic contract tests），原 B+C **15/15 PASS**，0 skipped/fail。
- Vite7.3.7 **2663 模块实际 build PASS**：W46 新 Owner 组件 + **原 PR #53 W47 read-only gate 源码实际 import**。测试配置不修改 W47 owner：它使用 W09_R4_OWNER_JOIN_20261025 现有 `apps/web/runtime/vite.w47.config.mjs` 的真实数据/权限 transform，只在测试环境开放 `productDraft=1` 可见性开关，**没有绕过 W47 0 账号安全门禁或模拟真实认证**。此测试组合不是尚未更新新签名的 PR #53 原完整生产构建。
- 真实 Windows Google Chrome（headless）加载上面真实编译的 V2 Vue：CHAT 显示原 B+C `main.workspace` 与 W47 的 `尚未连接聊天平台` 权威空态；初始 GET /api/v2/runtime/health、GET /api/v2/contacts 返回 `trustedSession=false`、0账号/0联系人、`canSend=false`。九工作区切换、八个非 CHAT 隐藏 main，返回 CHAT 显示**同一个 DOM 节点**，DOM 连续性标记不丢；原 Composer 有且仅有**一个已登记的源码实例**，无选中授权 K 时**挂载的 Composer 数为 0（正确）**。
- Chrome 7 档 320/360/430/720/950/1101/1360px 返回 CHAT，无水平溢出，原空态正常；模拟 API HTTP 503 使候选显示不可用、未授权账户仍 0、无活动发送按钮。**所有切换 0 POST/0 TAKEOVER/0 W25 请求、0 JS 错误、0 真实发送**；未调用收费模型。
- 草稿测试：此前已在现有 bridge 合约证明 fake K 的本地未发送草稿可按联系人保留；本轮新 Node 用合成 A/B 再验证被动切换不触发 GET/POST，fake A unsent draft 写入、切至 B 再返回 A 保留，状态 BLOCKED/canSend false。Chrome 也确认 **同一个原 main DOM 未卸载**。这证明组件生命周期和合成 draft 保留，**不是有真实可信授权联系人及当前 Consent epoch 的完整人类草稿恢复**；后者明确 HOLD，不能伪造 trustedSession 来制造 PASS。

## 直接复现（本机只读服务，无发布）
1. 从同一 W46 checkout 使用 W46 自己的 `apps/web/tests/w46-r4-chat-w47-source-vite.config.mjs` 构建。环境 `YANCE_W47_PR53_CONFIG` 指向现有 PR #53 源码的 W47 vite config；不要设置 `W47_R4_ISOLATED_PREVIEW=1`（真正签名门禁不得跳过）。本适配器只绕过 W47 的候选视觉开关，其他原 W47 fixture filter / API 源码直接重用。
2. API 仍是原 W47 127.0.0.1:47182 `services/api/runtime/server.mjs`，返回可信未登录空数据，绝不添加 fixture 联系人；Vite preview 仅在 127.0.0.1:4174 运行。
3. `node apps/web/tests/w46-r4-chat-reachability-browser.cjs`，读取四张真实 Chrome 图及 `W46_R4_CHAT_P0_BROWSER_UAT.json`。
4. 运行 `node --test apps/web/tests/*.test.mjs`、原 B+C `npm test`，所有 TEST_ONLY 标记不得作为 W24 真实账号准入凭据。

## 本轮截图/数据
- `W46_R4_CHAT_P0_CHROME_1360_EMPTY.png` — 首次 CHAT 原 B+C 主体可达，0 授权真实空态。
- `W46_R4_CHAT_P0_CHROME_1360_RETURN.png` — 非 CHAT 往返后原 B+C 同一 DOM / 空态。
- `W46_R4_CHAT_P0_CHROME_360_EMPTY.png` — 360px 小屏联系人 0 空态。
- `W46_R4_CHAT_P0_CHROME_PERMISSION_503.png` — 真实 Chrome 网络失败，状态不虚报。
- `W46_R4_CHAT_P0_BROWSER_UAT.json` — 实际九工作区、GET 回读、DOM 连续性、7 宽度、权限失败、0 mutation/0 error 与精确来源标记。

## W09-2 / W47 下一步最小签署接缝（**W46 没有修改相关 Owner 文件**）
1. **PR #53 的 W47 已将 W46 候选签名锁定在旧 SHA `370ee569...`**，原 Owner 六文件 Git Blob 校验及 `W47_W46_CANDIDATE_SHA` 验签必须由 W09-2 和 W47 Owner 对新的 W46 SHA/受影响 `vite.w46.config.mjs`、`BCProductWorkspaceCandidate.vue` 做实际独立签名更新；**不得**把这次 W46 测试包装成 PR #53 原状态已经自动接受新组件。不直接修改 `apps/web/runtime/vite.w47.config.mjs`。
2. W09 在新集成的隔离 Draft PR HEAD 重新编译并使用 `W47_R4_ISOLATED_PREVIEW=1` 受控开关执行完整真 Chrome、7/7 GitHub CI；不继承先前 7 绿。独立 SEC 复签、W47 原 Owner 审阅，再向 W09-2 汇总。
3. 真账号授权的 K、Actor、binding_revision、Consent epoch 及消息发送/持续托管均尚未具备产品可信 Session；W24/W44/W25 安全门禁继续 HOLD，**无法用真实授权联系人验证草稿与 AUTO 相互隔离**，需在合法授权环境补测。无真账号时联系人 0、Composer 不挂载且不会发送。
4. R4 已签设计、其他九工作区、四渠道正式 SVG、原 W46 61 回归和 252 Stable ID 映射完全保留。不恢复旧 W37 120 fixture、不重做 R4、不部署、不连私人账号、不调用收费模型、不实际外发。

**签署限定：W46 P0 CHAT workspace reachability + original DOM continuity verified; real authorized CONTACT UI, W09 signed join and release remain HOLD.**
