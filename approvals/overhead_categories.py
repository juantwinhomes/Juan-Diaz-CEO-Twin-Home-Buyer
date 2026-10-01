"""What each overhead charge is for. First matching rule wins (vendor + description,
case-insensitive). Charges whose tracker Bucket is filled in use BUCKETS instead."""
import re

RULES = [
    ("Bank, Interest & Fees", r"interest charge|past due fee|late fee|reinstatement fee|ez pay fee|balance adjust|annual fee|bank fee|melio\*melio"),
    ("Insurance", r"insurance|bristolwest|bristol west|foremost|geico|state farm|progressive ins"),
    ("Legal & Professional", r"notary|attorney|law office|legal|better business|\bbbb\b|homewise docs|cpa|bookkeep|colon verona|secretary of state|cslb"),
    ("Office Rent", r"williams business park|regus|wework|office rent"),
    ("Travel", r"airline|airlines|lufthansa|deutsche luft|aeromexico|volaris|\btap\b|plusgrade|kiwi\.com|renfe|amex ?travel|amextravel|fine hotel|online flight|hotel|hoteles|doubletree|ritz|marriott|hilton|sundance|car rental|national car|hertz|enterprise rent|uber(?! ?eats)|lyft|waymo|clipper|fastrak|tolls|parking|terminal a|priority pass|pwp american expr|pwp american express|gama ride|meyer feinkost airport|new stand ta14|venta abordo"),
    ("Vehicle & Fuel", r"gas|fuel|shell|chevron|valero|arco|\b76\b|union 76|phillips 66|marathon petro|holly 76|c-store trans|tire|lube|mechanic|trailer hitch|autozone|car wash|sunnyvale ford|\bford\b|tesla|dmv|auto pride|auto genius|blink charging"),
    ("Office Supplies & Equipment", r"apple store|best buy|target|amazon|ups store|fedex|ferguson|staples|office depot|dollar tree|home depot"),
    ("Meals & Entertainment", r"belmont double|san carlos do|doordash|bt\*dd|dd \*|instacart|shipt|uber ?eats|restaurant|ristorante|rest |taqueria|tacos|taco|pizz|sushi|chipotle|in-n-out|chick-fil|benihana|ihop|panda express|el pollo|burger|burbelmont|godfather|mel's|kitchen|cafe|coffee|starbucks|peets|donut|bagel|baguette|paneria|panaderia|gelat|baskin|softee|auntie anne|boudin|omelette|grill|broiler|mokambo|shiki|iron gate|shalizaar|lunardi|safeway|nob hill|market|supermarket|foods|liquor|vending|365 vend|nayax|cinepolis|bowlero|round1|massage|seville|sevilla|catedral|paseillo|heliopolis|americana|eskina|two sons|yummy|town - s|mendocino|lulus|groovy goose|toot sweet|orangerie|puro azahar|alfaro|gaviotas|nation's|third wheel|chuck|golden bell|thegrounds|placer v|b&g 23|bg 23|cheers|lunula|manga sushi|sinaloa|leos|maguey|authentic str|grulle|metate|charrito|el toro|king chuan|7-eleven"),
    ("Phone & Internet", r"t-mobile|tmobile|metro by|comcast|xfinity|starlink|viasat|answering service|google voice|justcall|twilio|efax"),
    ("Advertising", r"facebook|facebk|bing ads|google ads|propertyradar"),
    ("Software & Subscriptions", r"anthropic|claude|openai|chatgpt|grok|xai|perplexity|ai\.com|retell|google \*cloud|google\*cloud|google \*svcs|google\*svcs|google llc|workspace|google one|youtube|intuit|quickbooks|zapier|monday\.com|hubstaff|deputy|red cape|highlevel|go high level|signnow|godaddy|durable|plaud|dictanote|voice in plus|triplog|progress software|tloc|apple\.com|applecombill|apple\.com/bil|onlinejobs|taskrabbit|fireflies|icloud"),
    ("Shopping & Other", r"."),
]

BUCKETS = {
    "Travel": "Travel", "Vehicle/Field": "Vehicle & Fuel", "Meals/Entertainment": "Meals & Entertainment",
    "Software/Systems": "Software & Subscriptions", "Financial Drag": "Bank, Interest & Fees",
    "Protection": None,  # split below by expense type
    "Operations": "Office Supplies & Equipment", "Growth": "Shopping & Other",
}


def categorize(vendor, desc="", bucket="", expense_type=""):
    bucket, et = (bucket or "").strip(), (expense_type or "").strip()
    if bucket == "Protection":
        return {"Insurance": "Insurance", "Legal": "Legal & Professional"}.get(et, "Legal & Professional")
    if et in ("Internet/Phone",):
        return "Phone & Internet"
    if bucket in BUCKETS and BUCKETS[bucket]:
        return BUCKETS[bucket]
    text = f"{vendor} {desc}".lower()
    for name, pat in RULES:
        if re.search(pat, text):
            return name
    return "Shopping & Other"
