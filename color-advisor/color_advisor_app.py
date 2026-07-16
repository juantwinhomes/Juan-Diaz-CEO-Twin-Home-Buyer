#!/usr/bin/env python3
"""color-advisor — Twin Home Buyer exterior color recommendation app.

ONE input: a property address, or a Zillow / Redfin / Realtor / Google Maps
link. Claude researches the property on the web and applies the trained 2026
color framework. The recommendation is shown with a real visual color
palette — actual swatches, not just paint codes — and saved as both .md and
a shareable .html report.

Connects to Claude through the Claude Code CLI (your existing `claude`
login — no API keys). On startup the app VERIFIES the login and helps you
fix it if anything is missing.

Two ways to use it:
  Window:  python color_advisor_app.py
  CLI:     python color_advisor_app.py "123 Main St, Petaluma CA"

Requires: Python 3.8+ and Claude Code (https://claude.com/claude-code)
"""

import re
import shutil
import subprocess
import sys
import threading
from datetime import date
from html import escape
from pathlib import Path

TRENDS = "# 2026 Exterior Color Trends — Flip Decision Guide\n\nResearched July 2026. Use this to pick exterior colors for flip properties.\nWhen a sample property photo arrives, run it through the decision framework at\nthe bottom and pick from these trend-backed options.\n\n## The big picture for 2026\n\n- **Warm earth tones have replaced cool grays.** Gray is no longer the default\n  on new construction; warm neutrals photograph better and appeal to more buyers.\n- **Sage/muted green is the #1 trend color.** Houzz 2026 data: green-family\n  exterior paints up 34% in project saves vs 2024 — more than any other family.\n- **Creamy whites replaced stark white.** Warm charcoal replaced blue-gray.\n- **Colors of the Year:** Sherwin-Williams *Universal Khaki* (SW 6150),\n  Benjamin Moore *Silhouette* (AF-655, burnt umber/charcoal), PPG *Warm Mahogany*.\n- Northern California specifically: olive greens, muted sage, smoky green-grays\n  paired with stone, wood, black windows, and warm white trim.\n\n## Trend-backed color shortlist (by role)\n\n### Body / siding\n| Color | Code | Character | Best on |\n|---|---|---|---|\n| Universal Khaki | SW 6150 | Warm earthy neutral, 2026 COTY | Safe resale pick, any style |\n| Alabaster | SW 7008 | Creamy warm white | Timeless, brightens small homes |\n| Balboa Mist | BM OC-27 | Soft greige | Bridges traditional + modern buyers |\n| Sea Salt | SW 6204 | Soft green w/ blue undertone | Cottages, landscaped lots |\n| Evergreen Fog | SW 9130 | Muted green-gray | Ranch homes, wooded/mature lots |\n| Smoky Green | BM CC-700 | Gentle green-gray | Larger facades |\n\n### Trim\n- Warm white (Alabaster) against green or khaki bodies.\n- Black/bronze window and roofline accents remain strong.\n\n### Front door (highest ROI accent)\n- **Deep charcoal, dark warm bronze, warm black** — strongest 2026 resale door colors.\n- **Navy blue** — still associated with ~$1,500 higher sale prices.\n- Urbane Bronze (SW 7048), Wrought Iron (BM 2124-10) for door/trim/accents.\n\n### Warm-climate accents\n- Terra Cotta Tile (BM 2090-30), Southwest Pottery — accent-only, pairs with wood.\n\n## Decision framework for a specific property\n\nScore the property photo on these, then pick:\n\n1. **Fixed elements first** — roof color, stone/brick, driveway. The body color\n   must flatter what's not changing. (Warm roof → khaki/greige family;\n   gray roof → green-gray family.)\n2. **House style** — Ranch: sage/Evergreen Fog with warm white trim is the 2026\n   sweet spot. Traditional/cottage: Sea Salt or Alabaster. Modern: greige or\n   deeper green-gray with black trim.\n3. **Lot & landscaping** — mature trees/landscaping strengthen the case for\n   greens; bare lots lean warm neutral (khaki/greige) so the house doesn't\n   look unfinished.\n4. **Neighborhood comps** — the flip should read current but not be the odd\n   house out. If the street is all beige, a muted sage stands out (good);\n   a dark moody body may be too far (risk).\n5. **Small house rule** — light warm colors (Alabaster, Balboa Mist) make small\n   homes look bigger; save deep tones for the door.\n6. **Photography test** — warm neutrals and muted greens photograph better than\n   stark white or cool gray. Listing photos drive showings.\n\n**Default flip formula for 2026 (Northern California):**\nmuted sage/green-gray or warm khaki body + warm white trim + warm black or\nnavy door + black/bronze fixtures + landscape per `color-palette.md`\n(redwood, dark mulch, lavender/silver planting).\n\n## Relationship to the Petaluma yard palette\n\nThe existing curb-appeal palette (`training/color-palette.md`) is\ntrend-aligned: warm redwood = the warm-brown 2026 direction (PPG Warm\nMahogany family), dark mulch + silver-green + lavender = the\nnature-grounded look buyers save on Houzz. If the Petaluma house gets\nrepainted, Universal Khaki or Evergreen Fog body with Alabaster trim keeps\nthe beige-family harmony with the redwood box; the navy door already matches\n2026 resale data.\n\n## Sources\n\n- brickandbatten — Top Paint Colors of 2026\n- Sherwin-Williams / HGTV Home — 2026 Color Collection of the Year\n- Benjamin Moore — Color of the Year 2026 (Silhouette AF-655)\n- PPG — 2026 Trends (Warm Mahogany)\n- Milgard — Exterior Home Color Trends 2026\n- New Home Star — Home Builder's Guide to 2026 Paint Trends\n- Home-Stretch — Best Exterior Paint Colors That Help Homes Sell Faster\n- Facade Colorizer — Sage Green Exterior Paint Guide 2026 (Houzz +34% data)\n- Trico Painting / Davis Painting — Northern California 2026 color guides\n"

EXAMPLE = "# Sample Property Color Decision — Small Green Ranch (July 2026)\n\nWorked example of applying `2026-color-trends.md` to a real property photo.\nKeep this format for future property color calls.\n\n## Property read (fixed elements first)\n\n- Small single-story ranch/bungalow, shingle siding, dated pale celery-mint\n  green with white trim; street-facing garage with matching mint door.\n- Light gray composition roof + warm gray concrete driveway → cool/neutral\n  fixed elements → green-gray family over khaki/beige.\n- Mature landscaping (boxwood hedges, lawn, weeping birch) → supports a green\n  body color.\n- Street comps: cream/brick house on one side, terracotta-orange on the other\n  → muted sage differentiates without being the odd house out.\n- Small footprint → mid-light body (small-house rule); deep tones door-only.\n\n## Decision\n\n| Element | Color | Rationale |\n|---|---|---|\n| Body/siding | Evergreen Fog SW 9130 | 2026 ranch sweet spot; suits gray roof + mature landscaping; modernizes existing green character |\n| Trim/fascia | Alabaster SW 7008 | Creamy warm white, not stark |\n| Garage door | Body color (Evergreen Fog) | Street-facing door must recede, not accent |\n| Front door | Warm black / Urbane Bronze SW 7048 (alt: navy for resale data) | Single accent moment |\n| Fixtures/numbers | Matte black | Current, ties to door |\n| Picket fence | Fresh Alabaster or remove | Weathered fence drags the frontage |\n\nRunner-up scheme: Universal Khaki SW 6150 body + Alabaster trim + black door\n(max-safety neutral) — rejected here because the lot's landscaping and the\norange neighbor make the sage work harder.\n\n## Reusable rules confirmed by this example\n\n1. Street-facing garage doors get the body color, never an accent.\n2. Mature landscaping → green family; bare lot → warm neutral.\n3. Small house → mid-light body, accent saved for the door.\n4. Always check both neighbors before committing a body color.\n5. Note the free wins in every assessment (power-wash, fence paint, debris).\n"

STRATEGY = '# Palette Purchasing Strategy — built from EQUITY TRACK\'s own HD data\n\nDerived from `data/purchase-history-2024-2026.csv` (order-level; see\ndata-limits note at bottom). Companion to `2026-color-trends.md` and\n`purchase-history-knowledge.md`.\n\n## What the purchase data shows\n\n| Pattern | Number | Meaning |\n|---|---|---|\n| Returns | **810 transactions, -$95,499** (21% of all transactions) | Heavy over-buy-and-return churn — trips, restocking risk, price-protection losses |\n| Small runs | 634 purchases under $100 ($33k) | Truck-run tax: labor hours spent on sub-$100 store trips |\n| Median order | $195 | Buying is reactive/as-needed, not staged |\n| Spend curve | 69% of project spend in the FIRST third, only 10% in the final third | Finish materials (paint included) are bought late, small, and piecemeal |\n| Orders per project | avg 48 per flip | ~48 separate buying events per property |\n| Online share | 6% | Almost everything is in-store trips |\n\n## The strategy: standardize the palette, then buy it like inventory\n\nBecause EQUITY TRACK runs ~20+ flips/year with a $12.4k median HD materials\nbudget each, a **fixed company palette** turns paint from a per-house custom\ndecision into a repeatable SKU list:\n\n### 1. The standard EQUITY TRACK exterior palette (from the 2026 framework)\n\n| Role | Primary | Alternate (warm-roof houses) |\n|---|---|---|\n| Body A (green-gray) | Evergreen Fog SW 9130 / Behr match | — |\n| Body B (warm neutral) | Universal Khaki SW 6150 / Behr match | Balboa Mist (greige) |\n| Body C (cottage) | Sea Salt SW 6204 / Behr "Softened Green" PPU10-14 | — |\n| Trim (always) | Alabaster SW 7008 / Behr "Swiss Coffee" #12 | — |\n| Door accent | Naval SW 6244 or Urbane Bronze SW 7048 | — |\n| Fixtures | Matte black | — |\n\nThe color-advisor app picks WHICH body color per property; the SKUs stay\nconstant. Three body colors + one trim + two doors covers ~every flip.\n\n### 2. Buying rules the palette enables\n\n- **Stage one finish order per project** instead of piecemeal: when a\n  project enters its final third, place ONE consolidated order (paint from\n  the standard palette + the app\'s shopping list). Target: cut the ~48\n  orders/project meaningfully.\n- **Buy trim paint in bulk**: Alabaster/Swiss Coffee is on every house —\n  buy 5-gal buckets on Pro pricing, hold 2-3 in inventory; it never\n  strands (next flip always uses it).\n- **Order online for pickup** (only 6% today): consolidating to known SKUs\n  makes online ordering trivial and kills small store runs.\n- **Attack the return rate**: standard SKUs mean leftover paint transfers\n  to the next project instead of going back to the store. Target returns\n  under 10% of transactions (from 21%).\n- Keep coding tools separately ("pps tools") and ALWAYS enter the job name\n  (25% of historic spend is unattributed).\n\n### 3. What this is worth (rough)\n\n- Returns churn: even halving the -$95k/31mo return flow saves labor and\n  price-protection leakage worth thousands/yr.\n- 634 sub-$100 runs ≈ hundreds of crew-hours; consolidated staging\n  reclaims most of them.\n- Bulk 5-gal trim + Pro-desk quotes on staged orders: typically 10-20%\n  under shelf on paint.\n\n## Data limits — what we still can\'t see\n\nThe current export is ORDER-level: dates, jobs, totals — **no SKUs, no\nproduct names, no paint colors**. To analyze what was actually ordered\n(brands, colors, quantities), export the ITEM-level history: Home Depot\nPro Xtra → Purchase Tracking → include item detail / itemized receipts.\nOnce provided, update this file with: actual paint spend share, brands\nbought, and whether current buying already clusters around any colors.\n'

INSTALL_HELP = (
    "Claude Code is not installed on this PC yet.\n\n"
    "1. Open PowerShell (Start menu, type: powershell)\n"
    "2. Paste this and press Enter:\n\n"
    "   irm https://claude.ai/install.ps1 | iex\n\n"
    "3. Close PowerShell, open it again, then reopen this app —\n"
    "   it will walk you through login."
)

LOGIN_HELP = (
    "Claude Code is installed but you are NOT logged in yet.\n\n"
    "Click 'Log in now' to open the Claude login window — your browser\n"
    "will ask you to sign in with your Claude account\n"
    "(Pro, Max, Team, or Enterprise plan required).\n\n"
    "When the browser confirms, close that window and click\n"
    "'Check login' here. You only do this once."
)

PROMPT_TEMPLATE = """You are the color advisor for Twin Home Buyer, a house-flipping business.

Property (address or listing link): {query}

Research this property on the web yourself:
1. Use WebSearch to find it — search the address plus "zillow", "redfin",
   and "realtor.com". If the input is already a listing URL, start there.
2. Use WebFetch on the best listing / property-record pages you find.
3. Extract every exterior fact you can: house style, year built, stories,
   square footage, roof type/material, exterior siding material and current
   color if described, garage (attached? street-facing?), lot size and
   landscaping maturity, neighborhood character.

Then decide the best exterior color scheme for THIS property by applying the
trained 2026 framework below, exactly as written.

=== TRAINED FRAMEWORK (source of truth) ===
{trends}

=== WORKED EXAMPLE (follow this rigor) ===
{example}

=== COMPANY PALETTE & PURCHASING STRATEGY (EQUITY TRACK standard) ===
{strategy}

=== YOUR TASK ===
Produce a markdown report with exactly these sections:

# Color Recommendation — {query}

## What I found
Bullet the property facts you confirmed from the web (with which site each
came from), covering style, year, roof, siding, garage, lot/landscaping,
neighborhood. Only state facts you actually found — never invent.

## Recommended scheme
A table: Element | Color (name + code + approx hex) | Rationale.
Cover body/siding, trim, garage door (if street-facing: body color rule),
front door, fixtures/numbers.
IMPORTANT: choose the body color from the COMPANY STANDARD PALETTE
(Body A: Evergreen Fog / Body B: Universal Khaki / Body C: Sea Salt),
trim is ALWAYS Alabaster, door is Naval or Urbane Bronze — deviate only if
a confirmed fixed element forces it, and say why.

## Runner-up
One alternative scheme (also from the standard palette) and why it lost.

## Budget check
Estimate the total paint + supplies cost for this property from the
shopping list quantities and typical Home Depot pricing. Then put it in
company context: EQUITY TRACK's median TOTAL Home Depot materials budget
per flip is $12,406 (mean $16,024) — state what share of a typical
project budget this paint job represents, and flag if the property's size
makes it likely to run above the company median.

## Verify before painting
Since you worked from listing data rather than viewing photos, list the 2-3
specific things Juan should eyeball in a photo or drive-by that could change
the call (e.g. actual roof color temperature, neighbor colors, masonry).

## Free wins
2-3 cheap curb-appeal fixes typical for this property type/age.

## Home Depot shopping list
A ready-to-buy list for the recommended scheme. Home Depot sells Behr, not
Sherwin-Williams, so for each paint pick give the closest BEHR equivalent
(name + code) and note it can also be color-matched to the SW color in store.
Estimate quantities from the square footage you found (exterior body: ~1 gal
per 350 sq ft per coat, 2 coats; trim: ~1 gal per 750 linear-ish ft, round
up). Include primer, caulk, painter's tape, rollers/brushes.
Format as a table: Item | Product | Qty | Link — where Link is a Home Depot
search URL of the form https://www.homedepot.com/s/behr%20marquee%20exterior%20satin
(URL-encode the query; use specific queries per product). Do not invent
direct product-page URLs — search URLs only.
Apply the company purchasing rules: trim paint (Alabaster/Swiss Coffee) in
5-gallon buckets — note "pull from standing inventory if available"; frame
the list as ONE consolidated finish-phase order for online pickup, not
multiple store runs; remind to enter the job name (property address) at
checkout so spend is attributed.

## AI render prompt
A paste-ready prompt Juan can use with any AI image tool (attaching the
listing photo) to generate a photorealistic "after" image. Put it in a
fenced code block. It must state: keep the house structure and photo
unchanged except colors; repaint body/trim/garage/door with the exact hex
values of the recommended scheme; matte black fixtures; bright daylight,
real-estate listing photo style; no other alterations.

## Palette
A machine-readable palette of the RECOMMENDED scheme, one line per element,
inside a fenced code block exactly like this (accurate 6-digit hex for each
paint color, no extra text in the block):

```palette
Body|Evergreen Fog SW 9130|#95978A
Trim|Alabaster SW 7008|#EDEAE0
Front door|Naval SW 6244|#1F3A5F
Fixtures|Matte black|#26221E
```

Rules: pick colors ONLY from the trained shortlist unless a confirmed fixed
element forces otherwise (then say why). Be decisive — one recommended
scheme, not a menu. If you genuinely cannot find the property at all, say so
plainly and give the safe default flip scheme from the framework instead.

OUTPUT FORMAT — critical: your entire final response must be the raw markdown
report itself, starting with the "# Color Recommendation" heading. Do NOT
write files, do NOT attach or send files, and do NOT reply with a summary or
commentary — your response text IS the report."""


GROK_KEY_FILE = Path.home() / ".color_advisor_grok_key"


def load_grok_key():
    import os
    key = os.environ.get("XAI_API_KEY", "").strip()
    if key:
        return key
    if GROK_KEY_FILE.exists():
        return GROK_KEY_FILE.read_text().strip()
    return ""


def save_grok_key(key):
    try:
        GROK_KEY_FILE.write_text(key.strip())
    except Exception:
        pass


def extract_render_prompt(report):
    m = re.search(r"## AI render prompt\s*```[a-z]*\n(.*?)```", report, re.DOTALL)
    return m.group(1).strip() if m else ""


def grok_after_image(api_key, image_ref, prompt, out_path):
    """Call xAI Grok image-edits API to repaint the listing photo.

    image_ref: a public image URL, or a local file path (sent as data URI).
    Saves the result PNG/JPG to out_path. Returns out_path.
    """
    import base64
    import json
    import urllib.request

    ref = image_ref.strip()
    if not ref.lower().startswith(("http://", "https://", "data:")):
        f = Path(ref)
        if not f.is_file():
            raise RuntimeError(f"Photo not found: {ref}")
        ext = f.suffix.lower().lstrip(".") or "jpeg"
        if ext == "jpg":
            ext = "jpeg"
        ref = f"data:image/{ext};base64," + base64.b64encode(f.read_bytes()).decode()

    body = json.dumps({
        "model": "grok-imagine-image-quality",
        "prompt": prompt,
        "image": ref,
        "response_format": "b64_json",
    }).encode()
    req = urllib.request.Request(
        "https://api.x.ai/v1/images/edits",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"Grok API error {e.code}: {detail}")
    img = decode_grok_response(payload)
    out_path.write_bytes(img)
    return out_path


def decode_grok_response(payload):
    """Handle both b64_json and url response shapes."""
    import base64
    import urllib.request

    data = (payload or {}).get("data") or []
    if not data:
        raise RuntimeError("Grok returned no image: " + str(payload)[:300])
    item = data[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        with urllib.request.urlopen(item["url"], timeout=120) as r:
            return r.read()
    raise RuntimeError("Unrecognized Grok response shape: " + str(item)[:300])


def find_claude():
    """Locate the claude CLI, checking common install paths too."""
    path = shutil.which("claude")
    if path:
        return path
    candidates = [
        Path.home() / ".local" / "bin" / "claude",
        Path.home() / ".local" / "bin" / "claude.exe",
        Path.home() / "AppData" / "Roaming" / "npm" / "claude.cmd",
        Path("/usr/local/bin/claude"),
        Path("/opt/homebrew/bin/claude"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def verify_login(claude_bin):
    """Verify the Claude CLI is authenticated by making a tiny real request."""
    try:
        result = subprocess.run(
            [claude_bin, "-p", "Reply with exactly the word: OK"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return False, "Login check timed out — check your internet connection."
    out = (result.stdout or "") + (result.stderr or "")
    if result.returncode == 0 and "OK" in result.stdout.upper():
        return True, "Logged in to Claude — ready."
    lowered = out.lower()
    if any(k in lowered for k in ("login", "log in", "api key", "authent", "credential", "unauthorized")):
        return False, "not_logged_in"
    return False, "Claude CLI error:\n" + out[-800:]


def open_login_window(claude_bin):
    """Open an interactive `claude` session in a new terminal for login."""
    try:
        if sys.platform.startswith("win"):
            subprocess.Popen([claude_bin], creationflags=subprocess.CREATE_NEW_CONSOLE)
        elif sys.platform == "darwin":
            subprocess.Popen(
                ["osascript", "-e", f'tell app "Terminal" to do script "{claude_bin}"']
            )
        else:
            for term in ("x-terminal-emulator", "gnome-terminal", "xterm"):
                if shutil.which(term):
                    subprocess.Popen([term, "-e", claude_bin])
                    break
        return True
    except Exception:
        return False


def slugify(text):
    s = re.sub(r"https?://", "", text.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "property"


def parse_palette(report):
    """Extract [(element, color name, #hex), ...] from the report.

    Prefers the fenced ```palette block; falls back to scanning the
    recommended-scheme table for hex codes.
    """
    swatches = []
    m = re.search(r"```palette\s*\n(.*?)```", report, re.DOTALL)
    if m:
        for line in m.group(1).strip().splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3 and re.fullmatch(r"#[0-9A-Fa-f]{6}", parts[2]):
                swatches.append((parts[0], parts[1], parts[2].upper()))
    if not swatches:
        for line in report.splitlines():
            hexes = re.findall(r"#[0-9A-Fa-f]{6}\b", line)
            if hexes and "|" in line:
                cells = [c.strip() for c in line.strip("|").split("|")]
                if len(cells) >= 2:
                    swatches.append((cells[0], re.sub(r"\(.*?\)", "", cells[1]).strip(), hexes[0].upper()))
    return swatches


def pick_colors(swatches):
    """Map palette swatches to house parts with sensible fallbacks."""
    c = {"body": "#B5A488", "trim": "#EDEAE0", "door": "#1F3A5F",
         "garage": None, "fixtures": "#26221E"}
    for el, _name, h in swatches:
        e = el.lower()
        if "body" in e or "siding" in e:
            c["body"] = h
        elif "trim" in e or "fascia" in e:
            c["trim"] = h
        elif "garage" in e:
            c["garage"] = h
        elif "door" in e:
            c["door"] = h
        elif "fixture" in e or "number" in e:
            c["fixtures"] = h
    if not c["garage"]:
        c["garage"] = c["body"]
    return c


def house_svg(colors):
    """Illustrated house preview painted in the recommended colors."""
    b, t, d, g, f = (colors["body"], colors["trim"], colors["door"],
                     colors["garage"], colors["fixtures"])
    return f'''<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg" role="img">
<rect width="560" height="300" fill="#DDE3DC"/>
<rect y="235" width="560" height="65" fill="#4E8A3C"/>
<polygon points="255,235 330,235 360,300 225,300" fill="#B3ADA0"/>
<polygon points="60,110 300,110 280,60 80,60" fill="#8A8A85"/>
<rect x="70" y="108" width="220" height="127" fill="{b}"/>
<rect x="66" y="104" width="228" height="8" fill="{t}"/>
<rect x="90" y="130" width="60" height="50" fill="#D8DEE2" stroke="{t}" stroke-width="5"/>
<line x1="120" y1="130" x2="120" y2="180" stroke="{t}" stroke-width="3"/>
<rect x="255" y="150" width="42" height="85" fill="{d}"/>
<circle cx="290" cy="195" r="3" fill="{t}"/>
<rect x="205" y="140" width="6" height="18" fill="{f}"/>
<rect x="216" y="140" width="6" height="18" fill="{f}"/>
<polygon points="300,235 300,125 320,120 460,120 460,235" fill="{b}"/>
<rect x="296" y="116" width="168" height="8" fill="{t}"/>
<rect x="325" y="150" width="105" height="85" fill="{g}" stroke="{t}" stroke-width="4"/>
<line x1="325" y1="178" x2="430" y2="178" stroke="{t}" stroke-width="2"/>
<line x1="325" y1="206" x2="430" y2="206" stroke="{t}" stroke-width="2"/>
<circle cx="480" cy="150" r="28" fill="#3E6B34"/>
<rect x="476" y="170" width="8" height="35" fill="#6B4F35"/>
<text x="12" y="290" font-family="Arial" font-size="11" fill="#3A362F">Illustration of the recommended scheme — not the actual house</text>
</svg>'''


def text_color_for(hex_color):
    """Black or white text, whichever reads better on this background."""
    r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return "#000000" if (0.299 * r + 0.587 * g + 0.114 * b) > 140 else "#FFFFFF"


def strip_palette_block(report):
    return re.sub(r"## Palette\s*```palette.*?```\s*", "", report, flags=re.DOTALL).strip()


def build_html(query, report, swatches, after_img_name=None):
    chips = "".join(
        f'<div class="chip"><div class="color" style="background:{h}"></div>'
        f"<strong>{escape(el)}</strong><span>{escape(name)}</span><code>{h}</code></div>"
        for el, name, h in swatches
    )
    svg = house_svg(pick_colors(swatches)) if swatches else ""
    after_html = (
        f'<h3>AI "after" preview (Grok)</h3><img src="{escape(after_img_name)}" '
        'style="max-width:100%;border-radius:8px" alt="AI after image">'
        if after_img_name else ""
    )
    body = escape(strip_palette_block(report))
    body = re.sub(
        r"(https?://[^\s\)\|<]+)",
        r'<a href="\1" target="_blank">\1</a>',
        body,
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Color Recommendation — {escape(query)}</title>
<style>
 body {{ font-family: Segoe UI, Arial, sans-serif; max-width: 900px; margin: 2em auto; padding: 0 1em; color:#222; }}
 h1 {{ font-size: 1.4em; }}
 .palette {{ display:flex; flex-wrap:wrap; gap:12px; margin:1.5em 0; }}
 .chip {{ width:150px; border:1px solid #ddd; border-radius:8px; overflow:hidden; text-align:center; padding-bottom:8px; }}
 .chip .color {{ height:84px; margin-bottom:6px; }}
 .chip strong {{ display:block; font-size:.85em; }}
 .chip span {{ display:block; font-size:.78em; color:#555; padding:0 4px; }}
 .chip code {{ font-size:.75em; color:#777; }}
 .preview {{ margin:1em 0; }} .preview svg {{ max-width:560px; width:100%; border-radius:8px; }}
 pre {{ white-space:pre-wrap; background:#fafafa; border:1px solid #eee; border-radius:8px; padding:1em; font-family: Consolas, monospace; font-size:.9em; }}
</style></head><body>
<h1>Twin Home Buyer — Color Recommendation</h1>
<h2>{escape(query)}</h2>
{after_html}
<div class="preview">{svg}</div>
<div class="palette">{chips}</div>
<pre>{body}</pre>
</body></html>"""


def save_report(query, report, swatches, after_img_name=None):
    reports = Path("reports")
    reports.mkdir(exist_ok=True)
    stem = f"{slugify(query)}-{date.today().strftime('%Y%m%d')}"
    md = reports / f"{stem}.md"
    md.write_text(report + "\n", encoding="utf-8")
    html = reports / f"{stem}.html"
    html.write_text(build_html(query, report, swatches, after_img_name), encoding="utf-8")
    return md, html


def analyze(query, claude_bin):
    """Run the web-research analysis through the Claude Code CLI."""
    prompt = PROMPT_TEMPLATE.format(query=query, trends=TRENDS, example=EXAMPLE, strategy=STRATEGY)
    result = subprocess.run(
        [claude_bin, "-p", prompt, "--allowedTools", "WebSearch,WebFetch"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Claude CLI failed:\n" + (result.stderr or result.stdout or "no output")
        )
    return result.stdout.strip()


# ---------------------------------------------------------------- CLI mode


def run_cli(query, photo_ref=None):
    claude_bin = find_claude()
    if not claude_bin:
        sys.exit(
            "Error: Claude Code is not installed. In PowerShell run:\n"
            "  irm https://claude.ai/install.ps1 | iex\n"
            "then reopen PowerShell, run 'claude' to log in once, and retry."
        )
    print("Verifying Claude login ...", file=sys.stderr)
    ok, msg = verify_login(claude_bin)
    if not ok:
        if msg == "not_logged_in":
            sys.exit(
                "Error: Claude Code is installed but not logged in.\n"
                "Run 'claude' in a terminal, sign in via the browser, then retry."
            )
        sys.exit("Error: " + msg)
    print(f"Researching {query} ...", file=sys.stderr)
    report = analyze(query, claude_bin)
    swatches = parse_palette(report)
    print(strip_palette_block(report))
    if swatches:
        print("\nPalette:", file=sys.stderr)
        for el, name, h in swatches:
            print(f"  {el}: {name}  {h}", file=sys.stderr)
    after_name = None
    grok_key = load_grok_key()
    if photo_ref and grok_key:
        print("Generating AI after-photo with Grok ...", file=sys.stderr)
        stem = f"{slugify(query)}-{date.today().strftime('%Y%m%d')}"
        out = Path("reports") / f"{stem}-after.png"
        out.parent.mkdir(exist_ok=True)
        rp = extract_render_prompt(report) or "Repaint this house's exterior using the recommended colors; change nothing else."
        try:
            grok_after_image(grok_key, photo_ref, rp, out)
            after_name = out.name
            print(f"AI after-photo: {out}", file=sys.stderr)
        except Exception as e:
            print(f"Grok after-photo failed: {e}", file=sys.stderr)
    elif photo_ref:
        print("No Grok key found (set XAI_API_KEY) — skipping AI photo.", file=sys.stderr)
    md, html = save_report(query, report, swatches, after_name)
    print(f"\nReport saved: {md}", file=sys.stderr)
    print(f"Visual report (open in browser): {html}", file=sys.stderr)


# ---------------------------------------------------------------- GUI mode


def run_gui():
    import tkinter as tk
    import webbrowser
    from tkinter import messagebox, scrolledtext

    root = tk.Tk()
    root.title("Twin Home Buyer — Color Advisor")
    root.geometry("880x720")

    state = {"claude_bin": None, "logged_in": False, "html_path": None}

    frm = tk.Frame(root, padx=12, pady=10)
    frm.pack(fill="both", expand=True)

    # --- login status bar -------------------------------------------------
    login_bar = tk.Frame(frm)
    login_bar.grid(row=0, column=0, sticky="we", pady=(0, 8))
    login_light = tk.Label(login_bar, text="●", fg="orange", font=("Arial", 14))
    login_light.pack(side="left")
    login_var = tk.StringVar(value="Checking Claude login...")
    tk.Label(login_bar, textvariable=login_var).pack(side="left", padx=6)
    login_btn = tk.Button(login_bar, text="Log in now", state="disabled")
    login_btn.pack(side="right", padx=4)
    check_btn = tk.Button(login_bar, text="Check login", state="disabled")
    check_btn.pack(side="right")

    tk.Label(
        frm, text="Property address — or paste a Zillow / Redfin / Google Maps link:"
    ).grid(row=1, column=0, sticky="w")
    query_var = tk.StringVar()
    entry = tk.Entry(frm, textvariable=query_var)
    entry.grid(row=2, column=0, sticky="we", pady=4)
    entry.focus()
    frm.columnconfigure(0, weight=1)

    grok_bar = tk.Frame(frm)
    grok_bar.grid(row=2, column=0, sticky="we", pady=(34, 0))
    grok_bar.grid_remove()  # placeholder to keep row math simple

    extras = tk.Frame(frm)
    extras.grid(row=7, column=0, sticky="we", pady=(4, 0))
    tk.Label(extras, text="Optional — AI after-photo (Grok):", fg="gray25").grid(
        row=0, column=0, columnspan=4, sticky="w"
    )
    tk.Label(extras, text="xAI API key:").grid(row=1, column=0, sticky="w")
    grok_key_var = tk.StringVar(value=load_grok_key())
    tk.Entry(extras, textvariable=grok_key_var, show="*", width=32).grid(
        row=1, column=1, sticky="we", padx=6
    )
    tk.Label(extras, text="Listing photo URL or file:").grid(row=1, column=2, sticky="w")
    photo_var = tk.StringVar()
    tk.Entry(extras, textvariable=photo_var, width=36).grid(
        row=1, column=3, sticky="we", padx=6
    )
    extras.columnconfigure(1, weight=1)
    extras.columnconfigure(3, weight=2)

    btn_bar = tk.Frame(frm)
    btn_bar.grid(row=3, column=0, pady=6)
    analyze_btn = tk.Button(btn_bar, text="Get color recommendation", width=26, state="disabled")
    analyze_btn.pack(side="left", padx=4)
    open_html_btn = tk.Button(btn_bar, text="Open visual report", width=18, state="disabled")
    open_html_btn.pack(side="left", padx=4)

    status_var = tk.StringVar(value="")
    tk.Label(frm, textvariable=status_var, fg="gray25").grid(
        row=4, column=0, sticky="w", pady=(0, 4)
    )

    # --- palette swatch panel ---------------------------------------------
    visual_bar = tk.Frame(frm)
    visual_bar.grid(row=5, column=0, sticky="we", pady=(2, 6))
    canvas = tk.Canvas(visual_bar, width=420, height=210, highlightthickness=0)
    canvas.pack(side="left", padx=(0, 10))
    palette_frame = tk.Frame(visual_bar)
    palette_frame.pack(side="left", fill="both", expand=True)

    def render_house(swatches):
        canvas.delete("all")
        if not swatches:
            return
        c = pick_colors(swatches)
        b, t, d, g = c["body"], c["trim"], c["door"], c["garage"]
        # sky + ground
        canvas.create_rectangle(0, 0, 420, 165, fill="#DDE3DC", width=0)
        canvas.create_rectangle(0, 165, 420, 210, fill="#4E8A3C", width=0)
        # main house
        canvas.create_polygon(40, 78, 225, 78, 210, 42, 55, 42, fill="#8A8A85", width=0)
        canvas.create_rectangle(48, 76, 218, 165, fill=b, width=0)
        canvas.create_rectangle(45, 72, 221, 78, fill=t, width=0)
        canvas.create_rectangle(62, 92, 107, 128, fill="#D8DEE2", outline=t, width=3)
        canvas.create_rectangle(178, 105, 208, 165, fill=d, width=0)
        # garage wing
        canvas.create_rectangle(218, 88, 340, 165, fill=b, width=0)
        canvas.create_rectangle(215, 84, 343, 90, fill=t, width=0)
        canvas.create_rectangle(235, 110, 320, 165, fill=g, outline=t, width=3)
        canvas.create_line(235, 128, 320, 128, fill=t, width=2)
        canvas.create_line(235, 146, 320, 146, fill=t, width=2)
        canvas.create_text(6, 200, anchor="w", font=("Arial", 7),
                           text="Illustration of the scheme — not the actual house", fill="#3A362F")

    def render_palette(swatches):
        render_house(swatches)
        for w in palette_frame.winfo_children():
            w.destroy()
        for el, name, h in swatches[:8]:
            chip = tk.Frame(palette_frame, bd=1, relief="solid")
            chip.pack(side="left", padx=5, pady=2)
            tk.Label(
                chip, bg=h, fg=text_color_for(h), text="\n" + h + "\n",
                width=16, font=("Consolas", 9, "bold"),
            ).pack(fill="x")
            tk.Label(chip, text=el, font=("Arial", 8, "bold"), wraplength=120).pack()
            tk.Label(chip, text=name, font=("Arial", 8), wraplength=120).pack()

    output = scrolledtext.ScrolledText(frm, wrap="word", font=("Consolas", 10))
    output.grid(row=6, column=0, sticky="nsew", pady=4)
    frm.rowconfigure(6, weight=1)

    # --- login verification ----------------------------------------------
    def set_login_state(ok, message):
        state["logged_in"] = ok
        login_light.config(fg="green" if ok else "red")
        login_var.set(message)
        analyze_btn.config(state="normal" if ok else "disabled")
        check_btn.config(state="normal")
        login_btn.config(state="disabled" if ok else "normal")

    def check_login_worker():
        claude_bin = find_claude()
        if not claude_bin:
            def missing():
                set_login_state(False, "Claude Code is not installed on this PC.")
                messagebox.showerror("Color Advisor — one-time setup needed", INSTALL_HELP)
            root.after(0, missing)
            return
        state["claude_bin"] = claude_bin
        ok, msg = verify_login(claude_bin)
        def apply():
            if ok:
                set_login_state(True, "Logged in to Claude — ready.")
            elif msg == "not_logged_in":
                set_login_state(False, "Installed, but NOT logged in.")
                messagebox.showwarning("Color Advisor — login needed", LOGIN_HELP)
            else:
                set_login_state(False, "Claude connection problem.")
                messagebox.showerror("Color Advisor", msg)
        root.after(0, apply)

    def start_login_check():
        login_light.config(fg="orange")
        login_var.set("Checking Claude login...")
        check_btn.config(state="disabled")
        login_btn.config(state="disabled")
        analyze_btn.config(state="disabled")
        threading.Thread(target=check_login_worker, daemon=True).start()

    def on_login_now():
        if not state["claude_bin"]:
            messagebox.showerror("Color Advisor — one-time setup needed", INSTALL_HELP)
            return
        if open_login_window(state["claude_bin"]):
            messagebox.showinfo(
                "Color Advisor",
                "A Claude window just opened.\n\n"
                "Sign in through the browser when it asks, then come back\n"
                "here and click 'Check login'.",
            )
        else:
            messagebox.showinfo(
                "Color Advisor",
                "Couldn't open a terminal automatically.\n\n"
                "Open PowerShell yourself, type:  claude\n"
                "sign in via the browser, then click 'Check login' here.",
            )

    check_btn.config(command=start_login_check)
    login_btn.config(command=on_login_now)

    def on_open_html():
        if state["html_path"]:
            webbrowser.open(Path(state["html_path"]).resolve().as_uri())

    open_html_btn.config(command=on_open_html)

    # --- analysis ---------------------------------------------------------
    def worker(query, claude_bin, grok_key, photo_ref):
        try:
            report = analyze(query, claude_bin)
            swatches = parse_palette(report)
            after_name = None
            grok_err = None
            if grok_key and photo_ref:
                root.after(0, lambda: status_var.set(
                    "Report done — generating AI after-photo with Grok..."))
                try:
                    stem = f"{slugify(query)}-{date.today().strftime('%Y%m%d')}"
                    out = Path("reports") / f"{stem}-after.png"
                    out.parent.mkdir(exist_ok=True)
                    rp = extract_render_prompt(report) or (
                        "Repaint this house's exterior using the recommended colors; "
                        "change nothing else."
                    )
                    grok_after_image(grok_key, photo_ref, rp, out)
                    after_name = out.name
                    save_grok_key(grok_key)
                except Exception as ge:
                    grok_err = str(ge)
            md, html = save_report(query, report, swatches, after_name)

            def done():
                if grok_err:
                    messagebox.showwarning(
                        "Grok after-photo failed",
                        "The report is ready, but the AI photo failed:\n\n" + grok_err,
                    )
                render_palette(swatches)
                output.delete("1.0", "end")
                output.insert("1.0", strip_palette_block(report))
                state["html_path"] = str(html)
                open_html_btn.config(state="normal")
                status_var.set(f"Done. Saved: {md} + visual report {html}")
                analyze_btn.config(state="normal")

            root.after(0, done)
        except Exception as e:
            def failed():
                status_var.set("Failed.")
                messagebox.showerror("Color Advisor", str(e))
                analyze_btn.config(state="normal")

            root.after(0, failed)

    def on_analyze():
        if not state["logged_in"]:
            messagebox.showwarning("Color Advisor", "Verify your Claude login first.")
            return
        query = query_var.get().strip()
        if not query:
            messagebox.showwarning(
                "Color Advisor", "Paste the property address or listing link."
            )
            return
        analyze_btn.config(state="disabled")
        open_html_btn.config(state="disabled")
        status_var.set("Researching the property on the web... (2-4 minutes)")
        output.delete("1.0", "end")
        render_palette([])
        threading.Thread(
            target=worker,
            args=(query, state["claude_bin"], grok_key_var.get().strip(), photo_var.get().strip()),
            daemon=True,
        ).start()

    analyze_btn.config(command=on_analyze)
    entry.bind("<Return>", lambda e: on_analyze())

    start_login_check()
    root.mainloop()


if __name__ == "__main__":
    if len(sys.argv) == 2:
        run_cli(sys.argv[1])
    elif len(sys.argv) == 3:
        run_cli(sys.argv[1], sys.argv[2])
    elif len(sys.argv) == 1:
        run_gui()
    else:
        sys.exit(
            'Usage:\n  Window: python color_advisor_app.py\n'
            '  CLI:    python color_advisor_app.py "<address>" [photo URL or file]\n'
            '  (set XAI_API_KEY for the optional Grok AI after-photo)'
        )
