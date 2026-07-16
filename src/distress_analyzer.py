"""Analyze listing remarks for condition, distress, and seller motivation.

Returns a 0.0–1.0 distress score, the evidence phrases found, and structured
flags (fire, foundation, tenant, etc.) that feed the repair estimator and the
risk penalties. Combination patterns catch soft language ("original finishes...
sold in present condition... seller will make no repairs") that never uses the
word "fixer".
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# (phrase, weight). Weights: 3 = heavy condition signal, 2 = clear distress,
# 1 = motivation/soft signal. Score saturates at SATURATION.
PHRASES: list[tuple[str, int]] = [
    ("needs significant work", 3),
    ("major renovation", 3),
    ("uninhabitable", 3),
    ("fire damage", 3),
    ("foundation issue", 3),
    ("foundation problem", 3),
    ("code violation", 3),
    ("unfinished project", 3),
    ("down to the studs", 3),
    ("gut renovation", 3),
    ("contractor special", 2),
    ("contractor's special", 2),
    ("fixer", 2),
    ("handyman special", 2),
    ("bring your contractor", 2),
    ("bring your imagination", 2),
    ("bring your toolbelt", 2),
    ("cash only", 2),
    ("cash offers only", 2),
    ("will not qualify for financing", 2),
    ("won't qualify for financing", 2),
    ("as-is", 2),
    ("as is", 2),
    ("deferred maintenance", 2),
    ("original condition", 2),
    ("needs work", 2),
    ("needs tlc", 2),
    ("tlc needed", 2),
    ("water damage", 2),
    ("no interior access", 2),
    ("sight unseen", 2),
    ("investor opportunity", 2),
    ("investor special", 2),
    ("investors welcome", 2),
    ("probate", 2),
    ("court confirmation", 2),
    ("trust sale", 2),
    ("estate sale", 2),
    ("sweat equity", 2),
    ("do not disturb occupants", 2),
    ("tenant occupied", 2),
    ("diamond in the rough", 2),
    ("original finishes", 1),
    ("original features", 1),
    ("first time on market", 1),
    ("first time on the market", 1),
    ("original owner", 1),
    ("long-time family home", 1),
    ("longtime family home", 1),
    ("long time family home", 1),
    ("seller will make no repairs", 2),
    ("no repairs will be made", 2),
    ("sold in present condition", 2),
    ("sold in its present condition", 2),
    ("present condition", 1),
    ("priced to sell", 1),
    ("motivated seller", 2),
    ("value is in the land", 2),
    ("great opportunity", 1),
    ("endless potential", 1),
    ("make it your own", 1),
    ("roof leak", 2),
    ("sewer", 1),
    ("mold", 2),
    ("vacant", 1),
]

# Combination patterns: pairs of regexes that together imply distress even when
# no single phrase above fires strongly.
COMBINATIONS: list[tuple[str, str, int, str]] = [
    (r"\boriginal\b", r"\b(condition|finishes|features|kitchen|baths?)\b", 2,
     "original condition/finishes language"),
    (r"\b(no repairs|will not .{0,20}repair|make no repairs)\b", r"\b(seller|sold|sale)\b", 2,
     "seller refuses repairs"),
    (r"\b(present|current|existing)\s+condition\b", r"\b(sold|sale|selling|conveyed)\b", 2,
     "sold in present condition"),
    (r"\b(potential|opportunity|imagination|vision)\b", r"\b(needs?|requires?|awaits?)\b", 1,
     "potential + needs language"),
]

SATURATION = 6  # raw weight at which distress score reaches 1.0

# Structured flags for the repair estimator and risk penalties.
FLAG_PATTERNS: dict[str, str] = {
    "foundation": r"\bfoundation\b",
    "fire_damage": r"\bfire[- ]?damage|\bfire\b.{0,30}\b(damage|loss)\b",
    "water_damage": r"\bwater (damage|intrusion)|\bflood(ed)?\b(?! zone)|\bmold\b",
    "roof": r"\broof\b.{0,30}\b(leak|repair|replace|old|worn)\b|\b(leak|repair|replace)\b.{0,20}\broof\b",
    "sewer": r"\bsewer\b",
    "unpermitted": r"\bunpermitted\b|\bwithout permits?\b|\bno permits?\b|\bpermits? unknown\b",
    "tenant_occupied": r"\btenant[- ]occupied\b|\bdo not disturb (the )?(occupants?|tenants?)\b|\bsubject to tenants?\b",
    "no_interior_access": r"\bno interior access\b|\bsight unseen\b|\binterior not available\b|\bdrive[- ]by only\b",
    "probate_trust": r"\bprobate\b|\btrust sale\b|\bcourt confirmation\b|\bestate sale\b|\bconservatorship\b",
    "financing_limited": r"\bcash only\b|\bcash offers only\b|\bwill not qualify\b|\bwon'?t qualify\b",
    "hillside": r"\bhillside\b|\bsteep (lot|slope|driveway)\b",
    "flood_zone": r"\bflood zone\b|\bfema\b|\bfloodplain\b",
    "title_issues": r"\btitle (issue|problem|cloud)\b|\blis pendens\b|\bquiet title\b",
    "code_violations": r"\bcode violations?\b|\bred[- ]tagged?\b|\bcondemned\b",
}


@dataclass
class DistressResult:
    score: float                       # 0.0–1.0
    raw_weight: int
    evidence: list[str] = field(default_factory=list)
    flags: dict[str, bool] = field(default_factory=dict)

    @property
    def flagged(self) -> list[str]:
        return sorted(k for k, v in self.flags.items() if v)


def _sentence_containing(text: str, phrase_pos: int) -> str:
    """Return the sentence around a match position, trimmed."""
    start = max(text.rfind(".", 0, phrase_pos), text.rfind("!", 0, phrase_pos),
                text.rfind(";", 0, phrase_pos)) + 1
    end_candidates = [i for i in (text.find(".", phrase_pos), text.find("!", phrase_pos),
                                  text.find(";", phrase_pos)) if i != -1]
    end = min(end_candidates) + 1 if end_candidates else len(text)
    return text[start:end].strip()


def analyze(remarks: str) -> DistressResult:
    text = (remarks or "").lower()
    raw = 0
    evidence: list[str] = []
    seen_sentences: set[str] = set()

    for phrase, weight in PHRASES:
        pos = text.find(phrase)
        if pos != -1:
            raw += weight
            sentence = _sentence_containing(text, pos)
            key = f"{phrase}|{sentence}"
            if key not in seen_sentences:
                evidence.append(f'"{phrase}" — {sentence}')
                seen_sentences.add(key)

    for pat_a, pat_b, weight, label in COMBINATIONS:
        if re.search(pat_a, text) and re.search(pat_b, text):
            raw += weight
            evidence.append(f"combination: {label}")

    flags = {name: bool(re.search(pattern, text)) for name, pattern in FLAG_PATTERNS.items()}

    score = min(raw / SATURATION, 1.0)
    return DistressResult(score=round(score, 3), raw_weight=raw, evidence=evidence, flags=flags)
