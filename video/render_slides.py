#!/usr/bin/env python3
"""Render the Twin Home Buyer promo slides to PNG frames.

Generates the slide HTML into video/slides/ and screenshots each one at
1620x2880 (1.5x of 1080x1920) with Playwright/Chromium. The oversized
render gives ffmpeg's zoompan filter headroom for the Ken Burns motion.
"""

import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
SLIDES_DIR = ROOT / "slides"
FRAMES_DIR = ROOT / "frames"

BASE_CSS = """
@font-face { font-family: 'Poppins'; font-weight: 400; src: url('../assets/fonts/Poppins-400.woff2') format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 500; src: url('../assets/fonts/Poppins-500.woff2') format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 600; src: url('../assets/fonts/Poppins-600.woff2') format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 700; src: url('../assets/fonts/Poppins-700.woff2') format('woff2'); }
@font-face { font-family: 'Poppins'; font-weight: 800; src: url('../assets/fonts/Poppins-800.woff2') format('woff2'); }

* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --navy: #0b1d33;
  --navy-2: #14304f;
  --gold: #e3b04b;
  --gold-soft: #f0c96c;
  --cream: #f7f4ec;
  --muted: #a8b8cc;
}

html, body { width: 1080px; height: 1920px; overflow: hidden; }

body {
  font-family: 'Poppins', sans-serif;
  color: var(--cream);
  background:
    radial-gradient(1200px 900px at 85% -5%, rgba(227, 176, 75, 0.16), transparent 60%),
    radial-gradient(1400px 1100px at 10% 105%, rgba(56, 108, 176, 0.22), transparent 60%),
    linear-gradient(160deg, #102a47 0%, var(--navy) 55%, #081527 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 90px;
  position: relative;
}

/* subtle grid texture */
body::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 120px 120px;
  pointer-events: none;
}

.badge {
  display: inline-flex; align-items: center; gap: 18px;
  border: 2px solid rgba(227, 176, 75, 0.55);
  color: var(--gold-soft);
  border-radius: 999px;
  padding: 18px 44px;
  font-size: 34px; font-weight: 600;
  letter-spacing: 6px; text-transform: uppercase;
  background: rgba(227, 176, 75, 0.08);
}

.kicker {
  color: var(--gold);
  font-size: 40px; font-weight: 600;
  letter-spacing: 10px; text-transform: uppercase;
  margin-bottom: 36px;
}

h1 { font-size: 118px; font-weight: 800; line-height: 1.08; letter-spacing: -1px; }
h1 .accent { color: var(--gold); }

.sub {
  font-size: 44px; font-weight: 500; color: var(--muted);
  line-height: 1.5; margin-top: 44px;
}

.rule {
  width: 180px; height: 6px; border-radius: 3px;
  background: linear-gradient(90deg, var(--gold), var(--gold-soft));
  margin: 52px auto 0;
}

.list { margin-top: 70px; display: flex; flex-direction: column; gap: 36px; width: 100%; }
.item {
  display: flex; align-items: center; gap: 34px; text-align: left;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 28px; padding: 38px 44px;
  font-size: 44px; font-weight: 600;
}
.item svg { flex: 0 0 auto; }

.steps { margin-top: 80px; display: flex; flex-direction: column; gap: 44px; width: 100%; }
.step {
  display: flex; align-items: center; gap: 40px; text-align: left;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 30px; padding: 44px 48px;
}
.step .num {
  flex: 0 0 auto; width: 104px; height: 104px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--gold), #c8952f);
  color: var(--navy); font-size: 54px; font-weight: 800;
}
.step .txt strong { display: block; font-size: 46px; font-weight: 700; }
.step .txt span { display: block; font-size: 34px; color: var(--muted); margin-top: 8px; }

.footer-brand {
  position: absolute; bottom: 84px; left: 0; right: 0;
  font-size: 30px; font-weight: 600; letter-spacing: 8px;
  text-transform: uppercase; color: rgba(247, 244, 236, 0.5);
}
"""

HOUSE_SVG = """<svg width="150" height="150" viewBox="0 0 24 24" fill="none">
<path d="M3 11.5 12 4l9 7.5" stroke="#e3b04b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5.5 10v9.5h13V10" stroke="#f7f4ec" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M10 19.5v-5.5h4v5.5" stroke="#e3b04b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>"""

CHECK_SVG = """<svg width="58" height="58" viewBox="0 0 24 24" fill="none">
<circle cx="12" cy="12" r="10.5" stroke="#e3b04b" stroke-width="1.6"/>
<path d="m7.5 12.2 3 3 6-6.4" stroke="#e3b04b" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>"""

CASH_SVG = """<svg width="170" height="170" viewBox="0 0 24 24" fill="none">
<rect x="2.5" y="6.5" width="19" height="11" rx="2" stroke="#f7f4ec" stroke-width="1.6"/>
<circle cx="12" cy="12" r="3.1" stroke="#e3b04b" stroke-width="1.6"/>
<path d="M5.8 9.7h.01M18.2 14.3h.01" stroke="#e3b04b" stroke-width="2.4" stroke-linecap="round"/>
</svg>"""

SLIDES = {
    "slide1": f"""
<div class="badge">{'&#9670;'} Twin Home Buyer {'&#9670;'}</div>
<div style="margin-top: 120px;">{HOUSE_SVG}</div>
<h1 style="margin-top: 90px;">SELL YOUR<br>HOUSE <span class="accent">FAST</span></h1>
<div class="rule"></div>
<p class="sub">No repairs. No fees. No stress.<br>Just a fair cash offer.</p>
<div class="footer-brand">TwinHomeBuyer.com</div>
""",
    "slide2": f"""
<p class="kicker">Any Situation. Any Condition.</p>
<h1>WE BUY HOUSES<br><span class="accent">AS-IS</span></h1>
<div class="list">
  <div class="item">{CHECK_SVG} Inherited property</div>
  <div class="item">{CHECK_SVG} Facing foreclosure</div>
  <div class="item">{CHECK_SVG} Major repairs needed</div>
  <div class="item">{CHECK_SVG} Tired of being a landlord</div>
  <div class="item">{CHECK_SVG} Relocating or divorce</div>
</div>
<div class="footer-brand">Twin Home Buyer</div>
""",
    "slide3": f"""
{CASH_SVG}
<p class="kicker" style="margin-top: 90px;">Fast. Fair. Guaranteed.</p>
<h1>CASH OFFER<br>IN <span class="accent">24 HOURS</span></h1>
<div class="rule"></div>
<p class="sub">No commissions &bull; No closing costs<br>No obligation to accept</p>
<div class="footer-brand">Twin Home Buyer</div>
""",
    "slide4": """
<p class="kicker">Simple 3-Step Process</p>
<h1>CLOSE ON <span class="accent">YOUR</span><br>TIMELINE</h1>
<div class="steps">
  <div class="step"><div class="num">1</div><div class="txt"><strong>Reach out</strong><span>Tell us about your property</span></div></div>
  <div class="step"><div class="num">2</div><div class="txt"><strong>Get your cash offer</strong><span>Fair, no-obligation offer in 24 hours</span></div></div>
  <div class="step"><div class="num">3</div><div class="txt"><strong>Close &amp; get paid</strong><span>Pick your closing date &mdash; even 7 days</span></div></div>
</div>
<div class="footer-brand">Twin Home Buyer</div>
""",
    "slide5": f"""
<div class="badge">{'&#9670;'} Twin Home Buyer {'&#9670;'}</div>
<h1 style="margin-top: 130px;">GET YOUR <span class="accent">FREE</span><br>CASH OFFER<br>TODAY</h1>
<div class="rule"></div>
<p class="sub" style="font-size: 50px; color: var(--cream); font-weight: 600; margin-top: 64px;">Juan Diaz</p>
<p class="sub" style="margin-top: 6px; font-size: 36px;">Founder &amp; CEO</p>
<div class="list" style="margin-top: 84px; gap: 30px;">
  <div class="item" style="justify-content: center; font-size: 42px;">&#9993;&nbsp; juan@twinhomebuyer.com</div>
  <div class="item" style="justify-content: center; font-size: 42px;">&#127760;&nbsp; TwinHomeBuyer.com</div>
</div>
<div class="footer-brand">We buy houses &mdash; any condition, any situation</div>
""",
}

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><style>{css}</style></head>
<body>{body}</body></html>"""


def main():
    SLIDES_DIR.mkdir(exist_ok=True)
    FRAMES_DIR.mkdir(exist_ok=True)

    for name, body in SLIDES.items():
        (SLIDES_DIR / f"{name}.html").write_text(PAGE.format(css=BASE_CSS, body=body))

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        page = browser.new_page(
            viewport={"width": 1080, "height": 1920},
            device_scale_factor=1.5,
        )
        for name in SLIDES:
            page.goto(f"file://{SLIDES_DIR / name}.html")
            page.wait_for_timeout(400)  # let fonts settle
            page.screenshot(path=str(FRAMES_DIR / f"{name}.png"))
            print(f"rendered {name}.png")
        browser.close()


if __name__ == "__main__":
    main()
