# W46 → W09-2 / W47 / W43 / W45｜2026-10-26 13:00 单一闺蜜大脑 UI 精确增量

**签署限定：W46_UNIQUE_BRAIN_NO_PAIR_MODEL_UI_SOURCE_BUILD_CHROME_PASS / TRUE_CLOUD_AGNO_MULTITURN_HOLD / MODEL_CONFIG_OWNER_API_HOLD / DYNAMIC_CONTACT_W45_RUN_ATTESTATION_HOLD / NO_DEPLOY / NO_REAL_SEND**

## 精确来源和边界

- 本轮按 W09-2 最新 `COORD_AGGREGATE/W09_2_20261026_1300_SINGLE_PRODUCT_CORRECTION_OWNER_DELTA_DISPATCH_KEEP_44751_C.md` 实读执行，原 W46 CLEAN SHA `f2c9d995499e9974f8771c2832094f8ed6a4a287`，本轮独立 W46 worktree `C:\Users\1\Documents\YanceV2\Worktrees\W46_SINGLE_PRODUCT_P0_20261026`。
- 源码只在 `apps/web/**`，未改 W43 Agno、W45 People、W47 Runtime、W24/W44/W25、数据库、main、PR53 或正式 C_8EB7314 `http://127.0.0.1:44751/`。
- 只保留一个 `BCProductWorkspaceCandidate.vue` 内唯一 BRAIN 及原 `CHAT` 的 CONTACT Composer。原 R4 9工作区/品牌SVG/scroll安全、W46 GET→POST takeover和 W45 0–3真实候选全部继承，不重建。
- 当前本机 C 正式 Web/API SHA `8eb7314cf21b5e6d55fa0614b95ec286e5dcc084`，API 安装端口48184。实测 `GET /api/v2/local-session/status` 为 `paired:false,canSend:false,providerAuthorized:false`；`GET /api/v2/private-brain/history` 未登录401。未取得正式模型配置 API/受保护Key存储的Owner签署，不能声称已接入付费云端。

## W46 本轮的真实 UI 功能

1. `apps/web/src/BCProductWorkspaceCandidate.vue` 仅将原唯一 BRAIN 旧 `<BCLocalSessionConnector/>` 替换为 `<BCPrivateBrainWorkspace/>`。普通界面完全不再挂载终端 `pair` 或64位配对输入框，旧独立历史 component 仍保留在源码作以往回执复现，不会作为产品路由被编译/渲染。
2. 新 `apps/web/src/BCPrivateBrainWorkspace.vue`：一体式私人问答/历史/UI模型选择。无已配置模型显示「设置AI模型」，可显示 OpenRouter/OpenAI API/本地Qwen3三类来源说明，**本地模型未安装不屏蔽云端选项**。模型实际可选/Key配置/费用资格只取 W47 signed GET catalogue，模型未验证时选项禁用而不虚报 PASS。云端需要用户本人受保护 API Key，不拿 ChatGPT 订阅冒充 API 额度。真实发送至私人 Agno 的按钮未取得本地会话+模型GET+历史GET资格绝不启用（与 CONTACT 社交发送无关）。
3. 新 `apps/web/src/private-brain-ui-contract.mjs`：W47 `GET /api/v2/local-session/status` (Cookie HttpOnly/server-owned), 建议 W47 **待Owner批准** `GET /api/v2/private-brain/models`, `POST /api/v2/private-brain/model-selection`, `POST /api/v2/private-brain/credentials`；原现存 `POST /api/v2/private-brain/turn`, `GET /api/v2/private-brain/history` 按 W47 源码 field shape 接入。所有 POST 使用同源 Cookie+服务端签发CSRF、无 URL/localStorage/公开JS key、无向第二个Agent/Outbox路由。POST 模型选择后再 GET models 确认；真实 AI 回答必须 SDK `COMPLETED`、RunId/SessionId/请求Id/模型来源一致、`qualityQualified:false,canSend:false`；然后重新 GET W43 原生历史，**不把客户端收到的 POST 回复伪造写入历史**。刷新复原只依赖历史GET。
4. 现 W47/W43 **尚无正式 Cloud 模型生产签署**，所以 W46 合法状态为设置提示、模型候选禁用、历史为空、提问禁用。没有调用收费模型，也没有假答复。模型切换复用同一 `threadId='personal'`，不创建新 Agno/DB。
5. `apps/web/tests/w46-r4-chat-w47-source-vite.config.mjs` 仅独立非生产 Chrome 测试允许选择真实在运行的48184 API，而非原测试47182，仍消费原 W47 Gate 源码，绝不是正式签署发布版本。未修改受控 44751 或 4399。

## 实际 Windows 测试及证据

- `node --test apps/web/tests/*.test.mjs` **89/89 PASS、0 FAIL、0 SKIP**（原 W46 78 + 新11），保留真实 W24/44/W45 native owner source join，413/409，A/B/C独立托管、zero candidate、MID、译文/Run 失效等原始回归。原 B+C `npm test` **15/15 PASS**。
- Vite v7.3.7 W46+原W47只读 truth gate 原生 Vue 候选 **2666 transformed modules PASS**，最终编译产物在 W46 非生产目录，不发布到44751。
- 真实 Windows 安装 Chrome headless 四档 **320×680, 430×850, 950×620, 1360×900** 实际操作：唯一 BRAIN、原 terminal pair form 节点0、模型入口与 OpenRouter/OpenAI/Qwen3 说明、没有本机模型不强制安装、无授权模型选择按钮禁用、0历史/0真人回答、CHAT还原原B+C、0 extra composer、刷新从服务端恢复未授权状态；0 mutating API POST、0模型调用、0已授权联系人、0 Chrome JS error，横向无溢出。每档实际截图：`W46_SINGLE_BRAIN_320_SAFE_NO_PAIR.png`、`_430_SAFE_NO_PAIR.png`、`_950_SAFE_NO_PAIR.png`、`_1360_SAFE_NO_PAIR.png`，完整机器证据 `W46_SINGLE_BRAIN_REAL_CHROME_UAT.json`，含JS bundle资源/SW注册列表。
- `private-brain-ui-contract.test.mjs` 额外11项包含 cloud-only 无本地模型选项的**DTO纯合约**、OpenAI API 模型选择、空模型设置、无权Key禁用、假PAUSED模型回答拒绝、源Run/Request/Model/Session不匹配拒绝、无真实历史不虚构等。这**不是实际付费Cloud E2E**；禁止混淆。

## 还不能解除的精确 Owner HOLD

1. W47 真实会话：当前48184仍 `paired:false`，W09要求移除人工64码后必须由 W47/W54 Owner实现安全的受信本地宿主自动会话，不允许任意同机网站裸激活或盗用Cloud credits。原 W46 BRAIN 新UI已经不再展示终端配对，真实自动会话不是W46权限。
2. W47/W55 Key Vault 与ModelSelection：模型配置列表/状态、受保护Key写入接口及签名缺失。这里使用的 models/model-selection/credentials 三个路径目前是**W46待W47共同审定的消费契约草案，不是声称W47已存在且可用**。没有真实Key，任何请求均应401/403/404/503 fail-closed；在 Owner 签署Key存储契约后才能真实配置/切换。
3. W43 云端原生 Agno PRIVATE：当前 `NativeAgnoRuntime` 仅本地 Qwen3，CloudOnly Python路径实测 RED，`w47_private_dto.py` 的 provider固定本地；W47 `private-brain-http.mjs` 仍只验固定本地 qwen 3。原受信 `POST turn` / `GET history` 路由虽已存在原生源码，但没有 Cloud受签请求 ledger/model配置/切换跨重启历史 Owner E2E。W46界面不能替 W43/W47 造模型回答。
4. W45 CONTACT建议动态Cloud DTO：原W45 `acceptAgnoRun` 只准本地模型，W46 `composer-bridge.mjs`、`native-owner-bindings.mjs` 仍刻意强校验本地Qwen provider。**本轮没有无凭据放开它们**，因为真实Cloud SDK Run/owner-signed来源、Identity K/MID、Run/epoch/expiry、cost/grant/auth未由 W43/W45 联合签出。未来W45正式签新DTO后，W46须仅按 Owner 独立受信 attestation 扩大验证集合，不删除安全检查；目前W45原本地0–3 candidate进原Composer测试仍PASS。
5. 场景A云端Key、B云端独立于本地、C配置、D真人社交账号/外发、E发布等最终用户全链路验收都没有在本 SHA 上完成。Chrome 本次只签「无pair UI + 无账号正确空状态」。
6. W09-2 负责单一集成、重新获取 exact Owner SHA、Git Blob + 7项 CI及受控浏览器验证；本轮不替 W47签/部署、不覆盖44751。

**正式 Owner 结论：W46 SINGLE BRAIN nonprod UI / safe HTTP-consumer CONTRACT / REAL CHROME NEGATIVE PASS，云端真实多轮、模型Key安装/历史重启、动态来源与正式发布均 HOLD。**
