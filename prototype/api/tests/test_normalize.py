"""The most valuable tests in the repo. If these drift, every metric lies."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.normalize import (  # noqa: E402
    geo_of, is_brand, keyword_norm, page_type, url_norm, url_path,
)

HOME = "https://twinhomebuyer.com/"


@pytest.mark.parametrize(
    "raw",
    [
        "http://www.twinhomebuyer.com/",
        "https://www.twinhomebuyer.com",
        "https://twinhomebuyer.com//",
        "http://TwinHomeBuyer.com/#top",
        "https://www.twinhomebuyer.com/?utm_source=google&utm_medium=cpc",
        "https://twinhomebuyer.com/?gclid=abc123",
        "twinhomebuyer.com",
        "//www.twinhomebuyer.com/",
    ],
)
def test_homepage_variants_collapse(raw):
    """The protocol split that showed up in the Semrush export dies here."""
    assert url_norm(raw) == HOME


def test_path_case_and_slash():
    assert url_norm("https://twinhomebuyer.com/We-Buy-Houses-In-Concord-CA") == \
        "https://twinhomebuyer.com/we-buy-houses-in-concord-ca/"


def test_duplicate_slashes():
    assert url_norm("https://twinhomebuyer.com/a//b///c") == \
        "https://twinhomebuyer.com/a/b/c/"


def test_wordpress_replytocom_is_noise():
    assert url_norm("https://twinhomebuyer.com/hoarder-houses/?replytocom=42") == \
        "https://twinhomebuyer.com/hoarder-houses/"


def test_amp_and_feed_variants():
    assert url_norm("https://twinhomebuyer.com/reviews/amp/") == \
        "https://twinhomebuyer.com/reviews/"
    assert url_norm("https://twinhomebuyer.com/reviews/feed/") == \
        "https://twinhomebuyer.com/reviews/"


def test_file_paths_keep_their_shape():
    assert url_norm("https://twinhomebuyer.com/sitemap.xml") == \
        "https://twinhomebuyer.com/sitemap.xml"
    assert url_norm("https://www.twinhomebuyer.com/robots.txt") == \
        "https://twinhomebuyer.com/robots.txt"


def test_meaningful_params_survive_and_sort():
    assert url_norm("https://twinhomebuyer.com/search/?b=2&a=1&utm_source=x") == \
        "https://twinhomebuyer.com/search/?a=1&b=2"


def test_normalization_is_idempotent():
    once = url_norm("http://WWW.TwinHomeBuyer.com/We-Buy-Houses//?utm_source=x#top")
    assert url_norm(once) == once


def test_empty_input_is_safe():
    assert url_norm("") == ""
    assert keyword_norm("") == ""


def test_url_path():
    assert url_path("http://www.twinhomebuyer.com/Reviews") == "/reviews/"


# ------------------------------------------------------------------ keywords

def test_keyword_whitespace_and_case():
    assert keyword_norm("  Sell My House  FAST  ") == "sell my house fast"


def test_keyword_trailing_punctuation():
    assert keyword_norm("equity track inc.") == "equity track inc"


def test_singular_and_plural_stay_distinct():
    """Different SERPs, different intent. Clustering may group them; we don't."""
    assert keyword_norm("cash buyer") != keyword_norm("cash buyers")


def test_brand_detection():
    assert is_brand("twin home buyer")
    assert is_brand("equity track inc")
    assert not is_brand("cash buyers")


# ------------------------------------------------------------------ geography

def test_service_area_city():
    city, in_footprint = geo_of("sell my house fast concord ca")
    assert city == "concord" and in_footprint is True


def test_stray_geo_twin_falls():
    """Ranks only because 'Twin' collides with the brand name."""
    city, in_footprint = geo_of("sell my house fast twin falls")
    assert city == "twin falls" and in_footprint is False


def test_stray_geo_bay_county():
    city, in_footprint = geo_of("bay county cash home buyers")
    assert city == "bay county" and in_footprint is False


def test_longest_city_match_wins():
    city, _ = geo_of("we buy houses san mateo county")
    assert city == "san mateo"


def test_non_geo_keyword():
    assert geo_of("cash buyers") == (None, None)


# ------------------------------------------------------------------ page type

@pytest.mark.parametrize(
    "path,expected",
    [
        ("/", "home"),
        ("/we-buy-houses-in-concord-ca/", "city"),
        ("/san-mateo-most-trusted-cash-home-buyer-ca/", "city"),
        ("/about-juan-diaz-ceo-twin-home-buyer/", "about"),
        ("/reviews/", "trust"),
        ("/seismic-retrofit-costs-in-san-francisco-a-comprehensive-guide-2025-update/", "guide"),
        ("/hoarder-houses/", "guide"),
        ("/some-random-page/", "other"),
    ],
)
def test_page_type(path, expected):
    assert page_type(path) == expected
