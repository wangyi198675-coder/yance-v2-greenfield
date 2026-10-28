"use strict";
const byId = (id) => document.getElementById(id);
const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
async function refresh() {
  if (typeof invoke !== "function") {
    byId("os").textContent = "无可信原生宿主";
    byId("session").textContent = "不可用";
    byId("server").textContent = "未认证 (401)";
    byId("logout").disabled = true;
    return;
  }
  try {
    const state = await invoke("session_status");
    byId("os").textContent = state.nativeOsVerified ? "已核验当前 Windows 令牌" : "未验证";
    byId("session").textContent = state.nativeSessionActive ? "本机临时有效（未授予平台权限）" : "已撤销或失效";
    byId("server").textContent = state.serverTrusted ? "已认证" : "未接入（W47仍拒绝）";
    byId("send").textContent = "禁止 · canSend=false";
    byId("logout").disabled = !state.nativeSessionActive;
  } catch (_) {
    byId("os").textContent = "原生调用被拒绝";
    byId("session").textContent = "不可用";
    byId("logout").disabled = true;
  }
}
byId("logout").addEventListener("click", async () => {
  if (typeof invoke !== "function") return;
  try {
    await invoke("logout_session");
    byId("notice").textContent = "本机 Session 已撤销，不能通过刷新网页重新授权。";
  } catch (_) { byId("notice").textContent = "撤销操作未得到确认，状态不可用。"; }
  await refresh();
});
refresh();
