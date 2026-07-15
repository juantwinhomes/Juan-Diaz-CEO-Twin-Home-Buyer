#!/usr/bin/env python3
"""color-advisor — Twin Home Buyer exterior color recommendation app.

ONE input: a property address, or a Zillow / Redfin / Realtor / Google Maps
link. No photo upload needed — Claude researches the property on the web
(listing data, property records) and applies the trained 2026 color framework.

Connects to Claude through the Claude Code CLI (your existing `claude`
login — no API keys).

Two ways to use it:
  Window:  python color_advisor_app.py
  CLI:     python color_advisor_app.py "123 Main St, Petaluma CA"
           python color_advisor_app.py "https://www.zillow.com/homedetails/..."

Requires: Python 3.8+ and Claude Code installed & logged in
          (https://claude.com/claude-code)
"""

import re
import shutil
import subprocess
import sys
import threading
from datetime import date
from pathlib import Path

TRENDS = "# 2026 Exterior Color Trends — Flip Decision Guide\n\nResearched July 2026. Use this to pick exterior colors for flip properties.\nWhen a sample property photo arrives, run it through the decision framework at\nthe bottom and pick from these trend-backed options.\n\n## The big picture for 2026\n\n- **Warm earth tones have replaced cool grays.** Gray is no longer the default\n  on new construction; warm neutrals photograph better and appeal to more buyers.\n- **Sage/muted green is the #1 trend color.** Houzz 2026 data: green-family\n  exterior paints up 34% in project saves vs 2024 — more than any other family.\n- **Creamy whites replaced stark white.** Warm charcoal replaced blue-gray.\n- **Colors of the Year:** Sherwin-Williams *Universal Khaki* (SW 6150),\n  Benjamin Moore *Silhouette* (AF-655, burnt umber/charcoal), PPG *Warm Mahogany*.\n- Northern California specifically: olive greens, muted sage, smoky green-grays\n  paired with stone, wood, black windows, and warm white trim.\n\n## Trend-backed color shortlist (by role)\n\n### Body / siding\n| Color | Code | Character | Best on |\n|---|---|---|---|\n| Universal Khaki | SW 6150 | Warm earthy neutral, 2026 COTY | Safe resale pick, any style |\n| Alabaster | SW 7008 | Creamy warm white | Timeless, brightens small homes |\n| Balboa Mist | BM OC-27 | Soft greige | Bridges traditional + modern buyers |\n| Sea Salt | SW 6204 | Soft green w/ blue undertone | Cottages, landscaped lots |\n| Evergreen Fog | SW 9130 | Muted green-gray | Ranch homes, wooded/mature lots |\n| Smoky Green | BM CC-700 | Gentle green-gray | Larger facades |\n\n### Trim\n- Warm white (Alabaster) against green or khaki bodies.\n- Black/bronze window and roofline accents remain strong.\n\n### Front door (highest ROI accent)\n- **Deep charcoal, dark warm bronze, warm black** — strongest 2026 resale door colors.\n- **Navy blue** — still associated with ~$1,500 higher sale prices.\n- Urbane Bronze (SW 7048), Wrought Iron (BM 2124-10) for door/trim/accents.\n\n### Warm-climate accents\n- Terra Cotta Tile (BM 2090-30), Southwest Pottery — accent-only, pairs with wood.\n\n## Decision framework for a specific property\n\nScore the property photo on these, then pick:\n\n1. **Fixed elements first** — roof color, stone/brick, driveway. The body color\n   must flatter what's not changing. (Warm roof → khaki/greige family;\n   gray roof → green-gray family.)\n2. **House style** — Ranch: sage/Evergreen Fog with warm white trim is the 2026\n   sweet spot. Traditional/cottage: Sea Salt or Alabaster. Modern: greige or\n   deeper green-gray with black trim.\n3. **Lot & landscaping** — mature trees/landscaping strengthen the case for\n   greens; bare lots lean warm neutral (khaki/greige) so the house doesn't\n   look unfinished.\n4. **Neighborhood comps** — the flip should read current but not be the odd\n   house out. If the street is all beige, a muted sage stands out (good);\n   a dark moody body may be too far (risk).\n5. **Small house rule** — light warm colors (Alabaster, Balboa Mist) make small\n   homes look bigger; save deep tones for the door.\n6. **Photography test** — warm neutrals and muted greens photograph better than\n   stark white or cool gray. Listing photos drive showings.\n\n**Default flip formula for 2026 (Northern California):**\nmuted sage/green-gray or warm khaki body + warm white trim + warm black or\nnavy door + black/bronze fixtures + landscape per `color-palette.md`\n(redwood, dark mulch, lavender/silver planting).\n\n## Relationship to the Petaluma yard palette\n\nThe existing curb-appeal palette (`training/color-palette.md`) is\ntrend-aligned: warm redwood = the warm-brown 2026 direction (PPG Warm\nMahogany family), dark mulch + silver-green + lavender = the\nnature-grounded look buyers save on Houzz. If the Petaluma house gets\nrepainted, Universal Khaki or Evergreen Fog body with Alabaster trim keeps\nthe beige-family harmony with the redwood box; the navy door already matches\n2026 resale data.\n\n## Sources\n\n- brickandbatten — Top Paint Colors of 2026\n- Sherwin-Williams / HGTV Home — 2026 Color Collection of the Year\n- Benjamin Moore — Color of the Year 2026 (Silhouette AF-655)\n- PPG — 2026 Trends (Warm Mahogany)\n- Milgard — Exterior Home Color Trends 2026\n- New Home Star — Home Builder's Guide to 2026 Paint Trends\n- Home-Stretch — Best Exterior Paint Colors That Help Homes Sell Faster\n- Facade Colorizer — Sage Green Exterior Paint Guide 2026 (Houzz +34% data)\n- Trico Painting / Davis Painting — Northern California 2026 color guides\n"

EXAMPLE = "# Sample Property Color Decision — Small Green Ranch (July 2026)\n\nWorked example of applying `2026-color-trends.md` to a real property photo.\nKeep this format for future property color calls.\n\n## Property read (fixed elements first)\n\n- Small single-story ranch/bungalow, shingle siding, dated pale celery-mint\n  green with white trim; street-facing garage with matching mint door.\n- Light gray composition roof + warm gray concrete driveway → cool/neutral\n  fixed elements → green-gray family over khaki/beige.\n- Mature landscaping (boxwood hedges, lawn, weeping birch) → supports a green\n  body color.\n- Street comps: cream/brick house on one side, terracotta-orange on the other\n  → muted sage differentiates without being the odd house out.\n- Small footprint → mid-light body (small-house rule); deep tones door-only.\n\n## Decision\n\n| Element | Color | Rationale |\n|---|---|---|\n| Body/siding | Evergreen Fog SW 9130 | 2026 ranch sweet spot; suits gray roof + mature landscaping; modernizes existing green character |\n| Trim/fascia | Alabaster SW 7008 | Creamy warm white, not stark |\n| Garage door | Body color (Evergreen Fog) | Street-facing door must recede, not accent |\n| Front door | Warm black / Urbane Bronze SW 7048 (alt: navy for resale data) | Single accent moment |\n| Fixtures/numbers | Matte black | Current, ties to door |\n| Picket fence | Fresh Alabaster or remove | Weathered fence drags the frontage |\n\nRunner-up scheme: Universal Khaki SW 6150 body + Alabaster trim + black door\n(max-safety neutral) — rejected here because the lot's landscaping and the\norange neighbor make the sage work harder.\n\n## Reusable rules confirmed by this example\n\n1. Street-facing garage doors get the body color, never an accent.\n2. Mature landscaping → green family; bare lot → warm neutral.\n3. Small house → mid-light body, accent saved for the door.\n4. Always check both neighbors before committing a body color.\n5. Note the free wins in every assessment (power-wash, fence paint, debris).\n"

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

## Runner-up
One alternative scheme and why it lost.

## Verify before painting
Since you worked from listing data rather than viewing photos, list the 2-3
specific things Juan should eyeball in a photo or drive-by that could change
the call (e.g. actual roof color temperature, neighbor colors, masonry).

## Free wins
2-3 cheap curb-appeal fixes typical for this property type/age.

Rules: pick colors ONLY from the trained shortlist unless a confirmed fixed
element forces otherwise (then say why). Be decisive — one recommended
scheme, not a menu. If you genuinely cannot find the property at all, say so
plainly and give the safe default flip scheme from the framework instead.

OUTPUT FORMAT — critical: your entire final response must be the raw markdown
report itself, starting with the "# Color Recommendation" heading. Do NOT
write files, do NOT attach or send files, and do NOT reply with a summary or
commentary — your response text IS the report."""


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


def slugify(text):
    s = re.sub(r"https?://", "", text.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "property"


def analyze(query, claude_bin):
    """Run the web-research analysis through the Claude Code CLI."""
    prompt = PROMPT_TEMPLATE.format(query=query, trends=TRENDS, example=EXAMPLE)
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


def save_report(query, report):
    reports = Path("reports")
    reports.mkdir(exist_ok=True)
    out = reports / f"{slugify(query)}-{date.today().strftime('%Y%m%d')}.md"
    out.write_text(report + "\n", encoding="utf-8")
    return out


# ---------------------------------------------------------------- CLI mode


def run_cli(query):
    claude_bin = find_claude()
    if not claude_bin:
        sys.exit(
            "Error: the 'claude' CLI was not found. Install Claude Code first: "
            "https://claude.com/claude-code"
        )
    print(f"Researching {query} ...", file=sys.stderr)
    report = analyze(query, claude_bin)
    print(report)
    out = save_report(query, report)
    print(f"\nReport saved: {out}", file=sys.stderr)


# ---------------------------------------------------------------- GUI mode


def run_gui():
    import tkinter as tk
    from tkinter import messagebox, scrolledtext

    root = tk.Tk()
    root.title("Twin Home Buyer — Color Advisor")
    root.geometry("820x620")

    frm = tk.Frame(root, padx=12, pady=10)
    frm.pack(fill="both", expand=True)

    tk.Label(
        frm, text="Property address — or paste a Zillow / Redfin / Google Maps link:"
    ).grid(row=0, column=0, sticky="w")
    query_var = tk.StringVar()
    entry = tk.Entry(frm, textvariable=query_var)
    entry.grid(row=1, column=0, sticky="we", pady=4)
    entry.focus()
    frm.columnconfigure(0, weight=1)

    analyze_btn = tk.Button(frm, text="Get color recommendation", width=26)
    analyze_btn.grid(row=2, column=0, pady=6)

    status_var = tk.StringVar(value="Ready.")
    tk.Label(frm, textvariable=status_var, fg="gray25").grid(
        row=3, column=0, sticky="w", pady=(0, 4)
    )

    output = scrolledtext.ScrolledText(frm, wrap="word", font=("Consolas", 10))
    output.grid(row=4, column=0, sticky="nsew", pady=4)
    frm.rowconfigure(4, weight=1)

    def worker(query, claude_bin):
        try:
            report = analyze(query, claude_bin)
            out = save_report(query, report)

            def done():
                output.delete("1.0", "end")
                output.insert("1.0", report)
                status_var.set(f"Done. Report saved: {out}")
                analyze_btn.config(state="normal")

            root.after(0, done)
        except Exception as e:
            def failed():
                status_var.set("Failed.")
                messagebox.showerror("Color Advisor", str(e))
                analyze_btn.config(state="normal")

            root.after(0, failed)

    def on_analyze():
        query = query_var.get().strip()
        if not query:
            messagebox.showwarning(
                "Color Advisor", "Paste the property address or listing link."
            )
            return
        claude_bin = find_claude()
        if not claude_bin:
            messagebox.showerror(
                "Color Advisor",
                "The 'claude' CLI was not found.\n\nInstall Claude Code and log in "
                "first:\nhttps://claude.com/claude-code",
            )
            return
        analyze_btn.config(state="disabled")
        status_var.set("Researching the property on the web... (2-4 minutes)")
        output.delete("1.0", "end")
        threading.Thread(target=worker, args=(query, claude_bin), daemon=True).start()

    analyze_btn.config(command=on_analyze)
    entry.bind("<Return>", lambda e: on_analyze())
    root.mainloop()


if __name__ == "__main__":
    if len(sys.argv) == 2:
        run_cli(sys.argv[1])
    elif len(sys.argv) == 1:
        run_gui()
    else:
        sys.exit(
            'Usage:\n  Window: python color_advisor_app.py\n'
            '  CLI:    python color_advisor_app.py "<address or listing link>"'
        )
