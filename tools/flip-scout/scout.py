"""
Flip Scout — scan pipeline + CLI entry point.

Pipeline (Juan's actual flow, automated):
  1. Ingest ALL active + coming-soon houses under the cap per region.
     No keyword filtering at ingest — the deal signal is comps, not adjectives.
  2. Comp every listing against 1-mile sold comps (180 days).
  3. Candidates = listed at <= 85% of comp-implied value AND at least one
     rehab tier clears a 20% net spread without the >30%-rehab red flag.
  4. Enrich candidates with listing remarks (page fetch), then one structured
     LLM analysis call each (capped).
  5. Surface score >= 8 in an email-ready markdown report + performance recap.

Run:  python scout.py            (full scan; needs provider credentials)
      python scout.py --dry-run  (steps 1-3 only, no LLM calls)

The Streamlit app (app.py) drives the same functions with a city selection.
"""

import argparse
import sys
import time
from datetime import date
from pathlib import Path

from comps import run_comps
from config import (
    BUY_BOX, MAX_LEADS_TO_AGENT, MIN_SCORE_TO_SURFACE, REGIONS, REPORT_DIR,
)
from db import ScoutDB
from redfin import fetch_active, fetch_remarks, fetch_sold
from underwrite import is_sf_priority, underwrite


def in_buy_box(l: dict, price_max: int) -> bool:
    if l["property_type"] not in BUY_BOX["allowed_property_types"]:
        return False
    if not l["price"] or not (BUY_BOX["price_min"] <= l["price"] <= price_max):
        return False
    if l["beds"] is not None and not (BUY_BOX["beds_min"] <= l["beds"] <= BUY_BOX["beds_max"]):
        return False
    return bool(l["sqft"] and l["lat"] and l["lon"] and l["mls"])


def ingest_and_comp(region_names=None, db: ScoutDB | None = None,
                    progress=lambda msg: None):
    """Steps 1-3. Returns (candidates, stats). Pure data — no LLM calls."""
    db = db or ScoutDB()
    regions = {n: REGIONS[n] for n in (region_names or REGIONS)}
    candidates, total_listings = [], 0
    new_count = drop_count = 0

    for name, region in regions.items():
        cap = region.get("price_max", BUY_BOX["price_max"])
        progress(f"📍 {name}: fetching active listings + sold comps "
                 f"(cap ${cap:,})...")
        active = fetch_active(region["region_id"], region["region_type"],
                              cap, BUY_BOX["price_min"])
        time.sleep(2)
        sold = fetch_sold(region["region_id"], region["region_type"],
                          BUY_BOX.get("sold_within_days", 180))
        time.sleep(2)
        boxed = [l for l in active if in_buy_box(l, cap)]
        total_listings += len(boxed)
        progress(f"   {len(active)} active → {len(boxed)} in buy box; "
                 f"{len(sold)} sold comps in pool")

        for listing in boxed:
            delta = db.upsert_listing(listing)
            new_count += delta["is_new"]
            drop_count += bool(delta["price_drop"])

            comp_result = run_comps(listing, sold)
            if not comp_result:
                continue
            if comp_result["price_to_value"] > BUY_BOX["max_price_to_value"]:
                continue
            deal = underwrite(listing, comp_result)
            if not deal["viable"]:
                continue
            candidates.append({
                "region": name,
                "listing": listing,
                "is_new": delta["is_new"],
                "price_drop": delta["price_drop"],
                "sf_priority": is_sf_priority(listing),
                "comps": comp_result,
                "underwrite": deal,
            })

    # Deepest discount first; SF priority neighborhoods break ties
    candidates.sort(
        key=lambda c: (c["comps"]["price_to_value"], not c["sf_priority"]))

    stats = {
        "date": str(date.today()),
        "regions": list(regions),
        "in_box_listings": total_listings,
        "new_listings": new_count,
        "price_drops": drop_count,
        "comp_discount_candidates": len(candidates),
    }
    return candidates, stats


def analyze_candidates(candidates, db: ScoutDB | None = None,
                       progress=lambda msg: None):
    """Steps 4-5 minus report. Returns (surfaced, analyzed_count)."""
    from agent import analyze_lead

    db = db or ScoutDB()
    shortlist = candidates[:MAX_LEADS_TO_AGENT]
    surfaced, analyzed = [], 0
    for c in shortlist:
        l = c["listing"]
        progress(f"🔎 Remarks + analysis: {l['address']}")
        c["remarks"] = fetch_remarks(l["url"]) or "(remarks unavailable)"
        time.sleep(1.5)
        try:
            verdict = analyze_lead(c)
        except Exception as e:  # noqa: BLE001 — skip lead, keep scan alive
            progress(f"   agent error, skipping: {e}")
            continue
        analyzed += 1
        db.record_verdict(l["mls"], verdict.score, verdict.verdict)
        progress(f"   → {verdict.verdict} score {verdict.score:.1f}")
        if verdict.score >= MIN_SCORE_TO_SURFACE:
            surfaced.append({**c, "verdict": verdict.model_dump()})
    return surfaced, analyzed


def render_report(surfaced: list[dict], stats: dict, perf: str) -> str:
    """Email-ready markdown for the daily report."""
    lines = [
        f"# Flip Scout Daily — {stats['date']}",
        "",
        f"**Territory:** {', '.join(stats['regions'])}  ",
        f"**Funnel:** {stats['in_box_listings']} in-box listings → "
        f"{stats['comp_discount_candidates']} comp-discount candidates → "
        f"{stats.get('surfaced_8_plus', 0)} surfaced (score ≥ 8)",
        "",
    ]
    if not surfaced:
        lines += ["## No 8+ leads today",
                  "",
                  "Discipline held — nothing cleared the bar. "
                  "Candidates analyzed are logged in the database.", ""]
    for i, s in enumerate(surfaced, 1):
        l, v, cr = s["listing"], s["verdict"], s["comps"]
        tier = s["underwrite"]["tiers"][v["rehab_tier"]]
        flags = []
        if s["is_new"]:
            flags.append("NEW")
        if s["price_drop"]:
            flags.append(f"PRICE DROP −${s['price_drop']:,}")
        if s["sf_priority"]:
            flags.append("PRIORITY AREA")
        if l["price"] and l["price"] > 1_500_000:
            flags.append("OVER $1.5M — JUAN SIGN-OFF REQUIRED")
        lines += [
            f"## {i}. {l['address']} — Score {v['score']:.1f} ({v['verdict']})",
            f"{' · '.join(flags)}" if flags else "",
            "",
            f"- **List:** ${l['price']:,} ({l['beds']:.0f}bd/{l['baths']}ba, "
            f"{l['sqft']:,} sqft, lot {l['lot_sqft'] or '?'} sqft, "
            f"built {l['year_built'] or '?'}, DOM {l['days_on_market']})",
            f"- **Comps ({cr['comp_count']} sold, 1 mi/6 mo):** implied value "
            f"${cr['implied_value']:,} → listed at "
            f"**{cr['price_to_value']:.0%} of value**; renovated ARV "
            f"${s['underwrite']['arv']:,}",
            f"- **Underwrite ({v['rehab_tier']} rehab):** rehab "
            f"${tier['rehab']:,} ({tier['rehab_pct_of_purchase']:.0%} of "
            f"purchase), net profit **${tier['net_profit']:,}** = "
            f"**{tier['spread']:.0%} spread**",
            f"- **Condition:** {v['condition_read']}",
            f"- **ADU:** {v['adu_potential']}",
            f"- **Risks:** {'; '.join(v['key_risks'])}",
            f"- **Next step:** {v['recommended_next_step']}",
            f"- **Link:** {l['url']}",
            "",
            v["email_summary"],
            "",
        ]
    lines += ["---", "", "## Performance Report", "", perf, ""]
    return "\n".join(lines)


def full_scan(region_names=None, dry_run=False, progress=print):
    """Complete scan. Returns dict with candidates/surfaced/stats/report."""
    db = ScoutDB()
    candidates, stats = ingest_and_comp(region_names, db, progress)
    dropped = max(0, len(candidates) - MAX_LEADS_TO_AGENT)
    if dropped:
        progress(f"⚠️  {dropped} candidates beyond the {MAX_LEADS_TO_AGENT}-"
                 f"lead agent cap were not analyzed (deepest discounts kept)")
    progress(f"\n✅ Ingested {stats['in_box_listings']} in-box listings "
             f"({stats['new_listings']} new, {stats['price_drops']} price "
             f"drops) → {len(candidates)} comp-discount candidates")

    result = {"candidates": candidates, "stats": stats,
              "surfaced": [], "report": None, "report_path": None}
    if dry_run:
        db.record_scan(",".join(stats["regions"]), stats["in_box_listings"],
                       len(candidates), 0, 0)
        return result

    from agent import write_performance_report

    surfaced, analyzed = analyze_candidates(candidates, db, progress)
    stats.update({
        "candidates_beyond_agent_cap": dropped,
        "agent_analyzed": analyzed,
        "surfaced_8_plus": len(surfaced),
    })
    perf = write_performance_report(
        stats,
        [{k: s[k] for k in ("region", "verdict")} |
         {"address": s["listing"]["address"]} for s in surfaced])

    report = render_report(surfaced, stats, perf)
    out_dir = Path(__file__).parent / REPORT_DIR
    out_dir.mkdir(exist_ok=True)
    report_path = out_dir / f"flip-scout-{stats['date']}.md"
    report_path.write_text(report, encoding="utf-8")

    db.record_scan(",".join(stats["regions"]), stats["in_box_listings"],
                   len(candidates), analyzed, len(surfaced))
    progress(f"\n📧 Email-ready report: {report_path}")
    result.update({"surfaced": surfaced, "report": report,
                   "report_path": report_path})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="ingest + comps only; no LLM calls")
    parser.add_argument("--regions", nargs="*", default=None,
                        help="subset of region names (default: all)")
    args = parser.parse_args()
    try:
        res = full_scan(region_names=args.regions, dry_run=args.dry_run)
        if args.dry_run:
            for c in res["candidates"][:MAX_LEADS_TO_AGENT]:
                l, cr = c["listing"], c["comps"]
                print(f"  {l['address']} | ${l['price']:,} | "
                      f"{cr['price_to_value']:.0%} of value "
                      f"({cr['comp_count']} comps) | {l['url']}")
    except KeyboardInterrupt:
        sys.exit(130)
