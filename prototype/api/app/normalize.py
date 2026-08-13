"""URL and keyword normalization.

Every SEO warehouse dies here. http vs https, www vs bare, trailing slashes,
UTM params, ?replytocom from WordPress comments, uppercase paths, AMP variants
-- each one fragments a single page into several rows and quietly corrupts
every metric downstream.

These are pure functions with no I/O so they can be tested exhaustively, and
nothing is allowed to write a raw URL into a fact table.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query params that never change what page you're looking at.
TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_source_platform", "gclid", "gbraid", "wbraid", "dclid",
    "fbclid", "msclkid", "mc_cid", "mc_eid", "_ga", "_gl", "ref", "referrer",
    "hsa_acc", "hsa_cam", "hsa_grp", "hsa_ad", "hsa_src", "hsa_tgt", "hsa_kw",
    "hsa_mt", "hsa_net", "hsa_ver", "igshid", "si", "replytocom",
}

# WordPress / plugin noise that produces duplicate URLs.
STRIP_SUFFIXES = ("/amp", "/amp/", "?amp", "/feed", "/feed/", "/print", "/print/")

_MULTISLASH = re.compile(r"/{2,}")
_WS = re.compile(r"\s+")


def url_norm(url: str, *, force_host: str | None = None) -> str:
    """Return the canonical form of a URL.

    Rules, in order:
      1. lowercase scheme and host, force https
      2. drop a leading "www."
      3. collapse duplicate slashes in the path
      4. strip AMP/feed/print suffixes
      5. ensure exactly one trailing slash (except for file-like paths)
      6. drop tracking params, sort the rest
      7. drop the fragment

    >>> url_norm("http://WWW.TwinHomeBuyer.com/We-Buy-Houses//?utm_source=x#top")
    'https://twinhomebuyer.com/we-buy-houses/'
    >>> url_norm("https://twinhomebuyer.com/sitemap.xml")
    'https://twinhomebuyer.com/sitemap.xml'
    """
    if not url:
        return ""

    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    elif not re.match(r"^https?://", url, re.I):
        url = "https://" + url.lstrip("/")

    parts = urlsplit(url)

    host = (force_host or parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    path = _MULTISLASH.sub("/", parts.path or "/")
    # Paths are case-sensitive per RFC, but WordPress serves them case-insensitively
    # and GSC reports both. Lowercasing is correct for this site.
    path = path.lower()

    for suffix in STRIP_SUFFIXES:
        if path.endswith(suffix):
            path = path[: -len(suffix)] or "/"
            break

    # A path with a file extension keeps its exact form; everything else gets
    # exactly one trailing slash.
    last = path.rsplit("/", 1)[-1]
    if "." in last and last:
        pass
    elif not path.endswith("/"):
        path += "/"

    kept = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=False)
        if k.lower() not in TRACKING_PARAMS
    ]
    query = urlencode(sorted(kept)) if kept else ""

    return urlunsplit(("https", host, path, query, ""))


def url_path(url: str) -> str:
    """Just the normalized path, for display and grouping."""
    return urlsplit(url_norm(url)).path or "/"


def keyword_norm(keyword: str) -> str:
    """Lowercase, collapse whitespace, strip surrounding punctuation.

    Deliberately does NOT stem or de-pluralize -- "cash buyer" and "cash buyers"
    are different queries with different SERPs and must stay distinct rows.
    Grouping them is the clustering layer's job, not normalization's.

    >>> keyword_norm("  Sell My House  FAST  ")
    'sell my house fast'
    """
    if not keyword:
        return ""
    k = _WS.sub(" ", keyword.strip().lower())
    return k.strip(" .,;:!?\"'")


# --------------------------------------------------------------- classification

BRAND_TOKENS = ("twin home buyer", "twinhomebuyer", "equity track", "equitytrack")

PAGE_TYPE_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^/$"), "home"),
    (re.compile(r"^/(we-buy-houses|sell-your-house-fast|sell-my-house-fast)[-/]"), "city"),
    (re.compile(r"most-trusted-cash-home-buyer"), "city"),
    (re.compile(r"^/about"), "about"),
    (re.compile(r"^/reviews"), "trust"),
    (re.compile(r"^/(blog|guide)"), "guide"),
    (re.compile(r"(retrofit|hoarder|bankruptcy|condemned|equity)"), "guide"),
)


def is_brand(keyword_norm_value: str) -> bool:
    return any(t in keyword_norm_value for t in BRAND_TOKENS)


def page_type(path: str) -> str:
    for pattern, label in PAGE_TYPE_RULES:
        if pattern.search(path):
            return label
    return "other"


# Cities we actually service. Anything geo-flavoured outside this list is a
# stray -- it inflates keyword counts without producing a serviceable lead.
SERVICE_AREA: dict[str, str] = {
    "concord": "Contra Costa", "dixon": "Solano", "san jose": "Santa Clara",
    "san mateo": "San Mateo", "belmont": "San Mateo", "hayward": "Alameda",
    "union city": "Alameda", "sunnyvale": "Santa Clara", "pittsburg": "Contra Costa",
    "san francisco": "San Francisco", "stockton": "San Joaquin",
    "brentwood": "Contra Costa", "fairfax": "Marin", "sebastopol": "Sonoma",
    "el sobrante": "Contra Costa", "oakland": "Alameda", "richmond": "Contra Costa",
    "antioch": "Contra Costa", "vallejo": "Solano", "fremont": "Alameda",
    "daly city": "San Mateo", "redwood city": "San Mateo", "santa clara": "Santa Clara",
}

# Known false-friend geographies that look local but are not.
STRAY_GEOS = {
    "twin falls": "Idaho -- collides with the brand name",
    "bay county": "Florida/Michigan -- near-miss on 'Bay Area'",
    "pasco county": "Florida",
    "compton": "Los Angeles County -- ~350mi outside footprint",
    "granite bay": "Sacramento County -- outside footprint",
}


def geo_of(keyword_norm_value: str) -> tuple[str | None, bool | None]:
    """Return (city, in_footprint). in_footprint is None when not geo-scoped."""
    for stray, _reason in STRAY_GEOS.items():
        if stray in keyword_norm_value:
            return stray, False
    # Longest match first so "san mateo county" doesn't match "san mateo" early.
    for city in sorted(SERVICE_AREA, key=len, reverse=True):
        if city in keyword_norm_value:
            return city, True
    return None, None
