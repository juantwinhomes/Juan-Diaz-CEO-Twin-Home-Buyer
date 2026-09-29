// Everything the UI counts or labels is derived here from the data model,
// so counts update automatically when a property document changes.
import type { OverallStatus, Priority, Property, Task, TaskStatus } from "./types";

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const toUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

export const fmtDate = (iso?: string, withDay = false) => {
  if (!iso) return "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  return new Date(toUTC(iso)).toLocaleDateString("en-US", {
    ...(withDay ? { weekday: "short" } : {}), month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
};
export const fmtShort = (iso?: string) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? new Date(toUTC(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : iso || "";

export const usd = (n?: number) =>
  n === undefined || n === null ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export const isOpen = (t: Task) => t.status !== "Completed";
export const isOverdue = (t: Task, today = todayISO()) => isOpen(t) && !!t.deadline && t.deadline < today;
export const isUnassigned = (t: Task) => !t.owner || t.owner === "Not assigned";
export const isBlocked = (t: Task) => isOpen(t) && t.status === "Blocked";
export const isWaiting = (t: Task) => isOpen(t) && (t.status === "Waiting" || !!t.waitingOn);
export const needsApproval = (t: Task) => isOpen(t) && (t.status === "Needs Approval" || !!t.approvalBy);
export const isJuanApproval = (t: Task) => needsApproval(t) && /juan/i.test(t.approvalBy || (t.status === "Needs Approval" ? t.owner : ""));

/** "Action needed now": urgent, blocked, awaiting approval, needing repair, or past its deadline. */
export const needsActionNow = (t: Task, today = todayISO()) =>
  isOpen(t) &&
  (t.priority === "Urgent" || t.status === "Blocked" || t.status === "Needs Approval" ||
    t.status === "Repair Required" || isOverdue(t, today));

const PRI_RANK: Record<Priority, number> = { Urgent: 0, High: 1, Normal: 2, Completed: 3 };
export const byUrgency = (today = todayISO()) => (a: Task, b: Task) =>
  PRI_RANK[a.priority] - PRI_RANK[b.priority] ||
  Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
  (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
  a.title.localeCompare(b.title);

export interface DerivedStatus { status: OverallStatus; inferred: boolean; reason: string }

export function propertyStatus(p: Property, today = todayISO()): DerivedStatus {
  if (p.statusOverride) return { status: p.statusOverride, inferred: false, reason: "Set from the source notes." };
  const open = p.tasks.filter(isOpen);
  if (!open.length) {
    return p.tasks.length
      ? { status: "Completed", inferred: true, reason: "Every task on record is completed." }
      : { status: "On Track", inferred: true, reason: "No open tasks on the board for this property." };
  }
  const urgentBlocked = open.filter((t) => t.status === "Blocked" && t.priority === "Urgent");
  if (urgentBlocked.length)
    return { status: "Blocked", inferred: true, reason: `Urgent task blocked: ${urgentBlocked[0].title}.` };
  const overdue = open.filter((t) => isOverdue(t, today));
  const unassigned = open.filter((t) => isUnassigned(t) && t.priority !== "Normal");
  const urgent = open.filter((t) => t.priority === "Urgent");
  if (overdue.length || unassigned.length || urgent.length) {
    const bits = [
      overdue.length && `${overdue.length} past due`,
      urgent.length && `${urgent.length} urgent`,
      unassigned.length && `${unassigned.length} high-priority unassigned`,
    ].filter(Boolean);
    return { status: "Needs Attention", inferred: true, reason: bits.join(" · ") + "." };
  }
  if (open.every((t) => t.status === "Waiting" || t.status === "Scheduled" || !!t.waitingOn))
    return { status: "Waiting", inferred: true, reason: "Every open task is waiting on someone or scheduled." };
  return { status: "On Track", inferred: true, reason: "Open work is moving with nothing past due." };
}

export const openDecisions = (p: Property) => p.decisions.filter((d) => !d.resolved);
export const pendingInspections = (p: Property) => p.inspections.filter((i) => i.state !== "Passed");

export interface Summary {
  properties: number; action: number; blocked: number; waiting: number;
  inspections: number; approvals: number; completed: number; archived: number;
}

export function summarize(props: Property[], today = todayISO()): Summary {
  const tasks = props.flatMap((p) => p.tasks);
  return {
    properties: props.length,
    action: tasks.filter((t) => needsActionNow(t, today)).length,
    blocked: tasks.filter(isBlocked).length,
    waiting: tasks.filter(isWaiting).length,
    inspections: props.reduce((a, p) => a + pendingInspections(p).length, 0),
    approvals: props.reduce((a, p) => a + openDecisions(p).length, 0) + tasks.filter(needsApproval).length,
    completed: tasks.filter((t) => !isOpen(t)).length,
    archived: props.reduce((a, p) => a + (p.archivedCompleted || 0), 0),
  };
}

/** Next confirmed event on or after today, else the next open deadline. */
export function nextEvent(p: Property, today = todayISO()) {
  const ev = p.upcomingEvents.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (ev) return { date: ev.date, label: `${ev.kind}: ${ev.title}`, kind: "event" as const };
  const dl = p.tasks.filter((t) => isOpen(t) && t.deadline && t.deadline >= today)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
  if (dl) return { date: dl.deadline!, label: `Deadline: ${dl.title}`, kind: "deadline" as const };
  return null;
}

export const STATUS_TONE: Record<TaskStatus, string> = {
  "Not Started": "neutral", "In Progress": "progress", Waiting: "wait", Blocked: "urgent",
  "Needs Approval": "approve", Scheduled: "info", "Ready to Order": "info", Ordered: "info",
  Delivered: "ok", "Inspection Pending": "wait", "Inspection Completed": "info",
  "Repair Required": "urgent", Completed: "ok",
};

export const OVERALL_TONE: Record<OverallStatus, string> = {
  "On Track": "ok", "Needs Attention": "high", Blocked: "urgent", Waiting: "wait", Completed: "ok",
};

export function taskHaystack(p: Property, t: Task) {
  return [p.address, p.city, t.title, t.category, t.owner, t.vendor, t.status, t.priority, t.stage,
    t.latestUpdate, t.nextAction, t.blocker, t.waitingOn, t.sourceNote, ...(t.flags || [])]
    .filter(Boolean).join(" ").toLowerCase();
}

export function propertyHaystack(p: Property) {
  return [p.address, p.city, p.stage, p.whereItStands, p.nextAction, p.nextMilestone,
    ...p.inspections.map((i) => i.type), ...p.vendors.map((v) => `${v.company} ${v.service}`),
    ...p.purchases.map((x) => x.item), ...p.risks.map((r) => r.risk)]
    .join(" ").toLowerCase();
}
