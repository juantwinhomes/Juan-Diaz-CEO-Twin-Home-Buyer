import type { Property } from "../data/types";
import { byUrgency, fmtDate, isBlocked, isOpen, isOverdue, nextEvent, propertyStatus, todayISO } from "../data/derive";
import { OverallBadge, PriorityBadge } from "./ui";

const EDGE: Record<string, string> = {
  "On Track": "border-t-ok", "Needs Attention": "border-t-high", Blocked: "border-t-urgent", Waiting: "border-t-wait", Completed: "border-t-ok",
};

export function PropertyCard({ p, onOpen }: { p: Property; onOpen: () => void }) {
  const today = todayISO();
  const st = propertyStatus(p, today);
  const open = p.tasks.filter(isOpen);
  const done = p.tasks.length - open.length;
  const top = open.slice().sort(byUrgency(today))[0];
  const ev = nextEvent(p, today);
  const [street, ...rest] = p.address.split(", ");

  return (
    <article className={`flex flex-col rounded-lg border border-line border-t-[3px] bg-surface ${EDGE[st.status]}`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="eyebrow">{p.stage}</div>
          <h3 className="font-display text-[17px] font-bold leading-tight tracking-tight">{street}</h3>
          <div className="text-[12px] text-ink3">{rest.join(", ")}</div>
        </div>
        <OverallBadge {...st} />
      </div>

      <dl className="mx-4 mt-3 grid grid-cols-3 overflow-hidden rounded border border-line text-center">
        {[["Open", open.length, ""], ["Completed", done + (p.archivedCompleted || 0), ""], ["Blocked", open.filter(isBlocked).length, open.some(isBlocked) ? "text-urgent" : ""]].map(([l, n, c]) => (
          <div key={l as string} className="border-r border-line py-1.5 last:border-0">
            <dt className="eyebrow">{l}</dt><dd className={`num font-mono text-[17px] font-semibold ${c}`}>{n}</dd>
          </div>
        ))}
      </dl>

      <div className="flex-1 space-y-2.5 px-4 py-3 text-[12.5px]">
        <div>
          <div className="eyebrow mb-0.5">Most urgent pending</div>
          {top ? (
            <div className="flex items-start gap-2">
              <PriorityBadge priority={top.priority} compact />
              <span className="min-w-0 font-medium">{top.title}{isOverdue(top, today) && <span className="text-urgent"> · past due</span>}</span>
            </div>
          ) : <span className="italic text-ink3">Nothing open</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="eyebrow mb-0.5">Next scheduled</div>{ev ? <span><span className="num font-mono">{fmtDate(ev.date)}</span> <span className="text-ink2">{ev.label}</span></span> : <span className="italic text-ink3">None on record</span>}</div>
          <div><div className="eyebrow mb-0.5">Last update</div><span className="num font-mono">{fmtDate(p.lastUpdated)}</span></div>
        </div>
        <div className="next-slot rounded py-2 pl-3.5 pr-2.5">
          <div className="eyebrow !text-accent">Next action</div>
          <div className="font-semibold text-accent">{p.nextAction}</div>
        </div>
      </div>

      <button type="button" onClick={onOpen}
        className="m-4 mt-0 rounded border border-accent bg-surface py-2 text-[13px] font-semibold text-accent hover:bg-accent hover:text-white">
        View Property
      </button>
    </article>
  );
}
