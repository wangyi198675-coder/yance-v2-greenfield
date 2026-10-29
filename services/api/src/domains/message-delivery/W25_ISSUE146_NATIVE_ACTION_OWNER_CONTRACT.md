# W25 — Issue #146 — Original MessageDelivery message-action Owner contract
Date: 2026-10-29. Parent W25 SHA: 3eef9fab4a29dc03438942d30773ae5cda50582b.

Scope: W25 only. This new guard uses the original MessageDelivery.db (one audit-hold table), NOT an alternate sender, Outbox, SDK transport, Agent, message database or frontend. It does not send/retry/settle. New native-message-actions.mjs exposes createW25MessageActionFence({delivery,checkW24,checkW44,checkNativeCapability,now}), prepare({k,action,providerMid,requestId,actorId,sessionId,mode,targetK?,payload}), matrix(), and explicit rejecting dispatch/recordProviderReceipt.

All original Provider SDK actions remain UI_DISABLED_HOLD until Owner capability signed and the actual original W25 irreversible network boundary is independently secured. Provider support is UNKNOWN/NOT_WIRED, NOT PROVIDER_UNSUPPORTED. No real social-user account, ACK or platform data was accessed.

## Action-by-action contract

| Action | W25 admission and immutable MID requirements | Next original Owner |
|---|---|---|
| REACTION | Full current K, original Provider MID, exact emoji, W24 Actor/ChannelAccount/Peer/Consent/epoch, W44 Grant/Agent scope, signed Provider capability, idempotent hold | W26 Meta, W55 Pancake, W07 Baileys, TDLib Owner official SDK and ACK proof |
| QUOTE_REPLY | Quote binds original full K and Provider MID, no free-form URL/MID; HOLD does not send | Original Composer/W25 existing SendIntent plus Provider quoted-MID adapter and ACK |
| FORWARD | Original source MID and distinct W24-authorized TARGET full K, same account/channel/tenant required until cross-account contract signed | Original Provider forward recipient and actual W25 recipient lock/ACK |
| EDIT | Verified original fromMe=1 plus account, actor, Grant, provider MID | Provider edit support, message direction/type/time rules, authentic edit ACK |
| REVOKE | Verified original fromMe=1 plus current epoch, original MID; HOLD only | Provider revoke-for-everyone semantics, limit and receipt |
| PROVIDER_DELETE | Provider MID/actor/epoch/Owner source required; HOLD only | Provider remote-delete semantics vs local delete; actual receipt |
| MEDIA_ACTION | W23 media proof missing: fail closed, no media bytes | Original W23/Provider per-type capability and crypto custody |
| LOCAL_DELETE | NOT a remote operation; W25 explicitly rejects | Real Conversation DB Owner local hide/soft-delete audit GET/POST/GET |
| LOCAL_FAVORITE | W25 matrix marks Conversation DB owner | Real Conversation DB persisted favorite and CAS readback |

Private server-injected original W24 strict proof requires current five-part K, ChannelAccount, Actor, Session, accountEpoch/consentEpoch, expiry and binding revision. W44 scope proof requires identical identity/epoch, custodyEpoch, Grant revision, human permission or Agent active AUTO permission, and expiry. Forward needs separately authorized recipient K. Native Provider capability must be independently signed/owned; untrusted HTTP/body booleans cannot constitute proof. The guard stores only hashes of action payload, a unique operation key and HELD_FOR_PROVIDER_OWNER inside existing SQLite. It does not expose any HTTP endpoint, native SDK callback, transport, original W25 SendIntent, ACK or auto-retry.

## Final irreversible and Provider reconciliation HOLD
Future integration must be within the original W25 sender: independently current W24/W44 proofs again at PRE_NETWORK; atomic ARM with Agent stop and identity rebinding, single physical attempt/peer lock, durable attempt before SDK call, verified Provider action+source MID+target MID+ACK, late ACK reconstruction, UNKNOWN no retry/refund without proof. Current implementation deliberately rejects dispatch() and recordProviderReceipt(). HTTP200 or returned SDK DTO is not Provider-delivered proof.

## Validation and handoff
New source + test committed in W25-only draft PR #147 from base W25 3eef9fa. Actual submitted source core exercised with isolated V8 mock SQL and fake hash, 13/13 logic checks PASS (quote MID, reaction hold, duplicate ID conflict, edit direction, target forwarding, W24 revocation, Agent stop, absent Provider capability, no sender/ACK). This is NOT an execution of the committed Node test suite and NOT actual SQLite/Windows/provider UAT. The 56/56 historical W25 Windows test result was for parent SHA, not this PR. Remote Desktop Commander reported monthly usage exhausted and forbade retries/reconnection; exact remote SHA, Windows test and independent SEC signature on new branch remain HOLD.
No channel Owner source, runtime, UI, 44751, user's social credentials, actual external send or model cost modified. Issue #146 stays OPEN / DESIGN_ACCEPTANCE_RED. W09 reviews the draft, W24/W44 and 4 Provider Owners sign their respective scopes, W47/W09-3 own actual HTTP/UI. No independent deployment.
