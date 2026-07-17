"""
Flip Scout — daily scan entry point.

Pipeline (Juan's actual flow, automated):
  1. Ingest ALL active + coming-soon houses under the cap per region.
     No keyword filtering at ingest — the deal signal is comps, not adjectives.
  2. Comp every listing against 1-mile sold comps (180 days).
  3. Candidates = listed at <= 85% of comp-implied value AND at least one
     rehab tier clears a 20% net spread without the >30%-rehab red flag.
  4. Enrich candidates with listing remarks (page fetch), then one Claude
     structured-analysis call each (capped).
  5. Surface score >= 8 in an email-ready markdown report + performance recap.

Run:  python scout.py            (full scan; needs ANTHROPIC_API_KEY)
      python scout.py --dry-run  (steps 1-3 only, no Claude calls)
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


def in_buy_box(l: dict) -> bool:
    if l["property_type"] not in BUY_BOX["allowed_property_types"]:
        return False
    if not l["price"] or not (BUY_BOX["price_min"] <= l["price"] <= BUY_BOX["price_max"]):
        return False
    if l["beds"] is not None and not (BUY_BOX["beds_min"] <= l["beds"] <= BUY_BOX["beds_max"]):
        return False
    return bool(l["sqft"] and l["lat"] and l["lon"] and l["mls"])


def scan(dry_run: bool = False) -> None:
    db = ScoutDB()
    all_candidates = []
    total_listings = 0
    new_count = drop_count = 0

    for name, region in REGIONS.items():
        print(f"📍 {name}: fetching active listings + sold comps...")
        active = fetch_active(region["region_id"], region["region_type"],
                              BUY_BOX["price_max"], BUY_BOX["price_min"])
        time.sleep(2)
        sold = fetch_sold(region["region_id"], region["region_type"], 180)
        time.sleep(2)
        boxed = [l for l in active if in_buy_box(l)]
        total_listings += len(boxed)
        print(f"   {len(active)} active → {len(boxed)} in buy box; "
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
            all_candidates.append({
                "region": name,
                "listing": listing,
                "is_new": delta["is_new"],
                "price_drop": delta["price_drop"],
                "sf_priority": is_sf_priority(listing),
                "comps": comp_result,
                "underwrite": deal,
            })

    # Deepest discount first; SF priority neighborhoods break ties
    all_candidates.sort(
        key=lambda c: (c["comps"]["price_to_value"], not c["sf_priority"]))
    shortlist = all_candidates[:MAX_LEADS_TO_AGENT]
    dropped = len(all_candidates) - len(shortlist)
    if dropped > 0:
        print(f"⚠️  {dropped} candidates beyond the {MAX_LEADS_TO_AGENT}-lead "
              f"agent cap were not analyzed (deepest discounts kept)")

    print(f"\n✅ Ingested {total_listings} in-box listings "
          f"({new_count} new, {drop_count} price drops) → "
          f"{len(all_candidates)} comp-discount candidates")

    if dry_run:
        for c in shortlist:
            l, cr = c["listing"], c["comps"]
            print(f"  {l['address']} | ${l['price']:,} | "
                  f"{cr['price_to_value']:.0%} of value "
                  f"({cr['comp_count']} comps) | {l['url']}")
        db.record_scan(",".join(REGIONS), total_listings,
                       len(all_candidates), 0, 0)
        return

    # ---- Agent layer ----
    from agent import analyze_lead, write_performance_report

    surfaced, analyzed = [], 0
    for c in shortlist:
        l = c["listing"]
        print(f"🔎 Remarks + analysis: {l['address']}")
        c["remarks"] = fetch_remarks(l["url"]) or "(remarks unavailable)"
        time.sleep(1.5)
        try:
            verdict = analyze_lead(c)
        except Exception as e:
            print(f"   agent error, skipping: {e}")
            continue
        analyzed += 1
        db.record_verdict(l["mls"], verdict.score, verdict.verdict)
        print(f"   → {verdict.verdict} score {verdict.score:.1f}")
        if verdict.score >= MIN_SCORE_TO_SURFACE:
            surfaced.append({**c, "verdict": verdict.model_dump()})

    scan_stats = {
        "date": str(date.today()),
        "regions": list(REGIONS),
        "in_box_listings": total_listings,
        "new_listings": new_count,
        "price_drops": drop_count,
        "comp_discount_candidates": len(all_candidates),
        "candidates_beyond_agent_cap": dropped,
        "agent_analyzed": analyzed,
        "surfaced_8_plus": len(surfaced),
    }
    perf = write_performance_report(
        scan_stats,
        [{k: s[k] for k in ("region", "verdict")} |
         {"address": s["listing"]["address"]} for s in surfaced])

    report_path = write_report(surfaced, scan_stats, perf)
    db.record_scan(",".join(REGIONS), total_listings, len(all_candidates),
                   analyzed, len(surfaced))
    print(f"\n📧 Email-ready report: {report_path}")


def write_report(surfaced: list[dict], stats: dict, perf: str) -> Path:
    out_dir = Path(__file__).parent / REPORT_DIR
    out_dir.mkdir(exist_ok=True)
    path = out_dir / f"flip-scout-{stats['date']}.md"

    lines = [
        f"# Flip Scout Daily — {stats['date']}",
        "",
        f"**Territory:** {', '.join(stats['regions'])}  ",
        f"**Funnel:** {stats['in_box_listings']} in-box listings → "
        f"{stats['comp_discount_candidates']} comp-discount candidates → "
        f"{stats['surfaced_8_plus']} surfaced (score ≥ 8)",
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
    path.write_text("\n".join(lines))
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="ingest + comps only; no Claude calls")
    args = parser.parse_args()
    try:
        scan(dry_run=args.dry_run)
    except KeyboardInterrupt:
        sys.exit(130)
