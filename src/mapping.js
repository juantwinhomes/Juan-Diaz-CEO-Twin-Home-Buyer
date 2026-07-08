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
  const source = pick(payload, ['source', 'lead_source', 'Source', 'campaign', 'utm_source']);
  const leadId = pick(payload, ['contact_id', 'lead_id', 'id', 'ContactId', 'contactId']);

  const notesParts = [];
  if (phone) notesParts.push(`Phone: ${phone}`);
  if (email) notesParts.push(`Email: ${email}`);
  if (source) notesParts.push(`Source: ${source}`);
  const extraNotes = pick(payload, ['notes', 'message', 'comments']);
  if (extraNotes) notesParts.push(extraNotes);

  return {
    // Item name on the board is the property address; fall back to the person.
    itemName: street || address || fullName || 'New REI Blackbook lead',
    leadName: fullName,
    leadId,
    county,
    address,
    receivedDate: pick(payload, ['created_at', 'date', 'received_date']).slice(0, 10) || undefined,
    notes: notesParts.join('\n'),
  };
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
