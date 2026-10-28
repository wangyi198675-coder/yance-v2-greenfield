"""Official Agno Model boundary for an existing ChatGPT SIWC text session.

The callback is supplied by the existing trusted SDK owner, never by the
browser or model-selection request. Agno remains responsible for original
Agent, Run, Session and persistent ChatHistory.
"""
from __future__ import annotations

import asyncio
from typing import Callable
from agno.models.base import Model
from agno.models.response import ModelResponse


class ChatGPTSiwcModel(Model):
    def __init__(self, *, model_id: str, invoke_official: Callable):
        if not isinstance(model_id, str) or not model_id:
            raise ValueError("SIWC_MODEL_ID_REQUIRED")
        if not callable(invoke_official):
            raise ValueError("SIWC_TRUSTED_SDK_CALLBACK_REQUIRED")
        super().__init__(id=model_id, name="ChatGPT", provider="ChatGPT",
                         supports_native_structured_outputs=False)
        self._invoke_official = invoke_official

    @staticmethod
    def _messages(messages):
        values = []
        for message in messages:
            role = getattr(message, "role", None)
            role = getattr(role, "value", role)
            if isinstance(role, str):
                role = role.lower()
            # Agno's authoritative stored Run history can contain completed
            # tool-result messages from a previously selected local model.
            # The official SIWC text API cannot execute tools. Omit historical
            # tool frames rather than upgrading their contents to developer
            # instructions or pretending a tool was executed by ChatGPT.
            if role in {"tool", "function"}:
                continue
            content = getattr(message, "content", None)
            if role == "system":
                role = "developer"
            if role not in {"developer", "assistant", "user"}:
                raise ValueError("SIWC_MESSAGE_ROLE_UNSUPPORTED")
            if not isinstance(content, str):
                raise ValueError("SIWC_TEXT_ONLY_UNSUPPORTED")
            if content.strip():
                values.append({"role": role, "content": content})
        if not values or not any(item["role"] == "user" for item in values):
            raise ValueError("SIWC_USER_MESSAGE_REQUIRED")
        return values

    def _parse_provider_response(self, response, **kwargs):
        if not isinstance(response, str) or not response.strip():
            raise ValueError("SIWC_EMPTY_PROVIDER_RESULT")
        return ModelResponse(role="assistant", content=response)

    def _parse_provider_response_delta(self, response, **kwargs):
        return self._parse_provider_response(response)

    def invoke(self, messages, assistant_message=None, **kwargs):
        if kwargs.get("response_format") is not None:
            raise ValueError("SIWC_STRUCTURED_OUTPUT_NOT_SUPPORTED")
        if kwargs.get("tools") or kwargs.get("tool_choice") not in (None, "none"):
            raise ValueError("SIWC_NATIVE_TOOL_CALLS_NOT_SUPPORTED")
        answer = self._invoke_official(model_id=self.id, messages=self._messages(messages))
        return self._parse_provider_response(answer)

    def invoke_stream(self, messages, assistant_message=None, **kwargs):
        yield self.invoke(messages, assistant_message, **kwargs)

    async def ainvoke(self, messages, assistant_message=None, **kwargs):
        return await asyncio.to_thread(self.invoke, messages, assistant_message, **kwargs)

    async def ainvoke_stream(self, messages, assistant_message=None, **kwargs):
        yield await self.ainvoke(messages, assistant_message, **kwargs)
