"""
Comps engine — Juan's actual deal signal.

A deal is a house listed too low vs its comparables, ugly or not. For each
active listing: sold comps within 1 mile (haversine), similar beds/sqft, last
180 days → implied value from median comp $/sqft. Discount = price / implied.
"""

import math
import statistics

from config import COMPS


def haversine_miles(lat1, lon1, lat2, lon2) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def select_comps(subject: dict, sold_pool: list[dict]) -> list[dict]:
    if not (subject.get("lat") and subject.get("lon") and subject.get("sqft")):
        return []
    lo, hi = COMPS["sqft_ratio_range"]
    beds_tol = COMPS["beds_tolerance"]
    out = []
    for c in sold_pool:
        if not (c.get("lat") and c.get("lon") and c.get("sqft") and c.get("price")):
            continue
        if subject.get("beds") is not None and c.get("beds") is not None:
            if abs(c["beds"] - subject["beds"]) > beds_tol:
                continue
        ratio = c["sqft"] / subject["sqft"]
        if not (lo <= ratio <= hi):
            continue
        dist = haversine_miles(subject["lat"], subject["lon"], c["lat"], c["lon"])
        if dist > COMPS["radius_miles"]:
            continue
        out.append({**c, "distance_miles": round(dist, 2)})
    out.sort(key=lambda c: c["distance_miles"])
    return out


def run_comps(subject: dict, sold_pool: list[dict]) -> dict | None:
    """Returns comp stats + discount, or None if too few comps."""
    comps = select_comps(subject, sold_pool)
    if len(comps) < COMPS["min_comps"]:
        return None
    ppsfs = sorted(c["price"] / c["sqft"] for c in comps)
    median_ppsf = statistics.median(ppsfs)
    # p75 approximates renovated-condition comps → ARV basis after rehab
    p75_ppsf = ppsfs[min(len(ppsfs) - 1, int(0.75 * len(ppsfs)))]
    implied_value = int(median_ppsf * subject["sqft"])
    arv_renovated = int(p75_ppsf * subject["sqft"])
    return {
        "comp_count": len(comps),
        "median_ppsf": round(median_ppsf),
        "p75_ppsf": round(p75_ppsf),
        "implied_value": implied_value,
        "arv_renovated": arv_renovated,
        "price_to_value": round(subject["price"] / implied_value, 3),
        "comps": comps[:8],  # nearest 8 kept for the agent's context
    }
