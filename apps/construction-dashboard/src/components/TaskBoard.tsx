import { useState } from "react";
import type { Property, Task, TaskStatus } from "../data/types";
import { byUrgency, isOpen, todayISO } from "../data/derive";
import { TaskCard, type TaskEdit } from "./TaskCard";
import { Empty } from "./ui";

/** Column header shared by every task list so rows line up across sections. */
export function TaskListHead() {
  return (
    <div className="eyebrow hidden grid-cols-[minmax(0,1fr)_128px_110px_104px_110px] gap-x-3 border-b border-line px-4 py-2 md:grid">
      <span>Task</span><span>Status</span><span>Responsible</span><span>Priority</span><span>Deadline</span>
    </div>
  );
}

export function TaskBoard({ property, onSaveTask }: { property: Property; onSaveTask: (t: Task, e: TaskEdit) => void }) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const today = todayISO();
  const open = property.tasks.filter(isOpen).sort(byUrgency(today));
  const statuses = [...new Set(open.map((t) => t.status))];
  const cats = [...new Set(open.map((t) => t.category))].sort();
  const shown = open.filter((t) => (!status || t.status === status) && (!cat || t.category === cat));
  const titleOf = (id: string) => property.tasks.find((t) => t.id === id)?.title || id;

  const chip = (on: boolean) =>
    `rounded border px-2 py-0.5 text-[12px] font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink2 hover:border-line2"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
        <span className="eyebrow mr-1">Status</span>
        <button type="button" className={chip(!status)} onClick={() => setStatus(null)} aria-pressed={!status}>All {open.length}</button>
        {statuses.map((s) => (
          <button type="button" key={s} className={chip(status === s)} onClick={() => setStatus(status === s ? null : s)} aria-pressed={status === s}>
            {s} {open.filter((t) => t.status === s).length}
          </button>
        ))}
        <span className="eyebrow ml-3 mr-1">Category</span>
        <select aria-label="Filter by category" className="rounded border border-line bg-surface px-2 py-0.5 text-[12px]"
          value={cat || ""} onChange={(e) => setCat(e.target.value || null)}>
          <option value="">All</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <TaskListHead />
      {shown.length ? shown.map((t) => (
        <TaskCard key={t.id} task={t} onSave={onSaveTask} dependsOnTitles={t.dependsOn?.map(titleOf)} />
      )) : <Empty>{open.length ? "No open task matches this filter." : "No open tasks for this property."}</Empty>}
    </div>
  );
}
