"""Built-in sample data for --demo mode and tests. No API key required.

Includes a Kathryne-Ave-style heavy fixer (the pattern to catch), a moderate
cosmetic flip, a retail-ready home (should be screened out), and an overpriced
fixer (distress language but no spread — should score poorly). Comps mirror the
real Kathryne case: renovated sales around $960–$1,326/sqft.
"""
from __future__ import annotations

from ..normalize import Comp, Listing

RETRIEVED_AT = "2026-07-15T14:00:00+00:00"
TODAY = "2026-07-15"


def demo_listings() -> list[Listing]:
    return [
        Listing(
            address="742 Cottage Grove Ave", city="San Mateo", state="CA", zip_code="94401",
            listing_price=925000, status="active", property_type="single_family",
            beds=4, baths=3.0, sqft=1690, lot_sqft=5736, year_built=1948, stories=1,
            garage=True, corner_lot=True, hoa_fee=None, days_on_market=9,
            remarks=(
                "Long-time family home, first time on market in over 50 years. "
                "Single-level ranch with an open great room, four bedrooms and three baths "
                "on a corner lot. Property needs significant work and is best suited to a "
                "buyer planning a major renovation. Sold in its present condition; seller "
                "will make no repairs. Bring your contractor and your imagination."
            ),
            latitude=37.5741, longitude=-122.3210,
            record_beds=3, record_baths=2.0, record_sqft=1690,
            source="sample", retrieved_at=RETRIEVED_AT,
        ),
        Listing(
            address="318 Hazel Ave", city="San Mateo", state="CA", zip_code="94401",
            listing_price=1150000, status="active", property_type="single_family",
            beds=3, baths=2.0, sqft=1420, lot_sqft=5200, year_built=1952, stories=1,
            garage=True, corner_lot=False, hoa_fee=None, days_on_market=24,
            remarks=(
                "Charming rancher with original hardwood floors and original kitchen. "
                "Some deferred maintenance; sold as-is. Great opportunity to add value "
                "in a sought-after neighborhood close to downtown."
            ),
            latitude=37.5688, longitude=-122.3305,
            record_beds=3, record_baths=2.0, record_sqft=1420,
            source="sample", retrieved_at=RETRIEVED_AT,
        ),
        Listing(
            address="1205 Palm Dr", city="San Mateo", state="CA", zip_code="94402",
            listing_price=1795000, status="active", property_type="single_family",
            beds=4, baths=3.0, sqft=1810, lot_sqft=6000, year_built=1955, stories=1,
            garage=True, corner_lot=False, hoa_fee=None, days_on_market=6,
            remarks=(
                "Fully remodeled and move-in ready. Designer finishes throughout, "
                "brand new kitchen with quartz counters, new baths, new roof, "
                "landscaped yard. Turnkey living at its finest."
            ),
            latitude=37.5610, longitude=-122.3352,
            record_beds=4, record_baths=3.0, record_sqft=1810,
            source="sample", retrieved_at=RETRIEVED_AT,
        ),
        Listing(
            address="88 Quarry Rd", city="San Mateo", state="CA", zip_code="94402",
            listing_price=1690000, status="active", property_type="single_family",
            beds=4, baths=2.0, sqft=1550, lot_sqft=4400, year_built=1961, stories=2,
            garage=False, corner_lot=False, hoa_fee=None, days_on_market=87,
            remarks=(
                "Fixer opportunity on a hillside lot with bay views. Needs work throughout "
                "including foundation repair per seller disclosure. Tenant occupied — "
                "do not disturb occupants. Cash only. Sold as-is."
            ),
            latitude=37.5522, longitude=-122.3441,
            record_beds=4, record_baths=2.0, record_sqft=1550,
            source="sample", retrieved_at=RETRIEVED_AT,
        ),
    ]


def demo_comps(listing: Listing) -> list[Comp]:
    """Comps keyed by subject address. Modeled on the real Kathryne comp set."""
    sets: dict[str, list[Comp]] = {
        "742 Cottage Grove Ave": [
            Comp(address="611 N Claremont St", sale_price=1850000, sale_date="2026-05-28",
                 sqft=1720, lot_sqft=5500, beds=4, baths=3.0, stories=1, distance_miles=0.31,
                 remarks="Beautifully remodeled ranch, designer kitchen, new baths.",
                 source="sample"),
            Comp(address="415 Poplar Ave", sale_price=1640000, sale_date="2026-04-19",
                 sqft=1580, lot_sqft=5100, beds=4, baths=2.5, stories=1, distance_miles=0.42,
                 remarks="Renovated throughout, open floor plan, move-in ready.",
                 source="sample"),
            Comp(address="230 N Eldorado St", sale_price=1480000, sale_date="2026-06-10",
                 sqft=1540, lot_sqft=4900, beds=3, baths=2.0, stories=1, distance_miles=0.38,
                 remarks="Updated kitchen and baths, refinished hardwood, landscaped.",
                 source="sample"),
            Comp(address="857 N Idaho St", sale_price=1210000, sale_date="2026-05-02",
                 sqft=1660, lot_sqft=5400, beds=4, baths=2.0, stories=1, distance_miles=0.26,
                 remarks="Original condition, estate sale, sold as-is. Great potential.",
                 source="sample"),
            Comp(address="119 S Humboldt St", sale_price=1265000, sale_date="2026-03-22",
                 sqft=1750, lot_sqft=5900, beds=4, baths=3.0, stories=1, distance_miles=0.47,
                 remarks="Needs TLC, original kitchen, priced for condition.",
                 source="sample"),
            Comp(address="1490 Marina Ct", sale_price=1725000, sale_date="2025-12-15",
                 sqft=1705, lot_sqft=5000, beds=4, baths=3.0, stories=1, distance_miles=0.88,
                 remarks="Fully renovated coastal ranch.", source="sample"),
        ],
        "318 Hazel Ave": [
            Comp(address="521 Cypress Ave", sale_price=1520000, sale_date="2026-05-15",
                 sqft=1450, lot_sqft=5000, beds=3, baths=2.0, stories=1, distance_miles=0.29,
                 remarks="Tastefully updated, new kitchen, refinished floors.", source="sample"),
            Comp(address="708 Fremont St", sale_price=1455000, sale_date="2026-06-02",
                 sqft=1380, lot_sqft=4800, beds=3, baths=2.0, stories=1, distance_miles=0.44,
                 remarks="Remodeled charmer near downtown.", source="sample"),
            Comp(address="212 Dale Ave", sale_price=1230000, sale_date="2026-04-30",
                 sqft=1410, lot_sqft=5100, beds=3, baths=2.0, stories=1, distance_miles=0.51,
                 remarks="Original condition, needs updating, as-is sale.", source="sample"),
        ],
        "1205 Palm Dr": [
            Comp(address="1330 Palm Dr", sale_price=1810000, sale_date="2026-05-20",
                 sqft=1790, lot_sqft=5800, beds=4, baths=3.0, stories=1, distance_miles=0.15,
                 remarks="Remodeled, designer finishes.", source="sample"),
            Comp(address="148 W 25th Ave", sale_price=1760000, sale_date="2026-06-08",
                 sqft=1850, lot_sqft=6100, beds=4, baths=3.0, stories=1, distance_miles=0.35,
                 remarks="Updated and turnkey.", source="sample"),
        ],
        "88 Quarry Rd": [
            Comp(address="102 Crestview Dr", sale_price=1900000, sale_date="2026-04-11",
                 sqft=1620, lot_sqft=4600, beds=4, baths=2.5, stories=2, distance_miles=0.62,
                 remarks="Renovated view home.", source="sample"),
            Comp(address="77 Tobin Clark Dr", sale_price=1750000, sale_date="2026-01-20",
                 sqft=1500, lot_sqft=4300, beds=3, baths=2.0, stories=2, distance_miles=0.95,
                 remarks="Updated hillside home with views.", source="sample"),
        ],
    }
    return sets.get(listing.address.split(",")[0], [])
