# Color Advisor CLI

Command-line app for Twin Home Buyer: give it a property address and a photo,
get back the recommended 2026 exterior color scheme for that specific house.

It connects to Claude **through the Claude Code CLI only** — it uses your
existing `claude` login, no API keys to manage.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in
  (`claude` available on your PATH)

## Windows app (color-advisor.exe)

`color-advisor.exe` is a self-contained Windows app — the trained framework
is embedded in the binary, so it does NOT need the repo cloned. Run from
Command Prompt or PowerShell:

```
color-advisor.exe "1425 Elm St, Petaluma CA" C:\Users\Juan\Desktop\property.jpg
```

The report prints to the screen and is saved under `reports\` next to where
you ran it.

### Rebuilding the binaries

The Go source embeds `trends.md` / `example.md` (copies of the files in
`training/`). After updating the training docs, re-sync and rebuild:

```bash
cd color-advisor
cp ../training/2026-color-trends.md trends.md
cp ../training/sample-property-color-decision.md example.md
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o color-advisor.exe .
GOOS=darwin  GOARCH=arm64 go build -ldflags="-s -w" -o color-advisor-mac .
GOOS=linux   GOARCH=amd64 go build -ldflags="-s -w" -o color-advisor-linux .
```

## Shell script (Mac/Linux, no build needed)

```bash
./color-advisor/color-advisor.sh "1425 Elm St, Petaluma CA" ~/Desktop/property.jpg
```

- The address labels the report; the photo is what actually gets analyzed.
- Claude reads the photo, applies the trained decision framework (fixed
  elements first, house style, landscaping, neighbors, small-house rule),
  and prints a markdown report.
- The report is also saved to `reports/<address>-<date>.md` so every
  property decision is kept in the repo.

## What the report contains

1. **Property read** — roof, concrete, style, landscaping, neighbor context
2. **Recommended scheme** — body, trim, garage door, front door, fixtures,
   with paint names, codes, and hex values from the trained shortlist
3. **Runner-up** — the alternative and why it lost
4. **Free wins** — cheap curb-appeal fixes visible in the photo

## Updating the brain

The recommendations come from `training/2026-color-trends.md`. To refresh the
trends (say, in 2027), update that file — the CLI picks it up automatically.
