from datetime import datetime, timezone

from email_agent import rules
from email_agent.triage import classify, triage_all

NOW = datetime(2026, 10, 26, 23, 45, tzinfo=timezone.utc)


def prio(subject, snippet="", sender="someone@twinhomebuyer.com"):
    return classify(subject, snippet, sender)[0]


def test_juans_urgent_categories():
    assert prio("Closing date moved for 27 Prague", "escrow officer says") == rules.URGENT
    assert prio("Wire instructions for EMD") == rules.URGENT
    assert prio("Demand letter from tenant attorney") == rules.URGENT
    assert prio("Final inspection failed at Norton") == rules.URGENT
    assert prio("Water damage at 460 5th Ave", "pipe burst overnight") == rules.URGENT


def test_city_gov_sender_is_urgent():
    assert prio("Sales - 915 52nd St", "", "Sneha@acgov.org") == rules.URGENT


def test_electrical_wire_is_not_a_bank_wire():
    _, cats, _ = classify("Norton electric heaters", "need 12 gauge wire and breakers", "jd@twinhomebuyer.com")
    assert "wire" not in cats


def test_company_name_is_not_a_lead():
    assert prio("Hello", "Juan Diaz, Twin Home Buyer") == rules.FYI


def test_robots_cannot_be_urgent():
    p = prio("Peninsula Plumbing - Emergency: New missed call", "", "google-workspace-alerts-noreply@google.com")
    assert p == rules.ACTION
    assert prio("Meeting records", "discussed close of escrow", "meetings-noreply@google.com") == rules.NOISE


def test_newsletter_is_noise():
    assert prio("Coming Soon in Lower Bal at $749K", "", "listings@redfin.com") == rules.NOISE


def _thread(tid, msgs):
    return {"id": tid, "messageCount": len(msgs), "messages": msgs}


def test_unreplied_and_overdue():
    data = {"threads": [
        _thread("a", [{"date": "2026-10-26T20:00:00Z", "sender": "title@escrowco.com",
                       "subject": "Close of escrow docs", "snippet": ""}]),
        _thread("b", [{"date": "2026-10-26T20:00:00Z", "sender": "title@escrowco.com",
                       "subject": "Close of escrow docs", "snippet": ""},
                      {"date": "2026-10-26T21:00:00Z", "sender": rules.JUAN,
                       "subject": "Re: Close of escrow docs", "snippet": "signed"}]),
    ]}
    a, b = sorted(triage_all(data, NOW), key=lambda t: t.thread_id)
    assert a.awaiting_juan and a.overdue          # URGENT waiting 3.75h > 2h limit
    assert not b.awaiting_juan and not b.overdue  # Juan replied last
