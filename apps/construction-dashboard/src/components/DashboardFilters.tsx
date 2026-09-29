import type { Property, Task } from "../data/types";
import { PRIORITIES, TASK_STATUSES } from "../data/types";
import { isBlocked, isOpen, isOverdue, isWaiting, needsApproval, taskHaystack, todayISO } from "../data/derive";

export interface Filters {
  q: string; property: string; status: string; priority: string; owner: string; category: string; vendor: string;
  due: "" | "overdue" | "week" | "dated" | "none";
  approval: boolean; waiting: boolean; blocked: boolean; completed: boolean;
}
export const EMPTY_FILTERS: Filters = {
  q: "", property: "", status: "", priority: "", owner: "", category: "", vendor: "", due: "",
  approval: false, waiting: false, blocked: false, completed: false,
};
export const filtersActive = (f: Filters) =>
  Object.entries(f).some(([k, v]) => (k === "q" ? !!String(v).trim() : !!v));

export function matchTask(p: Property, t: Task, f: Filters, today = todayISO()) {
  if (f.property && p.id !== f.property) return false;
  if (f.status && t.status !== f.status) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.owner && t.owner !== f.owner) return false;
  if (f.category && t.category !== f.category) return false;
  if (f.vendor && t.vendor !== f.vendor) return false;
  if (f.due === "overdue" && !isOverdue(t, today)) return false;
  if (f.due === "dated" && !t.deadline) return false;
  if (f.due === "none" && t.deadline) return false;
  if (f.due === "week") {
    if (!t.deadline || t.deadline < today) return false;
    const wk = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    if (t.deadline > wk) return false;
  }
  if (f.approval && !needsApproval(t)) return false;
  if (f.waiting && !isWaiting(t)) return false;
  if (f.blocked && !isBlocked(t)) return false;
  if (f.completed ? isOpen(t) : false) return false;
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = taskHaystack(p, t);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

const TOGGLE_VAR = {
  approval: "var(--status-approval)", waiting: "var(--status-waiting)", blocked: "var(--status-blocked)", completed: "var(--status-completed)",
};

export function DashboardFilters({ f, set, properties }: { f: Filters; set: (f: Filters) => void; properties: Property[] }) {
  const tasks = properties.flatMap((p) => p.tasks);
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
  const sel = "field";
  const upd = <K extends keyof Filters>(k: K, v: Filters[K]) => set({ ...f, [k]: v });
  const toggle = (k: "approval" | "waiting" | "blocked" | "completed", label: string) => (
    <button type="button" aria-pressed={f[k]} onClick={() => upd(k, !f[k])}
      className={`inline-flex min-h-[34px] items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] font-medium ${f[k] ? "border-line2 bg-hover text-ink" : "border-line bg-raised text-ink3 hover:text-ink2"}`}>
      <i className="block h-2 w-2 rounded-full" style={{ background: TOGGLE_VAR[k], opacity: f[k] ? 1 : 0.55 }} aria-hidden />{label}{f[k] && <span className="text-ink3" aria-hidden>✓</span>}
    </button>
  );
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap gap-2">
        <input id="search" type="search" value={f.q} onChange={(e) => upd("q", e.target.value)} autoComplete="off"
          placeholder='Search — "termite", "windows", "inspection", "Paramount", "Kristine"…'
          className="field !w-auto flex-[1_1_260px] !py-2.5 !text-[14px]" />
        {filtersActive(f) && (
          <button type="button" onClick={() => set(EMPTY_FILTERS)} className="btn btn-secondary">
            Clear all
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <select aria-label="Property" id="f-property" className={sel} value={f.property} onChange={(e) => upd("property", e.target.value)}>
          <option value="">All properties</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.address.split(",")[0]}</option>)}
        </select>
        <select aria-label="Status" id="f-status" className={sel} value={f.status} onChange={(e) => upd("status", e.target.value)}>
          <option value="">Any status</option>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Priority" id="f-priority" className={sel} value={f.priority} onChange={(e) => upd("priority", e.target.value)}>
          <option value="">Any priority</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Responsible person" id="f-owner" className={sel} value={f.owner} onChange={(e) => upd("owner", e.target.value)}>
          <option value="">Anyone</option>{uniq(tasks.map((t) => t.owner)).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Category" id="f-category" className={sel} value={f.category} onChange={(e) => upd("category", e.target.value)}>
          <option value="">Any category</option>{uniq(tasks.map((t) => t.category)).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Vendor" id="f-vendor" className={sel} value={f.vendor} onChange={(e) => upd("vendor", e.target.value)}>
          <option value="">Any vendor</option>{uniq(tasks.map((t) => t.vendor)).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Due date" id="f-due" className={sel} value={f.due} onChange={(e) => upd("due", e.target.value as Filters["due"])}>
          <option value="">Any due date</option><option value="overdue">Past due</option><option value="week">Due in next 7 days</option>
          <option value="dated">Has a deadline</option><option value="none">No deadline</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {toggle("approval", "Needs approval")}{toggle("waiting", "Waiting")}{toggle("blocked", "Blocked")}{toggle("completed", "Completed")}
      </div>
    </div>
  );
}
