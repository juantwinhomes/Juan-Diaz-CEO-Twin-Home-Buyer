"""Distress language analysis, including soft-combination detection."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from src import distress_analyzer


def test_explicit_fixer_language():
    r = distress_analyzer.analyze(
        "Contractor special! Needs significant work. Sold as-is, cash only.")
    assert r.score >= 0.9
    assert r.flags["financing_limited"]
    assert len(r.evidence) >= 3


def test_soft_language_still_scores():
    # The ChatGPT-blueprint acid test: no "fixer" keyword at all
    r = distress_analyzer.analyze(
        "Long-time family home with original finishes, being sold in present "
        "condition. Seller will make no repairs.")
    assert r.score > 0.5, f"soft distress language only scored {r.score}"
    assert any("combination" in e for e in r.evidence)


def test_clean_listing_scores_near_zero():
    r = distress_analyzer.analyze(
        "Gorgeous home with modern kitchen, landscaped yard, and two-car garage "
        "close to award-winning schools.")
    assert r.score < 0.2
    assert not r.flagged


def test_structural_flags_detected():
    r = distress_analyzer.analyze(
        "Needs foundation repair per disclosure. Fire damage in garage. "
        "Tenant occupied, do not disturb occupants. Unpermitted addition in rear.")
    for flag in ("foundation", "fire_damage", "tenant_occupied", "unpermitted"):
        assert r.flags[flag], f"{flag} not detected"


def test_evidence_cites_the_sentence():
    r = distress_analyzer.analyze(
        "Lovely street. This home needs significant work throughout. Close to parks.")
    hit = [e for e in r.evidence if "needs significant work" in e][0]
    assert "throughout" in hit  # sentence context included
