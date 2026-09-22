// Structured property model for the Construction Control dashboard.
// The data itself lives in public/data/properties.json (seed + repo record)
// and, once published, in the artifact's shared database (collection
// "properties", one document per property). Components only read this shape.

export type TaskStatus =
  | "Not Started"
  | "In Progress"
  | "Waiting"
  | "Blocked"
  | "Needs Approval"
  | "Scheduled"
  | "Ready to Order"
  | "Ordered"
  | "Delivered"
  | "Inspection Pending"
  | "Inspection Completed"
  | "Repair Required"
  | "Completed";

export const TASK_STATUSES: TaskStatus[] = [
  "Not Started", "In Progress", "Waiting", "Blocked", "Needs Approval", "Scheduled",
  "Ready to Order", "Ordered", "Delivered", "Inspection Pending", "Inspection Completed",
  "Repair Required", "Completed",
];

export type Priority = "Urgent" | "High" | "Normal" | "Completed";
export const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Completed"];

export type OverallStatus = "On Track" | "Needs Attention" | "Blocked" | "Waiting" | "Completed";

/** How sure we are of a fact. Shown next to anything that is not plain confirmed. */
export type Certainty = "confirmed" | "scheduled" | "requested" | "waiting" | "estimated" | "completed" | "needs verification";

export interface Cost {
  quote?: number;
  approved?: number;
  paid?: number;
  balance?: number;
  note?: string;
}

export interface HistoryEntry {
  date: string;            // ISO date (YYYY-MM-DD) or ISO timestamp
  status?: TaskStatus;
  note: string;
  source: string;          // e.g. "Monday Open Work board", "Dashboard edit"
}

export interface Task {
  id: string;
  title: string;
  category: string;
  status: TaskStatus;
  priority: Priority;
  owner: string;           // "Not assigned" when unknown
  stage?: string;          // Monday stage tag, e.g. "Stage E"
  date?: string;           // date of the latest update
  deadline?: string;       // ISO date, only when the source gives one
  latestUpdate: string;
  completedWork: string[];
  pendingWork: string[];
  nextAction: string;
  blocker?: string;
  dependsOn?: string[];    // task ids
  waitingOn?: string;      // person / vendor the task is waiting on
  approvalBy?: string;     // "Juan" etc. when an approval is documented
  vendor?: string;
  cost?: Cost;
  reference?: string;
  flags?: string[];        // Monday tags such as "First priority"
  needsVerification?: string;
  sourceNote: string;      // the original Monday text this card came from
  history: HistoryEntry[];
}

export interface Inspection {
  id: string;
  type: string;
  permitRef?: string;
  scheduledDate?: string;
  inspector?: string;
  state: "Not scheduled" | "Requested" | "Scheduled" | "Completed — result pending" | "Passed" | "Failed" | "Corrections required";
  result?: string;
  corrections?: string;
  nextAction: string;
  reinspection?: "Yes" | "No" | "Unknown";
  taskId?: string;
  sourceNote: string;
}

export interface Vendor {
  id: string;
  company: string;
  contact?: string;
  service: string;
  phone?: string;
  email?: string;
  quote?: number;
  status: string;
  nextAction: string;
  sourceNote: string;
}

export interface Purchase {
  id: string;
  item: string;
  quantity?: string;
  specs?: string;
  vendor?: string;
  price?: number;
  orderStatus: string;
  orderNumber?: string;
  paymentStatus?: string;
  expectedDelivery?: string;
  notes?: string;
  taskId?: string;
  sourceNote: string;
}

export interface UpcomingEvent {
  id: string;
  date: string;            // ISO date
  time?: string;
  kind: string;            // Inspection, Delivery, Deadline, ...
  title: string;
  certainty: Certainty;
  taskId?: string;
}

export interface DecisionOption { label: string; detail?: string }

export interface Decision {
  id: string;
  title: string;
  needs: string;
  decisionMaker: string;   // "Not assigned" when the source names nobody
  options: DecisionOption[];
  cost?: string;
  deadline?: string;
  impact?: string;
  taskId?: string;
  resolved?: boolean;
  sourceNote: string;
}

export interface Risk {
  id: string;
  risk: string;
  why: string;
  taskId?: string;
  nextAction: string;
  basis: "from source" | "computed from source figures" | "inferred";
}

export interface TimelineEntry {
  date: string;            // ISO date; "" when the source gives no year/date
  displayDate?: string;    // shown verbatim when the source date is partial
  title: string;
  detail?: string;
  source: string;
}

export interface Financials {
  rehabBudget?: number;
  actualCost?: number;
  drawAllocated?: number;
  drawDisbursed?: number;
  source: string;
}

export interface Reference {
  label: string;
  title: string;
  url?: string;
  lines: string[];
  table?: { columns: string[]; rows: string[][] };
  note?: string;
}

export interface Property {
  id: string;
  address: string;
  city: string;
  stage: string;                 // Monday group: Pending / Active Property In MLS / Undergoing Construction
  acquisitionDate?: string;      // verbatim from Monday
  constructionTimeline?: string; // verbatim from Monday
  statusOverride?: OverallStatus;// only when a source states it; otherwise derived
  lastUpdated: string;           // ISO date of the newest supplied update
  nextMilestone: string;
  nextAction: string;
  whereItStands: string;
  archivedCompleted?: number;    // Monday archive count with no item detail supplied
  financials?: Financials;
  tasks: Task[];
  inspections: Inspection[];
  vendors: Vendor[];
  purchases: Purchase[];
  upcomingEvents: UpcomingEvent[];
  decisions: Decision[];
  risks: Risk[];
  timeline: TimelineEntry[];
  references?: Reference[];
  order?: number;
}

export interface Dataset {
  asOf: string;                  // ISO date of the source snapshot
  sources: string[];
  properties: Property[];
}
