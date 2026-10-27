# W27 → W09-3｜R4 Facebook Page真实点击后授权流程的 P0 修复｜2026-10-28

## 结论

对原固定44767 `6e52ef5b80df19f558c160bab47791c47107e8cb`的真实 Chrome RED 做了W09可核验的独立集成源码修复。本次**UI truthful / secured action contract / independent local browser UAT PASS**；因现有W54本机原生Session与W55 Pancake社交Token受保护租约没有在已运行API接通，**真人Page身份/头像/历史/在线USER_DELIVERED仍 HOLD**。绝不混淆二者。

## 真实源码与稳定基线

- 唯一基线：已运行`http://127.0.0.1:44767/` Web/API `6e52ef5b80df19f558c160bab47791c47107e8cb`；本机健康`trustedSession:false, mode:NATIVE_PROVIDER_OWNER_PORTS_NOT_CONNECTED,canSend:false`。没有合法用户Page绑定，不能偷用用户Opera/Pancake网页Cookie。
- 独立原生集成Owner分支 `integration/w27-fbpage-auth-click-fix-20261028`，工作树`C:\Users\1\Documents\YanceV2\Worktrees\W27_AUTH_CLICK_FIX_20261028`；无覆盖原W46/W47/W24/W27等工作树，不修改正式44767/44751、main或Tauri安装。
- 旧真浏览器P0证据：`C:\Users\1\Documents\YanceV2\Phase3_OSS_Worktrees_20261024\DISPATCH\P2_AUDIT_ONLY_20261024\COORD_AGGREGATE\W27_20261028_FB_PAGE_AUTH_REAL_BROWSER_P0\evidence`。

## 本轮实际修复内容（不自研第二套Facebook SDK）

1. `apps/web/src/BCProductWorkspaceCandidate.vue`：从四卡占屏换为R4已批准的**四个紧凑平台选择行→只渲染选中的一张原生账号组件→返回选择或聊天**。原Chat B+C、Composer和Agno不改。
2. `apps/web/src/BCSettingsWorkspace.vue`：账号设置也统一为“选择平台→单个平台”，没有同时挂载四个授权卡/四套后台轮询；高级诊断只按需打开。
3. `apps/web/src/BCChannelAccountSetup.vue`：旧`GET /setup`即将界面无条件设`WAITING_USER_AUTH`的代码已移除。`OFFICIAL_SETUP_REQUIRED`绝不会转成待授权。`FB_PAGE`通过W54`/api/v2/local-session/status`确认真实`NATIVE_FIRST_PARTY`及64位CSRF后才允许点击；缺乏可信原生会话就**禁用按钮并提示设备尚未启用**。真实START返回`WAITING_USER_AUTH`及native protected entry，随后“读取主页”（真实PAGES）、本人选择、BIND回读`AUTHORIZED_READ_ONLY`；没有Meta ONLINE证据不会假称收发成功。非FB Page继续使用原W26/28/29接口；W28二维码不重造。
4. `apps/web/src/channel-setup-contract.mjs`：`invokeFbPageNativeAuthorization`只通过same-origin GET本机Session并校验`NATIVE_FIRST_PARTY`+原CSRF，然后由用户主动点击 POST`/api/v2/providers/fb-page/authorization/{start,pages,bind,refresh}`，验证W27真实source/status/Page ID/bindingRevision，不接受SPA构造的假账号/Token/图片。受限动作无任意URL。
5. `services/api/runtime/native-fb-page-authorization-http.mjs`：原W47上的新安全HTTP薄路由，严格POST/Origin/same-origin Fetch Metadata/localSession `NATIVE_FIRST_PARTY`/CSRF/JSON体大小+字段/Page数字ID，原W54 principal+session revocation epoch重查，委托**原W27`createFacebookPageNativeAuthorization()`实现的方法**。新增`makeOriginalW27NativeInvoker(originalW27)`严格对应现有五个Owner方法，无自研OAuth、凭据库或发送器。缺签W54/W24/W55/原W27实际注入返回503，禁止还没有真人授权时虚构ONLINE。
6. `services/api/runtime/server.mjs`：注册上述真实路由，但故意不使用fake callback。**当前已运行W47缺签`beginProtectedTokenEnrollment, getProtectedTokenLease, assertNativeUserAction, resolveNativeSession, readVerifiedW24Binding`等真实original Owner Port；W09-3不得直接把mock填入生产、需要原W54/W55/W24签署来源**。
7. 相应受保护原生HTTP安全测试、R4单渠道UI和 W54/native Session POST合同的真实Node测试同步更新，不静默删旧安全回归。

## 实际验收结果

- 安全与W46/W47旧回归 Node **29/29 PASS**，包含原W27 Owner invoke adapter映射，不新增第二套协议。独立浏览器三宽度均PASS。
- `@vue/compiler-sfc`经Vite实际B+C全产品转换 2687 modules，构建PASS。独立动态Chrome测试使用`http://127.0.0.1:44827/`（不替换44767），1360×850/950×620/430×850三档全部通过，具体：`pickerCount:1,channelChoices:4,fourCardBefore:0,fbOnly:1,disabledByNativeSession:true,countFalseWaiting:0,homepageLink:0,choiceReturn:true,backChat:'CHAT',pageerror:[]`，Page未认证时只读`GET /api/v2/local-session/status HTTP200`并禁止后续POST。**预览是准确编译后浏览器功能测试，不是真人Facebook Page授权**。
- 实际截图和Net JSON在`C:\Users\1\Documents\YanceV2\Audit\W27_R4_FB_PAGE_CLICK_20261028\fix44827`，前一轮RED存相邻文件。当前独立预览端口`44827`，其Vite静态预览仍使用已运行`48219` API做真实未授权readbacks。

## W09-3对这条链最后必须完成的授权Owner签署（不可用假数据）

```js
import {createFacebookPageNativeAuthorization} from
  './connectors/pancake/native-authorization.mjs';
import {makeOriginalW27NativeInvoker,
  createNativeFbPageAuthorizationHttp} from
  './services/api/runtime/native-fb-page-authorization-http.mjs';

// 使用已签真正的W54/W55/W24原生Callback创建 existing W27:
// const originalW27=createFacebookPageNativeAuthorization({
//   resolveNativeSession,assertNativeUserAction,openExternalOfficialLogin,
//   beginProtectedTokenEnrollment,readProtectedCredentialStatus,
//   getProtectedTokenLease,readVerifiedW24Binding,
//   commitVerifiedW24Binding,revokeW24Binding,revokeProtectedCredentials
// });
// 然后W47 createNativeFbPageAuthorizationHttp({
//   sessionAuthority:localSessionAuthority,webOrigin,
//   resolveW54Principal:originalW54CurrentPrincipal,
//   invokeW27NativeAuthorization:makeOriginalW27NativeInvoker(originalW27)
// });
// W54 Session和原W27方法自己会核验账号/K/epoch/本人手势。
// 没有任何一个真实signed callback时不能开通按钮。
```

用户真正的后续动作只在上述路径具备资格后：本人连接Pancake → 在原W55保护的本机UI录入新签User/Page Token（绝不能贴聊天或原浏览器普通表单）→ W27 PAGES真实读回本人可管理的Page→本人选择并BIND到W24 K → W27 STATUS/刷新 → W25原生历史/发信独立验证 →头像/撤权反测。原Pancake OAuth回调如未得到Pancake正式支持，就不能靠打开pages.fm网站自动将登录转为言策 Token；此部分是真实厂商集成限制，不是 UI 能绕过的。

**发布门禁：W27_R4_UI_SOURCE_PASS, W47_NATIVE_HTTP_SECURITY_PASS, INDEPENDENT_44827_REAL_CHROME_PASS；W54/W55/W24_SIGNED_NATIVE_AUTH_HOLD；REAL_USER_FB_PAGE_AUTH_HOLD；FIXED_44767_NOT_DEPLOYED；MAIN/44751_UNCHANGED。**
