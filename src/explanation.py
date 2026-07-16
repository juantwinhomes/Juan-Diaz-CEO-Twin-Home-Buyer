"""One-page underwriting summaries for the acquisitions team."""
from __future__ import annotations

from typing import Optional

from .comp_analyzer import CompAnalysis
from .deal_calculator import DealResult
from .distress_analyzer import DistressResult
from .normalize import Listing
from .repair_estimator import RepairEstimate
from .scorer import ScoreResult


def _money(v: Optional[float]) -> str:
    return f"${v:,.0f}" if v is not None else "unknown"


def top_risks(listing: Listing, distress: DistressResult, comps: CompAnalysis,
              score: ScoreResult, n: int = 3) -> list[str]:
    risks = list(score.risk_reasons)
    risks += [f"data inconsistency: {i}" for i in listing.record_inconsistencies()
              if not any(i in r for r in risks)]
    if comps.confidence < 0.5 and not any("comp confidence" in r for r in risks):
        risks.append(f"comp confidence only {comps.confidence:.2f}")
    if not risks:
        risks.append("no material risks evidenced in listing data — verify with walkthrough")
    return risks[:n]


def summary_markdown(listing: Listing, distress: DistressResult, comps: CompAnalysis,
                     repairs: Optional[RepairEstimate], deal: Optional[DealResult],
                     score: ScoreResult) -> str:
    lines = [
        f"# {listing.address}, {listing.city}, {listing.state} {listing.zip_code}",
        "",
        f"**Score: {score.total:.0f}/100 — {score.action}**  |  confidence {score.confidence:.2f}",
        "",
        f"- Status: {listing.status}  |  {listing.days_on_market if listing.days_on_market is not None else '?'} days on market",
        f"- Asking: {_money(listing.listing_price)}"
        + (f"  ({_money(listing.ppsf)}/sqft)" if listing.ppsf else ""),
        f"- {listing.beds or '?'} bd / {listing.baths or '?'} ba / {listing.sqft or '?'} sqft"
        f" / lot {listing.lot_sqft or '?'} sqft / built {listing.year_built or '?'}"
        f" / {listing.stories or '?'} story",
        "",
        "## The deal",
    ]
    if deal:
        lines += [
            f"| | |",
            f"|---|---|",
            f"| Estimated ARV | {_money(deal.arv)} |",
            f"| Expected purchase price | {_money(deal.expected_purchase_price)}"
            + (" *(assumed = listing price)* |" if deal.purchase_price_is_assumed else " |"),
            f"| Repairs ({repairs.scope if repairs else '?'}) | {_money(deal.repairs)}"
            + (f" (range {_money(repairs.low)}–{_money(repairs.high)}) |" if repairs else " |"),
            f"| Contingency | {_money(deal.contingency)} |",
            f"| Holding costs | {_money(deal.holding_costs)} |",
            f"| Financing costs | {_money(deal.financing_costs)} |",
            f"| Closing + commissions | {_money(deal.buyer_closing + deal.seller_closing + deal.commissions)} |",
            f"| **Projected net profit** | **{_money(deal.net_profit)}** |",
            f"| **Return on total cost** | **{deal.roi_on_total_cost:.1%}** |",
            f"| **Maximum allowable offer** | **{_money(deal.mao)}** |",
        ]
        if comps.arv_range:
            lines.append(f"\nARV range from renovated comps: {_money(comps.arv_range[0])}–{_money(comps.arv_range[1])}")
        if comps.present_value_estimate:
            lines.append(f"Present-condition value (unrenovated comps): {_money(comps.present_value_estimate)}")
    else:
        lines.append("Could not underwrite — no usable ARV (insufficient comps or missing sqft).")

    lines += ["", "## Why it may be mispriced"]
    if listing.ppsf and comps.renovated_ppsf_values:
        reno_lo, reno_hi = min(comps.renovated_ppsf_values), max(comps.renovated_ppsf_values)
        lines.append(f"- Listing at {_money(listing.ppsf)}/sqft vs renovated comps at "
                     f"{_money(reno_lo)}–{_money(reno_hi)}/sqft")
    for note in comps.notes:
        lines.append(f"- {note}")

    lines += ["", "## Distress / motivation evidence"]
    lines += [f"- {e}" for e in distress.evidence] or ["- none found"]

    lines += ["", "## Comparables"]
    for ev in comps.evaluations:
        tag = ("RENOVATED" if ev.renovated is True
               else "unrenovated" if ev.renovated is False else "condition unknown")
        lines.append(f"- {ev.comp.address}: {_money(ev.comp.sale_price)} "
                     f"({_money(ev.comp.ppsf)}/sqft, {ev.comp.sale_date}, {tag}) — {ev.reason}")

    lines += ["", "## Top risks"]
    lines += [f"- {r}" for r in top_risks(listing, distress, comps, score)]

    lines += ["", "## Score breakdown"]
    for c in score.components:
        lines.append(f"- **{c.name}**: {c.points}/{c.max_points}")
        lines += [f"  - {r}" for r in c.reasons]
    if score.risk_penalty:
        lines.append(f"- **risk penalty**: -{score.risk_penalty} ({'; '.join(score.risk_reasons)})")

    if deal:
        lines += ["", "## Assumptions"]
        lines += [f"- {a}" for a in deal.assumptions]
        if repairs:
            lines += [f"- {a}" for a in repairs.assumptions]

    lines += ["", f"*Source: {listing.source}, retrieved {listing.retrieved_at}*", ""]
    return "\n".join(lines)
