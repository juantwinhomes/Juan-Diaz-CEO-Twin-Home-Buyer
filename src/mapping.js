/**
 * Normalize an REI Blackbook workflow webhook payload into the lead shape
 * used to create Monday.com items.
 *
 * REI Blackbook workflow "Post to URL / webhook" steps send contact merge
 * fields. Field names vary by workflow configuration, so this mapper checks
 * the common variants for each logical field.
 */

function pick(payload, keys) {
  for (const k of keys) {
    const v = payload[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function normalizeReiLead(payload = {}) {
  const firstName = pick(payload, ['first_name', 'firstname', 'FirstName', 'contact_first_name']);
  const lastName = pick(payload, ['last_name', 'lastname', 'LastName', 'contact_last_name']);
  const fullName =
    pick(payload, ['full_name', 'name', 'contact_name']) || [firstName, lastName].filter(Boolean).join(' ');

  const street = pick(payload, [
    'property_address', 'property_street', 'address', 'street_address', 'PropertyAddress', 'address1',
  ]);
  const city = pick(payload, ['property_city', 'city', 'City']);
  const state = pick(payload, ['property_state', 'state', 'State']);
  const zip = pick(payload, ['property_zip', 'zip', 'postal_code', 'Zip']);
  const county = pick(payload, ['property_county', 'county', 'County']);

  const address = [street, city, state, zip].filter(Boolean).join(', ');
  const phone = pick(payload, ['phone', 'phone_number', 'mobile', 'Phone', 'contact_phone']);
  const email = pick(payload, ['email', 'Email', 'contact_email']);
  const rawSource = pick(payload, ['source', 'lead_source', 'Source', 'utm_source']);
  const tagsRaw = pick(payload, ['tags', 'Tags', 'flags']);
  let campaign = pick(payload, ['campaign', 'Campaign', 'utm_campaign', 'list', 'list_name']);
  if (!campaign) campaign = deriveCampaignFromTags(tagsRaw); // infer list from motivation tags
  const mailBatch = pick(payload, ['mail_batch', 'batch', 'redstone_job_id', 'job_id']);
  const leadId = pick(payload, ['contact_id', 'lead_id', 'id', 'ContactId', 'contactId']);

  // Normalize source to the board's Source labels.
  const s = rawSource.toLowerCase();
  let source = rawSource;
  if (/postcard/.test(s)) source = 'Direct Mail (Postcard)';
  else if (/check/.test(s)) source = 'Direct Mail (Checks)';
  else if (/letter/.test(s)) source = 'Direct Mail (Letters)';

  const notesParts = [];
  if (email) notesParts.push(`Email: ${email}`);
  if (rawSource && source !== rawSource) notesParts.push(`Raw source: ${rawSource}`);
  const extraNotes = pick(payload, ['notes', 'message', 'comments']);
  if (extraNotes) notesParts.push(extraNotes);

  return {
    // Item name on the board is the property address; fall back to the person.
    itemName: street || address || fullName || 'New REI Blackbook lead',
    leadName: fullName,
    leadId,
    source,       // mapped to a board Source label
    campaign,
    mailBatch,
    phone,
    county,
    address,
    receivedDate: pick(payload, ['created_at', 'date', 'received_date']).slice(0, 10) || undefined,
    notes: notesParts.join('\n'),
  };
}

/** True when a normalized lead is a direct-mail / postcard lead. */
export function isDirectMailLead(lead) {
  return /Direct Mail/i.test(lead.source || '');
}

/**
 * Infer the mail list / campaign from REI Blackbook motivation tags when the
 * Campaign field is blank. tags may be a comma/semicolon string or array.
 * Ordered most-specific first.
 */
const CAMPAIGN_TAG_MAP = [
  [/death of joint tenant/i, 'Death of Joint Tenant'],
  [/notice of trustee sale|(^|\W)nts(\W|$)/i, 'NTS'],
  [/notice of default|(^|\W)nod(\W|$)/i, 'NOD / Foreclosure'],
  [/foreclosure/i, 'Foreclosure'],
  [/tax delinquent/i, 'Tax Delinquent'],
  [/lien/i, 'Liens'],
  [/70%? distress|distress score/i, '70% Distress'],
  [/ugly house/i, 'Ugly House'],
  [/high equity/i, 'High Equity'],
  [/probate/i, 'Probate'],
  [/bankruptcy/i, 'Bankruptcy'],
  // NOTE: "Motivated Leads" and "Property Leads" are separate PPL lead sources,
  // not direct-mail campaigns — intentionally excluded from this map.
];
export function deriveCampaignFromTags(tags) {
  const list = Array.isArray(tags) ? tags.join(';') : String(tags || '');
  for (const [re, label] of CAMPAIGN_TAG_MAP) if (re.test(list)) return label;
  return '';
}

/**
 * Extract the pieces we care about from a Monday.com webhook event.
 * Monday sends { event: { type, pulseId, boardId, columnId, value, ... } }.
 */
export function parseMondayEvent(body = {}) {
  const e = body.event || {};
  const labels = [];
  // dropdown values arrive as { value: { chosenValues: [{ name }] } }
  const chosen = e.value?.chosenValues;
  if (Array.isArray(chosen)) for (const c of chosen) if (c?.name) labels.push(c.name);
  // status values arrive as { value: { label: { text } } }
  const statusText = e.value?.label?.text;
  if (statusText) labels.push(statusText);

  return {
    type: e.type || '',
    itemId: e.pulseId || e.itemId || null,
    boardId: e.boardId || null,
    columnId: e.columnId || '',
    labels,
  };
}
