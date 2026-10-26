# Accounting Review & Decision Dashboard

Interactive decision center for Juan Diaz (CEO) and Kristine (Controller), Twin Home Buyer / Equity Track Inc.

Live page: https://claude.ai/artifact/9YL42MD2VpXZPTkW4g6d2d

- `src.html` — page source (the `/*SEED*/` placeholder is replaced by `seed.json` at build time)
- `seed.json` — starting data (confirmed figures only; everything else is "Pending verification")
- `index.html` — built page that gets published
- `state.json` — shared saved state served next to the page; the page's **Save** button replaces it

Rebuild after editing `src.html` or `seed.json`:

```
python3 -c "import json;s=open('src.html').read();open('index.html','w').write(s.replace('/*SEED*/',json.dumps(json.load(open('seed.json')),ensure_ascii=False)))"
```

Approve / Hold only documents decisions. It does not send payments, change bank settings, or send email.
