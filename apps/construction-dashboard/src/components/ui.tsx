// Shared primitives: badges, section shells, tables, property marker.
// Colors come from theme/theme.css variables; property identity comes from
// the --prop custom property set on a property's subtree.
import { useState, type CSSProperties, type ReactNode } from "react";
import type { OverallStatus, Priority, TaskStatus } from "../data/types";
import { PRIORITY_VAR, STATUS_VAR, propStyle } from "../theme/palette";

const cvar = (c: string) => ({ ["--c" as string]: c }) as CSSProperties;

/** Label pill. `c` is a CSS color or variable (status, priority, functional). */
export function Pill({ c = "var(--status-not-started)", children, title, dot }: { c?: string; children: ReactNode; title?: string; dot?: boolean }) {
  return <span className="pill" style={cvar(c)} title={title}>{dot && <i />}{children}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Pill c={STATUS_VAR[status]} dot>{status}</Pill>;
}

const OVERALL_VAR: Record<OverallStatus, string> = {
  "On Track": "var(--status-completed)", "Needs Attention": "var(--priority-high)", Blocked: "var(--status-blocked)",
  Waiting: "var(--status-waiting)", Completed: "var(--status-completed)",
};
export function OverallBadge({ status, inferred, reason }: { status: OverallStatus; inferred?: boolean; reason?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pill c={OVERALL_VAR[status]} title={reason} dot>{status.toUpperCase()}</Pill>
      {inferred && <span className="text-[10.5px] text-ink3" title={reason}>inferred</span>}
    </span>
  );
}

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  if (compact)
    return (
      <span className="tint inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide" style={cvar(PRIORITY_VAR[priority])}>
        <i className="block h-2 w-2 rounded-full" style={{ background: PRIORITY_VAR[priority] }} />{priority}
      </span>
    );
  return <Pill c={PRIORITY_VAR[priority]} dot>{priority.toUpperCase()}</Pill>;
}

/** Property identity marker: accent dot + optional label. Never a status. */
export function PropMark({ color, label, strong }: { color?: string; label?: ReactNode; strong?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2" style={color ? propStyle(color) : undefined}>
      <span className="prop-dot" aria-hidden />
      {label && <span className={`truncate ${strong ? "font-semibold text-ink" : "text-ink2"}`}>{label}</span>}
    </span>
  );
}

const TONE_VAR = { urgent: "var(--status-blocked)", approve: "var(--status-approval)", ok: "var(--status-completed)" };

export function Section({ title, count, hint, children, defaultOpen = true, id, tone, right }: {
  title: string; count?: number; hint?: string; children: ReactNode; defaultOpen?: boolean; id?: string;
  tone?: keyof typeof TONE_VAR; right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className={`inline-block w-3 text-ink3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>▸</span>
          {tone && <i className="block h-2.5 w-2.5 rounded-sm" style={{ background: TONE_VAR[tone] }} aria-hidden />}
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {count !== undefined && <span className="num rounded bg-raised px-1.5 font-mono text-[11px] text-ink2">{count}</span>}
          {hint && <span className="hidden text-[12px] text-ink3 sm:inline">{hint}</span>}
        </button>
        {right}
      </header>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-[13px] italic text-ink3">{children}</p>;
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className="text-[13px] text-ink2">{children}</div>
    </div>
  );
}

export function Missing({ children = "Not supplied" }: { children?: ReactNode }) {
  return <span className="italic text-ink4">{children}</span>;
}

/** Dark table. `rowColor` puts a property accent line on a row's first cell. */
export function Table({ head, rows, empty, rowColors }: { head: string[]; rows: ReactNode[][]; empty: string; rowColors?: (string | undefined)[] }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-raised">{head.map((h) => <th key={h} className="eyebrow whitespace-nowrap border-b border-line px-3 py-2 text-left !text-ink2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top text-ink2 last:border-0 hover:bg-hover">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2.5"
                  style={j === 0 && rowColors?.[i] ? { boxShadow: `inset 3px 0 0 ${rowColors[i]}` } : undefined}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
