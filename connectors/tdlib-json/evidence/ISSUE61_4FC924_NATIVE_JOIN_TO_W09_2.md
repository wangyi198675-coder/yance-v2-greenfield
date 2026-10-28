# W29 → W09-2｜Issue #61 TDLib JSON 真实官方Windows原生库及联合4FC924独立接入回执
2026-10-26｜DESKTOP-029FH47｜Owner W29｜NONPRODUCTION ONLY

## 精确联合接线与源码
- W09-2现有联合基线：`4fc924b43136b9499ce9c4d3c5fdbc9f0871bfde`（`integration/w09-2-real-native-oss-capability-20261026`，原工作树CLEAN，不覆盖）。
- 独立W29最小增量分支：`owner/telegram-personal/issue61-4fc-native-dll-join-20261026`，独立目录 `C:\Users\1\Documents\YanceV2\Worktrees\W29_ISSUE61_4FC924_NATIVE_JOIN_20261026`；保留现有W29/W09工作树无改动。
- 只补入已完成W29安全增量 `c405ecd73ed616450477129b57ee211e84d34046`和已完成原生DLL验收增量 `8c314fb025fb65f428f677cf65e1e39c347de8a1`；它们在此联合基线上的cherry-pick为 `df88f84...`及`e7404860837b7da1fae5926f5f276b4f976b3099`。再增**一个**直接调用真实tdjson worker的安全离线进程测试，未重写旧34测试。
- 最终Git HEAD请以此分支 `git rev-parse HEAD`及GitHub远端实际回读为准。全部增量仅在 `connectors/tdlib-json/**`，不修改W09/W47/W54/W24/W25/W46源码，不合入main。

## 官方开源与正式构建完整性
- 官方仓库：https://github.com/tdlib/td.git
- 固定TDLib v1.8.69 / Git exact `ea3f69ce11aef458bfbb09869b809ede4447486f`；许可证BSL-1.0，许可证文本SHA256 `beb8e42e9d6b4284e03304d05a81a0755200a965fc8d0a5e0aea1e84cf805d6e`。
- 官方vcpkg源码SHA `817892b0ecbc6af994dd6df999c73faf795adbf2`，MSVC 19.44, VS2022, CMake, OpenSSL 3.6.5, zlib 1.3.2, gperf 3.3。原构建脚本 `connectors/tdlib-json/scripts/build-windows.ps1` 已真实编译tdjson.dll，不是第三方未知binary或仿协议栈。
- 真实Windows x64 `tdjson.dll` SHA256 `ae286549e2abc071acf67a3423468e8a5a8b488b4cdc368d6f203b2bf1d355e0`（28,558,848 bytes）。
- 原生TDJsonHost.exe SHA256 `72ee2ea1015d37775fbb8f23c55d7ac1b6ad2d5c0eee3b276d2e18b5b63fad57`。
- libcrypto-3-x64.dll `012ed20b740b018506b268121c7372a041c0118b7ae28ab6da6b121f5584d8e4`；libssl-3-x64.dll `b3ced74277fc7b3f5e0220c804ec0fe17feebf9b197dab984d853c4d184571f0`；z.dll `b42377e67c9541e5934044c5f189534c4e2b89c12c6f53ed9dcb725509455e31`。
- 实际本地可交付非生产二进制包（包含上述所有文件、哈希manifest和上游BSL许可证）：
  `C:\Users\1\Documents\YanceV2\Phase3_OSS_Worktrees_20261024\DISPATCH\P2_AUDIT_ONLY_20261024\COORD_AGGREGATE\W29_TDLIB_1_8_69_EA3F69CE_WINX64_OFFICIAL_NATIVE_NONPROD.zip`
  ZIP SHA256：`ac5a7f251e5b25fe4d0c1f0b0ed07d2ebd678140f403e42663d9e8d35dce02ec`，13,582,233 bytes。**不是已签名的生产安装程序**，绝不自动发布或覆盖44751。

## 本次重新实际执行（在精确4FC924联合源码加W29最小增量上）
- `TDJsonHost.exe --probe` → 真正已加载官方tdjson.dll，`td_execute`→`textEntities`，exit0；不登录。
- `TDJsonHost.exe --probe-state` → `td_create_client_id`→`td_send`→`td_receive` 真正回读`authorizationStateWaitTdlibParameters`，exit0；未输入API ID/hash、手机号/OTP/密码，不读取旧V1凭据或本地授权数据库。
- `YANCE_W29_EXPECT_NATIVE=1 node --test connectors/tdlib-json/test/native-tdjson-actual-windows.test.mjs connectors/tdlib-json/test/native-tdjson.test.mjs` → **10/10 PASS**, 0FAIL,0SKIP。含双独立Windows原生进程重载、篡改的二进制哈希拒绝、真实未授权状态机和7项安全负例。
- 新原生Worker生命周期开销：实际Windows `TDJsonHost.exe --worker`进程PID `35752`，收到`native_tdjson_worker_started`，用真正`td_send`提交仅只读的官方`getOption(version)`，通过`td_receive`接收版本1.8.69及官方未授权事件，随后`stop`正常退出，**1/1 PASS**。独立于既有34项测试。无真人消息/账号。

## 最小可信接线合同与实际剩余阻断
- W29源码已提供官方原生 `nativeTDJsonController`：需要原W54/W47受信应用会话和**用户主动点击**证明（`attestUserGesture`），W55新授权会话及受保护TDLib session/DB路径（`findAuthorizedAccount`），W24原生 `getMe`用户UID/账号与Peer精确K/epoch权威（`onNativeAccountIdentity`,`verifyCurrentPeerK`,`onTrustedChatIndex`），W25唯一outbox的可验证attempt/MID/ACK端口（`verifyW25Receipt`,`onW25Receipt`），后续W45/W43及W46唯一Composer由各原Owner接入。
- **W54/W47当前原生信任链仍未签署正向子进程调用**：最新4FC924含W54启动框架与W47现有安全拒绝；并无已证实的已安装B+C按钮→受信native第一方Session→W29 TDLib合法账号会话。W29不会凭HTTP本地请求、renderer发来的`active:true`或模拟Principal创建可信授权，不建立公开TCP接口，仍需原W54/W47/W09在独立集成分支复签最小真实进程接线。
- W24/W44确切真实Platform ChannelAccount/Peer来源与合法Consent尚无真人证据；W25仍需唯一发送前原生资格+Provider MID/ACK真实来源签署，W29不得自建另一个物理Sender、Outbox或冒认ACK。没有用户本人合法Telegram登录授权不得演示通讯录/私信/实际发送。
- **该模块已完成：官方TDLib DLL真实构建、依赖完整哈希、ABI调用、Worker进程生命周期/重启，非生产二进制本地交付**。
- **仍HOLD：真正被可信W54/W47运行时启动的业务Worker、W46可点击Telegram登录UI及W55密钥保护、真实账号登录/重启、联系人和入站MID、W24/W25正式外发ACK全链、GitHub正式全部安全门禁、正式44751生产发布**。

结论：`OFFICIAL_TDLIB_NATIVE_BUILD_AND_ABI_PASS` / `4FC924_W29_NATIVE_SOURCE_JOIN_PASS` / `NO_LOGIN_OR_SEND` / `REAL_PROVIDER_AND_APP_INTEGRATION_HOLD`。
