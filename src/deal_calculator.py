"""Deal math: every transaction cost, projected net profit, return on total
cost, and maximum allowable offer.

  MAO = ARV - repairs - contingency - holding - financing
        - buyer closing - seller closing - commissions - required profit

  Net profit = ARV - purchase - repairs - contingency - holding - financing
               - buyer closing - seller closing - commissions

A cheap property is not automatically a good deal — profit is measured after
every cost. Assumptions come from config/acquisition_rules.yaml.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DealResult:
    arv: float
    expected_purchase_price: float
    purchase_price_is_assumed: bool
    repairs: float
    contingency: float
    holding_costs: float
    financing_costs: float
    buyer_closing: float
    seller_closing: float
    commissions: float
    required_profit: float
    net_profit: float
    total_cost: float
    roi_on_total_cost: float
    mao: float
    gross_spread: float
    assumptions: list[str] = field(default_factory=list)

    def cost_breakdown(self) -> dict[str, float]:
        return {
            "expected_purchase_price": self.expected_purchase_price,
            "repairs": self.repairs,
            "contingency": self.contingency,
            "holding_costs": self.holding_costs,
            "financing_costs": self.financing_costs,
            "buyer_closing": self.buyer_closing,
            "seller_closing": self.seller_closing,
            "commissions": self.commissions,
        }


def _carry_costs(purchase: float, repairs: float, cfg: dict) -> tuple[float, float, list[str]]:
    """Holding + financing costs for a given purchase price and repair budget."""
    months = cfg["holding_months"]
    monthly_tax = purchase * cfg["property_tax_annual_pct"] / 12
    monthly = monthly_tax + cfg["insurance_monthly"] + cfg["utilities_maintenance_monthly"]
    holding = monthly * months

    fin = cfg["financing"]
    loan = (purchase + repairs) * fin["loan_to_cost"]
    financing = loan * fin["annual_rate"] * (months / 12) + loan * fin["points_pct"]

    assumptions = [
        f"holding period {months} months",
        f"financing {fin['loan_to_cost']:.0%} of cost at {fin['annual_rate']:.1%} + {fin['points_pct']:.1%} points",
    ]
    return holding, financing, assumptions


def calculate(arv: float, listing_price: float, repairs_point: float, cfg: dict,
              expected_purchase_price: Optional[float] = None) -> DealResult:
    assumed = expected_purchase_price is None
    purchase = expected_purchase_price if expected_purchase_price is not None else listing_price

    contingency = repairs_point * cfg["contingency_pct_of_repairs"]
    holding, financing, assumptions = _carry_costs(purchase, repairs_point, cfg)
    buyer_closing = purchase * cfg["buyer_closing_pct"]
    seller_closing = arv * cfg["seller_closing_pct"]
    commissions = arv * cfg["commission_pct"]

    rp = cfg["required_profit"]
    required_profit = max(arv * rp["pct_of_arv"], rp["minimum"])

    total_cost = (purchase + repairs_point + contingency + holding + financing
                  + buyer_closing + seller_closing + commissions)
    net_profit = arv - total_cost
    roi = net_profit / total_cost if total_cost > 0 else 0.0

    # MAO: what we could pay and still hit required profit. Purchase-dependent
    # costs (holding, financing, buyer closing) are iterated to convergence.
    mao = purchase
    for _ in range(20):
        h, f, _a = _carry_costs(mao, repairs_point, cfg)
        bc = mao * cfg["buyer_closing_pct"]
        new_mao = (arv - repairs_point - contingency - h - f - bc
                   - seller_closing - commissions - required_profit)
        if abs(new_mao - mao) < 100:
            mao = new_mao
            break
        mao = new_mao

    if assumed:
        assumptions.insert(0, "expected purchase price = LISTING PRICE (assumption — actual contract price unknown)")
    assumptions.append(f"required profit = max({rp['pct_of_arv']:.0%} of ARV, ${rp['minimum']:,.0f})")

    return DealResult(
        arv=round(arv),
        expected_purchase_price=round(purchase),
        purchase_price_is_assumed=assumed,
        repairs=round(repairs_point),
        contingency=round(contingency),
        holding_costs=round(holding),
        financing_costs=round(financing),
        buyer_closing=round(buyer_closing),
        seller_closing=round(seller_closing),
        commissions=round(commissions),
        required_profit=round(required_profit),
        net_profit=round(net_profit),
        total_cost=round(total_cost),
        roi_on_total_cost=round(roi, 4),
        mao=round(mao, -3),
        gross_spread=round(arv - listing_price),
        assumptions=assumptions,
    )
