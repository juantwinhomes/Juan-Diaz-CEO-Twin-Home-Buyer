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
        _thread("a", [{"date": "2026-10-26T20:00:00Z", "sender": "title@escrowco.com", "toRecipients": [rules.JUAN],
                       "subject": "Close of escrow docs", "snippet": ""}]),
        _thread("b", [{"date": "2026-10-26T20:00:00Z", "sender": "title@escrowco.com",
                       "subject": "Close of escrow docs", "snippet": ""},
                      {"date": "2026-10-26T21:00:00Z", "sender": rules.JUAN,
                       "subject": "Re: Close of escrow docs", "snippet": "signed"}]),
    ]}
    a, b = sorted(triage_all(data, NOW), key=lambda t: t.thread_id)
    assert a.awaiting_juan and a.overdue          # URGENT waiting 3.75h > 2h limit
    assert not b.awaiting_juan and not b.overdue  # Juan replied last


def test_tax_and_district_attorney_matters_are_legal():
    _, cats, _ = classify("IRS audit reports - signature required", "attached reports", "x@examplelaw.com")
    assert "legal" in cats
    p, cats, _ = classify("District attorney matter prep", "", "staff@twinhomebuyer.com")
    assert p == rules.URGENT and "legal" in cats


def test_money_and_construction_words():
    assert "financial" in classify("Monthly cost review", "revenue and gross profit", "a@twinhomebuyer.com")[1]
    assert "construction" in classify("Septic work quote received", "three bids", "a@twinhomebuyer.com")[1]


def test_newsletters_with_dollar_amounts_are_noise():
    assert prio("Big company owes $25 billion", "Read online", "crowd@mail.beehiiv.com") == rules.NOISE


def test_robots_and_cc_only_threads_are_not_waiting_on_juan():
    data = {"threads": [
        _thread("robot", [{"date": "2026-10-26T20:00:00Z", "sender": "no-reply@accounts.google.com",
                           "toRecipients": [rules.JUAN], "subject": "Security alert", "snippet": ""}]),
        _thread("cc", [{"date": "2026-10-26T20:00:00Z", "sender": "a@twinhomebuyer.com",
                        "toRecipients": ["b@twinhomebuyer.com"], "ccRecipients": [rules.JUAN],
                        "subject": "Trees delivery date", "snippet": ""}]),
        _thread("to", [{"date": "2026-10-26T20:00:00Z", "sender": "a@twinhomebuyer.com",
                        "toRecipients": [rules.JUAN], "subject": "Invoice for 27 Prague", "snippet": ""}]),
    ]}
    r = {t.thread_id: t for t in triage_all(data, NOW)}
    assert not r["robot"].awaiting_juan
    assert not r["cc"].awaiting_juan and r["cc"].cc_only
    assert r["to"].awaiting_juan
