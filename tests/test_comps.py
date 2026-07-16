"""Comp selection rules: recency, distance, sqft, renovated separation."""
import pathlib
import sys
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from src import comp_analyzer
from src.normalize import Comp, Listing

TODAY = date(2026, 7, 15)

SUBJECT = Listing(address="742 Cottage Grove Ave", city="San Mateo", state="CA",
                  zip_code="94401", listing_price=925000, sqft=1690, beds=4,
                  baths=3.0, property_type="single_family")


def _comp(**kw) -> Comp:
    base = dict(address="x", sale_price=1600000, sale_date="2026-06-01",
                sqft=1700, beds=4, baths=3.0, distance_miles=0.3,
                property_type="single_family")
    base.update(kw)
    return Comp(**base)


def test_rejects_stale_distant_and_wrong_size():
    analysis = comp_analyzer.analyze(SUBJECT, [
        _comp(sale_date="2024-01-01"),          # too old
        _comp(distance_miles=2.5),               # too far
        _comp(sqft=3000),                        # way too big
        _comp(property_type="condo"),            # wrong type
    ], today=TODAY)
    assert len(analysis.selected) == 0
    assert all("rejected" in e.reason for e in analysis.evaluations)


def test_every_comp_gets_a_reason():
    analysis = comp_analyzer.analyze(SUBJECT, [_comp(), _comp(sale_date="2023-01-01")], today=TODAY)
    assert all(e.reason for e in analysis.evaluations)


def test_renovated_and_unrenovated_are_separated():
    analysis = comp_analyzer.analyze(SUBJECT, [
        _comp(remarks="Beautifully remodeled with designer kitchen", sale_price=1800000),
        _comp(remarks="Original condition, sold as-is, needs work", sale_price=1200000),
    ], today=TODAY)
    assert len(analysis.renovated_ppsf_values) == 1
    assert len(analysis.unrenovated_ppsf_values) == 1
    # ARV must come from the renovated comp, not a blend
    assert analysis.arv_estimate == round((1800000 / 1700) * SUBJECT.sqft, -3)


def test_arv_fallback_without_renovated_comps_is_flagged():
    analysis = comp_analyzer.analyze(SUBJECT, [
        _comp(remarks="Original condition fixer", sale_price=1200000),
        _comp(remarks="Estate sale, as-is", sale_price=1250000),
    ], today=TODAY)
    assert analysis.arv_estimate is not None
    assert any("low confidence" in n for n in analysis.notes)


def test_confidence_increases_with_renovated_support():
    weak = comp_analyzer.analyze(SUBJECT, [_comp(remarks="Original condition as-is")], today=TODAY)
    strong = comp_analyzer.analyze(SUBJECT, [
        _comp(remarks="remodeled", sale_price=1750000),
        _comp(remarks="renovated", sale_price=1800000, address="y"),
        _comp(remarks="updated and turnkey", sale_price=1650000, address="z"),
        _comp(remarks="original condition", sale_price=1250000, address="w"),
    ], today=TODAY)
    assert strong.confidence > weak.confidence
