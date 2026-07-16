"""The transparent 100-point opportunity score.

Every component returns its points AND the reasons, so the acquisitions team
can always see why a property scored what it scored. Weights and penalties live
in config/scoring.yaml.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .comp_analyzer import CompAnalysis
from .deal_calculator import DealResult
from .distress_analyzer import DistressResult
from .normalize import Listing


@dataclass
class ScoreComponent:
    name: str
    points: float
    max_points: float
    reasons: list[str] = field(default_factory=list)


@dataclass
class ScoreResult:
    total: float
    components: list[ScoreComponent] = field(default_factory=list)
    risk_penalty: float = 0.0
    risk_reasons: list[str] = field(default_factory=list)
    band_label: str = ""
    action: str = ""
    confidence: float = 0.0

    def breakdown(self) -> dict:
        return {
            "total": self.total,
            "components": {c.name: {"points": c.points, "max": c.max_points, "reasons": c.reasons}
                           for c in self.components},
            "risk_penalty": self.risk_penalty,
            "risk_reasons": self.risk_reasons,
            "band": self.band_label,
            "action": self.action,
        }


def _financial(deal: Optional[DealResult], listing: Listing, comps: CompAnalysis,
               cfg: dict, max_pts: float) -> ScoreComponent:
    c = ScoreComponent("financial_spread", 0.0, max_pts)
    if deal is None:
        c.reasons.append("no ARV available — cannot underwrite; 0 points")
        return c
    fin = cfg["financial"]

    # Net profit: 60% of the component
    span = fin["full_points_net_profit"] - fin["min_viable_net_profit"]
    profit_frac = max(0.0, min((deal.net_profit - fin["min_viable_net_profit"]) / span, 1.0))
    profit_pts = profit_frac * max_pts * 0.60
    c.reasons.append(f"projected net profit ${deal.net_profit:,.0f} → {profit_pts:.1f} pts")

    # ROI on total cost: 25%
    roi_frac = max(0.0, min(deal.roi_on_total_cost / fin["full_points_roi"], 1.0))
    roi_pts = roi_frac * max_pts * 0.25
    c.reasons.append(f"return on total cost {deal.roi_on_total_cost:.1%} → {roi_pts:.1f} pts")

    # PPSF anomaly: 15%
    anomaly_pts = 0.0
    if listing.ppsf and comps.renovated_ppsf_values:
        reno_median = sorted(comps.renovated_ppsf_values)[len(comps.renovated_ppsf_values) // 2]
        discount = 1 - listing.ppsf / reno_median
        if discount >= fin["ppsf_renovated_discount_flag"]:
            anomaly_pts = max_pts * 0.15
            c.reasons.append(
                f"listing ${listing.ppsf:,.0f}/sqft is {discount:.0%} below renovated comp "
                f"${reno_median:,.0f}/sqft (≥{fin['ppsf_renovated_discount_flag']:.0%} flag) → {anomaly_pts:.1f} pts")
        elif comps.neighborhood_median_ppsf and \
                (1 - listing.ppsf / comps.neighborhood_median_ppsf) >= fin["ppsf_discount_flag"]:
            anomaly_pts = max_pts * 0.075
            c.reasons.append(f"listing PPSF ≥{fin['ppsf_discount_flag']:.0%} below neighborhood median → {anomaly_pts:.1f} pts")
        else:
            c.reasons.append("no significant PPSF discount vs comps")
    c.points = round(profit_pts + roi_pts + anomaly_pts, 1)
    return c


def _distress(distress: DistressResult, max_pts: float) -> ScoreComponent:
    pts = round(distress.score * max_pts, 1)
    reasons = [f"distress score {distress.score:.2f} (raw weight {distress.raw_weight})"]
    reasons += distress.evidence[:5]
    return ScoreComponent("distress_motivation", pts, max_pts, reasons)


def _fundamentals(listing: Listing, max_pts: float) -> ScoreComponent:
    c = ScoreComponent("property_fundamentals", 0.0, max_pts)
    checks: list[tuple[bool, float, str]] = [
        (listing.property_type == "single_family", 0.20, "single-family"),
        (listing.stories == 1, 0.15, "single story"),
        (listing.beds is not None and 3 <= listing.beds <= 5, 0.15, "3–5 bedrooms"),
        (listing.sqft is not None and listing.sqft >= 1100, 0.15, "≥1,100 sqft"),
        (bool(listing.garage), 0.10, "garage"),
        (bool(listing.corner_lot) or (listing.lot_sqft or 0) >= 5000, 0.15, "corner or ≥5,000 sqft lot"),
        (not listing.hoa_fee, 0.10, "no HOA"),
    ]
    frac = 0.0
    for ok, weight, label in checks:
        if ok:
            frac += weight
            c.reasons.append(f"+ {label}")
        else:
            c.reasons.append(f"- missing: {label}")
    c.points = round(frac * max_pts, 1)
    return c


def _comp_confidence(comps: CompAnalysis, max_pts: float) -> ScoreComponent:
    pts = round(comps.confidence * max_pts, 1)
    reasons = [
        f"{len(comps.selected)} comps selected, "
        f"{len(comps.renovated_ppsf_values)} renovated, "
        f"{len(comps.unrenovated_ppsf_values)} unrenovated",
        f"comp confidence {comps.confidence:.2f}",
    ] + comps.notes
    return ScoreComponent("comp_confidence", pts, max_pts, reasons)


def _liquidity(listing: Listing, max_pts: float) -> ScoreComponent:
    c = ScoreComponent("market_liquidity", 0.0, max_pts)
    if listing.days_on_market is None:
        c.points = round(max_pts * 0.5, 1)
        c.reasons.append("days on market unknown — neutral 50%")
        return c
    dom = listing.days_on_market
    if dom <= 14:
        frac, note = 1.0, "fresh listing (≤14 DOM) in a liquid market"
    elif dom <= 30:
        frac, note = 0.8, "≤30 DOM"
    elif dom <= 60:
        frac, note = 0.6, "31–60 DOM — some staleness, possible negotiability"
    elif dom <= 120:
        frac, note = 0.4, "61–120 DOM — aging; check for price reductions"
    else:
        frac, note = 0.2, ">120 DOM — market has voted; investigate why"
    c.points = round(frac * max_pts, 1)
    c.reasons.append(f"{dom} days on market: {note}")
    return c


def _base_confidence(listing: Listing, comps: CompAnalysis, max_pts: float) -> ScoreComponent:
    c = ScoreComponent("base_confidence", max_pts, max_pts)
    missing = [f for f in ("beds", "baths", "sqft", "lot_sqft", "year_built", "stories")
               if getattr(listing, f) is None]
    inconsistencies = listing.record_inconsistencies()
    frac = 1.0 - 0.12 * len(missing) - 0.20 * len(inconsistencies)
    c.points = round(max(0.0, frac) * max_pts, 1)
    if missing:
        c.reasons.append(f"missing fields: {', '.join(missing)}")
    c.reasons += inconsistencies
    if not c.reasons:
        c.reasons.append("all key fields present and consistent")
    return c


def _risk_penalty(listing: Listing, distress: DistressResult, comps: CompAnalysis,
                  cfg: dict) -> tuple[float, list[str]]:
    penalties = cfg["risk_penalties"]
    total = 0.0
    reasons: list[str] = []
    for flag in distress.flagged:
        if flag in penalties:
            total += penalties[flag]
            reasons.append(f"{flag.replace('_', ' ')} (-{penalties[flag]})")
    if comps.confidence < 0.4:
        total += penalties["low_comp_confidence"]
        reasons.append(f"low comp confidence {comps.confidence:.2f} (-{penalties['low_comp_confidence']})")
    for issue in listing.record_inconsistencies():
        total += penalties["inconsistent_records"]
        reasons.append(f"inconsistent records: {issue} (-{penalties['inconsistent_records']})")
    if reasons:
        total = max(total, cfg["min_risk_penalty_when_any"])
    total = min(total, cfg["max_total_risk_penalty"])
    return round(total, 1), reasons


def score(listing: Listing, distress: DistressResult, comps: CompAnalysis,
          deal: Optional[DealResult], cfg: dict) -> ScoreResult:
    w = cfg["weights"]
    components = [
        _financial(deal, listing, comps, cfg, w["financial_spread"]),
        _distress(distress, w["distress_motivation"]),
        _fundamentals(listing, w["property_fundamentals"]),
        _comp_confidence(comps, w["comp_confidence"]),
        _liquidity(listing, w["market_liquidity"]),
        _base_confidence(listing, comps, w["base_confidence"]),
    ]
    penalty, risk_reasons = _risk_penalty(listing, distress, comps, cfg)
    total = max(0.0, min(100.0, round(sum(c.points for c in components) - penalty, 1)))

    band_label, action = "reject", "Reject"
    for band in cfg["score_bands"]:
        if total >= band["min"]:
            band_label, action = band["label"], band["action"]
            break

    confidence = round(0.6 * comps.confidence
                       + 0.4 * (components[-1].points / components[-1].max_points), 2)

    return ScoreResult(total=total, components=components, risk_penalty=penalty,
                       risk_reasons=risk_reasons, band_label=band_label,
                       action=action, confidence=confidence)
