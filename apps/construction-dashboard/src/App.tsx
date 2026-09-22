import { useEffect, useMemo, useState } from "react";
import type { Property, Task } from "./data/types";
import { useDataset } from "./data/store";
import {
  byUrgency, daysBetween, fmtDate, isBlocked, isJuanApproval, isOpen, isOverdue, isWaiting, needsActionNow,
  openDecisions, propertyHaystack, summarize, todayISO,
} from "./data/derive";
import { PropertyCard } from "./components/PropertyCard";
import { ActionCard, PropertyDetail } from "./components/PropertyDetail";
import { TaskCard, type TaskEdit } from "./components/TaskCard";
import { TaskListHead } from "./components/TaskBoard";
import { DashboardFilters, EMPTY_FILTERS, filtersActive, matchTask, type Filters } from "./components/DashboardFilters";
import { DecisionPanel, InspectionTracker, PurchaseTracker, UpcomingEvents } from "./components/panels";
import { Empty, Pill, PropMark, Section } from "./components/ui";
import { propStyle } from "./theme/palette";

const VIEWS = [
  ["all", "All Properties"], ["action", "Action Needed"], ["juan", "Juan Approval"], ["inspections", "Inspections"],
  ["orders", "Orders"], ["waiting", "Waiting / Blocked"], ["upcoming", "Upcoming"], ["completed", "Completed"],
] as const;
type View = (typeof VIEWS)[number][0];
const VIEW_IDS = VIEWS.map((v) => v[0]) as string[];

const short = (p: Property) => p.address.split(",")[0];

export default function App() {
  const { properties, asOf, mode, note, saveProperty, resetLocal, localEdits, ready } = useDataset();
  const [view, setView] = useState<View>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const today = todayISO();

  // Bare-token deep links: #paramount opens a property, #inspections a quick view.
  useEffect(() => {
    const read = () => {
      const h = location.hash.replace(/^#/, "");
      if (VIEW_IDS.includes(h)) { setView(h as View); setOpenId(null); }
      else if (h) setOpenId(h);
      else setOpenId(null);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const go = (hash: string) => { try { history.pushState(null, "", hash ? `#${hash}` : location.pathname); } catch { /* sandboxed */ } };
  const openProperty = (id: string) => { setOpenId(id); go(id); scrollTo({ top: 0 }); };
  const back = () => { setOpenId(null); go(view === "all" ? "" : view); };
  const pickView = (v: View) => { setView(v); setOpenId(null); go(v === "all" ? "" : v); };

  const current = properties.find((p) => p.id === openId) || null;
  const s = useMemo(() => summarize(properties, today), [properties, today]);
  const all = properties.flatMap((p) => p.tasks.map((t) => ({ p, t })));
  const staleDays = asOf ? daysBetween(asOf, today) : 0;

  /* ---------- edits ---------- */
  const saveTask = (p: Property) => (t: Task, e: TaskEdit) => {
    const changes: string[] = [];
    const owner = e.owner.trim() || "Not assigned";
    if (e.status !== t.status) changes.push(`status ${t.status} → ${e.status}`);
    if (e.priority !== t.priority) changes.push(`priority ${t.priority} → ${e.priority}`);
    if (owner !== t.owner) changes.push(`owner → ${owner}`);
    if ((e.deadline || "") !== (t.deadline || "")) changes.push(`deadline → ${e.deadline || "none"}`);
    if (e.nextAction !== t.nextAction) changes.push("next action updated");
    if ((e.blocker || "") !== (t.blocker || "")) changes.push(e.blocker ? `blocker: ${e.blocker}` : "blocker cleared");
    const noteText = e.note.trim();
    if (!changes.length && !noteText) return;
    const now = new Date().toISOString();
    const next: Task = {
      ...t, status: e.status, owner, nextAction: e.nextAction,
      priority: e.status === "Completed" && e.priority === t.priority ? "Completed" : e.priority,
      deadline: e.deadline || undefined, blocker: e.blocker.trim() || undefined,
      date: today,
      latestUpdate: noteText || `Updated from the dashboard: ${changes.join("; ")}.`,
      history: [...t.history, { date: now, status: e.status, note: [changes.join("; "), noteText].filter(Boolean).join(" — "), source: "Dashboard edit" }],
    };
    saveProperty({ ...p, lastUpdated: today, tasks: p.tasks.map((x) => (x.id === t.id ? next : x)) });
  };
  const resolveDecision = (p: Property) => (id: string) => {
    const d = p.decisions.find((x) => x.id === id);
    saveProperty({
      ...p, lastUpdated: today,
      decisions: p.decisions.map((x) => (x.id === id ? { ...x, resolved: true } : x)),
      timeline: [...p.timeline, { date: today, title: `Decision marked decided: ${d?.title}`, source: "Dashboard edit" }],
    });
  };

  /* ---------- render helpers ---------- */
  const taskList = (rows: { p: Property; t: Task }[], empty: string) =>
    rows.length ? (
      <><TaskListHead />{rows.map(({ p, t }) => (
        <TaskCard key={`${p.id}-${t.id}`} task={t} propertyLabel={short(p)} accent={p.accentColor} onSave={saveTask(p)} onOpenProperty={() => openProperty(p.id)}
          dependsOnTitles={t.dependsOn?.map((id) => p.tasks.find((x) => x.id === id)?.title || id)} />
      ))}</>
    ) : <Empty>{empty}</Empty>;

  const sortRows = (rows: { p: Property; t: Task }[]) => rows.slice().sort((a, b) => byUrgency(today)(a.t, b.t));

  // Functional colors only — these tiles span every property, so no property accents.
  const tiles: [string, number, string, View | null, string?][] = [
    ["Active properties", s.properties, "var(--status-in-progress)", "all"],
    ["Tasks requiring action", s.action, "var(--priority-high)", "action"],
    ["Blocked tasks", s.blocked, "var(--status-blocked)", "waiting"],
    ["Waiting on vendor / third party", s.waiting, "var(--status-waiting)", "waiting"],
    ["Inspections pending", s.inspections, "var(--status-scheduled)", "inspections"],
    ["Approvals needed", s.approvals, "var(--status-approval)", "juan"],
    ["Completed tasks", s.completed, "var(--status-completed)", "completed", s.archived ? `+${s.archived} archived on Monday` : undefined],
  ];

  let body: React.ReactNode;
  if (!ready) {
    body = <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink3">{note || "Loading the property board…"}</div>;
  } else if (current) {
    body = <PropertyDetail p={current} asOf={asOf} onBack={back} onSaveTask={saveTask(current)} onResolveDecision={resolveDecision(current)} />;
  } else if (openId) {
    body = <div className="rounded-lg border border-line bg-surface p-6 text-ink2">No property with id “{openId}”. <button className="btn btn-secondary btn-sm ml-2" onClick={back}>Back to all properties</button></div>;
  } else if (view === "all") {
    const active = filtersActive(filters);
    const matches = active ? sortRows(all.filter(({ p, t }) => matchTask(p, t, filters, today))) : [];
    const words = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const onlySearch = active && Object.entries(filters).every(([k, v]) => k === "q" || !v);
    const cards = !active ? properties : properties.filter((p) =>
      matches.some((m) => m.p.id === p.id) || (onlySearch && words.every((w) => propertyHaystack(p).includes(w))));
    body = (
      <div className="space-y-4">
        <DashboardFilters f={filters} set={setFilters} properties={properties} />
        {active && (
          <Section title="Matching tasks" count={matches.length}>
            {taskList(matches, "No task matches these filters.")}
          </Section>
        )}
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[18px] font-bold tracking-tight text-ink">{active ? "Matching properties" : "Properties"}</h2>
          <span className="text-[12px] text-ink3">{cards.length} of {properties.length}</span>
        </div>
        {active && cards.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
            {cards.map((p) => <PropMark key={p.id} color={p.accentColor} label={short(p)} />)}
          </div>
        )}
        {cards.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((p) => <PropertyCard key={p.id} p={p} onOpen={() => openProperty(p.id)} />)}
          </div>
        ) : <div className="rounded-lg border border-line bg-surface"><Empty>No property matches.</Empty></div>}
      </div>
    );
  } else if (view === "action") {
    const rows = sortRows(all.filter(({ t }) => needsActionNow(t, today)));
    body = (
      <Section title="Action Needed Now — all properties" count={rows.length} tone="urgent" hint="Urgent, blocked, awaiting approval, or past due">
        {rows.length ? <div className="grid gap-2.5 p-3 lg:grid-cols-2">{rows.map(({ p, t }) => <ActionCard key={`${p.id}-${t.id}`} t={t} property={p.address} accent={p.accentColor} onOpen={() => openProperty(p.id)} />)}</div>
          : <Empty>Nothing needs immediate action.</Empty>}
      </Section>
    );
  } else if (view === "juan") {
    const juanTasks = sortRows(all.filter(({ t }) => isJuanApproval(t)));
    const decisions = properties.flatMap((p) => openDecisions(p).map((d) => ({ ...d, property: p.address, color: p.accentColor })));
    const juanDecisions = decisions.filter((d) => /juan/i.test(d.decisionMaker));
    const otherDecisions = decisions.filter((d) => !/juan/i.test(d.decisionMaker));
    body = (
      <div className="space-y-4">
        <Section title="Juan Approval Needed" count={juanTasks.length + juanDecisions.length} tone="approve">
          {juanTasks.length + juanDecisions.length === 0 && <Empty>Nothing in the supplied notes names Juan as the approver.</Empty>}
          {juanDecisions.length > 0 && <DecisionPanel items={juanDecisions} />}
          {juanTasks.length > 0 && taskList(juanTasks, "")}
        </Section>
        <Section title="Other open decisions" count={otherDecisions.length} hint="Decision-maker not named or someone other than Juan">
          <DecisionPanel items={otherDecisions} />
        </Section>
      </div>
    );
  } else if (view === "inspections") {
    const items = properties.flatMap((p) => p.inspections.map((i) => ({ ...i, property: short(p), color: p.accentColor })));
    body = <Section title="Inspection Tracker — all properties" count={items.filter((i) => i.state !== "Passed").length}><InspectionTracker items={items} propertyLabel /></Section>;
  } else if (view === "orders") {
    const items = properties.flatMap((p) => p.purchases.map((x) => ({ ...x, property: short(p), color: p.accentColor })));
    body = <Section title="Orders & Materials — all properties" count={items.length}><PurchaseTracker items={items} propertyLabel /></Section>;
  } else if (view === "waiting") {
    const blocked = sortRows(all.filter(({ t }) => isBlocked(t)));
    const waiting = sortRows(all.filter(({ t }) => isWaiting(t) && !isBlocked(t)));
    body = (
      <div className="space-y-4">
        <Section title="Blocked" count={blocked.length} tone="urgent">{taskList(blocked, "Nothing is blocked.")}</Section>
        <Section title="Waiting on someone" count={waiting.length}>{taskList(waiting, "Nothing is waiting on a vendor or third party.")}</Section>
      </div>
    );
  } else if (view === "upcoming") {
    const events = properties.flatMap((p) => p.upcomingEvents.map((e) => ({ ...e, property: short(p), color: p.accentColor })));
    const overdue = all.filter(({ t }) => isOverdue(t, today)).map(({ p, t }) => ({ date: t.deadline!, title: t.title, owner: t.owner, property: short(p), color: p.accentColor }));
    body = <Section title="Upcoming — all properties" count={events.filter((e) => e.date >= today).length}><UpcomingEvents items={events} overdue={overdue} /></Section>;
  } else {
    const done = all.filter(({ t }) => !isOpen(t)).sort((a, b) => (b.t.date || "").localeCompare(a.t.date || ""));
    body = (
      <div className="space-y-4">
        <Section title="Recently Completed" count={Math.min(done.length, 8)} tone="ok">{taskList(done.slice(0, 8), "No completed tasks with detail yet.")}</Section>
        {done.length > 8 && <Section title="Completed History" count={done.length - 8} defaultOpen={false}>{taskList(done.slice(8), "")}</Section>}
        <Section title="Archived on Monday (no item detail supplied)" count={s.archived} defaultOpen>
          <ul className="divide-y divide-line">
            {properties.filter((p) => p.archivedCompleted).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 px-4 py-2 text-[13px] hover:bg-hover"><PropMark color={p.accentColor} label={p.address} /><span className="num font-mono text-ink">{p.archivedCompleted}</span></li>
            ))}
          </ul>
        </Section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-5 pb-3">
        <div>
          <div className="eyebrow">Equity Track Inc · Twin Home Buyer · Construction Operations</div>
          <h1 className="mt-1 font-display text-[26px] font-extrabold leading-none tracking-tight text-ink sm:text-[30px]">Construction Control</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink2">
          <span className="inline-flex items-center gap-1.5">
            <i className="block h-2 w-2 rounded-full" style={{ background: mode === "live" ? "var(--status-completed)" : mode === "loading" ? "var(--border-strong)" : "var(--status-waiting)" }} />
            {mode === "live" ? "Live — changes save for the whole team" : mode === "loading" ? "Connecting…" : mode === "error" ? note : "Local — edits save in this browser"}
          </span>
          {mode === "local" && localEdits > 0 && (
            <button type="button" onClick={resetLocal} className="btn btn-danger btn-sm">Discard {localEdits} local edit{localEdits === 1 ? "" : "s"}</button>
          )}
          {asOf && <span>Board data as of <b className="num font-mono font-semibold text-ink">{fmtDate(asOf)}</b></span>}
        </div>
      </header>

      {staleDays > 7 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-4 py-2.5 text-[13px] text-ink2"
          style={{ boxShadow: "inset 3px 0 0 var(--status-waiting)" }}>
          <Pill c="var(--status-waiting)" dot>STALE DATA</Pill>
          <span><b className="text-ink">Board data is {staleDays} days old.</b> Deadlines before today show as past due until newer Monday.com updates are loaded.</span>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([label, n, color, v, sub]) => (
          <button key={label} type="button" onClick={() => v && pickView(v)} aria-pressed={!current && view === v}
            className={`rounded-lg border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-hover ${!current && view === v && v !== "all" ? "border-line2" : "border-line"}`}
            style={{ boxShadow: `inset 0 2px 0 color-mix(in srgb, ${color} ${!current && view === v && v !== "all" ? 100 : 55}%, transparent)` }}>
            <div className="flex items-center gap-2">
              <i className="block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
              <span className="num font-mono text-[26px] font-semibold leading-none text-ink">{n}</span>
            </div>
            <div className="mt-2 text-[11.5px] font-medium leading-tight text-ink2">{label}</div>
            {sub && <div className="text-[10.5px] text-ink3">{sub}</div>}
          </button>
        ))}
      </div>

      <nav className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-4 mb-4 overflow-x-auto border-y border-line bg-nav/95 px-4 backdrop-blur sm:-mx-6 sm:px-6" aria-label="Quick views">
        <div className="flex items-center gap-1 py-1.5">
          {VIEWS.map(([id, label]) => {
            const on = !current && view === id;
            return (
              <button key={id} type="button" onClick={() => pickView(id)} aria-current={on ? "page" : undefined}
                className={`min-h-[36px] whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-semibold ${on ? "bg-raised text-ink" : "text-ink3 hover:bg-surface hover:text-ink2"}`}
                style={on ? { boxShadow: "inset 0 -2px 0 var(--text-primary)" } : undefined}>
                {label}
              </button>
            );
          })}
          {current && (
            <>
              <span className="mx-1 h-5 w-px flex-none bg-line2" aria-hidden />
              <span aria-current="page" className="inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink"
                style={{ ...propStyle(current.accentColor!), background: `color-mix(in srgb, ${current.accentColor} 14%, transparent)`, boxShadow: `inset 0 -2px 0 ${current.accentColor}` }}>
                <span className="prop-dot" aria-hidden />{short(current)}
              </span>
            </>
          )}
        </div>
      </nav>

      <main>{body}</main>

      <footer className="mt-10 border-t border-line pt-3 text-[11.5px] text-ink4">
        Sources: Monday.com Open Work board (Construction Team) and Properties board, snapshot {fmtDate(asOf)}. Statuses marked “inferred” are derived from task data, not stated on Monday. Nothing here is added beyond the supplied notes.
      </footer>
    </div>
  );
}
