// color-advisor — Twin Home Buyer exterior color recommendation app.
//
// Give it a property address and a photo; it connects to Claude through the
// Claude Code CLI (your existing login — no API keys) and applies the trained
// 2026 color framework.
//
// Usage:
//
//	color-advisor "123 Main St, Petaluma CA" C:\photos\property.jpg
//
// The trained framework is embedded in the binary at build time from
// ../training, so the .exe is fully self-contained — it only needs the
// `claude` CLI installed and logged in.
package main

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

//go:embed trends.md
var trends string

//go:embed example.md
var example string

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "Error: "+msg)
	os.Exit(1)
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintf(os.Stderr, "Usage: %s \"<property address>\" <photo.jpg|png>\n", filepath.Base(os.Args[0]))
		os.Exit(1)
	}
	address := os.Args[1]
	image := os.Args[2]

	claudeBin, err := exec.LookPath("claude")
	if err != nil {
		fail("the 'claude' CLI is not installed or not on PATH.\nInstall Claude Code first: https://claude.com/claude-code")
	}

	imageAbs, err := filepath.Abs(image)
	if err != nil || !fileExists(imageAbs) {
		fail("image not found: " + image)
	}

	prompt := buildPrompt(address, imageAbs)

	fmt.Fprintf(os.Stderr, "Analyzing %s ...\n", address)
	cmd := exec.Command(claudeBin, "-p", prompt, "--allowedTools", "Read")
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		fail("claude CLI failed: " + err.Error())
	}
	report := strings.TrimSpace(string(out))
	fmt.Println(report)

	reportDir := "reports"
	_ = os.MkdirAll(reportDir, 0o755)
	reportFile := filepath.Join(reportDir, slug(address)+"-"+time.Now().Format("20060102")+".md")
	if err := os.WriteFile(reportFile, []byte(report+"\n"), 0o644); err == nil {
		fmt.Fprintf(os.Stderr, "\nReport saved: %s\n", reportFile)
	}
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func slug(s string) string {
	s = strings.ToLower(s)
	s = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func buildPrompt(address, imageAbs string) string {
	return fmt.Sprintf(`You are the color advisor for Twin Home Buyer, a house-flipping business.

Property address: %s
Property photo on disk: %s

First, use the Read tool to view the photo at the path above. Then decide the
best exterior color scheme for THIS specific property by applying the trained
2026 framework below, exactly as written.

=== TRAINED FRAMEWORK (source of truth) ===
%s

=== WORKED EXAMPLE (follow this format and rigor) ===
%s

=== YOUR TASK ===
Produce a markdown report with exactly these sections:

# Color Recommendation — %s

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
directly into a file by the calling program.`, address, imageAbs, trends, example, address)
}
