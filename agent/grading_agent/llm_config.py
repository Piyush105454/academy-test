"""One place that decides which LLM the grader talks to.

Why this exists
---------------
The agent (OpenAI Agents SDK) and the image reader (plain OpenAI client) used to
each hard-code a model name and read whatever OPENAI_* variables happened to be
set. That made it easy for the two to point at different providers, and for a
model name with a "/" in it (``google/gemini-...``) to be misread by the SDK as
a provider prefix ("Unknown prefix: google").

Now both go through the functions below.

Environment variables
---------------------
GEMINI_API_KEY   Your key from https://aistudio.google.com/api-keys
                 (LLM_API_KEY is accepted instead, for any other provider.)
GRADING_MODEL    Model for the agent. Plain name, no "google/" prefix.
VISION_MODEL     Model that reads the handwritten note. Defaults to GRADING_MODEL.
LLM_BASE_URL     Optional. Defaults to Gemini's OpenAI-compatible endpoint.

OPENAI_API_KEY / OPENAI_BASE_URL are deliberately NOT read here, so an old
OpenRouter key left in the environment cannot be sent to the wrong provider.
"""
from __future__ import annotations

import os

GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_MODEL = "gemini-2.5-flash"

# The SDK's own retry handles 429 / 5xx with backoff. Free tiers hit 429 often.
_MAX_RETRIES = 4
_TIMEOUT_SECONDS = 90


def model_name() -> str:
    return os.environ.get("GRADING_MODEL") or DEFAULT_MODEL


def vision_model_name() -> str:
    return os.environ.get("VISION_MODEL") or model_name()


def _api_key() -> str:
    key = os.environ.get("LLM_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError(
            "No LLM API key set. Create one at https://aistudio.google.com/api-keys "
            "and set GEMINI_API_KEY.")
    return key


def _base_url() -> str:
    return os.environ.get("LLM_BASE_URL") or GEMINI_OPENAI_BASE_URL


def describe() -> dict:
    """Non-secret summary, safe to show on a health endpoint."""
    return {
        "base_url": _base_url(),
        "agent_model": model_name(),
        "vision_model": vision_model_name(),
        "api_key_set": bool(os.environ.get("LLM_API_KEY") or os.environ.get("GEMINI_API_KEY")),
    }


def get_sync_client():
    """Blocking client, for the image-reading helper."""
    from openai import OpenAI
    return OpenAI(api_key=_api_key(), base_url=_base_url(),
                  max_retries=_MAX_RETRIES, timeout=_TIMEOUT_SECONDS)


def get_agent_model():
    """A model object for ``Agent(model=...)``.

    Passing an object (not a string) skips the SDK's "provider/model" parsing,
    and pins the agent to this exact client. It is built fresh for each call on
    purpose: ``asyncio.run`` makes a new event loop per request, and an async
    HTTP client created in an earlier loop fails with "Event loop is closed".
    """
    from agents import OpenAIChatCompletionsModel, set_tracing_disabled
    from openai import AsyncOpenAI

    # Otherwise the SDK tries to upload traces to OpenAI using this key.
    set_tracing_disabled(True)
    client = AsyncOpenAI(api_key=_api_key(), base_url=_base_url(),
                         max_retries=_MAX_RETRIES, timeout=_TIMEOUT_SECONDS)
    return OpenAIChatCompletionsModel(model=model_name(), openai_client=client)
