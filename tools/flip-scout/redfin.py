"""
Redfin data source — unofficial gis-csv endpoint (verified working 2026-07-17).

Two fetch modes per region:
  - active listings (Active + Coming Soon / Pre On-Market): status=9
  - sold comps (last N days): sold_within_days=N & status=9 → SALE TYPE "PAST SALE"

The CSV has no listing description/remarks. Remarks are fetched separately,
per-candidate, from the listing page (fetch_remarks) — cheap because the comp
filter shrinks the set first.
"""

import csv
import io
import re
import time

import requests

BASE = "https://www.redfin.com/stingray/api/gis-csv"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept": "text/csv"})


def _num(value, cast=float):
    try:
        return cast(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _parse_csv(text: str) -> list[dict]:
    rows = []
    reader = csv.DictReader(io.StringIO(text))
    for raw in reader:
        # Skip the MLS-rules disclaimer line and blanks
        address = (raw.get("ADDRESS") or "").strip()
        if not address:
            continue
        url_key = next((k for k in raw if k and k.startswith("URL")), None)
        rows.append({
            "sale_type": (raw.get("SALE TYPE") or "").strip(),
            "sold_date": (raw.get("SOLD DATE") or "").strip(),
            "property_type": (raw.get("PROPERTY TYPE") or "").strip(),
            "address": address,
            "city": (raw.get("CITY") or "").strip(),
            "zip": (raw.get("ZIP OR POSTAL CODE") or "").strip(),
            "price": _num(raw.get("PRICE"), int),
            "beds": _num(raw.get("BEDS"), float),
            "baths": _num(raw.get("BATHS"), float),
            "location": (raw.get("LOCATION") or "").strip(),
            "sqft": _num(raw.get("SQUARE FEET"), int),
            "lot_sqft": _num(raw.get("LOT SIZE"), int),
            "year_built": _num(raw.get("YEAR BUILT"), int),
            "days_on_market": _num(raw.get("DAYS ON MARKET"), int),
            "ppsf": _num(raw.get("$/SQUARE FEET"), int),
            "status": (raw.get("STATUS") or "").strip(),
            "url": (raw.get(url_key) or "").strip() if url_key else "",
            "mls": (raw.get("MLS#") or "").strip(),
            "lat": _num(raw.get("LATITUDE")),
            "lon": _num(raw.get("LONGITUDE")),
        })
    return rows


def _fetch(params: dict, retries: int = 3) -> list[dict]:
    for attempt in range(retries):
        try:
            resp = session.get(BASE, params=params, timeout=30)
            if resp.status_code == 200 and "SALE TYPE" in resp.text[:200]:
                return _parse_csv(resp.text)
            print(f"    Redfin HTTP {resp.status_code}; attempt {attempt + 1}")
        except requests.RequestException as e:
            print(f"    Redfin error: {e}; attempt {attempt + 1}")
        time.sleep(2 * (attempt + 1))
    return []


def fetch_active(region_id: int, region_type: int, max_price: int,
                 min_price: int) -> list[dict]:
    """Active + coming-soon houses/small-multifam in a region."""
    params = {
        "al": 1, "v": 8, "num_homes": 350,
        "region_id": region_id, "region_type": region_type,
        "status": 9,                 # Active + Coming Soon / Pre On-Market
        "uipt": "1,4",               # 1 = house, 4 = multi-family
        "sf": "1,2,3,5,6,7",
        "min_price": min_price, "max_price": max_price,
    }
    listings = _fetch(params)
    return [l for l in listings if l["sale_type"] != "PAST SALE"]


def fetch_sold(region_id: int, region_type: int, sold_within_days: int) -> list[dict]:
    """Sold houses/small-multifam in a region — the comp pool."""
    params = {
        "al": 1, "v": 8, "num_homes": 350,
        "region_id": region_id, "region_type": region_type,
        # status=130 biases the (350-row-capped) response toward PAST SALE
        # rows instead of letting actives crowd out the comp pool
        "status": 130, "sold_within_days": sold_within_days,
        "uipt": "1,4",
        "sf": "1,2,3,5,6,7",
    }
    listings = _fetch(params)
    return [l for l in listings if l["sale_type"] == "PAST SALE"]


_META_DESC = re.compile(
    r'<meta\s+name="description"\s+content="([^"]*)"', re.IGNORECASE)
_REMARKS_JSON = re.compile(r'"marketingRemarks\\":\\"(.*?)\\"')


def fetch_remarks(url: str) -> str:
    """Best-effort listing remarks from the Redfin page (meta description or
    embedded JSON). Returns '' on failure — the agent treats it as unknown."""
    if not url:
        return ""
    try:
        resp = session.get(
            url, timeout=20,
            headers={"Accept": "text/html", "User-Agent": UA})
        if resp.status_code != 200:
            return ""
        m = _REMARKS_JSON.search(resp.text)
        if m:
            text = m.group(1)
            return text.encode().decode("unicode_escape", errors="ignore")[:2000]
        m = _META_DESC.search(resp.text)
        return m.group(1)[:2000] if m else ""
    except requests.RequestException:
        return ""
