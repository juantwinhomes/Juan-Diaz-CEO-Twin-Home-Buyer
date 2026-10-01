"""Short 'what is it for' labels for each approval line."""
import re

PROPERTY_RULES = [
    ("Insurance", r"\bins\b|insurance"),
    ("Office rent", r"williams business park"),
    ("Dump & disposal", r"sanitary|recycling|landfill|recology|garbage|disposal|south bayside|bee green"),
    ("Utilities", r"pg&e|pacific gas|\bpge\b|comcast|xfinity|water|sewer|utility"),
    ("Permits & inspections", r"city of|county|planning|building ?planning|cdd|bus tax|inspection|getitrecorded|laboratory|3r report|dept of bldg|mygovpay|petaluma"),
    ("Building materials", r"home depot|lumber|supply|placemakers|ferguson|garden materials|lyngso|lyons|tile|stone|plastics|sod farm|pace supply|ogawa|build\.com|hardware|^invoice #"),
    ("Contractors & repairs", r"garage door|gutter|termite|recovery|enviro|bass and sons|sustainable|glass|windows|empire today|flooring|cabinet|plumb|electric(?!al co)|roof|clean"),
    ("Appliances & furnishings", r"amazon|wayfair|t ?j ?maxx|appliance|sleepyhead|furniture|target"),
    ("Listing & photos", r"open homes|cubicasa|printing|photo"),
    ("Equipment rental", r"rent(al|ls)"),
    ("Fuel, tolls & meals", r"gas|shell|chevron|arco|\b76\b|exxon|fastrak|uber|waymo|lyft|doordash|restaurant|chipotle|in-n-out|mcdonald|tacos|cafe|kitchen|omelette|meze|inn|safeway|town|amici"),
]

BRANDS = [
    (r"anthropic|claude", "Claude (Anthropic)"), (r"google ?\*?cloud", "Google Cloud"), (r"workspace", "Google Workspace"),
    (r"google voice", "Google Voice"), (r"google ?\*?svcs|google llc", "Google services"), (r"quickbooks|intuit", "QuickBooks"),
    (r"grok|xai", "Grok"), (r"zapier", "Zapier"), (r"lufthansa|deutsche luft", "Lufthansa"), (r"\btap\b|plusgrade", "TAP Air"),
    (r"aeromexico", "Aeromexico"), (r"amex ?travel|amextravel|pay with points|fine hotel|flight statement", "AmEx travel credits"),
    (r"fastrak", "FasTrak tolls"), (r"lyft", "Lyft"), (r"uber", "Uber"), (r"trailer hitch", "Trailer hitch"),
    (r"tire", "Tires"), (r"ford", "Ford service"), (r"lube|mechanic", "Car service"), (r"dmv", "DMV"),
    (r"a ?(&|and) ?a gas|shell|chevron|valero|arco|76|gas", "Gas"), (r"doordash|bt\*dd|dd \*", "DoorDash"), (r"instacart", "Instacart"),
    (r"apple store", "Apple Store"), (r"target", "Target"), (r"ferguson", "Ferguson"), (r"amazon", "Amazon"),
    (r"comcast|xfinity", "Comcast"), (r"t-mobile|tmobile|metro by", "T-Mobile"), (r"starlink", "Starlink"),
    (r"interest", "Card interest"), (r"past due|late fee", "Late fees"), (r"bristol", "Bristol West"), (r"foremost", "Foremost"),
    (r"notary", "Notary"), (r"bbb|better business", "BBB"), (r"homewise", "Homewise Docs"), (r"colon verona", "Colon Verona"),
    (r"williams business park", "Williams Business Park"), (r"facebook|facebk", "Facebook ads"), (r"propertyradar", "PropertyRadar"),
    (r"bing", "Bing ads"), (r"google ?\*?ads|^google$", "Google Ads"), (r"property leads", "Property Leads"), (r"semrush", "SEMrush"),
    (r"wp ?engine", "WP Engine"), (r"instantly", "Instantly"), (r"auto(mated)? genius", "Auto Genius"), (r"callrail", "CallRail"),
    (r"investorbase", "InvestorBase"), (r"shutterstock", "Shutterstock"), (r"godaddy", "GoDaddy"), (r"durable", "Durable"),
    (r"stockx", "StockX"), (r"melio", "Melio"), (r"flor|flowers", "Flowers"), (r"cvs", "CVS"),
]


def property_purpose(vendor, desc=""):
    t = f"{vendor} {desc}".lower()
    for name, pat in PROPERTY_RULES:
        if re.search(pat, t):
            return name
    return "Other"


def brand(vendor):
    t = (vendor or "").lower()
    for pat, name in BRANDS:
        if re.search(pat, t):
            return name
    v = (vendor or "").strip()
    for _ in range(3):
        v = re.sub(r"^(aplpay|tst\*|sq \*|in \*|bt\*)\s*", "", v, flags=re.I)
    v = re.split(r"\s{2,}|\d{3,}|\*", v)[0].strip(" -")
    return v.title() if v.isupper() else v or "Other"


def about(section, items, top=3):
    """[{label, amount}] for the biggest few purposes (property) or vendors (others)."""
    agg = {}
    for i in items:
        if i.get("adj"):
            continue
        k = property_purpose(i["vendor"], i.get("desc", "")) if section in ("property", "invoices") else brand(i["vendor"])
        agg[k] = agg.get(k, 0) + i["amount"]
    ranked = sorted(agg.items(), key=lambda kv: -kv[1])
    out = [{"label": k, "amount": round(v, 2)} for k, v in ranked[:top] if v > 0]
    if len(ranked) == 1:  # one purpose: the line total already says how much
        out = [{"label": ranked[0][0]}]
    rest = sum(v for k, v in ranked[top:])
    if len(ranked) > top and rest > 0.5:
        out.append({"label": f"{len(ranked) - top} more", "amount": round(rest, 2)})
    return out
