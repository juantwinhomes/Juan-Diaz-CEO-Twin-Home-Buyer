export const config = {
  port: process.env.PORT || 3000,

  // Shared secret appended to the REI Blackbook webhook URL (?secret=...)
  // so only your REI Blackbook workflows can post leads.
  webhookSecret: process.env.WEBHOOK_SECRET || '',

  monday: {
    apiToken: process.env.MONDAY_API_TOKEN || '',
    apiUrl: 'https://api.monday.com/v2',
    // "📬 Direct Mail & Postcard Leads" board (Twin Home Buyer workspace).
    boardId: process.env.MONDAY_BOARD_ID || '18421418228',
    newLeadGroupId: process.env.MONDAY_NEW_LEAD_GROUP_ID || 'group_mm54scqh', // 🚨 New Leads
    // Column ids on the Direct Mail & Postcard Leads board
    columns: {
      source: 'color_mm54emr0',       // status: Direct Mail (Postcard) / (Checks) / (Letters)
      leadStage: 'color_mm548bx',     // status: New / Contacted / Interested / ...
      campaign: 'text_mm54s1vj',      // Campaign / List
      mailBatch: 'text_mm54ertw',     // Mail Batch (Redstone Job ID)
      leadId: 'text_mm54em6',         // REI Lead ID
      phone: 'phone_mm54d58j',
      location: 'location_mm5432yk',  // Property Address
      dateReceived: 'date_mm542afm',
      offerAmount: 'numeric_mm54f98z',
      notes: 'long_text_mm54j54x',
    },
    // Lead Stage labels that mean "deal closed" and should sync to QuickBooks
    closedStageLabels: (process.env.MONDAY_CLOSED_STAGES || 'Acquired,Closed / Won')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  quickbooks: {
    // QuickBooks Online app credentials (create an app at developer.intuit.com,
    // use the OAuth 2.0 playground or the /qbo/connect flow to obtain tokens).
    clientId: process.env.QBO_CLIENT_ID || '',
    clientSecret: process.env.QBO_CLIENT_SECRET || '',
    refreshToken: process.env.QBO_REFRESH_TOKEN || '',
    realmId: process.env.QBO_REALM_ID || '',
    environment: process.env.QBO_ENVIRONMENT || 'production', // or 'sandbox'
    // Item/service name used on the sales receipt line for closed deals
    serviceItemName: process.env.QBO_SERVICE_ITEM || 'Real Estate Deal',
  },
};

export function assertConfigured(keys) {
  const missing = [];
  const get = (path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), config);
  for (const k of keys) if (!get(k)) missing.push(k);
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')} (see .env.example)`);
  }
}
