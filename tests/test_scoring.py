"""End-to-end scoring on the demo data: the Kathryne-style fixer must rank
first, the retail-ready home must be screened out, the risky hillside fixer
must be penalized."""
import pathlib
import sys
from datetime import date

import yaml

ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from run_daily import analyze_listing, hard_filter, load_configs
from src.providers import sample_data

CFG = load_configs()
TODAY = date.fromisoformat(sample_data.TODAY)


def _analyses():
    out = {}
    for listing in sample_data.demo_listings():
        if hard_filter(listing, CFG["markets"]):
            continue
        out[listing.address] = analyze_listing(
            listing, sample_data.demo_comps(listing), CFG, TODAY)
    return out


def test_retail_ready_is_hard_filtered():
    palm = [l for l in sample_data.demo_listings() if "Palm" in l.address][0]
    reason = hard_filter(palm, CFG["markets"])
    assert reason and "retail-ready" in reason


def test_kathryne_style_fixer_scores_highest():
    analyses = _analyses()
    scores = {addr: a["score"].total for addr, a in analyses.items()}
    best = max(scores, key=scores.get)
    assert "Cottage Grove" in best, f"expected the Kathryne-style fixer to win, got {scores}"
    assert scores[best] >= 70, f"pattern-match listing only scored {scores[best]}"


def test_risky_hillside_fixer_is_penalized():
    analyses = _analyses()
    quarry = analyses["88 Quarry Rd"]
    assert quarry["score"].risk_penalty >= 10
    flagged = quarry["distress"].flagged
    assert "foundation" in flagged and "tenant_occupied" in flagged and "hillside" in flagged


def test_score_components_sum_to_total():
    for a in _analyses().values():
        s = a["score"]
        expected = max(0.0, min(100.0, round(sum(c.points for c in s.components) - s.risk_penalty, 1)))
        assert s.total == expected


def test_weights_sum_to_100():
    weights = yaml.safe_load((ROOT / "config" / "scoring.yaml").read_text())["weights"]
    assert sum(weights.values()) == 100


def test_record_inconsistency_is_flagged():
    analyses = _analyses()
    cottage = analyses[[a for a in analyses if "Cottage Grove" in a][0]]
    risks = " ".join(cottage["score"].risk_reasons)
    assert "inconsistent records" in risks
