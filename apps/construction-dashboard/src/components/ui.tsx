// Small shared primitives: badges, section shells, empty states.
import { useState, type ReactNode } from "react";
import type { OverallStatus, Priority, TaskStatus } from "../data/types";
import { OVERALL_TONE, STATUS_TONE } from "../data/derive";

const TONE: Record<string, string> = {
  neutral: "bg-sunk text-ink2 border-line2",
  progress: "bg-progress-soft text-progress border-progress/30",
  wait: "bg-wait-soft text-wait border-wait/30",
  urgent: "bg-urgent-soft text-urgent border-urgent/30",
  high: "bg-high-soft text-high border-high/30",
  approve: "bg-approve-soft text-approve border-approve/30",
  info: "bg-info-soft text-info border-info/30",
  ok: "bg-ok-soft text-ok border-ok/30",
  normal: "bg-normal-soft text-normal border-normal/30",
};

export function Pill({ tone = "neutral", children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 py-[1px] text-[11px] font-semibold leading-[18px] ${TONE[tone] || TONE.neutral}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{status}</Pill>;
}

export function OverallBadge({ status, inferred, reason }: { status: OverallStatus; inferred?: boolean; reason?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pill tone={OVERALL_TONE[status]} title={reason}>{status}</Pill>
      {inferred && <span className="text-[10.5px] text-ink3" title={reason}>inferred</span>}
    </span>
  );
}

const PRI: Record<Priority, { dot: string; tone: string; label: string }> = {
  Urgent: { dot: "bg-urgent", tone: "urgent", label: "Urgent" },
  High: { dot: "bg-high", tone: "high", label: "High" },
  Normal: { dot: "bg-normal", tone: "normal", label: "Normal" },
  Completed: { dot: "bg-ok", tone: "ok", label: "Completed" },
};

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const p = PRI[priority];
  if (compact)
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: `var(--color-${p.tone})` }}>
        <i className={`block h-2 w-2 rounded-full ${p.dot}`} />{p.label}
      </span>
    );
  return <Pill tone={p.tone}><i className={`block h-1.5 w-1.5 rounded-full ${p.dot}`} />{p.label.toUpperCase()}</Pill>;
}

export function Section({ title, count, hint, children, defaultOpen = true, id, tone, right }: {
  title: string; count?: number; hint?: string; children: ReactNode; defaultOpen?: boolean; id?: string; tone?: "urgent" | "approve" | "ok"; right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = tone === "urgent" ? "text-urgent" : tone === "approve" ? "text-approve" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <section id={id} className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`inline-block w-3 text-ink3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <h3 className={`font-display text-[15px] font-semibold tracking-tight ${color}`}>{title}</h3>
          {count !== undefined && <span className="num rounded bg-sunk px-1.5 font-mono text-[11px] text-ink2">{count}</span>}
          {hint && <span className="hidden text-[12px] text-ink3 sm:inline">{hint}</span>}
        </button>
        {right}
      </header>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-[13px] italic text-ink2">{children}</p>;
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="eyebrow mb-0.5">{label}</div>
      <div className="text-[13px] text-ink">{children}</div>
    </div>
  );
}

export function Missing({ children = "Not supplied" }: { children?: ReactNode }) {
  return <span className="italic text-ink3">{children}</span>;
}

export function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr>{head.map((h) => <th key={h} className="eyebrow whitespace-nowrap border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0 align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2.5">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
