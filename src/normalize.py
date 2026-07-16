"""Normalized data model. Every provider must return these types.

Claude / the LLM is never the source of raw property data — providers pull from
licensed APIs and normalize into Listing and Comp here.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Listing:
    address: str
    city: str
    state: str
    zip_code: str
    listing_price: float
    status: str = "active"                # active | pending | sold | expired
    property_type: str = "single_family"
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[float] = None
    lot_sqft: Optional[float] = None
    year_built: Optional[int] = None
    stories: Optional[int] = None
    garage: Optional[bool] = None
    corner_lot: Optional[bool] = None
    hoa_fee: Optional[float] = None
    days_on_market: Optional[int] = None
    remarks: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Public-record values for cross-checking listing claims
    record_beds: Optional[int] = None
    record_baths: Optional[float] = None
    record_sqft: Optional[float] = None
    source: str = "unknown"
    retrieved_at: str = ""

    @property
    def ppsf(self) -> Optional[float]:
        if self.sqft and self.sqft > 0:
            return self.listing_price / self.sqft
        return None

    def record_inconsistencies(self) -> list[str]:
        """Listing vs public-record mismatches worth flagging."""
        issues = []
        if self.record_beds is not None and self.beds is not None and self.record_beds != self.beds:
            issues.append(f"listing shows {self.beds} beds but public records show {self.record_beds}")
        if self.record_baths is not None and self.baths is not None and abs(self.record_baths - self.baths) >= 1:
            issues.append(f"listing shows {self.baths} baths but public records show {self.record_baths}")
        if (
            self.record_sqft and self.sqft
            and abs(self.record_sqft - self.sqft) / self.record_sqft > 0.10
        ):
            issues.append(f"listing sqft {self.sqft:.0f} differs >10% from record sqft {self.record_sqft:.0f}")
        return issues

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Comp:
    address: str
    sale_price: float
    sale_date: str                         # ISO date
    sqft: Optional[float] = None
    lot_sqft: Optional[float] = None
    beds: Optional[int] = None
    baths: Optional[float] = None
    stories: Optional[int] = None
    distance_miles: Optional[float] = None
    property_type: str = "single_family"
    remarks: str = ""
    renovated: Optional[bool] = None       # provider- or language-determined; None = unknown
    source: str = "unknown"

    @property
    def ppsf(self) -> Optional[float]:
        if self.sqft and self.sqft > 0:
            return self.sale_price / self.sqft
        return None

    def to_dict(self) -> dict:
        return asdict(self)


def parse_price(value) -> Optional[float]:
    """Tolerant price parser: '$898,000' -> 898000.0"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None
