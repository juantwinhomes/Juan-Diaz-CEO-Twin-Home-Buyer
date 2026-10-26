"""Classify a Gmail search_threads dump and build Juan's triage report.

Usage:
    python -m email_agent.triage <search_threads.json> [--now 2026-10-26T23:40:00Z]
        [--out email_agent/runs/2026-10-26.md] [--json]

The input is the raw JSON returned by the Gmail connector's search_threads
tool ({"threads": [{"id", "messageCount", "messages": [...]}]}).
"""
import argparse
import html
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from email_agent import rules


@dataclass
class Triage:
    thread_id: str
    subject: str
    sender: str
    date: str
    url: str
    priority: str
    categories: list = field(default_factory=list)
    hits: list = field(default_factory=list)
    awaiting_juan: bool = False
    cc_only: bool = False
    juan_replied_last: bool = False
    hours_waiting: float = 0.0
    overdue: bool = False
    needs_full_read: bool = False
    wire_safety: bool = False


def _parse_date(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _contains(text, kw):
    # Word-boundary match for plain words, substring match for anything with symbols.
    if re.fullmatch(r"[a-z0-9 \-]+", kw):
        return re.search(r"(?<![a-z0-9])" + re.escape(kw) + r"(?![a-z0-9])", text) is not None
    return kw in text


def classify(subject, snippet, sender):
    """Return (priority, categories, hits) for one message."""
    text = html.unescape(f"{subject} {snippet}").lower()
    sender_l = (sender or "").lower()

    categories, hits = [], []
    best = rules.NOISE
    for name, (prio, kws) in rules.CATEGORIES.items():
        matched = [k for k in kws if _contains(text, k)]
        if matched:
            categories.append(name)
            hits.extend(matched)
            if rules.PRIORITY_ORDER.index(prio) < rules.PRIORITY_ORDER.index(best):
                best = prio

    for pattern, prio in rules.PRIORITY_SENDERS.items():
        if pattern in sender_l and rules.PRIORITY_ORDER.index(prio) < rules.PRIORITY_ORDER.index(best):
            best = prio
            hits.append(f"sender:{pattern}")

    if any(n in sender_l for n in rules.NOISE_SENDERS):
        return rules.NOISE, categories, hits
    if any(n in text for n in rules.NOISE_KEYWORDS) and best != rules.URGENT:
        return rules.NOISE, categories, hits

    if any(h in sender_l for h in rules.AUTOMATED_SENDER_HINTS):
        # A robot can't create an URGENT item by itself.
        return (rules.ACTION if rules.AUTOMATED_KEEP & set(categories) else rules.FYI), categories, hits

    if best == rules.NOISE:
        # Nothing matched, but a human wrote it: worth knowing.
        best = rules.FYI
    return best, categories, hits


def triage_thread(thread, now):
    msgs = sorted(thread.get("messages", []), key=lambda m: m.get("date", ""))
    if not msgs:
        return None
    last = msgs[-1]
    # Classify on the whole visible thread so a follow-up "ok?" keeps its context.
    subject = last.get("subject") or msgs[0].get("subject", "")
    snippet = " ".join(m.get("snippet", "") for m in msgs)
    inbound = [m for m in msgs if rules.JUAN not in (m.get("sender") or "").lower()]
    sender = (inbound[-1] if inbound else last).get("sender", "")

    priority, cats, hits = classify(subject, snippet, sender)
    # Waiting on Juan only when a person wrote last and Juan is on the To line.
    # Robots never wait for a reply, and reply-all chatter with Juan on CC doesn't either.
    last_sender = (last.get("sender") or "").lower()
    to_juan = any(rules.JUAN in (a or "").lower() for a in last.get("toRecipients", []))
    robot = any(h in last_sender for h in rules.AUTOMATED_SENDER_HINTS)
    juan_last = rules.JUAN in last_sender
    awaiting = not juan_last and not robot and to_juan
    cc_only = not juan_last and not robot and not to_juan
    waited = (now - _parse_date(last["date"])).total_seconds() / 3600
    limit = rules.UNREPLIED_HOURS.get(priority)

    return Triage(
        thread_id=thread["id"],
        subject=html.unescape(subject),
        sender=sender,
        date=last["date"],
        url=thread.get("viewUrl") or last.get("viewUrl", ""),
        priority=priority,
        categories=cats,
        hits=sorted(set(hits)),
        awaiting_juan=awaiting,
        cc_only=cc_only,
        juan_replied_last=juan_last,
        hours_waiting=round(waited, 1),
        overdue=bool(awaiting and limit is not None and waited >= limit),
        # search_threads only previews the 5 oldest messages.
        needs_full_read=thread.get("messageCount", len(msgs)) > len(msgs),
        wire_safety="wire" in cats,
    )


def triage_all(data, now):
    out = [t for t in (triage_thread(th, now) for th in data.get("threads", [])) if t]
    # Highest priority first, longest-waiting first within a priority.
    out.sort(key=lambda t: (rules.PRIORITY_ORDER.index(t.priority), -t.hours_waiting))
    return out


def render_markdown(results, now):
    by = {p: [r for r in results if r.priority == p] for p in rules.PRIORITY_ORDER}
    unreplied = [r for r in results if r.awaiting_juan and r.priority in (rules.URGENT, rules.ACTION)]
    overdue = [r for r in unreplied if r.overdue]
    lines = [
        f"# Inbox triage — {now:%Y-%m-%d %H:%M} UTC",
        "",
        f"Threads scanned: {len(results)} · URGENT {len(by['URGENT'])} · ACTION {len(by['ACTION'])}"
        f" · FYI {len(by['FYI'])} · NOISE {len(by['NOISE'])} · awaiting Juan {len(unreplied)}"
        f" · overdue {len(overdue)}",
        "",
    ]
    for prio in (rules.URGENT, rules.ACTION):
        lines += [f"## {prio} — needs Juan", ""]
        for r in (r for r in by[prio] if r.awaiting_juan):
            flag = " ⏰ OVERDUE" if r.overdue else ""
            wire = " 🔒 verify by phone" if r.wire_safety else ""
            lines.append(f"- [{r.subject}]({r.url}) — {r.sender} · {', '.join(r.categories)}"
                         f" · waiting {r.hours_waiting}h{flag}{wire}")
        lines.append("")
    lines += ["## Juan on CC only (team talking to each other)", ""]
    for r in results:
        if r.cc_only and r.priority in (rules.URGENT, rules.ACTION):
            lines.append(f"- {r.priority} · [{r.subject}]({r.url}) — {r.sender}")
    lines += ["", "## Waiting on others (Juan replied last)", ""]
    for r in results:
        if r.juan_replied_last and r.priority in (rules.URGENT, rules.ACTION):
            lines.append(f"- {r.priority} · [{r.subject}]({r.url}) — last reply {r.hours_waiting}h ago")
    lines += ["", f"FYI: {len(by['FYI'])} threads · NOISE: {len(by['NOISE'])} threads (not listed)", ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dump")
    ap.add_argument("--now", help="ISO timestamp; defaults to current UTC time")
    ap.add_argument("--out", help="write the markdown report here")
    ap.add_argument("--json", action="store_true", help="print JSON instead of markdown")
    args = ap.parse_args(argv)

    now = _parse_date(args.now) if args.now else datetime.now(timezone.utc)
    with open(args.dump) as f:
        results = triage_all(json.load(f), now)

    if args.json:
        print(json.dumps([asdict(r) for r in results], indent=2))
        return
    report = render_markdown(results, now)
    if args.out:
        with open(args.out, "w") as f:
            f.write(report)
    print(report)


if __name__ == "__main__":
    sys.exit(main())
