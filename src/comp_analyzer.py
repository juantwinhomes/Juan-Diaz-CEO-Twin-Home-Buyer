"""Comparable-sale selection, renovated/unrenovated split, and ARV estimation.

Rules (see CLAUDE.md):
- Prefer comps within 0.5 mi, sold within 180 days, within 20% of subject sqft.
- Accept up to 1.0 mi / 365 days / 35% sqft with a confidence haircut.
- Never blend renovated and unrenovated comps blindly; ARV comes from renovated
  comps, present-condition value from unrenovated comps.
- Every comp gets a selected/rejected reason.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional

from .normalize import Comp, Listing

PREF_DISTANCE_MI = 0.5
MAX_DISTANCE_MI = 1.0
PREF_RECENCY_DAYS = 180
MAX_RECENCY_DAYS = 365
PREF_SQFT_TOLERANCE = 0.20
MAX_SQFT_TOLERANCE = 0.35

RENOVATED_PATTERNS = re.compile(
    r"\b(remodel(ed|)|renovated|updated|upgraded|turnkey|turn-key|move-in ready|"
    r"designer|brand new (kitchen|baths?)|new (kitchen|baths?|roof and)|gorgeous|stunning)\b",
    re.IGNORECASE,
)
UNRENOVATED_PATTERNS = re.compile(
    r"\b(original|fixer|as-is|as is|needs work|tlc|contractor|dated|deferred maintenance|"
    r"opportunity|potential|estate sale|probate)\b",
    re.IGNORECASE,
)


@dataclass
class CompEvaluation:
    comp: Comp
    selected: bool
    strong: bool
    renovated: Optional[bool]
    reason: str


@dataclass
class CompAnalysis:
    evaluations: list[CompEvaluation] = field(default_factory=list)
    renovated_ppsf_values: list[float] = field(default_factory=list)
    unrenovated_ppsf_values: list[float] = field(default_factory=list)
    arv_estimate: Optional[float] = None
    arv_range: Optional[tuple[float, float]] = None
    present_value_estimate: Optional[float] = None
    neighborhood_median_ppsf: Optional[float] = None
    confidence: float = 0.0            # 0.0–1.0
    notes: list[str] = field(default_factory=list)

    @property
    def selected(self) -> list[CompEvaluation]:
        return [e for e in self.evaluations if e.selected]


def classify_renovated(comp: Comp) -> Optional[bool]:
    """Provider flag wins; otherwise infer from remarks; None if no evidence."""
    if comp.renovated is not None:
        return comp.renovated
    text = comp.remarks or ""
    reno = bool(RENOVATED_PATTERNS.search(text))
    unreno = bool(UNRENOVATED_PATTERNS.search(text))
    if reno and not unreno:
        return True
    if unreno and not reno:
        return False
    return None


def _days_since(sale_date: str, today: date) -> Optional[int]:
    try:
        return (today - datetime.fromisoformat(sale_date).date()).days
    except (ValueError, TypeError):
        return None


def evaluate_comp(comp: Comp, subject: Listing, today: date) -> CompEvaluation:
    renovated = classify_renovated(comp)
    reasons: list[str] = []
    strong = True

    if comp.property_type != subject.property_type:
        return CompEvaluation(comp, False, False, renovated,
                              f"rejected: property type {comp.property_type} differs from subject")
    if not comp.sqft or not comp.sale_price:
        return CompEvaluation(comp, False, False, renovated, "rejected: missing sqft or sale price")

    days = _days_since(comp.sale_date, today)
    if days is None:
        return CompEvaluation(comp, False, False, renovated, "rejected: unparseable sale date")
    if days > MAX_RECENCY_DAYS:
        return CompEvaluation(comp, False, False, renovated, f"rejected: sold {days} days ago (> {MAX_RECENCY_DAYS})")
    if days > PREF_RECENCY_DAYS:
        strong = False
        reasons.append(f"sold {days} days ago (older than preferred {PREF_RECENCY_DAYS})")

    if comp.distance_miles is not None:
        if comp.distance_miles > MAX_DISTANCE_MI:
            return CompEvaluation(comp, False, False, renovated,
                                  f"rejected: {comp.distance_miles:.2f} mi away (> {MAX_DISTANCE_MI})")
        if comp.distance_miles > PREF_DISTANCE_MI:
            strong = False
            reasons.append(f"{comp.distance_miles:.2f} mi away (beyond preferred {PREF_DISTANCE_MI})")
    else:
        strong = False
        reasons.append("distance unknown")

    if subject.sqft:
        diff = abs(comp.sqft - subject.sqft) / subject.sqft
        if diff > MAX_SQFT_TOLERANCE:
            return CompEvaluation(comp, False, False, renovated,
                                  f"rejected: sqft differs {diff:.0%} from subject (> {MAX_SQFT_TOLERANCE:.0%})")
        if diff > PREF_SQFT_TOLERANCE:
            strong = False
            reasons.append(f"sqft differs {diff:.0%} (beyond preferred {PREF_SQFT_TOLERANCE:.0%})")

    if subject.beds and comp.beds and abs(comp.beds - subject.beds) > 1:
        strong = False
        reasons.append(f"bed count {comp.beds} vs subject {subject.beds}")

    label = "strong" if strong else "usable"
    detail = "; ".join(reasons) if reasons else "within all preferred bounds"
    return CompEvaluation(comp, True, strong, renovated, f"selected ({label}): {detail}")


def analyze(subject: Listing, comps: list[Comp], today: Optional[date] = None) -> CompAnalysis:
    today = today or date.today()
    result = CompAnalysis()
    result.evaluations = [evaluate_comp(c, subject, today) for c in comps]

    selected = result.selected
    all_ppsf = [e.comp.ppsf for e in selected if e.comp.ppsf]
    if all_ppsf:
        result.neighborhood_median_ppsf = statistics.median(all_ppsf)

    for ev in selected:
        if not ev.comp.ppsf:
            continue
        if ev.renovated is True:
            result.renovated_ppsf_values.append(ev.comp.ppsf)
        elif ev.renovated is False:
            result.unrenovated_ppsf_values.append(ev.comp.ppsf)

    if subject.sqft and result.renovated_ppsf_values:
        vals = sorted(result.renovated_ppsf_values)
        median_ppsf = statistics.median(vals)
        # Conservative range: low end from the cheapest renovated comp,
        # midpoint from the median. Never anchor ARV to the single best comp.
        result.arv_estimate = round(median_ppsf * subject.sqft, -3)
        result.arv_range = (round(vals[0] * subject.sqft, -3),
                            round(vals[-1] * subject.sqft, -3))
    elif subject.sqft and result.neighborhood_median_ppsf:
        # Fallback: no renovated comps — mark low confidence, use blended median.
        result.arv_estimate = round(result.neighborhood_median_ppsf * subject.sqft, -3)
        result.notes.append("ARV based on blended comps — no renovated comps identified; low confidence")

    if subject.sqft and result.unrenovated_ppsf_values:
        result.present_value_estimate = round(
            statistics.median(result.unrenovated_ppsf_values) * subject.sqft, -3)

    result.confidence = _confidence(result, today)
    return result


def _confidence(analysis: CompAnalysis, today: date) -> float:
    """0–1 from comp count, strength, proximity/recency, renovated support."""
    selected = analysis.selected
    if not selected:
        return 0.0
    count_score = min(len(selected) / 6, 1.0) * 0.30
    strong = [e for e in selected if e.strong]
    strength_score = (len(strong) / len(selected)) * 0.30
    reno_count = len(analysis.renovated_ppsf_values)
    reno_score = min(reno_count / 3, 1.0) * 0.40
    return round(count_score + strength_score + reno_score, 3)
