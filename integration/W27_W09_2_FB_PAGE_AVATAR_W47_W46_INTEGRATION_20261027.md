# W27 → W09-2 独立集成分支｜FB_PAGE Pancake真实头像前后端链路

## 真实结论

- **当前阶段：W27 official avatar SOURCE_PASS；W09独立Web/API合成授权链联测 PASS；真人头像 USER_DELIVERED HOLD。**
- 真实用户在Pancake官网已看到历史联系人头像，不能当作言策拥有同一会话/PSID、Meta平台头像授权的证明；此项目未获取用户真实社交令牌或使用其联系人数据。
- 初始真实Web `http://127.0.0.1:44767` 的运行 SHA `82de109abad35a1595ef5333d8beff0629b13211`：其 `GET /api/v2/providers/fb-page/setup`只有`OFFICIAL_SETUP_REQUIRED`+官方站链接，无法启动原生用户授权；`/api/v2/runtime/health`显示 `trustedSession:false`、`countsAuthoritative:false`。原 `BCLiveChatWorkspace.vue` 用姓名首字代替头像，第109和122行没有图片组件。**W27原PR#82的源码PASS不能算头像UI真正可见。**

## 准确源码基线与本轮集成

- **W09已在用户44767运行的基线** `82de109abad35a1595ef5333d8beff0629b13211`。
- 隔离Integration branch `integration/w09-w27-fbpage-avatar-uics-20261027`；工作树 `C:\Users\1\Documents\YanceV2\Worktrees\W09_W27_FB_PAGE_AVATAR_INTEGRATION_20261027`；**未动W46/W47/W24/W27原Owner正式工作树或用户44767/44751**。
- 从已有W27合法Owner增量准确 cherry-pick：原W27 Issue77 `711a5544f0176c1fc1052dead9b8f275b267ed7a`→集成commit `bc076f2...`；原W27 official avatar `283a821708125698702b1a240f354f9d42511eb0`→集成commit `0d3fcf1e9c897aa10a03c39dcc38ccaf5d420ca9`；W27原合成、REST与Chatwoot合同和原测试保留。
- 本轮 **integration-only proposal** 由W09-2决定分发 W46/W47源码Owner安全复签，不能不经Owner审核直接部署生产或现有44767。

## 改了什么（不另造身份或发送）

1. **W27已签** `connectors/pancake/official-avatar.mjs`：真实公开官方 `GET https://pages.fm/api/v1/pages/{page_id}/avatar/{psid}`，禁重定向并核验官方`301 → https://content.pancake.vn/...`，有W24当前Page/Peer与revocation epoch前后复验；不接入未经同意的旧FB账号。
2. **W47集成提案** `services/api/runtime/native-fb-page-avatar-read.mjs`：新GET `/api/v2/contacts/avatar?accountRef=...&peerRef=...&bindingRevision=...`，用户请求这些字段仅作为定位符，校验当前W54可信Native App Session，W24此Principal所属 FB_PAGE current Page-scoped PSID和Account/Peer当前K、Consent及BindingEpoch，独立调用W27官方CDN头像读取并再验Session/W24当前K，才返回严格`content.pancake.vn` HTTPS头像URL或NO_AVATAR；撤权/错账号/不可信Origin/伪CDN/参数篡改全部拒绝。**原W47 `server.mjs`只注册该只读入口，但真实W54/W24/W27回调尚未由正式Owner签入时必然返回401或503，绝不猜图。**
3. **W46集成提案** `apps/web/src/live-chat-source.mjs` 新增`readAuthorizedFbPageAvatar`，只对W47核验过的完整`contactRef/accountRef/peerRef/bindingRevision`请求，校验返回官方W27来源和唯一允许的CDN Host；其他渠道无Facebook头像读取。
4. **W46 UI集成提案** `apps/web/src/BCLiveChatWorkspace.vue` 真正渲染`<img>`代替“姓名首字”联系人头像与聊天标题头像，失败回退初字；只预取首12个已授权FB_PAGE联系人、最多3并发，其他联系人点击后读；切换账号/刷新/卸载清除头像映射，异步过期数据丢弃，引用图像`referrerpolicy=no-referrer`。不会缓存其它账号头像、不会合成假头像、不会发送消息或接管联系人。

## 在Windows实际验收

- 既有W27`npm test` **95/95 PASS**（旧85保留、10个官方Avatar新增）。
- 新W47节点模块用Node真实loopback HTTP Server执行`native-fb-page-avatar-read.test.mjs`和W46 `live-page-avatar.test.mjs`：**14/14 PASS**，包含401缺Session、503原生Port缺失、403跨账号/撤权、409回查版本变化、官方CDN不可信URL、404无图、非Page / browser伪造contactRef、GET only/no-store。
- 原W47 `native-authoritative-reads.test.mjs`、`native-provider-gateway.test.mjs` 与W46原`live-chat-source.test.mjs`联合加新增套件：**30/30 PASS**。
- Vue3 `@vue/compiler-sfc`对实际修改的`BCLiveChatWorkspace.vue`执行编译 **PASS**，编译结果包含头像State和真正`readAuthorizedFbPageAvatar`调用；Vite v7.3.7 `design/nonproduction/approved-clickable-abc-bc`依赖`npm ci` **安装74包成功**、`npm run build` **PASS**，2653 modules transformed（此Prototype build不等同用户正在用的44767真实UAT）。
- 官方公共API无效Page/Peer（不是用户实际账号）实网GET`https://pages.fm/api/v1/pages/0/avatar/0`实际**HTTP 301**，与正式OpenAPI一致；无任何真实用户Page/Peer图像GET。
- 本机Node24 Vite build + Node测试不写入或部署当前44767/44751。

## 真实剩余“最后一公里”，已定位准确Owner/接口

- **W24** 当前在W47 `native-authoritative-reads.mjs`的`readW24VerifiedContacts`缺真实实现，并且对外联系人只投射`accountRef,channel,peerRef,bindingRevision,displayName`；W09-2须按W24原生`createW24OfficialAccountLifecycle`签署来源注入`resolveW24CurrentPagePeer`，从同一当前K严格返回`{authorized,currentKVerified,consentCurrent,channel:'FB_PAGE',provider:'PANCAKE',ownerPrincipalRef,accountRef,peerRef,bindingRevision,active,accountOnline,providerPageId,pageScopedPsid,accountRevocationEpoch,consentEpoch,channelAccountId}`。全字段来自原W24/W44已验证Page/Peer，不接收前端自报身份/PSID；**原W24/W44仍存在synthetic-only真实账号资格阻断，须签署合法真人Account来源才行**。
- **W47+W54** 将可信`resolveW54CurrentUser`和W24只读解析注入`createNativeFbPageAvatarHttp`，将W27的`createOfficialPancakeAvatarResolver`经原W47 trusted session+W24 resolver注入其`readW27OfficialAvatar`Port；保持本机Session、Origin和撤权epoch。
- **W55** 社交Token安全存储需要已授权用户本机新录入（先前W55证明是AI云端BYOK，不是Pancake社交token），W27真实联系人来源须依其合法Page Access Token，未经本人允许不可读取Pancake历史消息/联系人、也不允许复制旧密钥。
- **W46 Owner** 复签本次W46 Vue渲染、失败回退及页面生命周期，继承此前用户真实Opera截图问题；用户本人经安全入口连接后在固定44767让指定Page联系人头像与Pancake实际会话对应，可见正例及撤权后反证。
- **W09-2** 在受控独立集成分支复核并合并前述各Owner精确签署、与44767 Web-first UAT；禁止仅拿本轮单元/UI编译 PASS就发布 USER_DELIVERED。

## 最终状态声明

本集成工作确实补齐了**头像读取/路由/显示源码的整条链**，但**真实用户头像显示仍未闭环**，唯一真实阻断是没有合法Page账户的当前W24/Page-scoped PSID证明、W54第一方Session和原生社交Token签署及用户授权。未把Pancake商业API偷换为开源模块，也没有解决其14天试用期的第三方商业依赖，长久免费需合法自托管开源渠道方案和Meta批准而非绕付费。
