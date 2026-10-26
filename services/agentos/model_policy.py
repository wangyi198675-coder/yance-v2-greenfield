"""W43 policy gate: ONLY local synthetic AI can run without additional grants.

It describes provider eligibility; does not mint SIWC tokens, OAuth flows,
paid API credentials, or any alternate agent execution engine.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Mapping

_ALLOWED_PURPOSES = frozenset({"HEALTHCHECK", "QUALITY_EVAL"})
_VALID_PROVIDERS = frozenset({"LOCAL_QWEN3_8B", "LOCAL_QWEN25_15B", "CHATGPT_PLAN_SIWC", "OTHER_EXPLICIT"})


class ModelPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class ProviderDecision:
    provider: str
    status: str
    allow_call: bool
    billing: str
    purpose: str
    reason: str

    def as_dict(self) -> dict:
        return dict(provider=self.provider, status=self.status,
                    allow_call=self.allow_call, billing=self.billing,
                    purpose=self.purpose, reason=self.reason)


def classify_provider(
    provider: str,
    purpose: str,
    *,
    local_model_verified: bool = False,
    user_explicitly_selected: bool = False,
    siwc: Mapping[str, Any] | None = None,
    extra_charge_approved: bool = False,
) -> ProviderDecision:
    """Fail closed: no subscription login, mock PASS or API key implies eligibility."""
    if provider not in _VALID_PROVIDERS or purpose not in _ALLOWED_PURPOSES:
        raise ModelPolicyError("INVALID_PROVIDER_OR_PURPOSE")
    if provider == "LOCAL_QWEN25_15B":
        if purpose != "HEALTHCHECK":
            return ProviderDecision(provider, "HEALTH_ONLY_NOT_QUALITY", False, "FREE_LOCAL", purpose, "SMALL_MODEL_NOT_QUALITY_GATE")
        return ProviderDecision(provider, "READY" if local_model_verified else "LOCAL_NOT_VERIFIED",
                                bool(local_model_verified), "FREE_LOCAL", purpose, "HEALTHCHECK_ONLY")
    if provider == "LOCAL_QWEN3_8B":
        return ProviderDecision(provider, "READY" if local_model_verified else "QWEN3_NOT_VERIFIED",
                                bool(local_model_verified), "FREE_LOCAL", purpose, "REQUIRES_REAL_INFERENCE_EVIDENCE")
    if provider == "CHATGPT_PLAN_SIWC":
        eligible = bool(
            siwc
            and siwc.get("participating_app_verified") is True
            and siwc.get("current_user_approved_plan_sharing") is True
            and siwc.get("scope_allows_requested_model_and_feature") is True
            and siwc.get("nonexpired_grant_attested") is True
            and siwc.get("allowance_available_verified") is True
            and siwc.get("v2_native_grant_verified") is True
            and siwc.get("runtime_receipt_verified") is True
        )
        # Never infer quota from Plus/Pro badge, token contents or the historical DA424 receipt.
        # Read-only preflight data can never be a trusted permission source.
        # Only the future W24/W44 native authorization runtime may issue one.
        return ProviderDecision(provider,
                                "PREFLIGHT_FIELDS_PRESENT_NATIVE_GATE_REQUIRED" if eligible else "V2_SIWC_NOT_VERIFIED",
                                False, "CHATGPT_INCLUDED_ALLOWANCE_ONLY", purpose,
                                "W24_W44_NATIVE_GRANT_AND_RUNTIME_RECEIPT_REQUIRED")
    if not user_explicitly_selected:
        return ProviderDecision(provider, "NOT_EXPLICITLY_SELECTED", False, "COST_UNDETERMINED", purpose, "USER_CONSENT_REQUIRED")
    if not extra_charge_approved:
        return ProviderDecision(provider, "PAID_OR_UNKNOWN_CHARGE_NOT_APPROVED", False,
                                "COST_UNDETERMINED", purpose, "PAID_PROVIDER_NEVER_AUTO_ENABLED")
    return ProviderDecision(provider, "PROVIDER_NATIVE_GRANT_NOT_ATTESTED", False,
                            "USER_PAYMENT_APPROVED_BUT_RUNTIME_NOT_VERIFIED", purpose,
                            "ACCOUNT_SCOPE_AND_RUNTIME_RECEIPT_REQUIRED")


def choose_preferred_nonprod(*, qwen3_real_run_verified: bool) -> ProviderDecision:
    """No fallback from Qwen3 to Qwen2.5 quality or a paid cloud provider."""
    return classify_provider("LOCAL_QWEN3_8B", "QUALITY_EVAL", local_model_verified=qwen3_real_run_verified)


def v2_chatgpt_siwc_status() -> ProviderDecision:
    """No actual V2 grant or allowance attestation in W43/Issue #5 source."""
    return classify_provider("CHATGPT_PLAN_SIWC", "QUALITY_EVAL")
