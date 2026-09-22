import type { Property, Task } from "../data/types";
import {
  byUrgency, fmtDate, isOpen, isOverdue, needsActionNow, nextEvent, openDecisions, pendingInspections, propertyStatus, todayISO, daysBetween,
} from "../data/derive";
import { PRIORITY_VAR, propStyle } from "../theme/palette";
import { TaskBoard, TaskListHead } from "./TaskBoard";
import { TaskCard, type TaskEdit } from "./TaskCard";
import {
  DecisionPanel, FinancialStrip, InspectionTracker, PurchaseTracker, RiskPanel, Timeline, UpcomingEvents, VendorTable,
} from "./panels";
import { Empty, Missing, OverallBadge, Pill, PriorityBadge, PropMark, Section, StatusBadge } from "./ui";

/** One "action needed" item. The left indicator is the functional color
 * (urgent red / high orange / waiting amber / approval purple); the property
 * marker is separate. */
export function ActionCard({ t, property, accent, onOpen }: { t: Task; property?: string; accent?: string; onOpen?: () => void }) {
  const today = todayISO();
  const late = isOverdue(t, today);
  const reason = t.blocker || (late ? `Deadline ${fmtDate(t.deadline)} has passed` : t.priority === "Urgent" ? "Marked critical on Monday" : t.status);
  const signal = t.status === "Needs Approval" || t.approvalBy ? "var(--status-approval)"
    : t.status === "Waiting" ? "var(--status-waiting)" : PRIORITY_VAR[t.priority];
  return (
    <div className="prop-scope rounded-md border border-line bg-raised" style={{ ...(accent ? propStyle(accent) : {}), boxShadow: `inset 3px 0 0 ${signal}` }}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={t.priority} />
            {t.approvalBy && /juan/i.test(t.approvalBy) && <Pill c="var(--status-approval)" dot>JUAN APPROVAL NEEDED</Pill>}
            {t.waitingOn && <Pill c="var(--status-waiting)" dot>WAITING ON: {t.waitingOn.toUpperCase()}</Pill>}
            {late && <Pill c="var(--status-blocked)">{daysBetween(t.deadline!, today)} DAYS PAST DUE</Pill>}
          </div>
          <div className="mt-1.5 text-[14px] font-semibold text-ink">{t.title}</div>
          {property && <div className="mt-0.5 text-[12px]"><PropMark label={property} /></div>}
        </div>
        <StatusBadge status={t.status} />
      </div>
      <div className="grid gap-x-5 gap-y-1.5 px-4 py-2.5 text-[12.5px] sm:grid-cols-3">
        <div><span className="eyebrow block">Responsible</span>{!t.owner || t.owner === "Not assigned" ? <Missing>Not assigned</Missing> : <span className="text-ink">{t.owner}</span>}</div>
        <div><span className="eyebrow block">Deadline</span>{t.deadline ? <span className={late ? "font-semibold text-ink" : ""}>{fmtDate(t.deadline)}</span> : <Missing>None given</Missing>}</div>
        <div><span className="eyebrow block">Reason / dependency</span>{reason}</div>
      </div>
      <div className="next-slot mx-4 mb-3 rounded py-2 pl-3.5 pr-2.5 text-[13px] font-semibold text-ink">
        <span className="eyebrow mr-2">What needs to happen</span>{t.nextAction}
      </div>
      {onOpen && <div className="px-4 pb-3"><button type="button" onClick={onOpen} className="btn btn-secondary btn-sm">Open property →</button></div>}
    </div>
  );
}

export function PropertyDetail({ p, onBack, onSaveTask, onResolveDecision, asOf }: {
  p: Property; asOf: string; onBack: () => void;
  onSaveTask: (t: Task, e: TaskEdit) => void; onResolveDecision: (id: string) => void;
}) {
  const today = todayISO();
  const st = propertyStatus(p, today);
  const open = p.tasks.filter(isOpen);
  const done = p.tasks.filter((t) => !isOpen(t)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const action = open.filter((t) => needsActionNow(t, today)).sort(byUrgency(today));
  const ev = nextEvent(p, today);
  const titleOf = (id?: string) => (id ? p.tasks.find((t) => t.id === id)?.title : undefined);
  const decisions = openDecisions(p);
  const recent = done.slice(0, 3);
  const history = done.slice(3);
  // Task history feeds the property timeline, so older updates stay visible.
  const timeline = [
    ...p.timeline,
    ...p.tasks.flatMap((t) => t.history.filter((h) => !/^Imported from Monday/.test(h.note))
      .map((h) => ({ date: h.date.slice(0, 10), title: `${t.title}${h.status ? ` — ${h.status}` : ""}`, detail: h.note, source: h.source }))),
  ];

  return (
    <div className="prop-scope space-y-4" style={propStyle(p.accentColor!)}>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" onClick={onBack} className="font-medium text-ink3 hover:text-ink">All properties</button>
        <span className="text-ink4" aria-hidden>/</span>
        <PropMark label={p.address.split(",")[0]} strong />
      </nav>

      {/* Overview */}
      <header className="overflow-hidden rounded-lg border border-line bg-surface" style={{ borderTop: "3px solid var(--prop)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4"
          style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--prop) 9%, transparent), transparent 90%)" }}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill c="var(--prop)" dot>PROPERTY</Pill>
              <span className="eyebrow">{p.stage}</span>
            </div>
            <h2 className="mt-1.5 font-display text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[28px]">{p.address}</h2>
          </div>
          <OverallBadge {...st} />
        </div>
        <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div>
              <div className="eyebrow mb-0.5">Where it stands</div>
              <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-ink">{p.whereItStands}</p>
            </div>
            <div className="next-slot rounded-md py-2.5 pl-4 pr-3">
              <div className="eyebrow">What needs to happen next</div>
              <div className="text-[15px] font-semibold text-ink">{p.nextAction}</div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
            <div><dt className="eyebrow">Overall status</dt><dd className="text-ink">{st.status}<div className="text-[11.5px] text-ink3">{st.inferred ? `Inferred: ${st.reason}` : st.reason}</div></dd></div>
            <div><dt className="eyebrow">Current stage</dt><dd className="text-ink">{p.stage}</dd></div>
            <div><dt className="eyebrow">Last update</dt><dd className="num font-mono text-ink2">{fmtDate(p.lastUpdated)}</dd></div>
            <div><dt className="eyebrow">Next major milestone</dt><dd className="text-ink2">{p.nextMilestone}</dd></div>
            <div><dt className="eyebrow">Acquisition</dt><dd className="text-ink2">{p.acquisitionDate || <Missing />}</dd></div>
            <div><dt className="eyebrow">Construction timeline</dt><dd className="text-ink2">{p.constructionTimeline || <Missing>Not set on Monday</Missing>}</dd></div>
            <div><dt className="eyebrow">Next scheduled</dt><dd className="text-ink2">{ev ? `${fmtDate(ev.date)} — ${ev.label}` : <Missing>None on record</Missing>}</dd></div>
            <div><dt className="eyebrow">Open / completed</dt><dd className="num font-mono text-ink2">{open.length} open · {done.length} done{p.archivedCompleted ? ` (+${p.archivedCompleted} archived)` : ""}</dd></div>
          </dl>
        </div>
        {asOf && daysBetween(p.lastUpdated, today) > 7 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-raised px-5 py-2 text-[12px] text-ink2">
            <Pill c="var(--status-waiting)">STALE</Pill>
            Newest update is {daysBetween(p.lastUpdated, today)} days old ({fmtDate(p.lastUpdated)}). Past-due flags reflect that snapshot — paste fresh Monday notes to refresh.
          </div>
        )}
      </header>

      <Section title="Action Needed Now" count={action.length} tone="urgent" hint="Urgent, blocked, awaiting approval, or past due">
        {action.length ? <div className="grid gap-2.5 p-3 lg:grid-cols-2">{action.map((t) => <ActionCard key={t.id} t={t} />)}</div>
          : <Empty>Nothing needs immediate action.</Empty>}
      </Section>

      {decisions.length > 0 && (
        <Section title="Decisions Needed" count={decisions.length} tone="approve">
          <DecisionPanel items={decisions} onResolve={(d) => onResolveDecision(d.id)} />
        </Section>
      )}

      <Section title="Task Board" count={open.length} hint="Click a task for full detail, source notes and updates"
        right={<PropMark label={p.address.split(",")[0]} />}>
        <TaskBoard property={p} onSaveTask={onSaveTask} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Upcoming Events" count={p.upcomingEvents.filter((e) => e.date >= today).length}>
          <UpcomingEvents items={p.upcomingEvents}
            overdue={open.filter((t) => isOverdue(t, today)).map((t) => ({ date: t.deadline!, title: t.title, owner: t.owner }))} />
        </Section>
        <Section title="Timeline" count={timeline.length}>
          <Timeline entries={timeline} />
        </Section>
      </div>

      <Section title="Inspection Tracker" count={pendingInspections(p).length}>
        <InspectionTracker items={p.inspections} />
      </Section>

      <Section title="Risks / Watch Items" count={p.risks.length}>
        <RiskPanel items={p.risks} taskTitle={titleOf} />
      </Section>

      <Section title="Financials">
        <FinancialStrip p={p} />
      </Section>

      <Section title="Purchases / Materials" count={p.purchases.length} defaultOpen={p.purchases.length > 0}>
        <PurchaseTracker items={p.purchases} />
      </Section>

      <Section title="Vendors" count={p.vendors.length} defaultOpen={p.vendors.length > 0}>
        <VendorTable items={p.vendors} />
      </Section>

      {p.references?.map((r) => (
        <Section key={r.title} title={r.label} defaultOpen={false}>
          <div className="space-y-2 px-4 py-3 text-[12.5px]">
            <div>{r.url ? <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a> : <span className="font-semibold text-ink">{r.title}</span>}</div>
            <ul className="list-disc pl-4 text-ink2 marker:text-ink4">{r.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {r.table && (
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead><tr className="bg-raised">{r.table.columns.map((c) => <th key={c} className="eyebrow border-b border-line px-2.5 py-2 text-left !text-ink2">{c}</th>)}</tr></thead>
                  <tbody>{r.table.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-line last:border-0 hover:bg-hover">
                      {row.map((c, i) => (
                        <td key={i} className={`num px-2.5 py-2 ${i ? "tint font-mono" : "font-medium text-ink"}`}
                          style={i ? { ["--c" as string]: c.startsWith("(") ? "var(--status-blocked)" : "var(--status-completed)" } : undefined}>
                          {c}{i > 0 && <span className="sr-only">{c.startsWith("(") ? " loss" : " profit"}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {r.note && <p className="italic text-ink3">{r.note}</p>}
          </div>
        </Section>
      ))}

      <Section title="Recently Completed" count={recent.length} tone="ok" defaultOpen={recent.length > 0}>
        {recent.length ? <><TaskListHead />{recent.map((t) => <TaskCard key={t.id} task={t} onSave={onSaveTask} />)}</>
          : <Empty>No completed tasks with detail yet.{p.archivedCompleted ? ` Monday shows ${p.archivedCompleted} archived item${p.archivedCompleted === 1 ? "" : "s"} for this property — item details were not supplied.` : ""}</Empty>}
        {history.length > 0 && (
          <details className="border-t border-line">
            <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] font-semibold text-ink2">Completed history ({history.length})</summary>
            {history.map((t) => <TaskCard key={t.id} task={t} onSave={onSaveTask} />)}
          </details>
        )}
      </Section>
    </div>
  );
}
