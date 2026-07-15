#!/usr/bin/env bash
# color-advisor — Twin Home Buyer exterior color recommendation CLI
#
# Give it a property address and a photo; it connects to Claude through the
# Claude Code CLI (your existing login — no API keys) and applies the trained
# 2026 color framework in training/2026-color-trends.md.
#
# Usage:
#   ./color-advisor.sh "123 Main St, Petaluma CA" /path/to/photo.jpg
#
# Output: prints the recommendation and saves it to reports/<address>-<date>.md

set -euo pipefail

usage() {
  echo "Usage: $0 \"<property address>\" <photo.jpg|png>" >&2
  exit 1
}

[ $# -eq 2 ] || usage
ADDRESS="$1"
IMAGE="$2"

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: the 'claude' CLI is not installed. Install Claude Code first: https://claude.com/claude-code" >&2
  exit 1
fi

if [ ! -f "$IMAGE" ]; then
  echo "Error: image not found: $IMAGE" >&2
  exit 1
fi
IMAGE_ABS="$(cd "$(dirname "$IMAGE")" && pwd)/$(basename "$IMAGE")"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRENDS_FILE="$REPO_ROOT/training/2026-color-trends.md"
EXAMPLE_FILE="$REPO_ROOT/training/sample-property-color-decision.md"

if [ ! -f "$TRENDS_FILE" ]; then
  echo "Error: training file missing: $TRENDS_FILE" >&2
  exit 1
fi

TRENDS="$(cat "$TRENDS_FILE")"
EXAMPLE=""
[ -f "$EXAMPLE_FILE" ] && EXAMPLE="$(cat "$EXAMPLE_FILE")"

REPORT_DIR="$REPO_ROOT/reports"
mkdir -p "$REPORT_DIR"
SLUG="$(echo "$ADDRESS" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//')"
REPORT_FILE="$REPORT_DIR/${SLUG}-$(date +%Y%m%d).md"

PROMPT=$(cat <<EOF
You are the color advisor for Twin Home Buyer, a house-flipping business.

Property address: ${ADDRESS}
Property photo on disk: ${IMAGE_ABS}

First, use the Read tool to view the photo at the path above. Then decide the
best exterior color scheme for THIS specific property by applying the trained
2026 framework below, exactly as written.

=== TRAINED FRAMEWORK (source of truth) ===
${TRENDS}

=== WORKED EXAMPLE (follow this format and rigor) ===
${EXAMPLE}

=== YOUR TASK ===
Produce a markdown report with exactly these sections:

# Color Recommendation — ${ADDRESS}

## Property read (fixed elements first)
Bullet the fixed elements you observe in the photo (roof, masonry, concrete,
driveway), the house style, lot/landscaping maturity, visible neighbor context,
and house size. Only describe what you can actually see.

## Recommended scheme
A table: Element | Color (name + code + approx hex) | Rationale.
Cover body/siding, trim, garage door (if street-facing: body color rule),
front door, fixtures/numbers, and any fence or notable element in the photo.

## Runner-up
One alternative scheme in a sentence or two, and why it lost.

## Free wins
2-4 cheap curb-appeal fixes visible in the photo.

Rules: pick colors ONLY from the trained shortlist unless a fixed element
forces otherwise (then say why). Apply the reusable rules from the worked
example. Be decisive — one recommended scheme, not a menu.

OUTPUT FORMAT — critical: your entire final response must be the raw markdown
report itself, starting with the "# Color Recommendation" heading. Do NOT
write the report to a file, do NOT attach or send files, and do NOT reply
with a summary or commentary — your response text IS the report and is piped
directly into a file by the calling script.
EOF
)

echo "Analyzing $ADDRESS ..." >&2
claude -p "$PROMPT" --allowedTools "Read" | tee "$REPORT_FILE"
echo "" >&2
echo "Report saved: $REPORT_FILE" >&2
