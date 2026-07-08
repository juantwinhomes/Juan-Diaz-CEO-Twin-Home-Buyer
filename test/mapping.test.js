import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReiLead, parseMondayEvent } from '../src/mapping.js';

test('normalizeReiLead maps common REI Blackbook fields', () => {
  const lead = normalizeReiLead({
    first_name: 'Maria',
    last_name: 'Santos',
    property_address: '123 Main St',
    city: 'Antioch',
    state: 'CA',
    zip: '94509',
    county: 'Contra Costa',
    phone: '(510) 555-1212',
    email: 'maria@example.com',
    lead_source: 'PPC',
    contact_id: '987654',
  });
  assert.equal(lead.itemName, '123 Main St');
  assert.equal(lead.leadName, 'Maria Santos');
  assert.equal(lead.leadId, '987654');
  assert.equal(lead.county, 'Contra Costa');
  assert.equal(lead.address, '123 Main St, Antioch, CA, 94509');
  assert.match(lead.notes, /Phone: \(510\) 555-1212/);
  assert.match(lead.notes, /Source: PPC/);
});

test('normalizeReiLead falls back to contact name when no address', () => {
  const lead = normalizeReiLead({ name: 'John Buyer' });
  assert.equal(lead.itemName, 'John Buyer');
});

test('normalizeReiLead handles empty payload', () => {
  const lead = normalizeReiLead({});
  assert.equal(lead.itemName, 'New REI Blackbook lead');
  assert.equal(lead.leadId, '');
});

test('parseMondayEvent extracts dropdown stage change', () => {
  const event = parseMondayEvent({
    event: {
      type: 'update_column_value',
      pulseId: 123456,
      boardId: 18392647845,
      columnId: 'dropdown_mm44r4m3',
      value: { chosenValues: [{ name: 'Acquired' }] },
    },
  });
  assert.equal(event.itemId, 123456);
  assert.deepEqual(event.labels, ['Acquired']);
});

test('parseMondayEvent extracts status label change', () => {
  const event = parseMondayEvent({
    event: { type: 'update_column_value', pulseId: 9, value: { label: { text: 'Done' } } },
  });
  assert.deepEqual(event.labels, ['Done']);
});
