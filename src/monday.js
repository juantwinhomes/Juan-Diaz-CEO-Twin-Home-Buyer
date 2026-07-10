import { config, assertConfigured } from './config.js';

async function gql(query, variables = {}) {
  assertConfigured(['monday.apiToken']);
  const res = await fetch(config.monday.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.monday.apiToken,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`monday.com API error: ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

/** Find an existing item by REI Blackbook lead id (dedupe). */
export async function findItemByLeadId(leadId) {
  if (!leadId) return null;
  const data = await gql(
    `query ($boardId: ID!, $columnId: String!, $value: String!) {
      items_page_by_column_values(
        board_id: $boardId,
        columns: [{ column_id: $columnId, column_values: [$value] }],
        limit: 1
      ) { items { id name } }
    }`,
    { boardId: config.monday.boardId, columnId: config.monday.columns.leadId, value: String(leadId) }
  );
  return data.items_page_by_column_values?.items?.[0] || null;
}

/** Create a lead item in the New Lead Alert group of the Property Leads board. */
export async function createLeadItem(lead) {
  const c = config.monday.columns;
  const columnValues = {};

  if (lead.leadId) columnValues[c.leadId] = String(lead.leadId);
  if (lead.source && c.source) columnValues[c.source] = { label: lead.source };
  if (c.leadStage) columnValues[c.leadStage] = { label: 'New' };
  if (lead.campaign && c.campaign) columnValues[c.campaign] = lead.campaign;
  if (lead.mailBatch && c.mailBatch) columnValues[c.mailBatch] = lead.mailBatch;
  if (lead.phone && c.phone) columnValues[c.phone] = { phone: lead.phone, countryShortName: 'US' };
  columnValues[c.dateReceived] = { date: lead.receivedDate || new Date().toISOString().slice(0, 10) };
  // The item name carries the property address. The Monday location column needs
  // lat/lng (a bare address string is rejected), so we fold the address into notes.
  const noteBody = [
    lead.leadName ? `Lead: ${lead.leadName}` : '',
    lead.address ? `Property: ${lead.address}` : '',
    lead.notes,
  ].filter(Boolean).join('\n');
  if (noteBody) columnValues[c.notes] = { text: noteBody };

  const data = await gql(
    `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(
        board_id: $boardId,
        group_id: $groupId,
        item_name: $itemName,
        column_values: $columnValues,
        create_labels_if_missing: true
      ) { id name }
    }`,
    {
      boardId: config.monday.boardId,
      groupId: config.monday.newLeadGroupId,
      itemName: lead.itemName,
      columnValues: JSON.stringify(columnValues),
    }
  );
  return data.create_item;
}

/** Append an update (activity log comment) to an item. */
export async function addItemUpdate(itemId, body) {
  await gql(
    `mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) { id }
    }`,
    { itemId, body }
  );
}

/** Fetch the column values needed to build a QuickBooks record for a closed deal. */
export async function getItemForClosedDeal(itemId) {
  const c = config.monday.columns;
  const data = await gql(
    `query ($itemId: [ID!]) {
      items(ids: $itemId) {
        id
        name
        column_values { id text value }
      }
    }`,
    { itemId: [String(itemId)] }
  );
  const item = data.items?.[0];
  if (!item) return null;
  const byId = Object.fromEntries(item.column_values.map((cv) => [cv.id, cv]));
  return {
    id: item.id,
    propertyAddress: item.name,
    leadName: byId[c.leadName]?.text || '',
    leadId: byId[c.leadId]?.text || '',
    leadStage: byId[c.leadStage]?.text || '',
    actualGrossRevenue: parseFloat(byId[c.actualGrossRevenue]?.text || '') || 0,
    projectedGrossRevenue: parseFloat(byId[c.projectedGrossRevenue]?.text || '') || 0,
    notes: byId[c.notes]?.text || '',
  };
}
