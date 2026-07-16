"""ATTOM provider — phase 2 (not yet implemented).

ATTOM adds what RentCast can't see: foreclosure/pre-foreclosure status, deed and
mortgage history, tax delinquency, true ownership duration, and AVMs. Those are
the strongest off-market distress signals.

Planned endpoints (https://api.developer.attomdata.com/):
  property/detail          — records, ownership, assessor data
  saleshistory/detail      — deed transfers (ownership duration)
  allevents/detail         — foreclosure, default, auction events
  attomavm/detail          — AVM values

Requires ATTOM_API_KEY. Implement once the RentCast prototype is producing
reviewed opportunities and the team wants pre-MLS distress leads.
"""
from __future__ import annotations


class AttomNotImplemented(NotImplementedError):
    pass


def fetch_distress_signals(*_args, **_kwargs):
    raise AttomNotImplemented(
        "ATTOM integration is phase 2. Set up the RentCast pipeline first."
    )
