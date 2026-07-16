# Twin Home Buyer Deal Hunter

## Mission

Build and maintain a property acquisition intelligence system for Twin Home Buyer.

The system must identify properties that resemble Twin Home Buyer's historically
profitable purchases. It must prioritize actual projected net profit, resale demand,
property fundamentals, seller motivation, and execution risk.

The system must never classify a property as a good deal merely because it is inexpensive.

## Core Workflow

For every available property:

1. Normalize the address and property data.
2. Retrieve property characteristics.
3. Retrieve active, pending, expired, and sold listing information where licensed.
4. Retrieve comparable sales.
5. Analyze listing remarks for condition and motivation.
6. Estimate present-condition value.
7. Estimate renovated ARV.
8. Estimate renovation costs.
9. Calculate maximum allowable offer.
10. Calculate projected net profit and return on total cost.
11. Calculate a transparent opportunity score.
12. Identify missing information and risk factors.
13. Create a concise explanation for the acquisitions team.
14. Export qualifying properties to the CRM.

## Target Property Pattern

Give preference to:

- Single-family properties
- High-demand Bay Area neighborhoods
- Properties requiring cosmetic or substantial renovation
- Properties priced below condition-adjusted market value
- Functional layouts or layouts with clear improvement potential
- Lots with useful expansion or ADU possibilities
- Properties with multiple strong renovated comparable sales
- Listings with motivation or distress signals
- Properties where Twin Home Buyer's construction capabilities create an advantage

Reference case: 864 Kathryne Ave, San Mateo, CA 94401 — listed $898,000, sold $1,200,000,
1,690 sqft single-story ranch, 4 bed / 3 bath, corner lot, "needs significant work",
nearby renovated sales $1.48M–$1.85M. This is the pattern to match.

## Financial Requirements

Calculate:

- Expected purchase price
- Renovation budget
- Renovation contingency
- Holding costs
- Financing costs
- Acquisition closing costs
- Resale closing costs
- Commissions
- Expected ARV
- Projected net profit
- Return on total project cost
- Maximum allowable offer

Never omit transaction costs.

Never use the listing price as the expected purchase price without clearly labeling
the assumption.

## Comparable Rules

Prefer comparable sales that are:

- Within the same neighborhood
- Within 0.5 miles when possible
- Sold within the last 180 days
- Within 20% of subject square footage
- Similar in lot size, bed count, bath count, story count, and style
- Similar in location quality

Separate renovated comparables from unrenovated comparables.
Do not average weak and strong comparables blindly.
Explain why each comparable was selected or rejected.

## Condition Analysis

Analyze listing language for:

- Deferred maintenance
- Original condition
- Major renovation
- Contractor opportunity
- As-is sale
- Probate or trust sale
- Financing limitations
- Fire, water, foundation, roof, sewer, electrical, plumbing, or structural problems
- Unpermitted work
- Occupancy problems
- Seller motivation

Return evidence from the listing remarks for every condition conclusion.
Understand combinations, not only exact keywords: "Long-time family home with
original finishes, being sold in present condition. Seller will make no repairs."
must receive a distress score even though the word "fixer" never appears.

## Risk Controls

Penalize:

- Weak or distant comparables
- Foundation uncertainty
- Hillside construction
- Major additions without permits
- Tenant or eviction complications
- Fire damage
- Severe water intrusion
- Flood exposure
- HOA restrictions
- Title uncertainty
- Unverified square footage
- Inconsistent bed or bath records
- Thin resale demand

Never hide uncertainty.

## Output Format

For each property return:

- Address
- Listing status
- Asking price
- Estimated purchase price
- Property summary
- Why it may be mispriced
- Distress evidence
- Estimated current value
- Estimated ARV
- Estimated repair range
- Projected net profit
- Return on total cost
- Maximum allowable offer
- Opportunity score
- Confidence score
- Top three risks
- Recommended next action
- Data sources and retrieval timestamps

## Decision Categories

- 90–100: Immediate acquisition review
- 80–89: Contact agent immediately
- 70–79: Manual underwriting required
- 60–69: Watchlist
- Below 60: Reject

## Learning Loop

Store the acquisition team's decision and reason in `data/manual_reviews.csv`.

After a property sells, compare:

- Predicted sale price vs actual sale price
- Predicted repair cost vs actual repair cost
- Predicted holding period vs actual holding period
- Predicted profit vs actual profit

Use these differences to improve rules and calibration.
Do not automatically change financial thresholds without human approval.

## Engineering Rules

- All tunable numbers live in `config/*.yaml`, never hardcoded in `src/`.
- Data providers live in `src/providers/` and return normalized `Listing` / `Comp`
  objects from `src/normalize.py`. Claude is never the source of raw property data.
- Do not scrape Redfin, Zillow, or any site whose terms prohibit automated collection.
- Every score must be explainable: the scorer returns a per-component breakdown.
- Run `python3 -m pytest tests/ -q` before committing.
- Demo mode (`python3 run_daily.py --demo`) must always work with no API key.
