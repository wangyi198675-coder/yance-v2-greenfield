# W27｜用户明确多主页自动管理｜覆盖旧单主页配置决策（2026-10-28）

## 已验证的官方合同（官方 `https://developer.pancake.biz/`）

- User Access Token `access_token`：账户级 `GET https://pages.fm/api/v1/pages`，自动发现当前 Pancake 用户所管理的**多个主页**。
- 每个 Page 使用独立 `page_access_token`，它是所有 `/api/public_api/v1`、`/v2` Page conversations / customers / history 的真实资格。
- `POST /api/v1/pages/{page_id}/generate_page_access_token` 会**使该主页旧Token失效**，因此绝不允许批量后台自动调用！只有用户知情、指定主页、明确同意令牌轮换，才可生成。其他人或其他工具可能正在使用旧令牌。
- 已通过 Pancake 登录授权 Facebook Page 不需再次 Facebook OAuth；言策连接的是获准的 Pancake API 账号和各 Page。
- 账户Token有效期与登出关联；Page Token直到手动撤销/更新为止。这两层应展示真实状态，不能为了自动管理直接无条件假ONLINE。

## 以多主页为第一公民的真实原生边界

1. 本人一次录入账户 Access Token → W27旧 `listAuthorizedPages`（或 `createFacebookPageNativeAuthorization`的PAGES）调用官方`GET /pages` → 过滤非Facebook频道、列表显示所有真实主页。
2. 用户可多选已拥有的 Page；每个 Page 单独验证 `page_access_token`，Page K = `principal/account/pageId/bindingRevision/consentEpoch`，独立配额、同步、头像、历史和撤权。不得以“Pancake已经连接”取代每页当前授权和状态。
3. 原W24必须支持 `readCurrentW24PageBinding({pageId})`、`bindVerifiedW24Page({pageId,...})`、`revokeSpecificW24Page({pageId})` 的多条并存记录，不能继续用一个 `readVerifiedW24Binding({channel:'FB_PAGE'})` 覆盖后一个主页。
4. W55复用WinCred/DPAPI，账户Token及每页Token各自受到隔离保护，单独撤销、更新、版本比对；**旧`PANCAKE_PAIR`固定账户单记录最多支持一个Page，不能作为真正多主页密钥库上线**。如果原W55无法做到按Page ID隔离，就应由原Owner进行最小扩展，而不是误称“一个pair存好多Page”；不可复制旧密钥。
5. 当前W46两Token表单、单选`chosenPage`以及`bindPage`也是**单主页UX实现，明确SUPERSEDED / NO_RELEASE**。新版需账户连接一次→主页列表勾选多项→独立授权状态/失败重试→点击一个主页查看各自联系人；不展示固定“第二枚Token必填给所有主页”的说明。
6. W25维持唯一真实发送器，同一联系人Peer必须用完整PageScope K；不自动发送，任何失败仅影响指定Page，不扩大撤权/自动回复到其他Page。

## 本轮直接新增可复用且未越权源码

- `connectors/pancake/multi-page-manager.mjs` 的`createPancakeMultiPageManager`复用原W27官REST+W24回调，六个状态/命令：discover, bindSelectedPage, bindMultiplePages, revokeOne。没有复制HTTP SDK、没有Token保存、没有生成/轮换令牌、没有独立数据库或发送器。
- `multi-page-manager.test.mjs`：7/7 PASS，3个Facebook Page自动发现，两个并行存在（顺序分事务），其中一个Token拒绝另两个依然连接，跨Owner拒绝，其他平台过滤，撤销A不影响B，禁止无本人选择自动绑定/轮换。
- 尚没有真实签署Page归属/社交Token，**`SOURCE_CONTRACT_TEST_PASS` 不等于 `MULTI_PAGE_USER_DELIVERED`**。不能对现有44767切换假Page，不能擅自批量生成新的PancakeToken。

## 发布纠偏

旧PR#113 `14c7072ca0e60c6626b1507d77c69ec4c24b3fa1`及其分支仍含只支持一个主页的表单。用户明确否定该作为最终成品；**禁止W09-3直接合并这个单Page UX版到44767/44751**。须原Owner实现以上W24+W55多Page当前权限与真实API回读、Web界面实测，再受控更新44767。

`SOURCE_MULTI_PAGE_CONTRACT_PASS / W24_PER_PAGE_OWNER_PORT_HOLD / W55_PER_PAGE_CUSTODY_HOLD / REAL_USER_TOKEN_NOT_ENTERED / 44767_USER_UAT_HOLD`.
