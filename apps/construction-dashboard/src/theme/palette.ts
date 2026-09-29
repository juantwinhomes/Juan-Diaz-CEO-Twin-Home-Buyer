// Property identity palette (dark-background safe) and status/priority
// color assignments. Property colors identify WHICH property; status colors
// say WHAT is happening. The two never substitute for each other.
import type { Priority, Property, TaskStatus } from "../data/types";

/** Approved property accents, in assignment order for new properties. */
export const PROPERTY_PALETTE = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#14B8A6", // Turquoise
  "#EC4899", // Pink
  "#84CC16", // Lime
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#6366F1", // Indigo
  "#0EA5E9", // Sky
  "#F43F5E", // Rose
];

/** A property's stored accent, or — for a property that has none yet — the
 * first palette color no other property uses (stable: based on data, not render). */
export function accentOf(p: Property, all: Property[]): string {
  if (p.accentColor) return p.accentColor;
  const used = new Set(all.map((x) => x.accentColor?.toUpperCase()).filter(Boolean));
  const unassigned = all.filter((x) => !x.accentColor).map((x) => x.id);
  const free = PROPERTY_PALETTE.filter((c) => !used.has(c));
  const idx = unassigned.indexOf(p.id);
  return free[idx % Math.max(free.length, 1)] || PROPERTY_PALETTE[idx % PROPERTY_PALETTE.length];
}

export const STATUS_VAR: Record<TaskStatus, string> = {
  "Not Started": "var(--status-not-started)",
  "In Progress": "var(--status-in-progress)",
  Waiting: "var(--status-waiting)",
  Blocked: "var(--status-blocked)",
  "Needs Approval": "var(--status-approval)",
  Scheduled: "var(--status-scheduled)",
  "Ready to Order": "var(--status-ready)",
  Ordered: "var(--status-ordered)",
  Delivered: "var(--status-delivered)",
  "Inspection Pending": "var(--status-inspection)",
  "Inspection Completed": "var(--status-scheduled)",
  "Repair Required": "var(--status-correction)",
  Completed: "var(--status-completed)",
};

export const PRIORITY_VAR: Record<Priority, string> = {
  Urgent: "var(--priority-urgent)",
  High: "var(--priority-high)",
  Normal: "var(--priority-normal)",
  Completed: "var(--priority-completed)",
};

/** Style object that puts a property's accent in scope for its subtree. */
export const propStyle = (color: string) => ({ ["--prop" as string]: color }) as React.CSSProperties;
