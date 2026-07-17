"""
Flip Scout configuration — Juan's buy box + guardrails.

Grounded in two sources:
  1. Juan's stated flow (2026-07-17): SF under $1.5M, houses only, no condos,
     include coming-soon, find deals by comparables (1-mile radius) — a deal is
     a house LISTED TOO LOW vs comps, ugly or not.
  2. knowledge/deal-pattern-buybox.md: losses cluster at buy >$1.5M in premium
     Peninsula markets with rehab >25-30% of purchase. Juan's own rule:
     "we won't buy anything past 85%" (of value).
"""

# ---- Territory (Redfin region IDs, verified 2026-07-17) ----
# Optional per-region "price_max" overrides the global BUY_BOX cap. Anything
# surfaced above $1.5M is flagged "JUAN SIGN-OFF REQUIRED" in the report —
# that price band is where every historical loss lived.
REGIONS = {
    "San Francisco": {"region_id": 17151, "region_type": 6, "price_max": 1_500_000},
    "Oakland":       {"region_id": 13654, "region_type": 6, "price_max": 1_500_000},
    "San Jose":      {"region_id": 17420, "region_type": 6, "price_max": 1_500_000},
    "San Mateo":     {"region_id": 17490, "region_type": 6, "price_max": 2_500_000},
    "Belmont":       {"region_id": 1362,  "region_type": 6, "price_max": 2_500_000},
    "Sunnyvale":     {"region_id": 19457, "region_type": 6, "price_max": 2_500_000},
}

# SF priority neighborhoods (matched against the CSV LOCATION column).
# D1/D2 = Richmond/Sunset, D9 = Bernal/Mission/Potrero, D10 = Bayview/Excelsior.
SF_PRIORITY_LOCATIONS = [
    "SF District 1", "SF District 2", "SF District 9", "SF District 10",
    "Bayview", "Sunset", "Richmond", "Bernal", "Excelsior", "Mission",
    "Portola", "Visitacion",
]

BUY_BOX = {
    "price_min": 400_000,
    "price_max": 1_500_000,      # hard cap per Juan's flow + loss history >$1.5M
    "beds_min": 2,
    "beds_max": 5,
    # Houses only — no condos/townhouses. Small multifam allowed per scout brief.
    "allowed_property_types": [
        "Single Family Residential",
        "Multi-Family (2-4 Unit)",
    ],
    # Juan's rule: don't buy past 85% of value. A listing priced at or below
    # this fraction of its comp-implied value is a candidate.
    "max_price_to_value": 0.85,
    # Minimum acceptable net spread (profit / ARV) after rehab+holding+fees.
    "min_spread": 0.20,
    "holding_months": 6,
}

# ---- Comps engine ----
COMPS = {
    "radius_miles": 1.0,
    "sold_within_days": 180,
    "beds_tolerance": 1,          # subject beds ± 1
    "sqft_ratio_range": (0.65, 1.45),
    "min_comps": 3,
}

# ---- Underwriting assumptions ----
REHAB_PER_SQFT = {"light": 200, "medium": 350, "heavy": 500}  # Bay Area 2026
BUY_CLOSING_PCT = 0.015          # of purchase
SELL_COST_PCT = 0.06             # of ARV (commissions + closing)
HOLDING_MONTHLY_PCT_PURCHASE = 0.008   # financing/taxes/insurance on purchase
HOLDING_MONTHLY_PCT_REHAB = 0.005      # carry on rehab budget

# RED-flag gate from deal-pattern-buybox.md: rehab > ~30% of purchase killed
# every historical loss. Enforced in code, not left to the model.
MAX_REHAB_PCT_OF_PURCHASE = 0.30

# ---- Agent layer ----
# Provider for the analysis brain (override with env FLIP_SCOUT_PROVIDER):
#   "anthropic" — Claude API (ANTHROPIC_API_KEY)
#   "xai"       — Grok via xAI API (XAI_API_KEY)
#   "grok-cli"  — local `grok` CLI, uses the CLI's own auth/subscription
LLM_PROVIDER = "anthropic"
AGENT_MODEL = "claude-opus-4-8"          # anthropic provider
XAI_MODEL = "grok-4"                     # xai provider
GROK_CLI_CMD = ["grok", "--prompt"]      # grok-cli provider; prompt appended
MAX_LEADS_TO_AGENT = 15          # cap Claude calls per daily scan
MIN_SCORE_TO_SURFACE = 8.0       # only 8+ goes in the email

# ---- Output ----
DB_PATH = "flip_scout.db"
REPORT_DIR = "reports"
