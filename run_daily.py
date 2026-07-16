#!/usr/bin/env python3
"""Twin Deal Hunter — daily acquisition pipeline.

    python3 run_daily.py --demo            # full pipeline on built-in sample data
    python3 run_daily.py                   # live run against RentCast (needs .env)
    python3 run_daily.py --city "San Mateo" --min-score 60

Outputs:
    reports/daily_opportunities.csv    every scored property, ranked
    reports/rejected_properties.csv    hard-filtered and sub-60 properties, with reasons
    reports/summaries/<address>.md     one-page underwriting summary per property >= 60
    reports/crm_export.csv             properties >= crm_export_min_score (default 80)
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

from src import comp_analyzer, crm_export, deal_calculator, distress_analyzer
from src import explanation, repair_estimator, scorer
from src.normalize import Comp, Listing

ROOT = Path(__file__).parent
REPORTS = ROOT / "reports"


def load_env(path: Path) -> None:
    """Minimal .env loader (no external dependency)."""
    import os
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def load_configs() -> dict:
    cfg = {}
    for name in ("markets", "scoring", "renovation_costs", "acquisition_rules"):
        cfg[name] = yaml.safe_load((ROOT / "config" / f"{name}.yaml").read_text())
    return cfg


def hard_filter(listing: Listing, markets_cfg: dict) -> str | None:
    """Return a rejection reason, or None if the listing passes."""
    f = markets_cfg["hard_filters"]
    if listing.property_type not in f["property_types"]:
        return f"property type {listing.property_type} not targeted"
    if listing.sqft and listing.sqft < f["min_sqft"]:
        return f"{listing.sqft:.0f} sqft below minimum {f['min_sqft']}"
    if listing.beds and not (f["min_beds"] <= listing.beds <= f["max_beds"]):
        return f"{listing.beds} beds outside {f['min_beds']}–{f['max_beds']}"
    if not (f["min_listing_price"] <= listing.listing_price <= f["max_listing_price"]):
        return f"price ${listing.listing_price:,.0f} outside budget window"
    if f.get("exclude_hoa") and listing.hoa_fee and listing.hoa_fee > 100:
        return f"HOA fee ${listing.hoa_fee:,.0f}/mo"
    remarks = (listing.remarks or "").lower()
    for phrase in markets_cfg["retail_ready_phrases"]:
        if phrase in remarks:
            return f'retail-ready: remarks contain "{phrase}"'
    return None


def analyze_listing(listing: Listing, comps_raw: list[Comp], cfg: dict, today: date) -> dict:
    distress = distress_analyzer.analyze(listing.remarks)
    comps = comp_analyzer.analyze(listing, comps_raw, today=today)
    repairs = repair_estimator.estimate(listing, distress, cfg["renovation_costs"])

    deal = None
    if comps.arv_estimate and repairs:
        deal = deal_calculator.calculate(
            arv=comps.arv_estimate,
            listing_price=listing.listing_price,
            repairs_point=repairs.point,
            cfg=cfg["acquisition_rules"],
        )

    result = scorer.score(listing, distress, comps, deal, cfg["scoring"])
    return {"listing": listing, "distress": distress, "comps": comps,
            "repairs": repairs, "deal": deal, "score": result}


def to_row(a: dict) -> dict:
    listing, deal, repairs, score = a["listing"], a["deal"], a["repairs"], a["score"]
    comps, distress = a["comps"], a["distress"]
    return {
        "address": listing.address, "city": listing.city, "state": listing.state,
        "zip": listing.zip_code, "status": listing.status,
        "asking_price": listing.listing_price,
        "expected_purchase_price": deal.expected_purchase_price if deal else "",
        "estimated_arv": deal.arv if deal else "",
        "repair_low": repairs.low if repairs else "",
        "repair_high": repairs.high if repairs else "",
        "projected_net_profit": deal.net_profit if deal else "",
        "roi_on_total_cost": deal.roi_on_total_cost if deal else "",
        "mao": deal.mao if deal else "",
        "opportunity_score": score.total,
        "confidence": score.confidence,
        "action": score.action,
        "top_risks": " | ".join(explanation.top_risks(listing, distress, comps, score)),
        "distress_evidence": " | ".join(distress.evidence[:4]),
        "source": listing.source,
        "retrieved_at": listing.retrieved_at,
    }


def slug(address: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", address.lower()).strip("-")


def main() -> int:
    parser = argparse.ArgumentParser(description="Twin Deal Hunter daily pipeline")
    parser.add_argument("--demo", action="store_true", help="run on built-in sample data (no API key)")
    parser.add_argument("--city", help="limit to one target city")
    parser.add_argument("--min-score", type=float, default=60, help="minimum score for a summary (default 60)")
    parser.add_argument("--limit", type=int, default=200, help="max listings per city (live mode)")
    args = parser.parse_args()

    load_env(ROOT / ".env")
    cfg = load_configs()

    # 1. Pull listings
    if args.demo:
        from src.providers import sample_data
        listings = sample_data.demo_listings()
        comps_for = sample_data.demo_comps
        today = date.fromisoformat(sample_data.TODAY)
        print(f"[demo] {len(listings)} sample listings loaded")
    else:
        from src.providers import rentcast
        today = date.today()
        markets = cfg["markets"]["target_markets"]
        if args.city:
            markets = [m for m in markets if m["city"].lower() == args.city.lower()]
            if not markets:
                print(f"City {args.city!r} is not in config/markets.yaml", file=sys.stderr)
                return 2
        listings = []
        for m in markets:
            batch = rentcast.fetch_sale_listings(m["city"], m["state"], limit=args.limit)
            print(f"[rentcast] {m['city']}, {m['state']}: {len(batch)} active listings")
            listings.extend(batch)
        comps_for = rentcast.fetch_comps

    # 2. Hard filters
    rejected: list[dict] = []
    survivors: list[Listing] = []
    for listing in listings:
        reason = hard_filter(listing, cfg["markets"])
        if reason:
            rejected.append({"address": listing.address, "city": listing.city,
                             "asking_price": listing.listing_price, "reason": reason})
        else:
            survivors.append(listing)
    print(f"{len(survivors)} listings pass hard filters ({len(rejected)} screened out)")

    # 3–7. Analyze, underwrite, score
    analyses = []
    for listing in survivors:
        try:
            comps_raw = comps_for(listing)
        except Exception as exc:  # a comp failure shouldn't kill the run
            print(f"  ! comps failed for {listing.address}: {exc}", file=sys.stderr)
            comps_raw = []
        analyses.append(analyze_listing(listing, comps_raw, cfg, today))

    analyses.sort(key=lambda a: a["score"].total, reverse=True)

    # 8. Reports
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "summaries").mkdir(exist_ok=True)

    rows = [to_row(a) for a in analyses]
    with (REPORTS / "daily_opportunities.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["address"])
        writer.writeheader()
        writer.writerows(rows)

    for a in analyses:
        if a["score"].total < args.min_score:
            rejected.append({"address": a["listing"].address, "city": a["listing"].city,
                             "asking_price": a["listing"].listing_price,
                             "reason": f"score {a['score'].total:.0f} below {args.min_score:.0f}"})
        else:
            md = explanation.summary_markdown(a["listing"], a["distress"], a["comps"],
                                              a["repairs"], a["deal"], a["score"])
            (REPORTS / "summaries" / f"{slug(a['listing'].address)}.md").write_text(md)

    with (REPORTS / "rejected_properties.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["address", "city", "asking_price", "reason"])
        writer.writeheader()
        writer.writerows(rejected)

    # 9. CRM export
    crm_min = cfg["scoring"]["crm_export_min_score"]
    crm_rows = [r for r in rows if float(r["opportunity_score"]) >= crm_min]
    for msg in crm_export.export(crm_rows, REPORTS / "crm_export.csv"):
        print(msg)

    # 10. Console summary
    alert_min = cfg["scoring"]["alert_min_score"]
    print(f"\n{'='*74}\nTOP OPPORTUNITIES — {datetime.now(timezone.utc).date()}\n{'='*74}")
    print(f"{'SCORE':>5}  {'NET PROFIT':>12}  {'MAO':>12}  {'ASK':>12}  ADDRESS")
    for a in analyses[:20]:
        deal, s, l = a["deal"], a["score"], a["listing"]
        profit = f"${deal.net_profit:,.0f}" if deal else "n/a"
        mao = f"${deal.mao:,.0f}" if deal else "n/a"
        flag = " <<< ALERT" if s.total >= alert_min else ""
        print(f"{s.total:>5.1f}  {profit:>12}  {mao:>12}  ${l.listing_price:>10,.0f}  "
              f"{l.address}, {l.city} — {s.action}{flag}")
    print(f"\nReports written to {REPORTS}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
