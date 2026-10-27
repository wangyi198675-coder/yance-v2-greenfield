# 言策 V2｜专家弹窗 Web-first 增量验收（2026-10-28）

基线：`63566637a0a4d5a8554aeaa117b2a95c9b21e975`

用户授权：直接执行专家弹窗定点修复；按已批准设计稿，沿用原唯一 Composer 和 W43 官方 Agno 专家目录。

## 精确允许的本次前端增量
- `apps/web/src/BCNativeExpertPicker.vue`：新 Vue 浮层组件，仅展示经 W47/W43 鉴真的专家目录；独立 Teleport 防父容器裁剪；搜索、已安装筛选、浮层定位、关闭与超时。
- `apps/web/src/BCNativeComposer.vue`：仅移除固定的十项不可选列表，复用原 Composer 的“＋专家”触发器与原身份/发送安全逻辑。
- `apps/web/src/BCLiveChatWorkspace.vue`：转发去唯一闺蜜大脑的导航事件；不新增 Agent 或发送器。
- `apps/web/tests/w46-pr99-contextual-popover.test.mjs`：更新原 315px 旧样式断言，验证当前设计和安全边界。
- `apps/web/runtime/vite.w47.config.mjs`：仅增加当前用户认可前端增量的精确 Git blob 白名单，旧版 Owner 校验和 W47 runtime-truth-gate 仍必须继续有效；不能接受不在白名单的源码修改。

## 证据等级
- 真实 W47 后端当前未建立可信会话，GET 专家目录拒绝 / 超时；浏览器必须显示“专家目录暂不可用”，不伪造业务状态。
- 本轮真实 Chrome 对 1360、950、430、360px 的打开、锚点不裁剪、关闭和焦点返回均通过；截图 `EXPERT_POPUP_REAL_401_1360_20261028.png`、`EXPERT_POPUP_REAL_401_430_20261028.png`。
- 仅使用明确 QA Fixture 校验 10 条服务端形状、1 项 READ_ONLY/9 项 NOT_INSTALLED、搜索、筛选、跳转到现有 Brain；截图 `EXPERT_POPUP_FIXTURE_DESIGN_1360_20261028.png` **不是正式已登录用户的真实专家目录，也不证明 CONTACT 专家绑定。**
- 原 W43 专家调用契约只允许 PRIVATE / THIS_TASK；Composer 专家按钮不得授予 CONTACT 权限、持续托管或真实社交发送。
- 本轮未触发任何真实社交账号登录、用户收费 API、真人消息发送、Windows 打包或对 44751 的覆盖。

完整运行 JSON：`EXPERT_POPUP_CDP_QA_20261028.json`。最新 Git SHA、真实固定地址资源读取和 rollback 在 Web 发布后另行回写。
