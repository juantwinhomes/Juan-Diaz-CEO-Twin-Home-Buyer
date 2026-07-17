"""
Deterministic underwriting — the math the agent must not be allowed to fudge.

For each candidate, computes the full deal at all three rehab tiers. The agent
picks the tier (from remarks/condition) but the numbers per tier are fixed here,
and the buy-box guardrails from knowledge/deal-pattern-buybox.md are enforced
in code: rehab > 30% of purchase = RED, spread < minimum = fail.
"""

from config import (
    BUY_BOX, BUY_CLOSING_PCT, HOLDING_MONTHLY_PCT_PURCHASE,
    HOLDING_MONTHLY_PCT_REHAB, MAX_REHAB_PCT_OF_PURCHASE, REHAB_PER_SQFT,
    SELL_COST_PCT, SF_PRIORITY_LOCATIONS,
)


def underwrite_tier(price: int, sqft: int, arv: int, tier: str) -> dict:
    rehab = int(sqft * REHAB_PER_SQFT[tier])
    holding = int(
        (price * HOLDING_MONTHLY_PCT_PURCHASE + rehab * HOLDING_MONTHLY_PCT_REHAB)
        * BUY_BOX["holding_months"]
    )
    buy_closing = int(price * BUY_CLOSING_PCT)
    sell_costs = int(arv * SELL_COST_PCT)
    total_in = price + rehab + holding + buy_closing + sell_costs
    profit = arv - total_in
    spread = profit / arv if arv else 0.0
    rehab_pct = rehab / price if price else 1.0
    return {
        "tier": tier,
        "rehab": rehab,
        "holding": holding,
        "buy_closing": buy_closing,
        "sell_costs": sell_costs,
        "net_profit": profit,
        "spread": round(spread, 3),
        "rehab_pct_of_purchase": round(rehab_pct, 3),
        "passes_spread": spread >= BUY_BOX["min_spread"],
        "red_flag_rehab": rehab_pct > MAX_REHAB_PCT_OF_PURCHASE,
    }


def underwrite(subject: dict, comp_result: dict) -> dict:
    arv = comp_result["arv_renovated"]
    tiers = {
        t: underwrite_tier(subject["price"], subject["sqft"], arv, t)
        for t in REHAB_PER_SQFT
    }
    return {
        "arv": arv,
        "implied_value_as_is": comp_result["implied_value"],
        "price_to_value": comp_result["price_to_value"],
        "tiers": tiers,
        # viable = at least one tier clears the spread floor without the
        # rehab-percentage red flag
        "viable": any(
            t["passes_spread"] and not t["red_flag_rehab"]
            for t in tiers.values()
        ),
    }


def is_sf_priority(subject: dict) -> bool:
    loc = f"{subject.get('location', '')} {subject.get('city', '')}"
    return any(p.lower() in loc.lower() for p in SF_PRIORITY_LOCATIONS)
