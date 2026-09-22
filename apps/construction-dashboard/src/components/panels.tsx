// Property-detail panels. Each takes plain model objects and renders only
// what the source supplied — missing fields show "Not supplied".
import { useState } from "react";
import type { Decision, Inspection, Property, Purchase, Risk, TimelineEntry, UpcomingEvent, Vendor } from "../data/types";
import { fmtDate, fmtShort, todayISO, usd } from "../data/derive";
import { Empty, Missing, Pill, PropMark, Table } from "./ui";

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
      <ol className="relative space-y-3 border-l-2 border-line2 pl-5">
        {shown.map((e, i) => {
          const newest = i === 0 && !!e.date;
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[27px] top-1 block h-3 w-3 rounded-full border-2"
                style={newest ? { borderColor: "var(--prop)", background: "var(--prop)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--prop) 20%, transparent)" }
                  : { borderColor: "color-mix(in srgb, var(--prop) 60%, transparent)", background: "var(--background-card)" }} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`num font-mono text-[12px] ${newest ? "font-semibold text-ink" : "text-ink3"}`}>
                  {e.date ? fmtDate(e.date) : e.displayDate || "Date not given"}
                </span>
                {newest && <Pill c="var(--prop)">LATEST</Pill>}
              </div>
              <div className={`text-[13px] ${newest ? "font-semibold text-ink" : "font-medium text-ink2"}`}>{e.title}</div>
              {e.detail && <div className="text-[12.5px] text-ink3">{e.detail}</div>}
              <div className="text-[11px] text-ink4">{e.source}</div>
            </li>
          );
        })}
      </ol>
      {list.length > 6 && (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length} entries`}
        </button>
      )}
    </div>
  );
}

const C = (c: string) => ({ ["--c" as string]: c }) as React.CSSProperties;
const NextAct = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-ink">→ {children}</span>;

/* ---------- Inspections ---------- */
const INSPECTION_VAR: Record<Inspection["state"], string> = {
  "Not scheduled": "var(--status-not-started)", Requested: "var(--status-waiting)", Scheduled: "var(--status-scheduled)",
  "Completed — result pending": "var(--status-inspection)", Passed: "var(--status-completed)",
  Failed: "var(--status-blocked)", "Corrections required": "var(--status-correction)",
};
type WithProp = { property?: string; color?: string };
export function InspectionTracker({ items, propertyLabel }: { items: (Inspection & WithProp)[]; propertyLabel?: boolean }) {
  return (
    <>
      <p className="px-4 pt-3 pb-2 text-[12px] text-ink3">
        Scheduled ≠ completed ≠ passed. An inspection shows <Pill c="var(--status-completed)">Passed</Pill> only when a source note says so.
      </p>
      <Table empty="No inspections recorded." rowColors={items.map((i) => i.color)}
        head={[...(propertyLabel ? ["Property"] : []), "Inspection", "State", "Permit / ref", "Scheduled", "Inspector", "Result", "Corrections", "Reinspection?", "Next action"]}
        rows={items.map((i) => [
          ...(propertyLabel ? [<PropMark color={i.color} label={i.property} strong />] : []),
          <span className="font-medium text-ink">{i.type}</span>,
          <Pill c={INSPECTION_VAR[i.state]} dot>{i.state}</Pill>,
          i.permitRef || <Missing />, i.scheduledDate ? fmtDate(i.scheduledDate) : <Missing>No date</Missing>,
          i.inspector || <Missing />, i.result || <Missing>—</Missing>, i.corrections || <Missing>—</Missing>,
          i.reinspection || "Unknown", <NextAct>{i.nextAction}</NextAct>,
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
        <span className="font-medium text-ink">{v.company}</span>, v.contact || <Missing />, v.service,
        v.phone ? <span className="select-all font-mono text-[12px]">{v.phone}</span> : <Missing />,
        v.email ? <span className="select-all font-mono text-[12px]">{v.email}</span> : <Missing />,
        v.quote !== undefined ? <span className="num font-mono">{usd(v.quote)}</span> : <Missing />,
        v.status, <NextAct>{v.nextAction}</NextAct>,
      ])} />
  );
}

/* ---------- Purchases ---------- */
const orderVar = (s: string) =>
  /install|deliver/i.test(s) ? "var(--status-delivered)" : /paid/i.test(s) ? "var(--status-completed)"
  : /ready to order/i.test(s) ? "var(--status-ready)" : /order|production|pickup/i.test(s) ? "var(--status-ordered)"
  : /approval/i.test(s) ? "var(--status-approval)" : /need/i.test(s) ? "var(--status-waiting)" : "var(--status-not-started)";
export function PurchaseTracker({ items, propertyLabel }: { items: (Purchase & WithProp)[]; propertyLabel?: boolean }) {
  return (
    <Table empty="No orders or materials recorded." rowColors={items.map((i) => i.color)}
      head={[...(propertyLabel ? ["Property"] : []), "Item", "Qty", "Dimensions / specs", "Vendor", "Price", "Order status", "Order #", "Payment", "Expected delivery", "Notes"]}
      rows={items.map((p) => [
        ...(propertyLabel ? [<PropMark color={p.color} label={p.property} strong />] : []),
        <span className="font-medium text-ink">{p.item}</span>, p.quantity || <Missing />, p.specs || <Missing />,
        p.vendor || <Missing />, p.price !== undefined ? <span className="num font-mono">{usd(p.price)}</span> : <Missing />,
        <Pill c={orderVar(p.orderStatus)} dot>{p.orderStatus}</Pill>,
        p.orderNumber ? <span className="font-mono">{p.orderNumber}</span> : <Missing />,
        p.paymentStatus || <Missing />, p.expectedDelivery ? fmtDate(p.expectedDelivery) : <Missing />,
        <span className="text-ink3">{p.notes}</span>,
      ])} />
  );
}

/* ---------- Upcoming ---------- */
export function UpcomingEvents({ items, overdue }: {
  items: (UpcomingEvent & WithProp)[];
  overdue?: { date: string; title: string; owner: string; property?: string; color?: string }[];
}) {
  const today = todayISO();
  const future = items.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="divide-y divide-line">
      {future.length ? future.map((e) => (
        <div key={e.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 px-4 py-2.5">
          <div className="num font-mono text-[12.5px] font-semibold text-ink">{fmtShort(e.date)}{e.time && <div className="text-[11px] font-normal text-ink3">{e.time}</div>}</div>
          <div><div className="text-[13px] font-medium text-ink">{e.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink3">
              <PropMark color={e.color} label={e.property} />
              <span>{e.kind}</span>
              <Pill c={e.certainty === "confirmed" || e.certainty === "scheduled" ? "var(--status-scheduled)" : "var(--status-waiting)"}>{e.certainty}</Pill>
            </div></div>
        </div>
      )) : <Empty>No confirmed upcoming inspections, deliveries, visits or deadlines on or after {fmtDate(today)}.</Empty>}
      {overdue && overdue.length > 0 && (
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center gap-2"><Pill c="var(--status-blocked)" dot>PAST DUE</Pill><span className="eyebrow">Deadlines already passed — still open</span></div>
          <ul className="space-y-1.5">
            {overdue.sort((a, b) => a.date.localeCompare(b.date)).map((o, i) => (
              <li key={i} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12.5px]">
                <span className="num font-mono text-ink2">{fmtShort(o.date)}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                  {o.color && <PropMark color={o.color} label={o.property} />}
                  <span className="text-ink">{o.title}</span><span className="text-ink3">· {o.owner}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Decisions ---------- */
export function DecisionPanel({ items, onResolve }: { items: (Decision & WithProp)[]; onResolve?: (d: Decision) => void }) {
  if (!items.length) return <Empty>No open decisions in the supplied notes.</Empty>;
  return (
    <div className="divide-y divide-line">
      {items.map((d) => (
        <div key={d.id} className="space-y-2.5 px-4 py-3.5" style={d.color ? { boxShadow: `inset 3px 0 0 ${d.color}` } : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill c="var(--status-approval)" dot>{/juan/i.test(d.decisionMaker) ? "JUAN APPROVAL NEEDED" : "DECISION NEEDED"}</Pill>
            <span className="font-display text-[14.5px] font-semibold text-ink">{d.title}</span>
            {d.property && <PropMark color={d.color} label={d.property} />}
          </div>
          <div className="text-[13px] text-ink2">{d.needs}</div>
          <div className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            <div><div className="eyebrow">Decision-maker</div>{/not assigned/i.test(d.decisionMaker) ? <Missing>Not assigned</Missing> : <span className="text-ink">{d.decisionMaker}</span>}</div>
            <div><div className="eyebrow">Cost</div>{d.cost || <Missing />}</div>
            <div><div className="eyebrow">Deadline</div>{d.deadline ? fmtDate(d.deadline) : <Missing>None given</Missing>}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Documented options</div>
            <div className="flex flex-wrap gap-2">
              {d.options.map((o) => (
                <div key={o.label} className="rounded-md border border-line bg-raised px-3 py-2">
                  <div className="num font-mono text-[13px] font-semibold text-ink">{o.label}</div>
                  {o.detail && <div className="max-w-[260px] text-[11.5px] text-ink3">{o.detail}</div>}
                </div>
              ))}
            </div>
          </div>
          {d.impact && <div className="text-[12.5px] text-ink2"><span className="eyebrow mr-1">Impact / context</span>{d.impact}</div>}
          <details className="text-[12px] text-ink3"><summary className="cursor-pointer">Source note</summary><p className="mt-1 rounded border border-line bg-raised p-2 font-mono text-[11.5px] text-ink2">{d.sourceNote}</p></details>
          {onResolve && <button type="button" onClick={() => onResolve(d)} className="btn btn-secondary btn-sm">Mark decided</button>}
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
            <i className="block h-2 w-2 rounded-full" style={{ background: "var(--priority-high)" }} aria-hidden />
            <span className="text-[13.5px] font-semibold text-ink">{r.risk}</span>
            {r.basis !== "from source" && <Pill c="var(--status-waiting)">{r.basis}</Pill>}
          </div>
          <div className="text-[12.5px] text-ink2">{r.why}</div>
          {taskTitle(r.taskId) && <div className="text-[12px] text-ink3">Related task: {taskTitle(r.taskId)}</div>}
          <div className="text-[12.5px]"><NextAct>{r.nextAction}</NextAct></div>
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
    ["Budget remaining", usd(rem), rem !== undefined ? (rem < 0 ? "var(--status-blocked)" : "var(--status-completed)") : undefined],
    ["Draw allocated", usd(f.drawAllocated)], ["Draw disbursed", usd(f.drawDisbursed)], ["Draw not yet disbursed", usd(owed)],
  ];
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {cells.map(([l, v, c]) => (
          <div key={l} className="bg-raised px-3 py-2.5">
            <div className="eyebrow">{l}</div>
            <div className={`num font-mono text-[15px] font-semibold ${c ? "tint" : "text-ink"}`} style={c ? C(c) : undefined}>
              {v}{l === "Budget remaining" && rem !== undefined && <span className="ml-1.5 align-middle"><Pill c={c}>{rem < 0 ? "OVER" : "UNDER"}</Pill></span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-ink3">Source: {f.source}. “Remaining” and “not yet disbursed” are simple differences of those figures.</p>
    </div>
  );
}
