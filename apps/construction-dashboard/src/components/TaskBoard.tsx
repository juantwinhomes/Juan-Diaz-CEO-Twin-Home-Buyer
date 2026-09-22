import { useState } from "react";
import type { Property, Task, TaskStatus } from "../data/types";
import { TASK_STATUSES } from "../data/types";
import { byUrgency, fmtShort, isOpen, isOverdue, isUnassigned, todayISO } from "../data/derive";
import { STATUS_VAR } from "../theme/palette";
import { TASK_GRID, TaskCard, type TaskEdit } from "./TaskCard";
import { Empty, PriorityBadge } from "./ui";

/** Column header shared by every task list so rows line up across sections. */
export function TaskListHead() {
  return (
    <div className={`eyebrow hidden gap-x-3 border-b border-line bg-raised px-4 py-2 md:grid ${TASK_GRID}`}>
      <span>Task</span><span>Status</span><span>Responsible</span><span>Priority</span><span>Deadline</span>
    </div>
  );
}

const chip = (on: boolean) =>
  `rounded-md border px-2.5 py-1 text-[12px] font-medium ${on ? "border-line2 bg-hover text-ink" : "border-line bg-surface text-ink3 hover:text-ink2"}`;

export function TaskBoard({ property, onSaveTask }: { property: Property; onSaveTask: (t: Task, e: TaskEdit) => void }) {
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const today = todayISO();
  const open = property.tasks.filter(isOpen).sort(byUrgency(today));
  const statuses = TASK_STATUSES.filter((s) => open.some((t) => t.status === s));
  const cats = [...new Set(open.map((t) => t.category))].sort();
  const shown = open.filter((t) => (!status || t.status === status) && (!cat || t.category === cat));
  const titleOf = (id: string) => property.tasks.find((t) => t.id === id)?.title || id;
  const focused = property.tasks.find((t) => t.id === focus);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
        <div className="mr-2 inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label="Layout">
          {(["list", "board"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLayout(l)} aria-pressed={layout === l}
              className={`px-3 py-1 text-[12px] font-semibold capitalize ${layout === l ? "bg-hover text-ink" : "bg-surface text-ink3 hover:text-ink2"}`}
              style={layout === l ? { boxShadow: "inset 0 -2px 0 var(--prop)" } : undefined}>{l}</button>
          ))}
        </div>
        <span className="eyebrow mr-1">Status</span>
        <button type="button" className={chip(!status)} onClick={() => setStatus(null)} aria-pressed={!status}>All {open.length}</button>
        {statuses.map((s) => (
          <button type="button" key={s} className={chip(status === s)} onClick={() => setStatus(status === s ? null : s)} aria-pressed={status === s}>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS_VAR[s] }} />{s} {open.filter((t) => t.status === s).length}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2">
          <span className="eyebrow">Category</span>
          <select aria-label="Filter by category" id={`cat-${property.id}`} className="field !w-auto !py-1 !text-[12px]"
            value={cat || ""} onChange={(e) => setCat(e.target.value || null)}>
            <option value="">All</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {layout === "list" ? (
        <>
          <TaskListHead />
          {shown.length ? shown.map((t) => (
            <TaskCard key={t.id} task={t} onSave={onSaveTask} dependsOnTitles={t.dependsOn?.map(titleOf)} />
          )) : <Empty>{open.length ? "No open task matches this filter." : "No open tasks for this property."}</Empty>}
        </>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto p-3">
            {(status ? [status] : statuses).map((s) => {
              const col = shown.filter((t) => t.status === s);
              return (
                <div key={s} className="flex w-[260px] flex-none flex-col rounded-lg border border-line bg-ground">
                  <div className="flex items-center gap-2 rounded-t-lg border-b border-line px-3 py-2" style={{ borderTop: `2px solid ${STATUS_VAR[s]}` }}>
                    <i className="block h-2 w-2 rounded-full" style={{ background: STATUS_VAR[s] }} />
                    <span className="text-[12.5px] font-semibold text-ink">{s}</span>
                    <span className="num ml-auto font-mono text-[11px] text-ink3">{col.length}</span>
                  </div>
                  <div className="space-y-2 p-2">
                    {col.map((t) => (
                      <button key={t.id} type="button" onClick={() => setFocus(focus === t.id ? null : t.id)} aria-pressed={focus === t.id}
                        className={`block w-full rounded-md border bg-surface px-3 py-2 text-left hover:bg-hover ${focus === t.id ? "border-line2" : "border-line"}`}
                        style={{ boxShadow: `inset 2px 0 0 ${focus === t.id ? "var(--prop)" : "color-mix(in srgb, var(--prop) 55%, transparent)"}` }}>
                        <div className="text-[13px] font-semibold leading-snug text-ink">{t.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                          <PriorityBadge priority={t.priority} compact />
                          <span className={isUnassigned(t) ? "italic text-ink4" : "text-ink2"}>{t.owner}</span>
                          {t.deadline && <span className={`num font-mono ${isOverdue(t, today) ? "text-ink" : "text-ink3"}`}>{fmtShort(t.deadline)}{isOverdue(t, today) ? " · late" : ""}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {focused && (
            <div className="border-t border-line">
              <TaskCard key={focused.id} task={focused} onSave={onSaveTask} dependsOnTitles={focused.dependsOn?.map(titleOf)} defaultOpen />
            </div>
          )}
          {!shown.length && <Empty>No open task matches this filter.</Empty>}
        </>
      )}
    </div>
  );
}
