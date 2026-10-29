# 言策 W09-3｜通知中心 Web-first（2026-10-28）

基础提交 ab56af052a857f281f7dc44dc15e6e90991b11a4。只调整现有九分类设置中通知页的布局与显示，不新增通知系统或社交消息发送器。

Agno 正式 SDK 支持 Run 流事件、工具 Hook、post-hook、后台通知钩子，但没有自动替言策的四个聊天 Provider 监听真人消息，也不能替代操作系统 Windows Tauri Toast 或浏览器权限。
现有 W47 capability truth 明确 notify.persistedWrite=false、W05_NATIVE_NOTIFICATION_SETTINGS_OWNER_PORT_NOT_CONNECTED。因此 Windows 原生 Toast、声音/音量、联系人例外及 Agno 事件订阅仅展示真实待接入状态，禁用伪开关、不伪造测试成功。
浏览器通知权限沿用 BCSettingsWorkspace.vue 原 Notification.requestPermission 原流程，只能由用户点击；仅在已有 granted 权限后，用户主动点击测试才通过浏览器原生 Notification API 发送静音的本机测试提醒，明确“提交≠送达”，不会接触任何真实联系人或远端 API。
使用项目既有 Vue、@lucide/vue、原主题 tokens，无新增 npm 依赖。保持 W05 原 Tauri+WebSocket/REST 路线和 W43 原 Agno 运行轨迹；未修改二者底座。
实际 Chrome QA：隔离端口44965，1360、950、430、360 四档无横向溢出；权限未允许时测试按钮禁用；Windows/音量/Agno 未连接状态正确。截图和 JSON 见同目录。原20项回归通过。

不代表已在固定正式端口44751发布，也不证明 Windows Toast 或真人通知可用。必须经原 W47 构建门禁、源码哈希和真实浏览器验证后才能切换。