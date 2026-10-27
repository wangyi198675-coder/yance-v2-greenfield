# W27｜真实多主页 Facebook Page 配置与 W24/W55 原Owner继承｜2026-10-28

## 用户最终确认
- 不用再登录 Facebook。用户已在 Pancake 授权，言策通过官方 Pancake API 取得**独立于 Pancake 浏览器 Cookie**的权限。
- 一个 Pancake 账户连接一次，官方 GET `/api/v1/pages` 自动发现多个 FB Page；每个 Page 的访问令牌不同，逐页真实 GET `/api/public_api/v1/pages/{pageId}/users` 验证。
- 不重建账号认证、独立Vault、Page聊天历史数据库，不重新生成/轮换任何 Pancake Page Token；原 W24/W44、W55、W25、Agno SQLite 既有系统各司其职。

## 真正已落地的源码
- `apps/web/src/BCPancakeMultiPageSetup.vue`：R4 Chat→连接账号→FB Page 只展示账户级Access Token一次输入。服务器真实验证账户后列表多主页，逐主页选择、粘贴已有Page Token、独立保存、显示状态。430/950/1360三档、退出/返回原Chat，密码输入不进URL/localStorage/chat日志。
- `apps/web/src/pancake-multi-browser.mjs`：完全复用原 `/api/v2/local-session/web-private-start` 及相同 CSRF，无新配对、无第二登录；仅服务器同源账户配置。
- `services/api/runtime/pancake-multi-onboarding-http.mjs`：安全路由 `/api/v2/providers/fb-page/onboarding/{capabilities,pages,account,page-token}`，必须原WEB_LOCAL_PRIVATE当前SID会话＋same-origin + CSRF；服务端仅官方 pages.fm HTTPS GET 账户和主页，返回已过滤名字/PageId/只读状态、不回显Token、不允许任何社交发送，真实供应商失败不伪造。
- 原W55 WinCred/DPAPI：`packages/credential-custody/src/cloud_keys.rs`复用原PANCAKE_PAIR WinCred加密CAS记录，原生JSON存 `{userAccessToken,pages:{pageId:pageAccessToken}}`，且绑定原WinUser/SID、校验版本；`web_local_cloud_keys.rs`新增仅W47私有stdio `lease_for_pancake`，原 `lease_for_agno`继续禁止社交密钥；`w55-web-native-stdio.mjs`原本机stdio新增server-private租约。账户+每页Token单条加密配置，单Page失败不损坏其他Page；系统与应用域分离，不新增Vault或消息DB。受WinCred blob限额约束，单记录最高2000字节、最多24页；超过时拒绝而不截断，后续更大规模需W55原Owner分槽扩展。
- `services/api/runtime/w55-pancake-web-custody.mjs`：原W55 status/store/readback+CAS，账户登记和逐主页存储；不把密钥发给网页、Agent或W25。
- `connectors/pancake/multi-page-manager.mjs`：继承已签W27官方Pancake及W24 perPage binding端口，模拟证明Page A/B/C分别绑定/撤销；**真实W24 Port仍缺，当前Web UI不会把单独API权限伪称W24真人授权**。
- `services/api/runtime/native-fb-page-authorization-http.mjs`：旧单主页配置POST显式410 GONE，保留以前的原生动作而不重复授权系统。旧 `/setup`返回静态说明不能标WAITING_USER_AUTH。
- **没有改**：原W25唯一发送、Agno SQLite、ChatHistory、W44 grant DB、旧Facebook个人平台、WhatsApp QR。

## 已真实执行的质量证据
- Node多主页Owner合同/W55保管/W47实HTTP `13/13 PASS`，安全Origin、CSRF、异平台/跨Page令牌拒绝。原Native动作相关 `11/11 PASS`；Rust `cargo test --locked` 原生WinCred/DPAPI包括Pancake多主页加密CAS/revoke/Agno模型租约禁止，执行PASS。
- 本机全产品B+C Vite build `2690 modules PASS`。
- Windows Google Chrome隔离实际 `http://127.0.0.1:44839/` 1360×850 / 950×620 / 430×850 三档**真实点击PASS**，现成本机会话WEB_PRIVATE开始200、Pancake onboarding capabilities200，未输入任何用户真实Token；尚未配置时pages403并正确显示空态；返回选择平台可用，三个尺寸无浏览器pageError。截图`C:\Users\1\Documents\YanceV2\Audit\W27_R4_FB_PAGE_CLICK_20261028\MULTI44839`。
- 独立 QA 使用随机专用WinCred命名空间和模拟Token；**未读取用户Pancake浏览器 Cookie、旧账号、密钥，不创建/轮换真人令牌、无真实社交发送**。

## 未完成，不允许偷换为USER_DELIVERED
1. **当前固定44767正在被W09-3独立主题发布更新**：执行期间Live Web SHA从55c429变更为`ab803f6c2ee722936af877e21cd2459faa12d521`，运行Web来自`W09_3_THEME_PERSIST_WEBFIRST_20261028`；API 48219仍运行 `6e52ef5b80df19f558c160bab47791c47107e8cb`，`trustedSession:false`。W27独立QA 44839成功≠已经接到44767。**不得用旧W27 B+C bundle直接覆盖新主题、Composer等其他Owner最新成果**。在当前Web确切SHA之上做Owner最小增量合并、正式CI，再受控部署固定44767。
2. **W24/W44真实性阻断**：实际源码`services/api/src/domains/identity-consent/durable-identity.mjs`和`services/api/src/domains/grant-custody-budget/authority-db.mjs`仍强制`fake-` actor/fixture proof（`SYNTHETIC_ONLY`）；绝不把真Page PSID/联系人套上假的W24 K。该原Owner最小生产态授权修复需要真实官方REST PageAdmin归属、现有Web当前Principal与原W44数据库事务才能安全批准，不能由W27另造身份SQLite或偷跳W24。**因此真人联系人/历史/托管/发送目前仍HOLD**，与UI账户/主页令牌保存是两层资格。
3. 用户真实Pancake`User Access Token`未录入言策，尚无真实官方多主页列表/Token回读。用户必须本人在已安装的安全页面提交一次Token才能实际核验；不得在ChatGPT聊天中收集令牌。
4. Agno既有SQLite继续用于原生AI对话持久化；FB Page真人MID/消息历史继续由原W25受权，不新建第二个历史数据库。

## 完成门禁
`MULTI_PAGE_SOURCE_IMPLEMENTED`，`W55_DPAPI_REUSED`，`WEB_PRIVATE_AUTO_REUSE`，`REAL_CHROME_44839_PASS`，`NO_SECRET_AND_NO_SEND`；
`FIXED_44767_INTEGRATION_PENDING`，`W24_W44_REAL_K_PENDING`，`USER_OFFICIAL_TOKEN_NOT_ENTERED`，`REAL_PAGE_INBOX_HOLD`。
