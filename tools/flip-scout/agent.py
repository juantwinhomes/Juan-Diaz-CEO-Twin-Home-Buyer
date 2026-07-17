"""
Claude agent layer — the judgment the math can't do.

The pipeline hands the agent a candidate with fixed numbers (comps, tiered
underwriting, guardrail flags). The agent reads the listing remarks and
context, picks the rehab tier, judges ADU potential and risks, scores 1-10,
and writes the email-ready summary. It cannot change the math — it chooses
between pre-computed tiers.
"""

import json
from typing import List, Literal

import anthropic
from pydantic import BaseModel, Field

from config import AGENT_MODEL

client = anthropic.Anthropic()


class LeadVerdict(BaseModel):
    score: float = Field(description="1-10. 8+ means Juan should see it today.")
    verdict: Literal["PURSUE", "WATCH", "PASS"]
    rehab_tier: Literal["light", "medium", "heavy"] = Field(
        description="Chosen from the pre-computed tiers based on remarks/condition.")
    condition_read: str = Field(
        description="One-line read of property condition from the remarks.")
    adu_potential: str = Field(
        description="ADU / garage-conversion upside given lot size, garage "
                    "mentions, and jurisdiction. Be concrete or say 'none evident'.")
    key_risks: List[str] = Field(
        description="Concrete risks: seismic/foundation, permits, tenants, "
                    "probate, thin comps, etc. Max 4.")
    recommended_next_step: str = Field(
        description="One concrete action, e.g. 'drive by + call listing agent "
                    "about offer timeline', 'order title check'.")
    email_summary: str = Field(
        description="3-5 sentence professional summary for the deal email: "
                    "address, price vs comp value, chosen-tier profit math, "
                    "the angle, the risk. Numbers-driven, no hype.")


SYSTEM = """You are the deal analyst for Twin Home Buyer, working directly for
Juan Diaz. Juan is a conservative, numbers-driven Bay Area flipper. His rules,
learned from ~160 historical deals, are hard constraints, not suggestions:

- Never buy past 85% of value. Sub-$1M with a fat comp discount is the
  repeatable play; every historical loss was a high-price buy + heavy rehab.
- Rehab above ~30% of purchase price killed every losing deal. If only the
  heavy tier fits the property's condition and it's red-flagged, the deal is
  a PASS no matter how good the discount looks.
- The deal signal is price vs 1-mile sold comps. Ugly is an explanation for a
  discount, not a requirement — a clean house listed 20% under comps is a deal.
- Target 20-30% net spread after rehab, holding, and fees on a 4-6 month turn.

You are given fixed comps and fixed per-tier underwriting numbers. You choose
the rehab tier that matches the property's condition (from the remarks) and
judge everything the math can't: condition, ADU upside, risk, and whether the
discount is real or the comps are misleading (e.g. subject is on a busy road,
comps are a different micro-market, remarks reveal a fatal problem like
foundation/unwarranted units/tenant issues).

Score 8+ ONLY when: the chosen tier passes the spread floor without a rehab
red flag, the comps look genuinely applicable, and there is no unpriced fatal
risk. When remarks are missing, cap the score at 7 and say condition is
unverified. Be skeptical — a false PURSUE costs Juan real money."""


def analyze_lead(candidate: dict) -> LeadVerdict:
    """One structured Claude call per candidate."""
    payload = json.dumps(candidate, indent=2, default=str)
    response = client.messages.parse(
        model=AGENT_MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": (
                "Analyze this candidate lead. All numbers below are "
                "pre-computed and authoritative.\n\n" + payload
            ),
        }],
        output_format=LeadVerdict,
    )
    return response.parsed_output


def write_performance_report(scan_stats: dict, surfaced: list[dict]) -> str:
    """One Claude call to write the closing performance section of the email."""
    response = client.messages.create(
        model=AGENT_MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": (
                "Write the short performance-report section that closes Juan's "
                "daily flip-scout email: 3-6 sentences. Cover lead counts and "
                "funnel, the strongest lead if any, notable market signals "
                "(price drops, thin inventory), and one concrete suggested "
                "improvement to the scan. Plain prose, no headers.\n\n"
                f"Scan stats: {json.dumps(scan_stats, default=str)}\n\n"
                f"Surfaced leads: {json.dumps(surfaced, default=str)}"
            ),
        }],
    )
    return next(b.text for b in response.content if b.type == "text")
