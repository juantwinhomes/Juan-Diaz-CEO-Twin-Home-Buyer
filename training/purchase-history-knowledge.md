# Purchase History Knowledge — Home Depot Pro (EQUITY TRACK LLC)

Source: Home Depot Pro purchase-tracking export, 2024-01-02 → 2026-07-15
(raw file archived at `data/purchase-history-2024-2026.csv`, 3,901 orders).
Company: EQUITY TRACK LLC, phone 510-740-8898.

## Headline numbers

| Metric | Value |
|---|---|
| Total HD spend (31 months) | **$1,598,404** |
| 2024 / 2025 / 2026-to-date | $560,808 / $758,016 / $279,580 |
| Average monthly spend | ~$51,600 (peak: Apr 2025, $142,372) |
| Orders | 3,901 (avg $410/order) |
| Total discounts captured | $215,243 (~13% of pre-tax) |
| Distinct flip projects (≥10 orders) | 59 |
| **Median HD materials per flip** | **$12,406** |
| Mean HD materials per flip | $16,024 |

## Budgeting rules of thumb (use in estimates)

- When estimating a new flip's Home Depot materials budget, start at
  **$12–16k**; heavy projects run $30–70k (see top list below).
- Business pace: roughly **2 active flips at any time**, ~20-25 projects/yr
  touched, primary card X-5253.
- Preferred stores: San Carlos (#0628 + Pro desk, ~$377k), HD Pro (~$179k),
  online (~$95k), Colma II, Daly City, San Mateo. Geography: SF Peninsula
  and East Bay core, with occasional SoCal (La Verne, Mulholland).

## Biggest projects by HD materials spend (consolidated job names)

| Property | Orders | HD spend | Active window |
|---|---|---|---|
| 2325 Jefferson | 143 | $67,779 | Apr 2024 → Jan 2025 |
| 441 Vera Ave | 95 | $55,760 | Apr 2024 → Oct 2025 |
| 751 27th (San Mateo) | 106 | $45,602 | Aug 2025 → Jul 2026 (active) |
| 1574 Jerrold Ave | 64 | $38,292 | Nov 2025 → Apr 2026 |
| 449 Vera Ave | 68 | $38,266 | Apr → Nov 2024 |
| 18115 La Verne Dr | 54 | $35,462 | Jan → Jun 2024 |
| 519 Orizaba Ave | 70 | $35,042 | Jun 2025 → May 2026 |
| 255 Amber Dr | 134 | $34,875 | May 2025 → May 2026 |
| 1083 Palomino Rd | 68 | $32,612 | Jul 2024 → Mar 2025 |
| 155 Gardiner Ave | 73 | $31,800 | Mar → Sep 2025 |

Typical project duration from first to last HD order: ~5-9 months.

## Data-hygiene flags (worth fixing going forward)

1. **$394,460 across 956 orders (25% of spend) has NO job name** — that
   money can't be attributed to a property. Enforce entering the job
   name at checkout.
2. **Job names are inconsistent** — same property appears as
   "2325 jefferson", "2325 jefferson st", "2325 jefferson ave";
   "751 th27 san mateo" vs "751 27th ave san mat"; typos like "27 pague st".
   Standardize on "NUMBER STREETNAME" (e.g. "2325 JEFFERSON").
3. Tools purchases are sometimes coded as "pps tools" / "pps" (~$39k) —
   good practice, keep separating tools from per-property materials.

## How the Twin should use this

- Sanity-check any new flip's materials estimate against the $12.4k median.
- When the color-advisor generates a Home Depot shopping list, its paint
  budget should be framed as part of this per-project materials number.
- Active projects as of the export (Jul 2026): 751 27th Ave San Mateo,
  27 Prague St, 164 Springdale Way, 519 Orizaba Ave, 255 Amber Dr.
