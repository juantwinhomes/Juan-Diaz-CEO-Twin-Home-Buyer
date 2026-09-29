import { useState } from "react";
import type { Priority, Task, TaskStatus } from "../data/types";
import { PRIORITIES, TASK_STATUSES } from "../data/types";
import { fmtDate, isOverdue, isUnassigned, todayISO, usd, daysBetween } from "../data/derive";
import { STATUS_VAR, propStyle } from "../theme/palette";
import { Field, Missing, Pill, PriorityBadge, PropMark, StatusBadge } from "./ui";

export interface TaskEdit {
  status: TaskStatus; priority: Priority; owner: string; deadline: string;
  nextAction: string; blocker: string; note: string;
}

function DetailList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <Missing>{empty}</Missing>;
  return <ul className="list-disc space-y-0.5 pl-4 marker:text-ink4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** Grid shared with TaskListHead so every task list lines up. */
export const TASK_GRID = "md:grid-cols-[minmax(0,1fr)_132px_112px_96px_116px]";

export function TaskCard({ task, propertyLabel, accent, dependsOnTitles, onSave, onOpenProperty, defaultOpen }: {
  task: Task; propertyLabel?: string; accent?: string; dependsOnTitles?: string[];
  onSave?: (t: Task, e: TaskEdit) => void; onOpenProperty?: () => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const today = todayISO();
  const late = isOverdue(task, today);
  const done = task.status === "Completed";

  return (
    <article
      className={`prop-scope border-b border-line last:border-0 ${open ? "bg-raised" : ""}`}
      style={{ ...(accent ? propStyle(accent) : {}), boxShadow: `inset ${open ? 3 : 2}px 0 0 color-mix(in srgb, var(--prop) ${open ? 100 : 55}%, transparent)` }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-hover ${TASK_GRID}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[13.5px] font-semibold ${done ? "text-ink3 line-through decoration-ink4" : "text-ink"}`}>{task.title}</span>
            {task.stage && <Pill>{task.stage}</Pill>}
            {task.flags?.map((f) => <Pill key={f} c="var(--priority-high)">{f}</Pill>)}
            {task.approvalBy && /juan/i.test(task.approvalBy) && <Pill c="var(--status-approval)">JUAN APPROVAL NEEDED</Pill>}
            {task.needsVerification && <Pill c="var(--status-waiting)">Needs Verification</Pill>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink3">
            {propertyLabel && <PropMark label={propertyLabel} />}
            {propertyLabel && <span aria-hidden>·</span>}
            <span>{task.category}</span>
            {task.blocker && !done && <span className="tint" style={{ ["--c" as string]: "var(--status-blocked)" }}>· Blocker: {task.blocker}</span>}
          </div>
        </div>
        <div className="justify-self-end md:justify-self-start"><StatusBadge status={task.status} /></div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
          <span className={`text-[12.5px] md:py-0.5 ${isUnassigned(task) ? "italic text-ink4" : "font-medium text-ink2"}`}>{task.owner || "Not assigned"}</span>
          <span className="md:py-0.5"><PriorityBadge priority={task.priority} compact /></span>
          <span className={`num font-mono text-[12px] md:py-0.5 ${late ? "font-semibold text-ink" : "text-ink3"}`}>
            {task.deadline ? fmtDate(task.deadline) : <span className="text-ink4">No date</span>}
            {late && <span className="ml-1.5"><Pill c="var(--status-blocked)">{daysBetween(task.deadline!, today)}d late</Pill></span>}
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 px-4 pb-4">
          <div className="next-slot rounded-md py-2.5 pl-4 pr-3">
            <div className="eyebrow">Next action</div>
            <div className="text-[14px] font-semibold text-ink">{task.nextAction || <Missing>None recorded</Missing>}</div>
            {task.waitingOn && !done && <div className="mt-1.5"><Pill c="var(--status-waiting)">WAITING ON: {task.waitingOn.toUpperCase()}</Pill></div>}
          </div>

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Task"><span className="text-ink">{task.title}</span></Field>
            <Field label="Current status"><StatusBadge status={task.status} /></Field>
            <Field label="Latest update" wide>
              <span className="text-ink">{task.latestUpdate}</span>
              {task.date && <span className="ml-1 font-mono text-[11px] text-ink3">({fmtDate(task.date)})</span>}
            </Field>
            <Field label="Completed"><DetailList items={task.completedWork} empty="Nothing recorded as finished" /></Field>
            <Field label="Pending"><DetailList items={task.pendingWork} empty="Nothing listed" /></Field>
            <Field label="Responsible">{isUnassigned(task) ? <Missing>Not assigned</Missing> : <span className="text-ink">{task.owner}</span>}</Field>
            <Field label="Deadline / schedule">{task.deadline
              ? <span className={late ? "font-semibold text-ink" : ""}>{fmtDate(task.deadline, true)}{late && <span className="ml-1.5"><Pill c="var(--status-blocked)">PAST DUE</Pill></span>}</span>
              : <Missing>No confirmed date</Missing>}</Field>
            <Field label="Blocker">{task.blocker ? <span className="tint" style={{ ["--c" as string]: "var(--status-blocked)" }}>{task.blocker}</span> : <Missing>None recorded</Missing>}</Field>
            <Field label="Depends on">{dependsOnTitles?.length ? dependsOnTitles.join(" → ") : <Missing>None recorded</Missing>}</Field>
            <Field label="Vendor">{task.vendor || <Missing />}</Field>
            <Field label="Cost">
              {task.cost && (task.cost.quote ?? task.cost.approved ?? task.cost.paid ?? task.cost.balance) !== undefined ? (
                <span className="num font-mono text-[12.5px] text-ink">
                  {task.cost.quote !== undefined && <>Quote {usd(task.cost.quote)} · </>}
                  {task.cost.approved !== undefined && <>Approved {usd(task.cost.approved)} · </>}
                  {task.cost.paid !== undefined && <>Paid {usd(task.cost.paid)} · </>}
                  {task.cost.balance !== undefined && <>Balance {usd(task.cost.balance)}</>}
                </span>
              ) : <Missing />}
            </Field>
            {task.needsVerification && <Field label="Needs verification" wide><span className="tint" style={{ ["--c" as string]: "var(--status-waiting)" }}>{task.needsVerification}</span></Field>}
            {task.reference && <Field label="Reference" wide>{task.reference}</Field>}
          </div>

          {task.history.length > 0 && (
            <div>
              <div className="eyebrow mb-1.5">Update history</div>
              <ol className="space-y-1.5">
                {task.history.slice().reverse().map((h, i) => (
                  <li key={i} className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink3">
                      <span className="prop-dot !h-2 !w-2" aria-hidden />
                      <span className="num font-mono">{fmtDate(h.date)}</span>
                      {h.status && <Pill c={STATUS_VAR[h.status]}>{h.status}</Pill>}
                      <span>{h.source}</span>
                    </div>
                    <div className={`mt-1 ${i === 0 ? "text-ink" : "text-ink2"}`}>{h.note}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {onSave && !editing && <button type="button" onClick={() => setEditing(true)} className="btn btn-primary btn-sm">Update task</button>}
            <button type="button" onClick={() => setShowSource(!showSource)} aria-expanded={showSource} className="btn btn-secondary btn-sm">
              {showSource ? "Hide" : "Show"} source notes
            </button>
            {onOpenProperty && <button type="button" onClick={onOpenProperty} className="btn btn-secondary btn-sm">Open property →</button>}
          </div>
          {showSource && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-ink2"
              style={{ borderTop: "2px solid var(--prop)" }}>{task.sourceNote}</pre>
          )}
          {editing && onSave && <TaskEditor task={task} onCancel={() => setEditing(false)} onSave={(e) => { onSave(task, e); setEditing(false); }} />}
        </div>
      )}
    </article>
  );
}

function TaskEditor({ task, onSave, onCancel }: { task: Task; onSave: (e: TaskEdit) => void; onCancel: () => void }) {
  const [e, setE] = useState<TaskEdit>({
    status: task.status, priority: task.priority, owner: task.owner, deadline: task.deadline || "",
    nextAction: task.nextAction, blocker: task.blocker || "", note: "",
  });
  const set = <K extends keyof TaskEdit>(k: K, v: TaskEdit[K]) => setE({ ...e, [k]: v });
  const id = (k: string) => `edit-${task.id}-${k}`;
  const lab = "block text-[12px]";
  return (
    <form className="grid gap-3 rounded-lg border border-line2 bg-surface p-4 sm:grid-cols-2" style={{ borderTop: "2px solid var(--prop)" }}
      onSubmit={(ev) => { ev.preventDefault(); onSave(e); }}>
      <div className="flex items-center gap-2 sm:col-span-2">
        <span className="prop-dot" aria-hidden />
        <h4 className="font-display text-[14px] font-semibold">Construction update — {task.title}</h4>
      </div>
      <label className={lab} htmlFor={id("status")}><span className="eyebrow mb-1 block">Status</span>
        <select id={id("status")} className="field" value={e.status} onChange={(x) => set("status", x.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select></label>
      <label className={lab} htmlFor={id("priority")}><span className="eyebrow mb-1 block">Priority</span>
        <select id={id("priority")} className="field" value={e.priority} onChange={(x) => set("priority", x.target.value as Priority)}>
          {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
        </select></label>
      <label className={lab} htmlFor={id("owner")}><span className="eyebrow mb-1 block">Responsible</span>
        <input id={id("owner")} className="field" value={e.owner} onChange={(x) => set("owner", x.target.value)} /></label>
      <label className={lab} htmlFor={id("deadline")}><span className="eyebrow mb-1 block">Deadline</span>
        <input id={id("deadline")} type="date" className="field" value={e.deadline} onChange={(x) => set("deadline", x.target.value)} /></label>
      <label className={`${lab} sm:col-span-2`} htmlFor={id("next")}><span className="eyebrow mb-1 block">Next action</span>
        <input id={id("next")} className="field" value={e.nextAction} onChange={(x) => set("nextAction", x.target.value)} /></label>
      <label className={`${lab} sm:col-span-2`} htmlFor={id("blocker")}><span className="eyebrow mb-1 block">Blocker (leave empty if none)</span>
        <input id={id("blocker")} className="field" value={e.blocker} onChange={(x) => set("blocker", x.target.value)} /></label>
      <label className={`${lab} sm:col-span-2`} htmlFor={id("note")}><span className="eyebrow mb-1 block">Update note — becomes the latest update; the old one moves to history</span>
        <textarea id={id("note")} rows={2} className="field" value={e.note} onChange={(x) => set("note", x.target.value)} placeholder="What changed on site?" /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary">Save update</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
      </div>
    </form>
  );
}
