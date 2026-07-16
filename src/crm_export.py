"""Export qualifying opportunities to the CRM.

Always writes reports/crm_export.csv. If GHL_WEBHOOK_URL is set, also POSTs
each qualifying property to that GoHighLevel inbound webhook as JSON.
"""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path

import requests

CSV_FIELDS = [
    "address", "city", "state", "zip", "status", "asking_price",
    "expected_purchase_price", "estimated_arv", "repair_low", "repair_high",
    "projected_net_profit", "roi_on_total_cost", "mao", "opportunity_score",
    "confidence", "action", "top_risks", "distress_evidence", "source", "retrieved_at",
]


def export(rows: list[dict], out_path: Path, webhook_url: str | None = None) -> list[str]:
    """Write CRM CSV; POST to webhook when configured. Returns log messages."""
    logs: list[str] = []
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    logs.append(f"CRM export: {len(rows)} properties -> {out_path}")

    url = webhook_url if webhook_url is not None else os.environ.get("GHL_WEBHOOK_URL", "").strip()
    if url:
        for row in rows:
            try:
                resp = requests.post(url, json=row, timeout=15,
                                     headers={"Content-Type": "application/json"})
                resp.raise_for_status()
                logs.append(f"GHL webhook OK: {row['address']}")
            except requests.RequestException as exc:
                logs.append(f"GHL webhook FAILED for {row['address']}: {exc}")
    return logs
