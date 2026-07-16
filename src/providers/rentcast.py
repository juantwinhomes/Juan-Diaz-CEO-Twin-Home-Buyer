"""RentCast provider — https://developers.rentcast.io/

Endpoints used:
  GET /listings/sale        active sale listings by city
  GET /avm/value            value estimate + comparables for an address

Requires RENTCAST_API_KEY in the environment (or .env). All responses are
normalized into Listing / Comp. Never guess data the API did not return.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Optional

import requests

from ..normalize import Comp, Listing

BASE_URL = "https://api.rentcast.io/v1"
REQUEST_TIMEOUT = 30
RATE_LIMIT_SLEEP = 0.6   # stay polite; RentCast allows ~20 req/sec but bursts cost credits


class RentCastError(RuntimeError):
    pass


def _api_key() -> str:
    key = os.environ.get("RENTCAST_API_KEY", "").strip()
    if not key:
        raise RentCastError(
            "RENTCAST_API_KEY is not set. Copy .env.example to .env and add your key, "
            "or run with --demo to use sample data."
        )
    return key


def _get(path: str, params: dict) -> dict | list:
    resp = requests.get(
        f"{BASE_URL}{path}",
        params=params,
        headers={"X-Api-Key": _api_key(), "Accept": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code == 401:
        raise RentCastError("RentCast rejected the API key (401). Check RENTCAST_API_KEY.")
    if resp.status_code == 429:
        raise RentCastError("RentCast rate/credit limit hit (429). Check your plan usage.")
    resp.raise_for_status()
    time.sleep(RATE_LIMIT_SLEEP)
    return resp.json()


def _norm_type(rc_type: Optional[str]) -> str:
    mapping = {
        "Single Family": "single_family",
        "Condo": "condo",
        "Townhouse": "townhouse",
        "Multi-Family": "multi_family",
        "Manufactured": "manufactured",
        "Land": "land",
    }
    return mapping.get(rc_type or "", (rc_type or "unknown").lower().replace(" ", "_"))


def fetch_sale_listings(city: str, state: str, limit: int = 200) -> list[Listing]:
    """All active sale listings for a city."""
    now = datetime.now(timezone.utc).isoformat()
    listings: list[Listing] = []
    offset = 0
    while True:
        batch = _get("/listings/sale", {
            "city": city, "state": state, "status": "Active",
            "limit": min(limit, 500), "offset": offset,
        })
        if not isinstance(batch, list) or not batch:
            break
        for item in batch:
            price = item.get("price")
            if not price:
                continue
            listings.append(Listing(
                address=item.get("formattedAddress") or item.get("addressLine1", ""),
                city=item.get("city", city),
                state=item.get("state", state),
                zip_code=str(item.get("zipCode", "")),
                listing_price=float(price),
                status="active",
                property_type=_norm_type(item.get("propertyType")),
                beds=item.get("bedrooms"),
                baths=item.get("bathrooms"),
                sqft=item.get("squareFootage"),
                lot_sqft=item.get("lotSize"),
                year_built=item.get("yearBuilt"),
                days_on_market=item.get("daysOnMarket"),
                remarks=item.get("description") or "",
                latitude=item.get("latitude"),
                longitude=item.get("longitude"),
                hoa_fee=(item.get("hoa") or {}).get("fee") if isinstance(item.get("hoa"), dict) else None,
                source="rentcast",
                retrieved_at=now,
            ))
        if len(batch) < min(limit, 500):
            break
        offset += len(batch)
        if offset >= limit:
            break
    return listings


def fetch_comps(listing: Listing, max_comps: int = 15) -> list[Comp]:
    """Comparable sales via the AVM endpoint (returns the comps it used)."""
    params: dict = {
        "address": f"{listing.address}, {listing.city}, {listing.state} {listing.zip_code}",
        "propertyType": "Single Family",
        "compCount": max_comps,
    }
    if listing.sqft:
        params["squareFootage"] = int(listing.sqft)
    if listing.beds:
        params["bedrooms"] = listing.beds
    if listing.baths:
        params["bathrooms"] = listing.baths

    data = _get("/avm/value", params)
    comps: list[Comp] = []
    for item in (data.get("comparables") or []):
        if not item.get("price"):
            continue
        comps.append(Comp(
            address=item.get("formattedAddress", ""),
            sale_price=float(item["price"]),
            sale_date=(item.get("removedDate") or item.get("listedDate") or "")[:10],
            sqft=item.get("squareFootage"),
            lot_sqft=item.get("lotSize"),
            beds=item.get("bedrooms"),
            baths=item.get("bathrooms"),
            distance_miles=item.get("distance"),
            property_type=_norm_type(item.get("propertyType")),
            remarks=item.get("description") or "",
            source="rentcast",
        ))
    return comps
