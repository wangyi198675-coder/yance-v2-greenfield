# 【视窗42→视窗39、视窗9｜Vite/esbuild 安全升级增量PREIMPORT_DELTA_ALLOW｜立即收件】
2026-10-24｜DESKTOP-029FH47｜独立OSS来源/许可审核Owner W42。
**BASE_GIT_SHA: `a96b4ded8c74bd66ff175682a0da375e5924dc7d`**
**STATUS: PREIMPORT_DELTA_ALLOW_PIN_ONLY / NEW_POSTBUILD_NOT_RUN / P4_HOLD**

## 已生效的精确允许动作
**正式机读白名单**：`VITE_ESBUILD_MINIMAL_SAFE_PIN_DELTA.csv`，实际44行，**28 ALLOW、16 HOLD**，SHA256 **`8287614bdf28e28fd51eb994037f351adbd9e74110fa0f9ec48409c1dc4c9e60`**。这是对已签159行历史preimport的**最小安全例外增量**，不是删除旧审批或授权其它任意安装。
- **ALLOW**：将已有直接`vite`由`7.3.1`固定改为`7.3.7`，精确tarball SRI **`sha512-AHEzTORMbi7/7aXp7w7KZ5+DCUdSeLsJz0grY8xHpc9DHdYb0vQu6DqJfm2tOw3gDExNgPgnJTXxM6syYFHaCA==`**；MIT/LICENSE.md实物已审。
- **ALLOW**：原Vite引入的唯一`esbuild`传递包从0.27.7固定为`0.28.1`，SRI **`sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==`**；MIT/LICENSE.md实物已审。为防npm保留漏洞版，在**隔离原型自己的package.json**许可使用唯一 `"overrides":{"esbuild":"0.28.1"}`；**不允许添加第15个直接依赖**。
- **ALLOW**：esbuild@0.28.1固定optional平台包共26项（含Win x64），仅限npm依锁自然生成和必要时本机正确平台安装。当前Windows `@esbuild/win32-x64@0.28.1` tarball真实SHA512 **`sha512-bm4Mowrv+GXMlpWX++EcXw/iLyd1o3+bJkC2DkWXYVvgZCqD/bSj9ctZeAMC3cIxgjRVR2Dufaiu4YPxr5gW1A==`**（MIT metadata，包内无单独LICENSE；必须在THIRD_PARTY_NOTICES保留上游esbuild父包的MIT正文和版权归属）。其余25平台项目只核元数据精确版本+SRI，**仅准写入锁，不准视为已下载、已安装或已审字节**。
- **HOLD**：其它13个原已审精确直接依赖保持版本，任何其它包/未批准UI组件或随手`npm audit fix --force`、Vite8大版本迁移、新CSS/icon bundle均禁止；Vite 7.3.6及以前或esbuild 0.27.7未解除完整W41告警，不能回退。

## 正式兼容和后审条件
W42独立核 npm engines/peer：Node实际24.18.0，vite@7.3.7允许Node`^20.19.0||>=22.12.0`且允许esbuild`^0.27||^0.28`；plugin-vue@6.0.10与tailwind/vite@4.3.3均接受Vite7，Reka2.11、Vue3.5.44、VueUse14.1.0无需变化。三个将实际安装的新候选tarball经**本次W42独立下载并hash**均真实SRI匹配，MIT许可证正确。平台26项各自元数据SRI核对通过，字节核验范围严格区分。

**视窗39现在可以依据正式CSV对自己的唯一隔离目录操作上述增量，不必等待额外前置签字**。W39需在正式source/lock中注明准确版本，合法npm regenerate-lock及干净npm ci后：
1. 提交新`package-lock.json`完整diff；只有vite/esbuild/26平台及其必然锁生成结果可以直接使用，其他意外包变动请STOP交W42增量审查。
2. 完整新SBOM、NOTICE/LICENSE（特别Win esbuild平台父包许可）、本机真实安装数量N及N/N真正tarball SRI、`npm ls vite esbuild`、`npm audit --json`与`--omit=dev --json`均保存；**不能继承旧版74包/lock/bundle哈希PASS**。所有HIGH/MODERATE/LOW/CRITICAL必须为0，注册表出现新告警则HOLD。
3. CSP按 `CSP_NONPRODUCTION_ACCEPTANCE_CRITERIA.md` 采用强制HTTP Header优先策略，真实Chrome/CDP回读、注入负例验证；不要为了PASS引入script `unsafe-inline`、eval、公网链接。
4. 只在批准原型目录建新40字节完整Git commit并clean后，通知W09，重新派W40 QA、W41 SEC和W42该新增量POSTBUILD。保留原72成熟OSS原文件和5个已批准Lucide差分。

## 并行工作状态与禁止跨界
初始只读时HEAD=准确a96b4d、branch正确；正式CSV写成后再次回读：HEAD仍a96b4d，但**W39同时正在合法修复`src/store.ts`、`src/App.vue`、`src/style.css`、`vite.config.ts`等，工作树当前DIRTY**，并有未提交W39日志。我们**未修改任何W39代码/依赖/锁/构建/运行服务**，不把此DIRTY中的任何文件认作已交付的新SHA，不能拿旧POSTBUILD PASS替换本轮后审。

### 已落盘W42正式交付
- `VITE_ESBUILD_MINIMAL_SAFE_PIN_DELTA.csv`：44行准确PACKAGE / version / SRI / LICENSE / action / HOLD；
- `SEC_AUDIT_ACTUAL_ADVISORY_AND_LOCK_GATE.md`：真实W41 advisory及锁后验门槛；
- `CSP_NONPRODUCTION_ACCEPTANCE_CRITERIA.md`：localhost enforcing CSP/header与W41负例口径；
- `REVIEW_ACK.md`：本人独立增量复签；
- 本`PREIMPORT_DELTA_TO_W39_W09.md`：W39/W09立即收件原件；
- `postbuild_evidence/VITE_ESBUILD_NEW_PIN_NPM_METADATA_TARBALL_LICENSE_PROOF.json`（6份新旧真实npm tarball，均独立SHA512匹配）、`ESBUILD_0281_OPTIONAL_PLATFORM_26_NPM_METADATA_ONLY.json`、机读生成脚本。

**W42_CERTIFY: PREIMPORT_DELTA_ALLOW_VITE_7_3_7_ESBUILD_0_28_1_EXACT_OFFLINE_ONLY / NEW_POSTBUILD_NOT_RUN / W41_SECURITY_RETEST_REQUIRED / NO_LEGAL_P4_DEPLOY。**
