"""Triage rules for Juan's inbox (juan@twinhomebuyer.com).

Edit THIS file when the Q&A Log shows a miss. Every keyword list is matched
case-insensitively against subject + snippet (+ sender for SENDER_RULES).

Priority levels:
    URGENT  - Juan should see it within the hour (escrow, wires, legal,
              city/permits, job-site emergencies, account security).
    ACTION  - Needs Juan's decision or reply today (financial, construction,
              team asking a question, leads).
    FYI     - Worth knowing, no reply needed.
    NOISE   - Newsletters, marketing, automated receipts.
"""

JUAN = "juan@twinhomebuyer.com"
TEAM_DOMAIN = "twinhomebuyer.com"

URGENT, ACTION, FYI, NOISE = "URGENT", "ACTION", "FYI", "NOISE"
PRIORITY_ORDER = [URGENT, ACTION, FYI, NOISE]

# Category -> (priority, keywords). Order matters only for display.
CATEGORIES = {
    "escrow": (URGENT, [
        "escrow", "title company", "closing date", "closing on", "close of escrow", "coe",
        "earnest money", "emd", "settlement statement", "hud-1", "alta",
        "closing disclosure", "deed recorded", "payoff", "did it close",
        "contingency", "contingencies", "disclosures", "addendum",
        "purchase agreement", "counter offer", "counteroffer",
    ]),
    "wire": (URGENT, [
        # Not bare "wire": on a job site that means electrical wire.
        "wire transfer", "wire payment", "wire payments", "wire instructions",
        "incoming wire", "outgoing wire", "set up wires", "wire fraud",
        "wire approval", "wire the funds", "ach", "routing number", "account ending",
        "dual custody", "bank login", "wells fargo", "funds transfer",
        "transferred", "release $", "release funds",
    ]),
    "legal": (URGENT, [
        "attorney", "lawyer", "lawsuit", "litigation", "subpoena", "lien",
        "mechanics lien", "notice of default", "foreclosure", "eviction",
        "unlawful detainer", "demand letter", "breach", "cease and desist",
        "court", "summons", "legal", "settlement agreement", "notarize",
        "irs", "audit", "tax attorney", "district attorney", "da matter",
        "franchise tax board", "ftb", "deposition", "subpoenaed",
    ]),
    "city_permits": (URGENT, [
        "permit", "permits", "inspection", "inspector", "building department",
        "planning department", "code enforcement", "violation", "red tag",
        "stop work", "certificate of occupancy", "final inspection",
        "city of", "county of", "assessor", "acgov", "smcgov", "pg&e",
        "service upgrade", "panel upgrade", "120a", "200a",
    ]),
    "jobsite_emergency": (URGENT, [
        "emergency", "flood", "flooding", "leak", "burst", "fire", "gas leak",
        "break-in", "broke in", "stolen", "theft", "vandal", "injury",
        "injured", "accident", "police", "no power", "sewage", "sewer backup",
        "plumbing issue", "water damage",
    ]),
    "account_security": (ACTION, [
        "security alert", "account was recovered", "new login", "re-auth",
        "password changed", "suspicious", "sign-in attempt", "2-step",
    ]),
    "financial": (ACTION, [
        "invoice", "payment", "paid", "bill", "billing", "rent", "rents",
        "loan", "lender", "draw", "hard money", "refinance", "appraisal",
        "credits", "budget", "accounting", "quickbooks", "bookkeeping",
        "tax", "insurance", "$", "payments", "revenue", "profit", "gross profit",
        "cash flow", "p&l", "assessment", "irs", "invoices", "expenses",
    ]),
    "construction": (ACTION, [
        "contractor", "electrician", "plumber", "plumbing", "roof", "hvac", "kitchen", "bath", "drywall", "paint", "flooring",
        "materials", "delivery", "scope", "change order", "rehab", "repairs",
        "demo", "framing", "electrical", "heaters", "landscaping", "trees",
        "window install", "new windows", "windows delivery", "septic", "bid",
        "bids", "estimate", "foundation", "sewer lateral", "panel",
    ]),
    "billing_alert": (ACTION, [
        "out of usage credits", "payment failed", "past due", "card declined",
        "service suspended", "final notice",
    ]),
    "deal_lead": (ACTION, [
        "missed call", "new text message", "voicemail", "motivated seller",
        "sell my house", "offer", "cash offer", "under contract", "assignment",
        "wholesale", "comps", "arv", "open house", "listing", "buyers",
    ]),
}

# Senders that are ALWAYS noise, whatever the text says.
NOISE_SENDERS = [
    "listings@redfin.com", "nextdoor.com", "meetings-noreply@google.com",
    "newsletter", "marketing", "no-reply@zillow.com", "notifications@linkedin.com",
    "beehiiv.com", "substack.com", "mailchimp", "nextdoor.com",
]

# Automated senders (alerts, notifications). Capped at ACTION: a robot can't
# create an URGENT item by itself. Categories in AUTOMATED_KEEP stay ACTION;
# anything else from a robot drops to FYI.
AUTOMATED_SENDER_HINTS = ["noreply", "no-reply", "notifications@", "alerts", "txt.voice.google.com"]
AUTOMATED_KEEP = {"account_security", "deal_lead", "escrow", "wire", "legal", "city_permits", "billing_alert"}

# Text that marks noise unless a URGENT category also matched.
NOISE_KEYWORDS = [
    "unsubscribe", "webinar", "newsletter", "% off", "coming soon in",
    "new listing", "price drop", "read online", "view in browser",
]

# Sender patterns that bump a match up one level (e.g. a city .gov address).
PRIORITY_SENDERS = {
    ".gov": URGENT,
    "gov.org": URGENT,      # county domains: acgov.org, smcgov.org
    "@cityof": URGENT,
    "escrow": URGENT,
    "title": URGENT,
    "law": URGENT,
}

# Wire safety: never draft a reply that confirms or changes banking details.
WIRE_SAFETY_NOTE = (
    "WIRE SAFETY: do not confirm, send, or change wire/bank details by email. "
    "Verify by phone using a number already on file."
)

# How long a thread can sit without Juan's reply before it shows as overdue.
UNREPLIED_HOURS = {URGENT: 2, ACTION: 24, FYI: None, NOISE: None}
