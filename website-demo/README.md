# Twin Home Buyer — SEMrush-style landing page (demo)

A working demo answering the question: *"can we build a website like semrush.com/home here?"*
It applies SEMrush's homepage anatomy to Twin Home Buyer's cash-offer business.

## View it

`index.html` is a single self-contained file — no build step, no dependencies.
Open it directly in a browser, or host it on GitHub Pages / Netlify / Vercel / any static host.

## What's in it (SEMrush homepage anatomy → Twin Home Buyer)

| SEMrush | This demo |
|---|---|
| Promo banner | "Buying now in San Diego County" banner |
| Sticky nav + CTAs | Sticky nav, phone, "Get my cash offer" |
| Hero with domain-search bar | Hero with property-address bar (working success state) |
| Client logo carousel | Auto-scrolling service-cities marquee |
| Three feature cards | Sell as-is / Cash in days / Zero fees |
| Expandable solutions showcase | Interactive tabs: 6 seller situations (keyboard accessible) |
| Stats band (28B keywords…) | Count-up stats band |
| Product/AI section | Numbered 3-step "How it works" |
| Testimonial + big metric | Seller quote + "14 days" metric |
| Resources grid | 3 guide cards |
| — | FAQ accordion |
| Footer CTA + mega footer | Footer CTA band + 4-column footer |

## Tech notes

- Vanilla HTML/CSS/JS, fonts (Bricolage Grotesque + Public Sans) inlined as data URIs
- Light **and** dark theme (follows OS preference), fully responsive (tested 390px–1440px)
- Respects `prefers-reduced-motion`; tabs/accordion are keyboard accessible

## ⚠️ Placeholders to replace before any real use

- Phone number `(619) 555-0142` (555 = fictional), email, hours
- All stats (350+ houses, $85M+, 4.9/5) and the testimonial quote
- Service-area city list, resource guides (links are stubs)
- The address form shows a success message but **does not submit anywhere** — needs wiring
  to a CRM / monday.com / email endpoint
