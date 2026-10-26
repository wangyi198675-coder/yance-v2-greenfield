# W27 → W09-2｜Issue #77 Facebook Page 本人主动授权最小原生接缝

**日期:** 2026-10-27
**准确范围:** 仅 `connectors/pancake/**`；保持`Pancake`主通道及`Chatwoot Cloud`只读受控备用，未更换供应商、未创建第二发送器。
**Owner ACK:** W27 的原生授权源码可测试，W47网关/W46 UI和W54/W55原生凭据接口未在本分支修改；真实本人授权与Web端实际点击验收仍 `WAITING_USER_AUTH / UI_GATEWAY_NOT_WIRED`。

## 已实现且可直接 import 的真实入口

```js
import {
  createFacebookPageNativeAuthorization,
  createChatwootStandbyAuthorization,
  createW27FacebookPageActionPort
} from './connectors/pancake/native-authorization.mjs';

const pancake=createFacebookPageNativeAuthorization({
  resolveNativeSession, assertNativeUserAction,
  openExternalOfficialLogin, beginProtectedTokenEnrollment,
  readProtectedCredentialStatus, getProtectedTokenLease,
  readVerifiedW24Binding, commitVerifiedW24Binding,
  revokeW24Binding, revokeProtectedCredentials
});
const chatwoot=createChatwootStandbyAuthorization({
  resolveNativeSession, assertNativeUserAction,
  openExternalOfficialLogin, beginProtectedTokenEnrollment,
  readProtectedCredentialStatus, getProtectedTokenLease,
  readVerifiedStandbyBinding, commitVerifiedStandbyBinding,
  revokeStandbyBinding, revokeProtectedCredentials
});
const actions=createW27FacebookPageActionPort({pancake,chatwoot});
await actions.invoke({provider:'PANCAKE',action:'STATUS'});
await actions.invoke({provider:'PANCAKE',action:'START'}); // ONLY in response to verified W54 native user click
await actions.invoke({provider:'PANCAKE',action:'PAGES'}); // official User Token GET, user selects Page
await actions.invoke({provider:'PANCAKE',action:'BIND',args:{selectedProviderPageId}});
await actions.invoke({provider:'PANCAKE',action:'REFRESH'}); // real Page Access Token GET, no messages
await actions.invoke({provider:'PANCAKE',action:'REVOKE'});
await actions.invoke({provider:'PANCAKE',action:'RECONNECT'});
await actions.invoke({provider:'CHATWOOT_CLOUD',action:'START'});
await actions.invoke({provider:'CHATWOOT_CLOUD',action:'BIND',
  args:{cloudAccountId,inboxId,expectedMetaPageId}});
await actions.invoke({provider:'CHATWOOT_CLOUD',action:'STATUS'});
await actions.invoke({provider:'CHATWOOT_CLOUD',action:'REVOKE'});
```

以上不是在当前 W47 已注册的 HTTP route。**消费方需最小接线**：W47 原 `native-provider-gateway.mjs` 的 Facebook Page setup 不能只返回 `OFFICIAL_SETUP_REQUIRED`，必须由用户点击发送真实操作到这个 W27 `actions.invoke`，操作受 W47 单一当前 Native Session 验证，W54签名的真实用户操作交 `assertNativeUserAction`；W46 Owner 在其现有页面将按钮绑定 W47 实际操作与后续 GET 回读。本 W27 PR不修改他们的源码、现有 44767 地址或旧 44751 版本。

## 本人点击后的真实官方授权流程

1. 用户在已有 B+C Facebook Page 账号设置点“连接” → W47/Gesture 验证 → W54 `openExternalOfficialLogin` 打开 **https://pages.fm/**。不后台登录，不恢复V1以前移除的账号。
2. 用户本人用合法 Pancake 账号在官方页面登录，并在其 Page Settings → Tools 按官方指引签发自己账号权限范围的 **User Access Token、Page Access Token**。这些 Token 只能通过W55已被审查的本机受保护凭据输入调用 `beginProtectedTokenEnrollment` 录入；**不得粘贴到聊天、普通Web表单或日志**。
3. W55仅签发短期、当前Principal限定的 `getProtectedTokenLease`，必须含 `enrollmentSource:'EXPLICIT_NATIVE_USER_ENTRY'`，未撤权且 `restoredLegacyAccount!==true`；无已实现对应 W55 社交Token口则明确501/503，不允许假装输入已经生效。过去W55确切已签的是云端模型Key，**没有证据其现有接口已支持PANCAKE/CHATWOOT**。
4. 用户点“选择Page” → W27真正通过 `GET https://pages.fm/api/v1/pages?access_token=...` 从官方Pancake读出账号授权Page列表；此首次读取 **不依赖已存在W24 Page Binding**，解决以往无法从无绑定状态接入的鸡蛋问题。
5. 用户选定自己的Page，W27再次用官方Page Token `GET https://pages.fm/api/public_api/v1/pages/{page_id}/users?page_access_token=...` 确认有效Page权限；只向原W24 `commitVerifiedW24Binding` 递交可验证Page事实，并在同一Native Principal下重新GET W24权威记录。W24必须独立检查 Meta Page真实权属、epoch与既有Consent，不允许把供应商字符串当作直接授予外发权限。**即使绑定成功也仅`AUTHORIZED_READ_ONLY`，`canSend:false`，不擅自自动托管**。
6. 用户点“刷新状态” → W27再次从W24/W55回读、用官方Page Token发真实GET，只在官方成功且W24仍当前时返回`providerApiReadback:'PANCAKE_PAGE_API_AUTHENTICATED'`；这不等于已验证真实Meta Messenger `ONLINE`，`connected:false`一直保守。
7. 用户点“撤销” → W24先持久撤销/失效，再验证回读，后W55清除凭据；清除失败明确 `REVOKED_CREDENTIAL_CLEANUP_PENDING`，禁止发送。用户点“重新连接”须再次主动打开官方页面，重新录入新凭据，绝不自动读取V1或已删除Token。
8. Chatwoot Cloud用户点“配置受控备用” → W54打开 **https://app.chatwoot.com/**；W55保护应用Token；W27真实 `GET /api/v1/accounts/{accountId}/inboxes` 只核对 `Channel::FacebookPage`（普通API Inbox不可替代），随后W24持久记录独立 standby mapping。**没有已授权Meta Conversation Routing、现存/新建conversation合法性、双App及W25 ownerEpoch/UNKNOWN证据时，继续 `eligibleToSwitch:false`，不做双活发送。**

## 当前实际回读/拒绝矩阵

- 无W47 Native Principal → 401，禁止打开官网或获取token。
- 未经W54真实点击 → 拒绝`START/PAGES/BIND/REVOKE/RECONNECT`；仅浏览网页、焦点变化不会登录。
- W55社交凭据输入界面/当前租约缺失 → `NATIVE_TOKEN_ENTRY_UNAVAILABLE`或`NATIVE_CREDENTIAL_LEASE_UNAVAILABLE`，不触发真实Page读取。
- 非本人Page ID → `PAGE_NOT_OWNED_BY_CURRENT_PANCAKE_USER`；无Page token/官方401 →拒绝，不创建W24账号记录。
- W24缺失有效签署Page归属、绑定事务或回读 →拒绝，不报告成功。
- W24撤权后W55清理失败 → `REVOKED_CREDENTIAL_CLEANUP_PENDING`，发送仍禁。
- Chatwoot非Facebook Inbox、跨账号、无官方 Cloud 应用凭据 → 不建立备用有效授权。
- 所有返回只含授权阶段/非秘密Page标识，`canSend:false`。没有W25派发调用，没有Chatwoot切主动作或真正Meta MID。
- 本测试未见任何真实用户授权账号；`ONLINE`、真实Page联系人或ACK**没有正例证据，不能从mock测试推断成功**。

## 交W09-2对齐的最小 Owner 改动

| Owner | 精确需求（非本W27代码权限） |
|---|---|
| W54 + W47 | `resolveNativeSession`, `assertNativeUserAction`, `openExternalOfficialLogin`（用户实际点击才可用）；W47现有provider gateway把真实ACTION传给W27 port，保留本机身份、安全来源；`/status`应消费W27 `connectionStatus`，不返回伪ONLINE。 |
| W55 | 现有受保护native key保存接口最小增量支持`PANCAKE USER/PAGE`与`CHATWOOT_CLOUD APPLICATION`、当前Principal隔离的原生输入、仅短期租约、撤权与用户新录入来源，不能在普通Web填写社交Token；不建第二Vault。 |
| W24 | 真实授权 `read/commit/revoke VerifiedW24Binding`，同一个当前native principal、Meta Page权限、bindingRevision/accountRevocationEpoch/consentEpoch的原事务与回读；Chatwoot backup映射不覆盖Pancake主权威。 |
| W46 | 当前B+C原账号组件使用W47正常 route，不重复写新Page UI/Composer；真实按钮GET/POST/GET和错误提示。 |
| W25 | 保持唯一MessageDelivery、Outbox及`UNKNOWN`，本W27没有任何发送权。 |
| W09-2 | 只合入本W27校验过的Owner delta，结合W47/W55/W24正式接线复签后在既有44767实机Opera/Chrome测试；不动44751。 |

**阶段：** W27 仅可签`SOURCE_PASS`（既有 REST+新授权胶水，本机单元/负例通过）。`UI_NATIVE_AUTH_NOT_YET_WIRED`、`WAITING_USER_AUTH`。缺真实Page授权时不能完成实际账号在线/联系人/断线重启正例；缺W47/W55/W24消费接线时不能说点击已贯通。
