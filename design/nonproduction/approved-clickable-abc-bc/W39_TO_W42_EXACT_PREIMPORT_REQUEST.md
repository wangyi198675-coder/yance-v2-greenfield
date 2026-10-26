# W39 → W42 | P3-1精确OSS前置放行申请
STATUS: REQUESTED / **PREIMPORT_ALLOW NOT RECEIVED** / COPY_INSTALL_BUILD_NOT_STARTED
DATE: 2026-10-24
GREENFIELD_BASE_HEAD: d05f46c83e34e0c2599254a4aac9dc77461f6026
WORK_BRANCH: p3-1/clickable-abc-bc
OWNER_SCOPE: design/nonproduction/approved-clickable-abc-bc/ ONLY

## 请求范围（明确仅是候选，不是既有许可）
请独立读取本目录 `W39_REQUESTED_OSS_EXACT_FILE_LIST.csv`：67行准确`upstream_path`、`upstream_sha256`、`planned_vendor_path`，均取自W38原始SELECTED_SOURCE中9个最小组（Button2/Bubble5/Message7/Scroller8/ContextMenu16/Dialog11/Popover8/ScrollArea3/InputGroup7）。初始来源为shadcn-vue tag v2.8.2 / commit `3f048dfb495703f39e191b25a69307fba72822eb` / MIT LICENSE SHA256 `69f84f4ad77be299dbf42d03d7fd862ab3ab05546c6e573c6c7c875b0168a94d`，注册表仅冻结Reka base，不使用new-york-v4顶层registry.json。

请W42逐文件标明 **PREIMPORT_ALLOW 或 HOLD**，实际允许的准确文件、上游SHA、版权/保留MIT正文义务及是否允许对import别名作必要diff；不要把整体MIT认定为每行已获导入授权。所列67行也不是必须全导入；如可用更小完整闭包，请退回准确缩减清单与替换diff方案，不得W39猜测。

## 未补签的依赖缺口
- InputGroup registryDependencies所指`input/index.ts`、`Input.vue`、`textarea/index.ts`、`Textarea.vue`，独立放行4文件或拒绝。
- 上游`lib/utils.ts` SHA256 `ce4d9a828c0312cf66d0196934e9efd50491887f601dcb12ccda8683118520e9`，独立核准及`clsx`/`tailwind-merge`许可证。
- ContextMenu/Dialog 对`IconPlaceholder`的依赖与`components/icon-placeholder/{index.ts,IconPlaceholder.vue}`额外2文件；请优先审核只有**一套@lucide/vue**图标链的有diff方案，不能因静态import就把其他五套图标族与W38其余18文件默认导入。若无签署路径，明确HOLD。
- `@/lib/utils`和`@/components`、Tailwind CSS、官方基础Reka registry的`components.json`/`tsconfig`映射、IconPlaceholder替换点，请以准确路径及差分列出放行范围。没有per-item JSON时，用同commit已审的Reka `_registry.ts`作只读来源；W42确认生成路径或准许无CLI手工固定路径方案。
- 禁止新的AI Elements PromptInput / Attachment / ToolConfirmation patterns、旧`ai-elements-vue`、motion-v、未签dropdown menu、其他UI族。动画只使用已放行基础控件内置transition与reduced-motion。

## 申请包级精确版本
当前锁定候选：`reka-ui@2.11.0`（Git `4dc1a2304e95fb97d642f24d8419359bfc3d2e85`），`@tanstack/vue-virtual@3.13.47`及`@tanstack/virtual-core@3.19.6`（Git `28ff2cab7a970f4e0908229d65a0da8803903900`），`shadcn-vue`只用于批准源文件，不把CLI作为运行依赖。其余**Vue/Vite/TypeScript/Tailwind/@vueuse/core/@lucide/vue/CVA/clsx/tailwind-merge**需W42给出准确可批准版本与许可证及包依赖闭包，不能自行猜测最终可安装版本。候选npm metadata SRI见W38，非真实安装完整性PASS。

请针对COPY与INSTALL分别交：`PREIMPORT_ALLOWED_AND_HOLD.csv`、`PREIMPORT_LICENSE_NOTICE_EVIDENCE.md`及本人`REVIEW_ACK.md`，包含证据SHA、路径、范围、依赖准则、剩余HOLD。其前审仅针对P3-1 **离线非生产**，不是公司法定LEGAL及P4放行。
没有准确PREIMPORT_ALLOW之前W39继续保持**0 copy、0 install、0 build**。

## W39预定受限实施
获批以后在本目录单一Vue/Vite实验运行器，四臂共享W37同一状态模型、原始fixture、overlay、sidecar，单独布局控制A/B/C/BC；120完整K/MID、0–3建议、引用+IME+每K草稿、A输入接管/B/C继续托管、PRIVATE独立Agno Mock、错误/撤权/UNKNOWN NO_SEND、5主题明暗10态、9响应宽、44真实任务测试。严禁任何真实网络连接、业务发送、真实Agno模型或收费API。

## 固定申请附件SHA（远程机器certutil实算）
- `W39_REQUESTED_OSS_EXACT_FILE_LIST.csv`: SHA256 `40b1644ffc8c1d5c77b55562d4027887a5488dad731b128711b9349bac6ddfc7`; precisely **67 entries**, request only.
- `RUNTIME_44_TASK_EXECUTION_ROWS_NOT_RUN.csv`: SHA256 `f65fb60c046b307b362a2ba24e8f79c7b1b963245e4c61913f1d649abe3e3427`; exactly **44 cases**, all actual run **NOT_RUN**.
