"""
LLM provider layer — the pipeline doesn't care which brain answers.

Three backends behind one interface, selected via FLIP_SCOUT_PROVIDER
(or config.LLM_PROVIDER):

  anthropic  Claude API via the anthropic SDK (needs ANTHROPIC_API_KEY)
  xai        xAI Grok API, OpenAI-compatible chat completions with
             json_schema structured output (needs XAI_API_KEY)
  grok-cli   shells out to a local `grok` CLI (uses whatever auth the CLI
             already has — e.g. Juan's Grok subscription). Output is
             instructed to be JSON-only and validated the same way.

Every backend returns output validated against the same Pydantic model, so
the scoring contract is identical regardless of provider.
"""

import json
import os
import re
import subprocess
from typing import Type, TypeVar

import requests
from pydantic import BaseModel

from config import AGENT_MODEL, GROK_CLI_CMD, LLM_PROVIDER, XAI_MODEL

M = TypeVar("M", bound=BaseModel)

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> str:
    """First balanced-looking JSON object in a possibly chatty output."""
    m = _JSON_BLOCK.search(text)
    if not m:
        raise ValueError(f"no JSON object in output: {text[:300]!r}")
    return m.group(0)


# ---------------------------------------------------------------- anthropic
def _anthropic_structured(system: str, user: str, model_cls: Type[M]) -> M:
    import anthropic
    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=AGENT_MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=model_cls,
    )
    return response.parsed_output


def _anthropic_text(system: str, user: str) -> str:
    import anthropic
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=AGENT_MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return next(b.text for b in response.content if b.type == "text")


# ---------------------------------------------------------------------- xai
_XAI_URL = "https://api.x.ai/v1/chat/completions"


def _xai_call(system: str, user: str, response_format: dict | None) -> str:
    key = os.environ.get("XAI_API_KEY")
    if not key:
        raise RuntimeError("XAI_API_KEY not set (required for provider 'xai')")
    body = {
        "model": XAI_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if response_format:
        body["response_format"] = response_format
    resp = requests.post(
        _XAI_URL, timeout=180,
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"},
        json=body)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _xai_structured(system: str, user: str, model_cls: Type[M]) -> M:
    fmt = {
        "type": "json_schema",
        "json_schema": {
            "name": model_cls.__name__,
            "schema": model_cls.model_json_schema(),
            "strict": True,
        },
    }
    content = _xai_call(system, user, fmt)
    return model_cls.model_validate_json(_extract_json(content))


def _xai_text(system: str, user: str) -> str:
    return _xai_call(system, user, None)


# ----------------------------------------------------------------- grok-cli
def _grok_cli_call(prompt: str) -> str:
    cmd = GROK_CLI_CMD + [prompt]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(
            f"grok CLI failed ({result.returncode}): {result.stderr[:500]}")
    return result.stdout


def _grok_cli_structured(system: str, user: str, model_cls: Type[M]) -> M:
    schema = json.dumps(model_cls.model_json_schema())
    prompt = (
        f"{system}\n\n{user}\n\n"
        "Respond with ONLY a single JSON object (no markdown fences, no "
        f"commentary) that validates against this JSON schema:\n{schema}"
    )
    last_err = None
    for _ in range(2):  # one retry on malformed JSON
        out = _grok_cli_call(prompt)
        try:
            return model_cls.model_validate_json(_extract_json(out))
        except Exception as e:  # noqa: BLE001 — retry then surface
            last_err = e
    raise last_err


def _grok_cli_text(system: str, user: str) -> str:
    return _grok_cli_call(f"{system}\n\n{user}")


# ------------------------------------------------------------------- public
_BACKENDS = {
    "anthropic": (_anthropic_structured, _anthropic_text),
    "xai": (_xai_structured, _xai_text),
    "grok-cli": (_grok_cli_structured, _grok_cli_text),
}


def _backend():
    provider = os.environ.get("FLIP_SCOUT_PROVIDER", LLM_PROVIDER)
    if provider not in _BACKENDS:
        raise ValueError(
            f"unknown provider {provider!r}; choose from {list(_BACKENDS)}")
    return _BACKENDS[provider]


def structured(system: str, user: str, model_cls: Type[M]) -> M:
    return _backend()[0](system, user, model_cls)


def text(system: str, user: str) -> str:
    return _backend()[1](system, user)
