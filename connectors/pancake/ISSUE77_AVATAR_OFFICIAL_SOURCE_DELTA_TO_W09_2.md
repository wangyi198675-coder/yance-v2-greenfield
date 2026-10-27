# W27 → W09-2 | Pancake官方Page头像现成API与开源移植辨别 | 2026-10-27

## 事实判断

用户在合法登录的 Pancake SaaS 页面，已经实际看到 Facebook Page 会话及部分头像，属于有效用户视窗观察；**不能仅据此断言该联系人原始头像在别的Facebook App或言策里自动可读**。

- Pancake官方 OpenAPI v1.0.0 已确证：`GET https://pages.fm/api/v1/pages/{page_id}/avatar/{psid}`（官方 REST 源自 `https://developer.pancake.biz/openapi/openapi.yaml`），无需 Token，返回 **301 HTTPS CDN Location**。这是一条可调用的第三方服务端接口，**不是 Pancake 公开的Messenger核心源代码、永久免费授权或开源发布许可**。原字节公开YAML SHA256 `ab2e2a9fadd2f170aba2921e459a2d349b42c2675c5883f27f8bbbd052f7130c`，Windows本机2026-10-27核对YAML目标段第2119行及状态码契约。
- Chatwoot Community Edition 的源代码在 `https://github.com/chatwoot/chatwoot`，非enterprise目录MIT许可；可合法借鉴/复用符合许可证的既有头像处理，但 **Chatwoot Messenger头像并不保证都显示**，2026-08 GitHub issue #15378 指出异步 AvatarFromUrlJob 事务竞态，需实际验证。为避免更换已确认主/备渠道，当前**Pancake保持主、Chatwoot Cloud仅受控备用**，不未经用户/总协调决定变更平台。
- Chatwoot社区版开源并不意味着其Cloud服务免费或拿到其官方Meta App/生产许可；Meta对Page-scoped PSID头像仍有隐私与权限边界。

## 已实施：仅 W27 原生最薄胶水

新增 `connectors/pancake/official-avatar.mjs`:
```js
import {createOfficialPancakeAvatarResolver} from './connectors/pancake/official-avatar.mjs';
const avatar = createOfficialPancakeAvatarResolver({
  resolveTrustedNativeSession: w47OriginalNativeSession,
  resolveCurrentW24PagePeer: w24CurrentAuthorizedPagePeer,
});
const result = await avatar.readAuthorizedAvatar({pageId, psid});
```

此接口从用户已合法授权的W24/W47 Page和该Page真实PSID解析；使用Pancake官方无Token的GET，仅跟随经校验的`content.pancake.vn` 301 Location（代码实际`redirect:'manual'`，不追随第三方恶意跳转），前后核验当前Session+W24绑定revision及撤权epoch；404/410给`NO_AVATAR`，任何未授权/跨Page/伪PSID/不可信CDN拒绝。**不建Avatar持久库、不读任何用户社交数据、不发消息或创建新的Provider/SDK**，输出不能变为跨账号共享头像缓存。

旧W27授权接口`711a5544f0176c1fc1052dead9b8f275b267ed7a`及Pancake REST/Chatwoot未改写；新测试`official-avatar.test.mjs`10项，老85项保留，本机合计95/95 PASS。

## 仍然HOLD

没有用户Page Token/PSID许可、W47实际session与W24可信本人的绑定输入，没有真实用户的301/头像文件及前端显示证据；这不是头像已经在44767显示。W09-2须在其自己的独立集成分支和W46原Composer联系人卡片实际消费该W27 port，等待本人账号授权后对照Pancake的同一联系人做头像正例、404和跨账号负例，确认实际用户截图。**目前仅 SOURCE_PASS，真人头像/USER_DELIVERED HOLD**。

另外，依赖第三方 Pancake公开avatar重定向不解决14天试用后的收费/服务政策问题；长期免第三方收费的方案必须以具有许可的开源代码和用户自己拥有的合法Meta App能力评估后决定，不可复制Pancake闭源代码、逆向登录Cookie或绕过供应商收费。
