// Property-detail panels. Each takes plain model objects and renders only
// what the source supplied — missing fields show "Not supplied".
import { useState } from "react";
import type { Decision, Inspection, Property, Purchase, Risk, TimelineEntry, UpcomingEvent, Vendor } from "../data/types";
import { fmtDate, fmtShort, todayISO, usd } from "../data/derive";
import { Empty, Missing, Pill, Table } from "./ui";

/* ---------- Timeline ---------- */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const [all, setAll] = useState(false);
  const dated = entries.filter((e) => e.date).sort((a, b) => b.date.localeCompare(a.date));
  const undated = entries.filter((e) => !e.date);
  const list = [...dated, ...undated];
  const shown = all ? list : list.slice(0, 6);
  if (!list.length) return <Empty>No dated events in the supplied notes.</Empty>;
  return (
    <div className="px-4 py-3">
      <ol className="relative space-y-3 border-l-2 border-line pl-5">
        {shown.map((e, i) => {
          const newest = i === 0 && !!e.date;
          return (
            <li key={i} className="relative">
              <span className={`absolute -left-[27px] top-1 block h-3 w-3 rounded-full border-2 ${newest ? "border-accent bg-accent" : "border-line2 bg-surface"}`} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`num font-mono text-[12px] ${newest ? "font-semibold text-accent" : "text-ink2"}`}>
                  {e.date ? fmtDate(e.date) : e.displayDate || "Date not given"}
                </span>
                {newest && <Pill tone="info">Latest</Pill>}
              </div>
              <div className={`text-[13px] ${newest ? "font-semibold" : "font-medium"}`}>{e.title}</div>
              {e.detail && <div className="text-[12.5px] text-ink2">{e.detail}</div>}
              <div className="text-[11px] text-ink3">{e.source}</div>
            </li>
          );
        })}
      </ol>
      {list.length > 6 && (
        <button type="button" className="mt-3 text-[12px] font-semibold text-accent" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length} entries`}
        </button>
      )}
    </div>
  );
}

/* ---------- Inspections ---------- */
const INSPECTION_TONE: Record<Inspection["state"], string> = {
  "Not scheduled": "neutral", Requested: "wait", Scheduled: "info", "Completed — result pending": "progress",
  Passed: "ok", Failed: "urgent", "Corrections required": "urgent",
};
export function InspectionTracker({ items, propertyLabel }: { items: (Inspection & { property?: string })[]; propertyLabel?: boolean }) {
  return (
    <>
      <p className="px-4 pt-3 text-[12px] text-ink3">
        Scheduled ≠ completed ≠ passed. An inspection shows <b className="text-ok">Passed</b> only when a source note says so.
      </p>
      <Table empty="No inspections recorded."
        head={[...(propertyLabel ? ["Property"] : []), "Inspection", "State", "Permit / ref", "Scheduled", "Inspector", "Result", "Corrections", "Reinspection?", "Next action"]}
        rows={items.map((i) => [
          ...(propertyLabel ? [<span className="font-medium">{i.property}</span>] : []),
          <span className="font-medium">{i.type}</span>,
          <Pill tone={INSPECTION_TONE[i.state]}>{i.state}</Pill>,
          i.permitRef || <Missing />, i.scheduledDate ? fmtDate(i.scheduledDate) : <Missing>No date</Missing>,
          i.inspector || <Missing />, i.result || <Missing>—</Missing>, i.corrections || <Missing>—</Missing>,
          i.reinspection || "Unknown", <span className="font-medium text-accent">{i.nextAction}</span>,
        ])} />
    </>
  );
}

/* ---------- Vendors ---------- */
export function VendorTable({ items }: { items: Vendor[] }) {
  return (
    <Table empty="No vendors named in the supplied notes."
      head={["Company", "Contact", "Service", "Phone", "Email", "Quote", "Status", "Next action"]}
      rows={items.map((v) => [
        <span className="font-medium">{v.company}</span>, v.contact || <Missing />, v.service,
        v.phone ? <span className="select-all font-mono text-[12px]">{v.phone}</span> : <Missing />,
        v.email ? <span className="select-all font-mono text-[12px]">{v.email}</span> : <Missing />,
        v.quote !== undefined ? <span className="num font-mono">{usd(v.quote)}</span> : <Missing />,
        v.status, <span className="font-medium text-accent">{v.nextAction}</span>,
      ])} />
  );
}

/* ---------- Purchases ---------- */
export function PurchaseTracker({ items, propertyLabel }: { items: (Purchase & { property?: string })[]; propertyLabel?: boolean }) {
  return (
    <Table empty="No orders or materials recorded."
      head={[...(propertyLabel ? ["Property"] : []), "Item", "Qty", "Dimensions / specs", "Vendor", "Price", "Order status", "Order #", "Payment", "Expected delivery", "Notes"]}
      rows={items.map((p) => [
        ...(propertyLabel ? [<span className="font-medium">{p.property}</span>] : []),
        <span className="font-medium">{p.item}</span>, p.quantity || <Missing />, p.specs || <Missing />,
        p.vendor || <Missing />, p.price !== undefined ? <span className="num font-mono">{usd(p.price)}</span> : <Missing />,
        <Pill tone={/deliver|install|paid/i.test(p.orderStatus) ? "ok" : /need/i.test(p.orderStatus) ? "high" : "info"}>{p.orderStatus}</Pill>,
        p.orderNumber ? <span className="font-mono">{p.orderNumber}</span> : <Missing />,
        p.paymentStatus || <Missing />, p.expectedDelivery ? fmtDate(p.expectedDelivery) : <Missing />,
        <span className="text-ink2">{p.notes}</span>,
      ])} />
  );
}

/* ---------- Upcoming ---------- */
export function UpcomingEvents({ items, overdue }: {
  items: (UpcomingEvent & { property?: string })[];
  overdue?: { date: string; title: string; property?: string; owner: string }[];
}) {
  const today = todayISO();
  const future = items.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="divide-y divide-line">
      {future.length ? future.map((e) => (
        <div key={e.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 px-4 py-2.5">
          <div className="num font-mono text-[12.5px] font-semibold text-accent">{fmtShort(e.date)}{e.time && <div className="text-[11px] font-normal text-ink3">{e.time}</div>}</div>
          <div><div className="text-[13px] font-medium">{e.title}</div>
            <div className="text-[12px] text-ink3">{e.property && `${e.property} · `}{e.kind} · <Pill tone={e.certainty === "confirmed" || e.certainty === "scheduled" ? "info" : "wait"}>{e.certainty}</Pill></div></div>
        </div>
      )) : <Empty>No confirmed upcoming inspections, deliveries, visits or deadlines on or after {fmtDate(today)}.</Empty>}
      {overdue && overdue.length > 0 && (
        <div className="bg-urgent-soft/40 px-4 py-3">
          <div className="eyebrow mb-1.5 !text-urgent">Deadlines already passed — still open</div>
          <ul className="space-y-1">
            {overdue.sort((a, b) => a.date.localeCompare(b.date)).map((o, i) => (
              <li key={i} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12.5px]">
                <span className="num font-mono text-urgent">{fmtShort(o.date)}</span>
                <span>{o.title}<span className="text-ink3"> · {o.property ? `${o.property} · ` : ""}{o.owner}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Decisions ---------- */
export function DecisionPanel({ items, onResolve }: { items: (Decision & { property?: string })[]; onResolve?: (d: Decision) => void }) {
  if (!items.length) return <Empty>No open decisions in the supplied notes.</Empty>;
  return (
    <div className="divide-y divide-line">
      {items.map((d) => (
        <div key={d.id} className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {/juan/i.test(d.decisionMaker) ? <Pill tone="approve">JUAN APPROVAL NEEDED</Pill> : <Pill tone="approve">DECISION NEEDED</Pill>}
            <span className="font-display text-[14.5px] font-semibold">{d.title}</span>
            {d.property && <span className="text-[12px] text-ink3">{d.property}</span>}
          </div>
          <div className="text-[13px] text-ink2">{d.needs}</div>
          <div className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            <div><div className="eyebrow">Decision-maker</div>{/not assigned/i.test(d.decisionMaker) ? <Missing>Not assigned</Missing> : d.decisionMaker}</div>
            <div><div className="eyebrow">Cost</div>{d.cost || <Missing />}</div>
            <div><div className="eyebrow">Deadline</div>{d.deadline ? fmtDate(d.deadline) : <Missing>None given</Missing>}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Documented options</div>
            <div className="flex flex-wrap gap-2">
              {d.options.map((o) => (
                <div key={o.label} className="rounded border border-line2 bg-sunk px-2.5 py-1.5">
                  <div className="num font-mono text-[13px] font-semibold">{o.label}</div>
                  {o.detail && <div className="max-w-[260px] text-[11.5px] text-ink2">{o.detail}</div>}
                </div>
              ))}
            </div>
          </div>
          {d.impact && <div className="text-[12.5px]"><span className="eyebrow mr-1">Impact if delayed / context</span>{d.impact}</div>}
          <details className="text-[12px] text-ink2"><summary className="cursor-pointer text-ink3">Source note</summary><p className="mt-1 font-mono text-[11.5px]">{d.sourceNote}</p></details>
          {onResolve && <button type="button" onClick={() => onResolve(d)} className="rounded border border-line2 px-2.5 py-1 text-[12px] text-ink2 hover:border-ok hover:text-ok">Mark decided</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Risks ---------- */
export function RiskPanel({ items, taskTitle }: { items: Risk[]; taskTitle: (id?: string) => string | undefined }) {
  if (!items.length) return <Empty>No risks found in the supplied notes.</Empty>;
  return (
    <div className="grid gap-px bg-line sm:grid-cols-2">
      {items.map((r) => (
        <div key={r.id} className="space-y-1 bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold">{r.risk}</span>
            {r.basis !== "from source" && <Pill tone="wait">{r.basis}</Pill>}
          </div>
          <div className="text-[12.5px] text-ink2">{r.why}</div>
          {taskTitle(r.taskId) && <div className="text-[12px] text-ink3">Related task: {taskTitle(r.taskId)}</div>}
          <div className="text-[12.5px] font-semibold text-accent">→ {r.nextAction}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Financial strip ---------- */
export function FinancialStrip({ p }: { p: Property }) {
  const f = p.financials;
  if (!f) return <Empty>No financials supplied.</Empty>;
  const rem = f.rehabBudget !== undefined && f.actualCost !== undefined ? f.rehabBudget - f.actualCost : undefined;
  const owed = f.drawAllocated !== undefined && f.drawDisbursed !== undefined ? f.drawAllocated - f.drawDisbursed : undefined;
  const cells: [string, string, string?][] = [
    ["Rehab budget", usd(f.rehabBudget)], ["Actual cost", usd(f.actualCost)],
    ["Budget remaining", usd(rem), rem !== undefined && rem < 0 ? "text-urgent" : "text-ok"],
    ["Draw allocated", usd(f.drawAllocated)], ["Draw disbursed", usd(f.drawDisbursed)], ["Draw not yet disbursed", usd(owed)],
  ];
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {cells.map(([l, v, c]) => (
          <div key={l} className="bg-surface px-3 py-2">
            <div className="eyebrow">{l}</div>
            <div className={`num font-mono text-[15px] font-semibold ${c || ""}`}>{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-ink3">Source: {f.source}. “Remaining” and “not yet disbursed” are simple differences of those figures.</p>
    </div>
  );
}
