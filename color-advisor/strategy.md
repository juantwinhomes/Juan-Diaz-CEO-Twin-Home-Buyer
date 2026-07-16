# Palette Purchasing Strategy — built from EQUITY TRACK's own HD data

Derived from `data/purchase-history-2024-2026.csv` (order-level; see
data-limits note at bottom). Companion to `2026-color-trends.md` and
`purchase-history-knowledge.md`.

## What the purchase data shows

| Pattern | Number | Meaning |
|---|---|---|
| Returns | **810 transactions, -$95,499** (21% of all transactions) | Heavy over-buy-and-return churn — trips, restocking risk, price-protection losses |
| Small runs | 634 purchases under $100 ($33k) | Truck-run tax: labor hours spent on sub-$100 store trips |
| Median order | $195 | Buying is reactive/as-needed, not staged |
| Spend curve | 69% of project spend in the FIRST third, only 10% in the final third | Finish materials (paint included) are bought late, small, and piecemeal |
| Orders per project | avg 48 per flip | ~48 separate buying events per property |
| Online share | 6% | Almost everything is in-store trips |

## The strategy: standardize the palette, then buy it like inventory

Because EQUITY TRACK runs ~20+ flips/year with a $12.4k median HD materials
budget each, a **fixed company palette** turns paint from a per-house custom
decision into a repeatable SKU list:

### 1. The standard EQUITY TRACK exterior palette (from the 2026 framework)

| Role | Primary | Alternate (warm-roof houses) |
|---|---|---|
| Body A (green-gray) | Evergreen Fog SW 9130 / Behr match | — |
| Body B (warm neutral) | Universal Khaki SW 6150 / Behr match | Balboa Mist (greige) |
| Body C (cottage) | Sea Salt SW 6204 / Behr "Softened Green" PPU10-14 | — |
| Trim (always) | Alabaster SW 7008 / Behr "Swiss Coffee" #12 | — |
| Door accent | Naval SW 6244 or Urbane Bronze SW 7048 | — |
| Fixtures | Matte black | — |

The color-advisor app picks WHICH body color per property; the SKUs stay
constant. Three body colors + one trim + two doors covers ~every flip.

### 2. Buying rules the palette enables

- **Stage one finish order per project** instead of piecemeal: when a
  project enters its final third, place ONE consolidated order (paint from
  the standard palette + the app's shopping list). Target: cut the ~48
  orders/project meaningfully.
- **Buy trim paint in bulk**: Alabaster/Swiss Coffee is on every house —
  buy 5-gal buckets on Pro pricing, hold 2-3 in inventory; it never
  strands (next flip always uses it).
- **Order online for pickup** (only 6% today): consolidating to known SKUs
  makes online ordering trivial and kills small store runs.
- **Attack the return rate**: standard SKUs mean leftover paint transfers
  to the next project instead of going back to the store. Target returns
  under 10% of transactions (from 21%).
- Keep coding tools separately ("pps tools") and ALWAYS enter the job name
  (25% of historic spend is unattributed).

### 3. What this is worth (rough)

- Returns churn: even halving the -$95k/31mo return flow saves labor and
  price-protection leakage worth thousands/yr.
- 634 sub-$100 runs ≈ hundreds of crew-hours; consolidated staging
  reclaims most of them.
- Bulk 5-gal trim + Pro-desk quotes on staged orders: typically 10-20%
  under shelf on paint.

## Data limits — what we still can't see

The current export is ORDER-level: dates, jobs, totals — **no SKUs, no
product names, no paint colors**. To analyze what was actually ordered
(brands, colors, quantities), export the ITEM-level history: Home Depot
Pro Xtra → Purchase Tracking → include item detail / itemized receipts.
Once provided, update this file with: actual paint spend share, brands
bought, and whether current buying already clusters around any colors.
