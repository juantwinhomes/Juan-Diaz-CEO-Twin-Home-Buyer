import { useState } from "react";
import type { Priority, Task, TaskStatus } from "../data/types";
import { PRIORITIES, TASK_STATUSES } from "../data/types";
import { fmtDate, isOverdue, isUnassigned, todayISO, usd, daysBetween } from "../data/derive";
import { Field, Missing, PriorityBadge, StatusBadge, Pill } from "./ui";

export interface TaskEdit {
  status: TaskStatus; priority: Priority; owner: string; deadline: string;
  nextAction: string; blocker: string; note: string;
}

function DetailList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <Missing>{empty}</Missing>;
  return <ul className="list-disc space-y-0.5 pl-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

export function TaskCard({ task, propertyLabel, dependsOnTitles, onSave, onOpenProperty, defaultOpen }: {
  task: Task; propertyLabel?: string; dependsOnTitles?: string[];
  onSave?: (t: Task, e: TaskEdit) => void; onOpenProperty?: () => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const today = todayISO();
  const late = isOverdue(task, today);
  const done = task.status === "Completed";

  return (
    <article className={`border-b border-line last:border-0 ${done ? "bg-sunk/60" : ""}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-sunk md:grid-cols-[minmax(0,1fr)_128px_110px_104px_110px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[13.5px] font-semibold ${done ? "text-ink2 line-through decoration-ink3" : ""}`}>{task.title}</span>
            {task.stage && <Pill>{task.stage}</Pill>}
            {task.flags?.map((f) => <Pill key={f} tone="high">{f}</Pill>)}
            {task.approvalBy && /juan/i.test(task.approvalBy) && <Pill tone="approve">JUAN APPROVAL NEEDED</Pill>}
            {task.needsVerification && <Pill tone="wait">Needs Verification</Pill>}
          </div>
          <div className="mt-0.5 text-[12px] text-ink3">
            {propertyLabel && <span className="font-medium text-ink2">{propertyLabel} · </span>}
            {task.category}
            {task.blocker && !done && <span className="text-urgent"> · Blocker: {task.blocker}</span>}
          </div>
        </div>
        <div className="justify-self-end md:justify-self-start"><StatusBadge status={task.status} /></div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
          <span className={`text-[12.5px] md:py-0.5 ${isUnassigned(task) ? "italic text-ink3" : "font-medium"}`}>{task.owner || "Not assigned"}</span>
          <span className="md:py-0.5"><PriorityBadge priority={task.priority} compact /></span>
          <span className={`num font-mono text-[12px] md:py-0.5 ${late ? "font-semibold text-urgent" : "text-ink2"}`}>
            {task.deadline ? fmtDate(task.deadline) : <span className="text-ink3">No date</span>}
            {late && <span className="ml-1 rounded bg-urgent px-1 text-[10px] text-white">{daysBetween(task.deadline!, today)}d late</span>}
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 px-4 pb-4">
          <div className="next-slot rounded-md py-2.5 pl-4 pr-3">
            <div className="eyebrow !text-accent">Next action</div>
            <div className="text-[14px] font-semibold text-accent">{task.nextAction || <Missing>None recorded</Missing>}</div>
            {task.waitingOn && !done && <div className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-wait">Waiting on: {task.waitingOn}</div>}
          </div>

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Task">{task.title}</Field>
            <Field label="Current status"><StatusBadge status={task.status} /></Field>
            <Field label="Latest update" wide>
              {task.latestUpdate}
              {task.date && <span className="ml-1 font-mono text-[11px] text-ink3">({fmtDate(task.date)})</span>}
            </Field>
            <Field label="Completed"><DetailList items={task.completedWork} empty="Nothing recorded as finished" /></Field>
            <Field label="Pending"><DetailList items={task.pendingWork} empty="Nothing listed" /></Field>
            <Field label="Responsible">{isUnassigned(task) ? <Missing>Not assigned</Missing> : task.owner}</Field>
            <Field label="Deadline / schedule">{task.deadline ? <span className={late ? "font-semibold text-urgent" : ""}>{fmtDate(task.deadline, true)}{late ? " — past due" : ""}</span> : <Missing>No confirmed date</Missing>}</Field>
            <Field label="Blocker">{task.blocker ? <span className="text-urgent">{task.blocker}</span> : <Missing>None recorded</Missing>}</Field>
            <Field label="Depends on">{dependsOnTitles?.length ? dependsOnTitles.join(" → ") : <Missing>None recorded</Missing>}</Field>
            <Field label="Vendor">{task.vendor || <Missing />}</Field>
            <Field label="Cost">
              {task.cost && (task.cost.quote ?? task.cost.approved ?? task.cost.paid ?? task.cost.balance) !== undefined ? (
                <span className="num font-mono text-[12.5px]">
                  {task.cost.quote !== undefined && <>Quote {usd(task.cost.quote)} · </>}
                  {task.cost.approved !== undefined && <>Approved {usd(task.cost.approved)} · </>}
                  {task.cost.paid !== undefined && <>Paid {usd(task.cost.paid)} · </>}
                  {task.cost.balance !== undefined && <>Balance {usd(task.cost.balance)}</>}
                </span>
              ) : <Missing />}
            </Field>
            {task.needsVerification && <Field label="Needs verification" wide><span className="text-wait">{task.needsVerification}</span></Field>}
            {task.reference && <Field label="Reference" wide>{task.reference}</Field>}
          </div>

          {task.history.length > 0 && (
            <div>
              <div className="eyebrow mb-1">Update history</div>
              <ol className="space-y-1 border-l border-line2 pl-3">
                {task.history.slice().reverse().map((h, i) => (
                  <li key={i} className={`text-[12.5px] ${i === 0 ? "text-ink" : "text-ink2"}`}>
                    <span className="num mr-2 font-mono text-[11px] text-ink3">{fmtDate(h.date)}</span>
                    {h.status && <span className="mr-1 font-semibold">{h.status}.</span>}{h.note}
                    <span className="ml-1 text-[11px] text-ink3">— {h.source}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowSource(!showSource)} aria-expanded={showSource}
              className="rounded border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink2 hover:border-line2 hover:text-ink">
              {showSource ? "Hide" : "Show"} source notes
            </button>
            {onSave && !editing && (
              <button type="button" onClick={() => setEditing(true)}
                className="rounded border border-accent bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-accent2">
                Update task
              </button>
            )}
            {onOpenProperty && (
              <button type="button" onClick={onOpenProperty}
                className="rounded border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-accent hover:border-accent">
                Open property →
              </button>
            )}
          </div>
          {showSource && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-line bg-sunk p-3 font-mono text-[11.5px] leading-relaxed text-ink2">{task.sourceNote}</pre>
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
  const input = "w-full rounded border border-line2 bg-surface px-2 py-1.5 text-[13px]";
  const id = (k: string) => `edit-${task.id}-${k}`;
  return (
    <form className="grid gap-3 rounded-md border border-line2 bg-sunk p-3 sm:grid-cols-2"
      onSubmit={(ev) => { ev.preventDefault(); onSave(e); }}>
      <label className="text-[12px]" htmlFor={id("status")}><span className="eyebrow block">Status</span>
        <select id={id("status")} className={input} value={e.status} onChange={(x) => set("status", x.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select></label>
      <label className="text-[12px]" htmlFor={id("priority")}><span className="eyebrow block">Priority</span>
        <select id={id("priority")} className={input} value={e.priority} onChange={(x) => set("priority", x.target.value as Priority)}>
          {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
        </select></label>
      <label className="text-[12px]" htmlFor={id("owner")}><span className="eyebrow block">Responsible</span>
        <input id={id("owner")} className={input} value={e.owner} onChange={(x) => set("owner", x.target.value)} /></label>
      <label className="text-[12px]" htmlFor={id("deadline")}><span className="eyebrow block">Deadline</span>
        <input id={id("deadline")} type="date" className={input} value={e.deadline} onChange={(x) => set("deadline", x.target.value)} /></label>
      <label className="text-[12px] sm:col-span-2" htmlFor={id("next")}><span className="eyebrow block">Next action</span>
        <input id={id("next")} className={input} value={e.nextAction} onChange={(x) => set("nextAction", x.target.value)} /></label>
      <label className="text-[12px] sm:col-span-2" htmlFor={id("blocker")}><span className="eyebrow block">Blocker (leave empty if none)</span>
        <input id={id("blocker")} className={input} value={e.blocker} onChange={(x) => set("blocker", x.target.value)} /></label>
      <label className="text-[12px] sm:col-span-2" htmlFor={id("note")}><span className="eyebrow block">Update note — becomes the latest update; the old one moves to history</span>
        <textarea id={id("note")} rows={2} className={input} value={e.note} onChange={(x) => set("note", x.target.value)} placeholder="What changed?" /></label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="rounded bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-accent2">Save update</button>
        <button type="button" onClick={onCancel} className="rounded border border-line2 bg-surface px-3 py-1.5 text-[12.5px] text-ink2">Cancel</button>
      </div>
    </form>
  );
}
