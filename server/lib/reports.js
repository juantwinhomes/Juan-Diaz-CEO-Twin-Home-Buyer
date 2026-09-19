/**
 * Report builders. Every report returns { title, subtitle, sections, text }
 * where `text` is plain text ready to paste into Google Chat, Slack or email.
 */
import { all, get, getSettings } from '../db.js';
import * as D from './dates.js';
import * as K from './kpi.js';

const pct = (n) => `${K.round(n)}%`;
const delta = (n) => `${n > 0 ? '+' : ''}${K.round(n)}%`;

/* ---------------------------------------------------------------- */
/* End of day / daily team report                                    */
/* ---------------------------------------------------------------- */
export async function dailyTeamReport(date) {
  const d = await K.dashboard(date);
  const s = await getSettings();
  const k = d.kpis;

  const sections = [];
  sections.push({
    heading: 'TEAM PERFORMANCE',
    rows: [
      ['Daily Commitments', `${k.commitments.completed} / ${k.commitments.total} completed`, pct(k.commitments.rate)],
      ['Active Projects', String(k.projects.active), ''],
      ['Projects Progressed', `${k.projects.progressed} / ${k.projects.active}`, pct(k.projects.rate)],
      ['Deployments', String(k.deployments.total), ''],
      ['Blocked Items', String(k.blockers.open), k.blockers.aging ? `${k.blockers.aging} aging` : ''],
      ['Critical Production Issues', String(k.production.critical), k.production.open ? `${k.production.open} open total` : ''],
      ['Daily Execution Score', `${d.score.total} / 100`, d.score.grade]
    ]
  });

  for (const sc of d.scorecards) {
    const lines = [];
    lines.push(['Commitments', `${sc.commitments.completed} / ${sc.commitments.total} completed`, pct(sc.commitments.rate)]);
    for (const p of sc.project_rows) {
      const evidence = p.evidence.length ? p.evidence.join('; ') : 'No measurable progress logged';
      lines.push([p.name, `${p.previous_pct}% → ${p.today_pct}% (${delta(p.progress_today)})`, evidence]);
      if (p.next_step) lines.push(['  Next', p.next_step, '']);
      if (p.blocker_summary) lines.push(['  Blocker', p.blocker_summary, '']);
    }
    if (sc.deployments.total) {
      lines.push(['Deployments', String(sc.deployments.total), sc.deployments.rows.map((r) => r.title).join('; ')]);
    }
    const incomplete = sc.commitments.rows.filter((c) => c.status !== 'Completed');
    for (const c of incomplete) {
      lines.push(['  Not completed', c.task, c.carryover_reason || c.status]);
    }
    sections.push({ heading: sc.user.name.toUpperCase(), rows: lines });
  }

  if (d.stagnant.length) {
    sections.push({
      heading: 'NOT MOVING',
      rows: d.stagnant.map((x) => [x.name, x.message, x.blocker || x.next_step || ''])
    });
  }

  if (d.priorities.length) {
    sections.push({
      heading: "TOMORROW'S RECOMMENDED PRIORITIES (for review — not decided automatically)",
      rows: d.priorities.slice(0, 12).map((p) => [`${p.rank}. ${p.title}`, p.category, `${p.owner || 'Unassigned'} · ${p.detail}`])
    });
  }

  return {
    type: 'daily-team',
    title: `${s.team_name} — Daily Report`,
    subtitle: `${D.dayName(date)}, ${D.formatLong(date)}`,
    date,
    sections,
    data: d,
    text: toText(`${s.team_name} — Daily Report`, `Date: ${D.formatLong(date)}`, sections)
  };
}

/* ---------------------------------------------------------------- */
export async function individualDailyReport(date, userId) {
  const d = await K.dashboard(date);
  const sc = d.scorecards.find((x) => x.user.id === Number(userId));
  if (!sc) return null;

  const sections = [{
    heading: 'SUMMARY',
    rows: [
      ['Daily Commitments', `${sc.commitments.completed} / ${sc.commitments.total} completed`, pct(sc.commitments.rate)],
      ['Projects Progressed', `${sc.projects.progressed} / ${sc.projects.active}`, pct(sc.projects.rate)],
      ['Deployments', String(sc.deployments.total), ''],
      ['Blockers', String(sc.blockers.open), ''],
      ['Production Issues', String(sc.production.open), sc.production.critical ? `${sc.production.critical} critical` : ''],
      ['Daily Execution Score', `${sc.score.total} / 100`, sc.score.grade]
    ]
  }];

  sections.push({
    heading: "TODAY'S COMMITMENTS",
    rows: sc.commitments.rows.map((c) => [
      c.status === 'Completed' ? '[x]' : '[ ]',
      c.task,
      c.status === 'Completed' ? 'Completed' : (c.carryover_reason || c.status)
    ])
  });

  if (sc.project_rows.length) {
    sections.push({
      heading: 'PROJECTS',
      rows: sc.project_rows.flatMap((p) => {
        const rows = [[p.name, `${p.previous_pct}% → ${p.today_pct}% (${delta(p.progress_today)})`,
          p.evidence.length ? p.evidence.join('; ') : 'No measurable progress']];
        if (p.next_step) rows.push(['  Next', p.next_step, '']);
        return rows;
      })
    });
  }

  sections.push({
    heading: 'SCORE BREAKDOWN',
    rows: sc.score.lines.map((l) => [l.label, `${l.points} / ${l.max}`, l.detail])
  });

  return {
    type: 'daily-individual',
    title: `${sc.user.name} — Daily Report`,
    subtitle: D.formatLong(date),
    date,
    sections,
    data: sc,
    text: toText(`${sc.user.name} — Daily Report`, `Date: ${D.formatLong(date)}`, sections)
  };
}

/* ---------------------------------------------------------------- */
export async function weeklyTeamReport(date) {
  const w = await K.weekly(date);
  const s = await getSettings();
  const sections = [
    {
      heading: 'DAILY COMMITMENT COMPLETION',
      rows: w.days.map((d) => [d.day, `${d.commitments_completed} / ${d.commitments_total}`, pct(d.completion_rate)])
    },
    {
      heading: 'PROJECTS PROGRESSED',
      rows: w.days.map((d) => [d.day, `${d.projects_progressed} / ${d.projects_active}`, pct(d.projects_progressed_rate)])
    },
    {
      heading: 'DELIVERY',
      rows: w.days.map((d) => [d.day,
        `${d.deployments} deployment${d.deployments === 1 ? '' : 's'}`,
        `avg project progress ${delta(d.avg_project_progress)}`])
    },
    {
      heading: 'BLOCKERS & INCIDENTS',
      rows: w.days.map((d) => [d.day,
        `${d.blockers_created} created / ${d.blockers_resolved} resolved`,
        `${d.incidents} incident${d.incidents === 1 ? '' : 's'}`])
    },
    {
      heading: 'WEEK TOTALS',
      rows: [
        ['Commitments', `${w.totals.commitments_completed} / ${w.totals.commitments_total}`, pct(w.totals.completion_rate)],
        ['Avg projects progressed', pct(w.totals.avg_progressed_rate), ''],
        ['Deployments', String(w.totals.deployments), ''],
        ['Blockers created / resolved', `${w.totals.blockers_created} / ${w.totals.blockers_resolved}`, ''],
        ['Production incidents', String(w.totals.incidents), ''],
        ['Projects completed', String(w.totals.projects_completed), ''],
        ['Average daily score', `${w.totals.avg_score} / 100`, '']
      ]
    }
  ];
  return {
    type: 'weekly-team',
    title: `${s.team_name} — Weekly Report`,
    subtitle: `${D.formatLong(w.week_start)} – ${D.formatLong(w.week_end)}`,
    date,
    sections,
    data: w,
    text: toText(`${s.team_name} — Weekly Report`, `${D.formatLong(w.week_start)} – ${D.formatLong(w.week_end)}`, sections)
  };
}

/* ---------------------------------------------------------------- */
export async function projectStatusReport(date) {
  const projects = await K.activeProjectsWithDay(date);
  const sections = [{
    heading: 'ACTIVE PROJECTS',
    rows: projects.map((p) => [
      `${p.name} (${p.owner_name || 'Unassigned'})`,
      `${p.priority} · ${p.status} · ${p.previous_pct}% → ${p.today_pct}% (${delta(p.progress_today)})`,
      `Due ${p.target_date ? D.formatShort(p.target_date) : 'n/a'} · Next: ${p.next_step || 'not set'}${p.blocker_summary ? ` · Blocked: ${p.blocker_summary}` : ''}`
    ])
  }];
  const done = await all("SELECT p.*, u.name AS owner_name FROM projects p LEFT JOIN users u ON u.id = p.owner_id WHERE p.status = 'Completed' AND p.archived = 0");
  if (done.length) {
    sections.push({ heading: 'COMPLETED', rows: done.map((p) => [p.name, p.owner_name || '', `${K.round(p.completion_pct)}%`]) });
  }
  return {
    type: 'project-status',
    title: 'Project Status Report',
    subtitle: D.formatLong(date),
    date, sections, data: projects,
    text: toText('Project Status Report', D.formatLong(date), sections)
  };
}

/* ---------------------------------------------------------------- */
export async function blockerReport(date) {
  const b = await K.blockerStats(date);
  const sections = [
    {
      heading: `OPEN BLOCKERS (${b.open})`,
      rows: b.open_rows.map((x) => [
        x.title,
        `${x.project_name || 'No project'} · ${x.owner_name || 'Unassigned'} · ${x.reason}`,
        `${x.status} · ${x.age_band} (${x.days_blocked} business day${x.days_blocked === 1 ? '' : 's'})${x.person_needed ? ` · needs ${x.person_needed}` : ' · nobody assigned'}`
      ])
    }
  ];
  const resolved = b.rows.filter((x) => x.status === 'Resolved');
  if (resolved.length) {
    sections.push({
      heading: 'RESOLVED',
      rows: resolved.map((x) => [x.title, x.resolution || '', `Resolved ${D.formatShort(x.resolved_date)} after ${x.days_blocked} day(s)`])
    });
  }
  return {
    type: 'blockers', title: 'Blocker Report', subtitle: D.formatLong(date), date, sections, data: b,
    text: toText('Blocker Report', D.formatLong(date), sections)
  };
}

/* ---------------------------------------------------------------- */
export async function productionHealthReport(date) {
  const p = await K.productionStats(date);
  const s = await getSettings();
  const sections = [
    {
      heading: 'SYSTEMS',
      rows: p.systems.map((x) => [
        `${x.name} (${x.system_type})`,
        `${x.status} · ${x.success_rate}% success (${x.successful_runs}/${x.total_runs} runs)`,
        `Owner ${x.owner_name || 'Unassigned'} · checked ${x.last_checked ? D.formatShort(x.last_checked) : 'never'}`
      ])
    },
    {
      heading: `OPEN ISSUES (${p.open})`,
      rows: p.open_rows.length
        ? p.open_rows.map((i) => [i.title, `${i.severity} · ${i.category}`, `${i.system_name || ''} · open since ${D.formatShort(i.reported_date)}`])
        : [['None', 'Target met: 0 critical production issues', '']]
    },
    {
      heading: 'OVERALL',
      rows: [
        ['Automation success rate', `${p.overall_success_rate}%`, `target ${s.success_rate_target}%+`],
        ['Critical issues', String(p.critical), `target ${s.critical_issue_target}`]
      ]
    }
  ];
  return {
    type: 'production-health', title: 'Production Health Report', subtitle: D.formatLong(date), date, sections, data: p,
    text: toText('Production Health Report', D.formatLong(date), sections)
  };
}

/* ---------------------------------------------------------------- */
export async function businessImpactReport(date) {
  const bi = await K.businessImpact();
  const s = await getSettings();
  const cur = s.currency || '$';
  const sections = [
    {
      heading: 'BY SYSTEM',
      rows: bi.rows.map((r) => [
        r.project_name || 'Unlinked',
        `${r.hours_saved_week} hrs/week · ${r.hours_saved_month} hrs/month`,
        `${cur}${r.monthly_savings.toLocaleString()}/month saved${r.manual_process ? ` · replaces: ${r.manual_process}` : ''}`
      ])
    },
    {
      heading: 'TOTALS',
      rows: [
        ['Hours saved per week', String(bi.totals.hours_saved_week), ''],
        ['Hours saved per month', String(bi.totals.hours_saved_month), ''],
        ['Estimated monthly cost savings', `${cur}${bi.totals.monthly_savings.toLocaleString()}`, ''],
        ['Estimated annual cost savings', `${cur}${bi.totals.annual_savings.toLocaleString()}`, ''],
        ['Revenue supported', `${cur}${bi.totals.revenue_supported.toLocaleString()}`, ''],
        ['Leads processed', String(bi.totals.leads_processed), ''],
        ['Errors prevented', String(bi.totals.errors_prevented), '']
      ]
    }
  ];
  return {
    type: 'business-impact', title: 'Business Impact Report',
    subtitle: 'Weekly / monthly reporting — excluded from the daily execution score',
    date, sections, data: bi,
    text: toText('Business Impact Report', 'Weekly / monthly reporting', sections)
  };
}

/* ---------------------------------------------------------------- */
export async function buildReport(type, { date, userId }) {
  switch (type) {
    case 'daily-team': return await dailyTeamReport(date);
    case 'daily-individual': return await individualDailyReport(date, userId);
    case 'weekly-team': return await weeklyTeamReport(date);
    case 'project-status': return await projectStatusReport(date);
    case 'blockers': return await blockerReport(date);
    case 'production-health': return await productionHealthReport(date);
    case 'business-impact': return await businessImpactReport(date);
    default: return null;
  }
}

/** Plain-text rendering — deliberately simple so it survives a copy/paste. */
function toText(title, subtitle, sections) {
  const out = [title, subtitle, ''];
  for (const s of sections) {
    out.push(s.heading, '-'.repeat(Math.min(60, s.heading.length)));
    for (const [a, b, c] of s.rows) {
      out.push([a, b, c].filter(Boolean).join('  |  '));
    }
    out.push('');
  }
  return out.join('\n').trim();
}
