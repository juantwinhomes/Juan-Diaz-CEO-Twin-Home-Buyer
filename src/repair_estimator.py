"""Estimate renovation scope and cost range from listing evidence.

Scope is chosen from distress language; costs come from config/renovation_costs.yaml
(update those figures from actual Twin Home Buyer job costs). Output is a range,
never a single false-precision number.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .distress_analyzer import DistressResult
from .normalize import Listing

SCOPE_ORDER = ["cosmetic", "moderate", "heavy", "gut"]

HEAVY_TRIGGERS = {"needs significant work", "major renovation", "contractor special",
                  "unfinished project", "diamond in the rough"}
GUT_TRIGGERS = {"uninhabitable", "down to the studs", "gut renovation", "fire damage",
                "condemned", "value is in the land"}


@dataclass
class RepairEstimate:
    scope: str
    low: float
    high: float
    point: float
    adders_applied: dict[str, float] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)


def choose_scope(distress: DistressResult, cfg: dict) -> tuple[str, list[str]]:
    assumptions = []
    evidence_text = " ".join(distress.evidence).lower()

    if any(t in evidence_text for t in GUT_TRIGGERS) or distress.flags.get("fire_damage"):
        scope = "gut"
    elif any(t in evidence_text for t in HEAVY_TRIGGERS) or distress.raw_weight >= 6:
        scope = "heavy"
    elif distress.raw_weight >= 3:
        scope = "moderate"
    elif distress.raw_weight >= 1:
        scope = "cosmetic"
    else:
        scope = "cosmetic"
        assumptions.append("no condition language found — cosmetic scope assumed; verify with photos/walkthrough")

    if distress.flags.get("no_interior_access"):
        min_scope = cfg.get("unknown_condition_min_scope", "heavy")
        if SCOPE_ORDER.index(scope) < SCOPE_ORDER.index(min_scope):
            scope = min_scope
            assumptions.append(f"no interior access — scope raised to at least '{min_scope}'")
    return scope, assumptions


def estimate(listing: Listing, distress: DistressResult, cfg: dict) -> Optional[RepairEstimate]:
    if not listing.sqft:
        return None

    scope, assumptions = choose_scope(distress, cfg)
    per_sqft = cfg["per_sqft"][scope]
    base = per_sqft * listing.sqft

    # distress flag -> cost adder key in renovation_costs.yaml
    flag_to_adder = {
        "foundation": "foundation",
        "fire_damage": "fire_damage",
        "roof": "roof",
        "sewer": "sewer_lateral",
        "water_damage": "water_damage",
        "unpermitted": "unpermitted_legalization",
    }
    adders: dict[str, float] = {}
    adder_cfg = cfg.get("adders", {})
    for flag, adder_key in flag_to_adder.items():
        if distress.flags.get(flag) and adder_key in adder_cfg:
            adders[adder_key] = adder_cfg[adder_key]

    point = base + sum(adders.values())
    band = cfg.get("range_pct", 0.20)
    assumptions.append(f"scope '{scope}' at ${per_sqft}/sqft × {listing.sqft:.0f} sqft")

    return RepairEstimate(
        scope=scope,
        low=round(point * (1 - band), -3),
        high=round(point * (1 + band), -3),
        point=round(point, -3),
        adders_applied=adders,
        assumptions=assumptions,
    )
