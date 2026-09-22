# Construction Control — Equity Track / Twin Home Buyer

Live property-operations dashboard: every active property, its tasks, blockers,
inspections, decisions, vendors, orders, risks and timeline, built from
Monday.com updates.

- **Live artifact:** https://claude.ai/artifact/8HfV89hQVeWduLoAC6pkbt
- **Stack:** React 19 + TypeScript + Tailwind v4 (Vite), built to one HTML file.

## Where the data lives

| Place | Role |
|---|---|
| `public/data/properties.json` | **The structured property data (repo record).** Edit this to change the data. Shape: `src/data/types.ts`. |
| Artifact database, collection `properties` (one doc per property id) + doc `meta/dataset` | **What the live artifact shows.** Every open view updates as soon as a doc changes. No rebuild or republish needed. |
| Browser localStorage | Only when the database isn't available (local dev, previews). Edits made there stay in that browser. |

On the live artifact, task edits made in the UI save to the database for the whole team.
Each edit also adds an entry to that task's history.

## Updating from new Monday.com notes

Paste the notes and say *"Update the property dashboard with these Monday.com notes."* Claude then:

1. Reads the current docs from the artifact database (`ArtifactData list properties`) so edits made in the UI aren't lost.
2. Matches each note to its property (by address) and task (by title/topic), and creates a task only when none matches.
3. Appends a `history` entry with the old status and note, then updates `status`, `latestUpdate`, `nextAction`, `blocker`, `deadline` and so on.
4. Updates the property's `lastUpdated`, `nextAction`, `whereItStands`, inspections, decisions, risks and timeline.
5. Writes the changed property docs back with `if_version`, updates `meta/dataset.asOf`, and mirrors the result into `public/data/properties.json` and commits it.

All counts, statuses and "action needed" lists are derived in `src/data/derive.ts`, so they update on their own.

**Accuracy rules:** don't invent facts. Scheduled ≠ completed ≠ passed. Quote received ≠ approved. Ordered ≠ delivered. When two notes conflict, set `needsVerification` and keep both notes.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + single-file build -> dist/artifact/index.html (+ data/properties.json)
node scripts/split-for-db.mjs   # per-property JSON in dist/db/ for ArtifactData writes
```

Republish the page (only after UI/code changes) from `dist/artifact/index.html` to the URL above.
