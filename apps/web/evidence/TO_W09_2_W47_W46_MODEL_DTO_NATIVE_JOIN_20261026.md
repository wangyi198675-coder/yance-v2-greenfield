# W46 → W09-2 / W47 / W54 / W55｜2026-10-26 唯一PRIVATE模型DTO最终Owner安全交接

**W46-W47_MODEL_CONTRACT_OWNER_SOURCE_BUILD_HTTP_CHROME_PASS / W54_NATIVE_FIRST_PARTY_SESSION_HOLD / W55_REAL_USER_PROTECTED_CREDENTIAL_HOLD / REAL_CLOUD_AGNO_LIVE_E2E_HOLD / NO_DEPLOY_44751 / NO_PAID_API / NO_SOCIAL_SEND**

## 1. 精确已读证据和版本

- 按 `COORD_AGGREGATE/W09_2_20261026_1345_FOUR_OWNER_JOIN_24D74BE_STAGING_44760_TRUE_HOLD.md` 执行。本机 W09-2 最新隔离联合 HEAD **`24d74be3309df81122acd82affd9099c853661da`**；正式 **44751** 仍是原 `C_8EB7314`，没有修改。
- W46 原签名基线 **`cf929000c24dc721e1008cf8459ebc9049e923a4`**；本轮从该精确 SHA 建新的独立工作树 `C:\Users\1\Documents\YanceV2\Worktrees\W46_MODEL_DTO_JOIN_20261026`、分支 `w46/p0-w47-model-dto-20261026`，只动 `apps/web/**`。
- W47 实际 Owner 源码 **`41c9a09bdb6c4124ffc979fac3a250d1079570c1`**，已真实读取 `services/api/runtime/private-model-http.mjs`、`first-party-model.test.mjs`、`private-brain-http.mjs` 与原 Owner 签署契约，不改 W47 源。
- W43 signed Agent 源 **`ff476587a7ffcc912551b4644ebac61155105c98`**，从 W09-2 联合源码 `services/agentos/yance_agentos.py`、`w47_private_dto.py` 验证**真正NativeRun provider**是 `OPENROUTER_USER_API`、`OPENAI_USER_API`、`LLAMACPP_LOCAL_QWEN3_8B_FREE`，不是 W47 REST 的小写名称。
- **补充本轮稍后收到的真正Owner CLEAN HEAD（同日更新）**：W54 Windows `b34dc8e37d12e066a8cbad42f751757cd1f1cf1b`，新增 `apps/windows/src-tauri/src/native_launch.rs`；W54本人的Windows回执是Rust **32/32 PASS**，但没有已审核W47 child二进制/reader或WebView专属Cookie会话；依然**真实自动登录HOLD**。W55 Windows `0ae4b7542e53b6de9a127784b68e1e3fee981de5`，新增 `packages/credential-custody/src/cloud_keys.rs`；W46在独立临时CARGO_TARGET_DIR实际跨Owner执行真实 `cargo test --offline --locked` **25/25 PASS、0 FAIL**，但生产构造器仍SEALED，仅假Key测试ctor可用；真实用户密钥Enroll/native executor lease **HOLD**。两者不等于正式产品已签连通。

## 2. 双方唯一实际 HTTP/DTO 契约（W46 scoped Owner 复签，W47已签原始HTTP事实）

| 路径 | 接口资格、响应 | W46严格消费 |
| --- | --- | --- |
| `GET /api/v2/private-brain/model-catalog` | W47真实公开200，`{ok:true,providers:[{provider,displayName,requiresUserApiKey,requiresLocalModel}],authoritative:false,actualAvailability:'CHECK_AUTHORIZED_MODEL_CONFIG',canSend:false}` | 只显示 provider 名称和Cloud/local类别，**决不当成模型ready**。真实枚举：`openrouter`、`openai`、`local`；非该列表/重复/额外敏感字段拒绝 |
| `GET /api/v2/private-brain/model-config` | 真实第一方 Cookie + W54当前用户+W55凭据资格+W43正式能力，返回 `{ok:true,selected:null\|{provider,modelId},sources:[{provider,configured,available,status,models?:string[]}],canSend:false,providerAuthorized:false,credentialsExposed:false}` | 只接受W47 status枚举与对应签名的具体modelId，源必须READY+configured+available才可选择；**不能从公开catalogue推断可用性**；401/503准确不可用 |
| `POST /api/v2/private-brain/model-selection` | W47严格只收 `{provider,modelId}`，Cookie+同源Origin+CSRF，W43费用资格、W55密钥状态原生签，写入W54原受保护配置；回执同 `model-config` | POST核对准确Provider/Model后，再 GET权威config确认，拒绝版本/授权变化；不自动支付、无fallback |
| `POST /api/v2/private-brain/turn`、`GET /history?threadId=personal` | W47/W43已存在原生 PRIVATE账本、同一 Agno SqliteDb/Thread、用户/Session/MID与请求Id实际授权仍由W47签 | DTO至少校验 W43 `COMPLETED`、原 requestId、runId/sessionId、thread、modelId 和**正式NativeRunProvider映射**；请求成功后仍只由GET 原生历史填充UI；UNKNOWN/PAUSED/失效回执拒绝，不伪造历史或第二Agent |
| 原提议 `POST /api/v2/private-brain/credentials`、`GET /models` | **不存在于W47原签源** | W46已从实际Vue/DTO移除，**不向浏览器索取、上传或显示Cloud Key**；待W55正式Windows原生受保护设置入口签署后再追加UI，不建新Vault |

Provider双层映射准确：HTTP select `openrouter`→真正NativeRun `OPENROUTER_USER_API`；`openai`→`OPENAI_USER_API`；`local`→`LLAMACPP_LOCAL_QWEN3_8B_FREE`。W46不仅核对modelId，还要求收到**对应W43正式回执provider**；不把服务端结果里的任意source字符串都当证据。W43/W47原生W43 signed receipt为最终权威，W46仅消费二次校验。

## 3. 本轮真实执行和权限边界

- 在真实Windows W46隔离 checkout执行：`node --test apps/web/tests/*.test.mjs` **94/94 PASS、0 FAIL、0 SKIP**；其中从**原 W47 Owner 模块导入真实 local-session/private-model HTTP**，以明确 TEST_ONLY current-user/profile/native model ports 进行实际 loopback HTTP `model-catalog→model-config→model-selection→model-config`，Cloud-only不需要本地Qwen，POST+GET都确认；没有原生安全端口仍503，无Cookie时401。测试fixture的真HTTP成功不等于用户正式Key/会话已接通。真实 W24/44/45 Owner source GET→POST→GET、A/B/C托管、409/422、W45真实本地来源0–3候选原测试全部保留。
- 原 B+C冻结设计 `npm test` **15/15 PASS**。Vite7.3.7 联合W09现存W47只读 truth gate **2666 modules build PASS**，W46源码只在自己的非生产目录构建，绝不覆盖 PR53/main/44751。
- 独立实际 Windows Chrome四档 **320×680、430×850、950×620、1360×900 4/4 PASS**：W46独立4174非生产预览**只代理 W09现有48185 staging API**；实际GET `/model-catalog`公开 200，GET `/local-session/status` paired:false，protected `/model-config`现场401；展示三种准确受签Provider名称但**0可选择modelId**、唯一BRAIN、无64位旧Pair、**无API Key/password输入控件**、历史0/模拟回答0/Model选择禁用/PRIVATE发送禁用，刷新回GET、CHAT回唯一原 CONTACT Composer，API写请求0、真人消息0、收费模型调用0、Chrome JS错误0、横向溢出0。
- 浏览器证据 `apps/web/evidence/W46_W47_MODEL_DTO_REAL_CHROME_UAT.json`，四张实际Chrome截图 `W46_W47_MODEL_DTO_{320,430,950,1360}_CHROME.png`；记录加载JS/SW及GET请求，非静态独立HTML，不假造用户已配对。

## 4. W54 / W55 两个原生Owner精确剩余阻断

- **W54**：新 scoped source `b34dc8e37d12e066a8cbad42f751757cd1f1cf1b` 有官方Tauri resource dir/已Pin二进制Digest的native child + private pipe challenge/超时与子进程清理，Owner Rust 32/32 PASS。**其自身Owner回执明确启动时不调用launch_reviewed**：缺已审核W47 child reader/bundled SHA、持续host liveness和注册Tauri WebView2专属Cookie，无法授权真实用户自动session。须W47本人签审子进程端和WebView session，任何普通localhost调用仍拒绝、无伪JS授权。
- **W55**：新 scoped source `0ae4b7542e53b6de9a127784b68e1e3fee981de5` 已使用原WinCred+DPAPI的假Key enclave、各Provider CAS rotation/revoke tombstone；W46独立Windows Rust 25/25测试PASS。**正式NativeKeyCustody::new()仍永久SEALED**，没有W54签出的不可复制nativeHost能力/独立secureKey dialog、W43 Agno原生Executor-only lease；不能把TEST_ONLY密钥变成真付费授权。W55 Rust JSON存储provider `OPENROUTER`/`OPENAI_API` 由受信native W47 adapter映射自 REST `openrouter`/`openai`，更不能误写成W43 Run `OPENROUTER_USER_API`/`OPENAI_USER_API`。不从浏览器传明文Key或凭据句柄。
- W09-2已有 GitHub Issue #58 管理W54/W55最小原生接缝。W46只提交本Owner的模型DTO收敛源码及独立实测，不越权代签两个 Rust Owner。
- W09-2下一步按精确Owner SHA接收、W47本人同契约签名、W54/W55真实Owner CLEAN +跨进程安全证据后，在原隔离stage 44760/48185做真正付费Cloud**需本人授权**的无local模型→多轮history→模型切换→冷启动恢复测试，随后独立旧C↔新版回滚和是否批准44751；目前所有真实Cloud体验和USER_DELIVERED继续HOLD。

**准确结论：W46 双方模型HTTP和真实W43 NativeRun DTO 复签完成；W54可信Windows宿主自动会话、W55真实保护Key及真实云端Agno调用仍依赖其原生Owner独立安全签署。**
