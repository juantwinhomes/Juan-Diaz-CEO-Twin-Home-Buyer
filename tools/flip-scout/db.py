"""
SQLite store — dedup by MLS#, price history for drop detection.

Fixes the flaw in the old script: INSERT OR REPLACE on an autoincrement id
never conflicts, so every scan duplicated everything. Here listings are keyed
by MLS number and price changes append to price_history.
"""

import sqlite3
from datetime import datetime, timezone

from config import DB_PATH


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


class ScoutDB:
    def __init__(self, path: str = DB_PATH):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self._setup()

    def _setup(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS listings (
                mls TEXT PRIMARY KEY,
                address TEXT, city TEXT, location TEXT, zip TEXT,
                property_type TEXT, price INTEGER, beds REAL, baths REAL,
                sqft INTEGER, lot_sqft INTEGER, year_built INTEGER,
                days_on_market INTEGER, status TEXT, url TEXT,
                lat REAL, lon REAL,
                first_seen TEXT, last_seen TEXT,
                last_score REAL, last_verdict TEXT
            );
            CREATE TABLE IF NOT EXISTS price_history (
                mls TEXT, price INTEGER, seen_at TEXT,
                PRIMARY KEY (mls, price)
            );
            CREATE TABLE IF NOT EXISTS scans (
                scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT, regions TEXT,
                total_listings INTEGER, candidates INTEGER,
                agent_analyzed INTEGER, surfaced INTEGER
            );
        """)
        self.conn.commit()

    def upsert_listing(self, l: dict) -> dict:
        """Returns {'is_new': bool, 'price_drop': int|None} for delta detection."""
        now = _now()
        row = self.conn.execute(
            "SELECT price FROM listings WHERE mls = ?", (l["mls"],)
        ).fetchone()
        is_new = row is None
        price_drop = None
        if row and l["price"] and row["price"] and l["price"] < row["price"]:
            price_drop = row["price"] - l["price"]

        self.conn.execute("""
            INSERT INTO listings (mls, address, city, location, zip,
                property_type, price, beds, baths, sqft, lot_sqft, year_built,
                days_on_market, status, url, lat, lon, first_seen, last_seen)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(mls) DO UPDATE SET
                price=excluded.price, status=excluded.status,
                days_on_market=excluded.days_on_market,
                last_seen=excluded.last_seen
        """, (
            l["mls"], l["address"], l["city"], l["location"], l["zip"],
            l["property_type"], l["price"], l["beds"], l["baths"], l["sqft"],
            l["lot_sqft"], l["year_built"], l["days_on_market"], l["status"],
            l["url"], l["lat"], l["lon"], now, now,
        ))
        if l["price"]:
            self.conn.execute(
                "INSERT OR IGNORE INTO price_history (mls, price, seen_at) "
                "VALUES (?,?,?)", (l["mls"], l["price"], now))
        self.conn.commit()
        return {"is_new": is_new, "price_drop": price_drop}

    def record_verdict(self, mls: str, score: float, verdict: str):
        self.conn.execute(
            "UPDATE listings SET last_score=?, last_verdict=? WHERE mls=?",
            (score, verdict, mls))
        self.conn.commit()

    def record_scan(self, regions: str, total: int, candidates: int,
                    analyzed: int, surfaced: int):
        self.conn.execute(
            "INSERT INTO scans (started_at, regions, total_listings, "
            "candidates, agent_analyzed, surfaced) VALUES (?,?,?,?,?,?)",
            (_now(), regions, total, candidates, analyzed, surfaced))
        self.conn.commit()
