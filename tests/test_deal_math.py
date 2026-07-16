"""Deal math must account for every cost and never call cheap = good."""
import pathlib
import sys

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from src import deal_calculator

CFG = yaml.safe_load((pathlib.Path(__file__).parent.parent / "config" / "acquisition_rules.yaml").read_text())


def test_kathryne_style_deal_is_profitable():
    # ~Kathryne: ask 925k, ARV ~1.64M, heavy rehab ~296k
    deal = deal_calculator.calculate(arv=1640000, listing_price=925000,
                                     repairs_point=296000, cfg=CFG)
    assert deal.net_profit > 100000
    assert deal.roi_on_total_cost > 0.05
    assert deal.gross_spread == 1640000 - 925000
    assert deal.purchase_price_is_assumed
    assert any("assumption" in a.lower() for a in deal.assumptions)


def test_all_costs_are_positive_and_present():
    deal = deal_calculator.calculate(arv=1500000, listing_price=1000000,
                                     repairs_point=200000, cfg=CFG)
    for name, value in deal.cost_breakdown().items():
        assert value > 0, f"{name} missing from cost model"
    # Net profit must equal ARV minus every cost
    assert abs(deal.net_profit - (deal.arv - deal.total_cost)) <= 1


def test_cheap_but_thin_deal_loses_money():
    # Cheap house, but ARV barely above ask once renovated: must show a loss/near-zero
    deal = deal_calculator.calculate(arv=800000, listing_price=700000,
                                     repairs_point=150000, cfg=CFG)
    assert deal.net_profit < 0


def test_mao_respects_required_profit():
    deal = deal_calculator.calculate(arv=1640000, listing_price=925000,
                                     repairs_point=296000, cfg=CFG)
    # Buying at exactly MAO must produce at least the required profit
    at_mao = deal_calculator.calculate(arv=1640000, listing_price=925000,
                                       repairs_point=296000, cfg=CFG,
                                       expected_purchase_price=deal.mao)
    assert at_mao.net_profit >= deal.required_profit - 2000  # rounding tolerance
    assert not at_mao.purchase_price_is_assumed


def test_required_profit_uses_max_of_pct_and_minimum():
    small = deal_calculator.calculate(arv=500000, listing_price=300000,
                                      repairs_point=50000, cfg=CFG)
    assert small.required_profit == CFG["required_profit"]["minimum"]
    big = deal_calculator.calculate(arv=2000000, listing_price=1200000,
                                    repairs_point=300000, cfg=CFG)
    assert big.required_profit == 2000000 * CFG["required_profit"]["pct_of_arv"]
