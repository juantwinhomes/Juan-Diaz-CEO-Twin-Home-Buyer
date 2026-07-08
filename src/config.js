export const config = {
  port: process.env.PORT || 3000,

  // Shared secret appended to the REI Blackbook webhook URL (?secret=...)
  // so only your REI Blackbook workflows can post leads.
  webhookSecret: process.env.WEBHOOK_SECRET || '',

  monday: {
    apiToken: process.env.MONDAY_API_TOKEN || '',
    apiUrl: 'https://api.monday.com/v2',
    boardId: process.env.MONDAY_BOARD_ID || '18392647845', // Property Leads
    newLeadGroupId: process.env.MONDAY_NEW_LEAD_GROUP_ID || 'topics', // 🚨 New Lead Alert!
    // Column ids on the Property Leads board
    columns: {
      leadName: 'text_mm3vahm9',
      leadId: 'text_mm3swbma',
      contactStatus: 'status',
      leadStage: 'dropdown_mm44r4m3',
      county: 'dropdown_mkyr1cc6',
      dateReceived: 'date_mm3sgnvn',
      lastUpdated: 'date_mkyrf1ew',
      notes: 'long_text_mkyrkwjz',
      location: 'location_mm4kxecc',
      costPerLead: 'numeric_mm3s2vk2',
      projectedGrossRevenue: 'numeric_mm4dsxj8',
      actualGrossRevenue: 'numeric_mm4dj28c',
    },
    // Lead Stage labels that mean "deal closed" and should sync to QuickBooks
    closedStageLabels: (process.env.MONDAY_CLOSED_STAGES || 'Acquired,Wholesale Closed')
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
