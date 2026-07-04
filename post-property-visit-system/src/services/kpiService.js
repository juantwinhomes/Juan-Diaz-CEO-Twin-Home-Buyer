// ============================================================================
// kpiService.js
// ----------------------------------------------------------------------------
// Two jobs:
//   1. logVisit(debrief, alerts) -> a compact one-line KPI record appended to a
//      JSONL log (src/data/kpiVisitsLog.jsonl). One line per processed visit.
//   2. generateWeeklyReport(records, range) -> the weekly review numbers from
//      the spec, computed from those records.
//
// No network, no keys. This is the Monday-morning report for the whole team.
// ============================================================================

// Build the compact record we store per visit (small, report-friendly).
export function buildKpiRecord(d, alerts = []) {
  return {
    visit_id: d.visit_id,
    visit_date: d.visit_date,
    property_address: d.property_address,
    seller_name: d.seller_name,
    deal_status: d.deal_status,
    seller_classification: d.seller_classification || '',
    entered_property: d.entered_property,
    voice_memo_received: d.voice_memo_received,
    photos_required: d.photos_required,
    photos_uploaded: d.photos_uploaded,
    video_required: d.video_required,
    video_uploaded: d.video_uploaded,
    follow_up_date_set: d.follow_up_date ? 'Yes' : 'No',
    recommended_follow_up_sequence: d.recommended_follow_up_sequence,
    pass_reason: d.pass_reason || '',
    main_objection: d.main_objection && d.main_objection !== 'Unknown' ? d.main_objection : '',
    alert_codes: alerts.map((a) => a.code),
  };
}

// Dedupe records by visit_id, keeping the LAST occurrence (latest processing).
function dedupe(records) {
  const byId = new Map();
  for (const r of records) byId.set(r.visit_id, r);
  return [...byId.values()];
}

// Count the top N string values (ignoring empties), returned as [{value,count}].
function topN(values, n = 3) {
  const counts = new Map();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

const pct = (num, den) => (den === 0 ? 0 : Math.round((num / den) * 100));

/**
 * @param {Array} allRecords - KPI records (buildKpiRecord shape)
 * @param {object} [range] - { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } inclusive
 * @returns {object} the weekly review numbers
 */
export function generateWeeklyReport(allRecords, range = {}) {
  let records = dedupe(allRecords);
  if (range.start) records = records.filter((r) => r.visit_date >= range.start);
  if (range.end) records = records.filter((r) => r.visit_date <= range.end);

  const total = records.length;
  const withMemo = records.filter((r) => r.voice_memo_received === 'Yes').length;

  // Full package = every REQUIRED visual is uploaded.
  const requireVisual = records.filter((r) => r.photos_required === 'Yes' || r.video_required === 'Yes');
  const fullPackage = requireVisual.filter(
    (r) =>
      (r.photos_required !== 'Yes' || r.photos_uploaded === 'Yes') &&
      (r.video_required !== 'Yes' || r.video_uploaded === 'Yes'),
  ).length;

  const underContractMissingVisual = records.filter(
    (r) =>
      r.deal_status === 'Under Contract' &&
      ((r.photos_required === 'Yes' && r.photos_uploaded !== 'Yes') ||
        (r.video_required === 'Yes' && r.video_uploaded !== 'Yes')),
  ).length;

  // No-contract visits that got a real nurture/follow-up sequence assigned.
  const noContractRouted = records.filter(
    (r) =>
      r.deal_status !== 'Under Contract' &&
      r.recommended_follow_up_sequence &&
      r.recommended_follow_up_sequence !== 'Unclassified — Needs Review',
  ).length;

  return {
    range: { start: range.start || '(all)', end: range.end || '(all)' },
    visits_completed: total,
    pct_with_voice_memo: pct(withMemo, total),
    pct_with_full_package_when_required: pct(fullPackage, requireVisual.length),
    full_package_denominator: requireVisual.length,
    under_contract_missing_visual: underContractMissingVisual,
    no_contract_moved_to_nurture: noContractRouted,
    leads_revived_from_followup: 'manual — track when a nurtured lead re-engages',
    top_reasons_sellers_did_not_sign: topN(
      records.flatMap((r) => [r.pass_reason, r.main_objection]),
    ),
    top_process_failures: topN(records.flatMap((r) => r.alert_codes)),
  };
}

// Render the report as a readable text block for the weekly meeting.
export function renderWeeklyReport(report) {
  const list = (arr) =>
    arr.length ? arr.map((x) => `    - ${x.value} (${x.count})`).join('\n') : '    - (none)';
  return [
    `WEEKLY POST-VISIT REVIEW  [${report.range.start} → ${report.range.end}]`,
    `  Visits completed: ${report.visits_completed}`,
    `  With voice memo/update: ${report.pct_with_voice_memo}%`,
    `  With full photo/video package (when required): ${report.pct_with_full_package_when_required}% ` +
      `(of ${report.full_package_denominator} that required it)`,
    `  Under-contract missing visual package: ${report.under_contract_missing_visual}`,
    `  No-contract visits routed to a nurture sequence: ${report.no_contract_moved_to_nurture}`,
    `  Leads revived from follow-up: ${report.leads_revived_from_followup}`,
    '  Top reasons sellers did not sign:',
    list(report.top_reasons_sellers_did_not_sign),
    '  Top process failures to fix:',
    list(report.top_process_failures),
  ].join('\n');
}
