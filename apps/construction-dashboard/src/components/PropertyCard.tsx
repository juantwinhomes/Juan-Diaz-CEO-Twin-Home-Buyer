import type { Property } from "../data/types";
import { byUrgency, fmtDate, isBlocked, isOpen, isOverdue, isWaiting, nextEvent, propertyStatus, todayISO } from "../data/derive";
import { propStyle } from "../theme/palette";
import { OverallBadge, PriorityBadge } from "./ui";

export function PropertyCard({ p, onOpen }: { p: Property; onOpen: () => void }) {
  const today = todayISO();
  const st = propertyStatus(p, today);
  const open = p.tasks.filter(isOpen);
  const blocked = open.filter(isBlocked).length;
  const waiting = open.filter(isWaiting).length;
  const top = open.slice().sort(byUrgency(today))[0];
  const ev = nextEvent(p, today);
  const [street, ...rest] = p.address.split(", ");

  return (
    <article className="prop-card prop-scope flex flex-col rounded-lg" style={propStyle(p.accentColor!)}>
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="prop-dot" aria-hidden />
          <h3 className="min-w-0 font-display text-[17px] font-bold leading-tight tracking-tight text-ink">{street}</h3>
        </div>
        <div className="mt-0.5 pl-[17px] text-[12px] text-ink3">{rest.join(", ")}</div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pl-[17px]">
          <OverallBadge {...st} />
          <span className="eyebrow">{p.stage}</span>
        </div>
      </div>

      <div className="mx-4 mt-3 flex flex-wrap gap-x-5 gap-y-1 border-y border-line py-2 text-[12.5px]">
        <span><b className="num font-mono text-[15px] text-ink">{open.length}</b> <span className="text-ink3">open</span></span>
        <span><b className="num font-mono text-[15px] text-ink">{waiting}</b> <span className="text-ink3">waiting</span></span>
        <span><b className={`num font-mono text-[15px] ${blocked ? "tint" : "text-ink"}`} style={{ ["--c" as string]: "var(--status-blocked)" }}>{blocked}</b> <span className="text-ink3">blocked</span></span>
      </div>

      <div className="flex-1 space-y-3 px-4 py-3 text-[12.5px]">
        <div className="next-slot rounded-md py-2 pl-3 pr-2.5">
          <div className="eyebrow">Next action</div>
          <div className="font-semibold leading-snug text-ink">{p.nextAction}</div>
        </div>
        {top && (
          <div className="flex items-start gap-2">
            <PriorityBadge priority={top.priority} compact />
            <span className="min-w-0 text-ink2">{top.title}{isOverdue(top, today) && <span className="text-ink3"> · past due</span>}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><div className="eyebrow mb-0.5">Last updated</div><span className="num font-mono text-ink2">{fmtDate(p.lastUpdated)}</span></div>
          <div><div className="eyebrow mb-0.5">Next scheduled</div>{ev ? <span className="text-ink2"><span className="num font-mono">{fmtDate(ev.date)}</span> {ev.label}</span> : <span className="italic text-ink4">None on record</span>}</div>
        </div>
      </div>

      <button type="button" onClick={onOpen} className="btn btn-secondary m-4 mt-0 justify-between">
        <span>View Property</span><span aria-hidden style={{ color: "var(--prop)" }}>→</span>
      </button>
    </article>
  );
}
