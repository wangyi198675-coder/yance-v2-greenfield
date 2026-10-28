# W46 → W09-2 / W47 / W43｜P0 真实本机会话配对 UI Owner 独立安全复签（2026-10-26）

**Scoped Verdict: W46_LOCAL_PAIRING_UI_SECURITY_DELTA_PASS / W47_RUNTIME_INSTALLED_REAL_HTTP_HOLD / HUMAN_PAIRING_44751_HOLD / PRIVATE_BRAIN_OWNER_API_HOLD / NO_DEPLOY / NO_REAL_SEND**

## 1. 源码身份、独立权限与实际修改

- 已在 DESKTOP-029FH47 读取 `COORD_AGGREGATE/W09_2_20261026_P0_PAIRING_QA_W46_LOCAL_UI_4A7CA3E_OWNER_DISPATCH_NO_DEPLOY.md`。
- W09-2 QA 新接线 `4a7ca3e34e1e724bb0a9b992d85f603de03ed2fc`，其父提交 `0bd518233c30aff817336de2148c72ab7422eaa8`。实际 `git diff parent HEAD` 精确只有：新增 `apps/web/src/BCLocalSessionConnector.vue`（110 行）及更改 `apps/web/src/BCProductWorkspaceCandidate.vue`（5 行）。
- 原 W46 唯一 B+C CHAT/Composer/滚动 Owner SHA `5ad548d2a7b2e202411cb1cfa7d13118556b34ad`，原源码功能不重建、不修改。
- W46 新建与 QA 精确同一 SHA 为父的独立 Owner worktree `C:\Users\1\Documents\YanceV2\Worktrees\W46_LOCAL_SESSION_OWNER_20261026`，分支 `w46/p0-local-session-owner-20261026`；不改原 W09 QA 工作树、44751、PR #53、main、生产客户端、W47 Runtime、Agno、W25 或数据库。
- 本轮实际源增量仅 `apps/web/src/BCLocalSessionConnector.vue`、`apps/web/src/local-session-ui-contract.mjs`，测试和证据仅 `apps/web/tests/**`、`apps/web/evidence/**`。父提交自带的 `BCProductWorkspaceCandidate.vue` 唯一 BRAIN mount 没有再改。
- 新 Owner exact FULL SHA / parent：本回执随本次新提交同行，准确值以 GitHub 同一分支 HEAD 及 W09-2 GitHub comment 为准，避免 Markdown SHA 自引用。

## 2. 实际源码审查和发现的前端安全缺口

真正 W47 原生接口来自该 checkout 内 `services/api/runtime/local-session.mjs`、`local-operator-console.mjs`、`server.mjs`（全部只读复核）。

- `POST /api/v2/local-session/redeem` 仅接收服务端终端输入 `pair` 生成的 64 位一次性 code。W47 verifier 内存 digest，90 秒 TTL，原子 consume。不可凭 HTTP/localhost/Origin/OS 用户名生成合法 code；HTTP 请求校验 loopback/Host/Origin/Fetch-site。浏览器发相对 POST JSON，不把 code 写 URL。
- W47 session Cookie 服务端随机生成 32 字节，`HttpOnly; SameSite=Strict; Path=/; Max-Age=...`，不会被前端 JavaScript 读取；会话保留在服务端进程 Map 中，重启/撤权/TTL 均失效。当前为 loopback HTTP，并非 HTTPS，**原生 Cookie 没有 Secure 属性**；正式安装/网络边界由 W47 本人独立复签，不由前端增补第二套 Cookie。
- W47 `GET /api/v2/local-session/status` 的 `paired:true` 契约必须完整包含 `ok:true, paired:true, expiresAt(未来安全整数), csrfToken(64位hex), canSend:false, providerAuthorized:false`；已注销的状态为 paired:false、canSend:false、providerAuthorized:false。W46 原草稿只核查 ok 和 boolean paired，若不完整或过期快照，UI 可错误显示“已验证”。
- 原 UI 会话到期后仅等待用户手动重新检查才更新文字，可能保留已验证显示直到下一次 GET；原错误反馈可直接回显不受信的 `error` 文本，理论上误带一次性码。已按 W46 范围最小修复。
- **新 W46 UI**：`checkedStatus` 严格校验所有权威字段、未来有效期及本机授权/发信双重否定；请求均带 `credentials:'same-origin', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer'`。状态 GET 发出前先清除旧已验证 UI；到期 timer 立即撤销前端已验证显示，并重读 GET，卸载时清理 timer/code/CSRF。错误只显示 allowlisted W47 错误说明或固定 HTTP 编码，不回显任意响应/error/code。
- 原 UI 本来就仅在 POST 后再 GET 确认，保留该流程；本轮 logout 须 `ok:true,paired:false` 响应才视为成功，并在任何结果后用 GET 真回读；POST 拒绝、Cookie 丢失、错误 CSRF、网络故障均不能本地直接标 paired/已退出成功。
- **区分威胁模型**：任何人都可以用自己控制的 DevTools 改写 DOM、拦截浏览器收到的假状态响应；这是浏览器表象，不会生成 W47 的 HttpOnly Cookie／Server Map record，因此不会使 W47 的真实授权 POST 接口通过。不能宣称 JavaScript 界面本身具有防 DevTools 修改的密码学证明。W47 API 才是最终权限边界。
- **日志剩余 W47 Owner 注意**：W46 UI 不写 localStorage/sessionStorage、URL query、console.log 或持久日志，代码输入在网络请求开始前即清空。W47 原生 `local-operator-console.mjs` 明确向终端 `stderr` 打印 `PAIRING_CODE=...` 以便用户本人复制。若终端 stderr 被启动器/监控持久捕获，可能构成配对码日志；W47/W09-2 必须独立确认真实 44751 安装器只短暂向人显示、不做持久采集。W46 不越权改 W47 terminal issuer。

## 3. 真实运行与测试，统计严格分别报告

1. 在本 W46 Owner 隔离工作树执行 `node --test apps/web/tests/*.test.mjs`：**78/78 PASS, 0 FAIL, 0 SKIP**，包含新增 `local-session-owner-security.test.mjs` **12/12 PASS**，验证恶意假 paired:true、缺 CSRF、过期/太远 expiry、假 canSend:true／providerAuthorized:true、恶意回显、完整一对一 BRAIN mount。
2. `node --test services/api/runtime/local-session.test.mjs services/api/runtime/local-operator-console.test.mjs`：W47 现有真正原生接口源码 **7/7 PASS**，涉及服务器 session、Cookie、错误/丢失 CSRF、TTL、replay、logout、原生终端 issuer；这些是隔离原生测试，**非用户真人手输配对码**。
3. 原 B+C `design/nonproduction/approved-clickable-abc-bc/npm test`：**15/15 PASS**。
4. 使用实际 W09 QA checkout W47 `apps/web/runtime/vite.w47.config.mjs` 作为原生只读 gate，并使用已存在的 W46 自有非生产 test-only build config，Windows Vite 7.3.7 **2666 modules transformed / BUILD PASS**。这是 W46 Owner 候选构建，**不是 44751 正式签名版本**，也没有改它。
5. 实际访问当前 `http://127.0.0.1:47182/api/v2/local-session/status` 返回 **HTTP 404 `ROUTE_NOT_FOUND`**，这是对运行现状的准确回读，不是 W47 Owner API 源码缺失证明。故浏览器真人正向配对 HOLD。
6. 在 **真正 Windows Chrome（headless）** 加载 W46 最新原生 Vue＋实际 W47 no-provider gate：950×620、430×850、320×680 三档进入唯一 BRAIN，实际 W47 status 404 -> “接口未接通”，redeem/logout 不出现，CHAT 返回原唯一 Main，无有效联系人 Composer 挂载数 0，JS pageerror 0、无水平溢出、无未经授权发信。补充 4 种**刻意注入的恶意伪造 GET**负例（缺CSRF、过期、假可发送、假 provider）全部显示不可用；还有 1 次明确标注 `SYNTHETIC_REJECTED_REDEEM`（虚构、无效的 code，经 401 返回），code 输入被清空、UI 未配对、URL/可见文本不泄漏。**本测试没有真人配对，也没有伪造“合法已授权”来制造正向 PASS。**
7. 本机 QA 原有 W09-2 `verify_w47_pairing_real_process.mjs` 自动 positive control flow（redeem200/replay401/logout/TTL）已在协调回执中存在；此次没有冒充用户手动 `pair` 重做。新 owner Chrome 证据独立可复现。

Machine evidence:
- `apps/web/evidence/W46_PAIRING_OWNER_CHROME_NEGATIVE_UAT.json`
- 真服务 HTTP404 截图 `W46_PAIRING_OWNER_CHROME_950_REAL_404.png`、`..._430_REAL_404.png`、`..._320_REAL_404.png`。
- `W46_PAIRING_OWNER_CHROME_320_REDEEM_DENIED.png` 是 **合成 HTTP 401 安全负例截图，不是 44751 真配对或真人凭据**。

## 4. W47 / W43 最小接口合同和 HOLD

W47：独立签署并在实际已安装 loopback 本机会话服务中暴露同源 `GET /api/v2/local-session/status`、`POST /redeem`、`POST /logout`，明确 Origin/CSRF/HttpOnly Cookie、一次性 code 在受信终端生成，当前源码存在但运行47182仍404。User must本人实际从受信终端输入 pair 后在正确44751来源中兑换；两个真实BrowserContext隔离、注销/撤权/90秒码TTL/5分钟sessionTTL、重启及Secret输出管控须独立复签。

W43 / W47：`POST /api/v2/private-brain/turn` 和 `GET /api/v2/private-brain/history` 必须由 Owner 联合签署可信 local principal -> **既有唯一 Agno PRIVATE thread、memory、history** 的服务端授权契约；未签时仅 401/403/503 或无入口。W46 本轮没有接入提问/回答或任何模型，不能假消息填充历史。

W09-2：待 W46 新 exact Owner SHA 签署后，只在非生产隔离集成源码更新精确 W46 owner blob、W47 original sha gate、Vue Build/negative UAT 和新 HEAD CI。原 QA HEAD `4a7ca3e` 未覆盖本轮 Owner 变更；不得直接覆盖44751、原 PR#53、main 或生产。

**结论：W46 前端配对安全边界 SOURCE / CONTRACT / REAL CHROME NEGATIVE PASS；真人本机正向配对、正式 Cookie 安全封装、可信 PRIVATE Brain 接口与产品发布全部 HOLD。**
