'use strict';
// Read-only connector interfaces for a later phase. NOTHING here is connected in the MVP.
//
// Rules for any future connector:
//  - Read-only scopes only. No connector may create, edit or delete ledger records, vendors, payments or bank details.
//  - Credentials come from environment variables or a secrets manager, never from code or the database.
//  - Every pull goes through the same importer path as a CSV: stored original, hash, row references, preview, commit.
//  - Pulls write an audit event with the connector name, scope and record counts.

/** @interface ReadOnlyLedgerConnector */
const LedgerConnectorInterface = {
  name: 'string',
  /** @returns {Promise<{connected:boolean, company:string, scopes:string[]}>} */
  status: 'async () => ...',
  /** Chart of accounts for one company file. */
  listAccounts: 'async ({ companyId }) => [{ number, name, type, subtype }]',
  /** General ledger detail for a date range, as rows the importer can stage. */
  exportTransactions: 'async ({ companyId, from, to }) => ({ filename, csv, retrievedAt })',
  /** Open bills for AP aging. */
  exportOpenBills: 'async ({ companyId, asOf }) => ({ filename, csv, retrievedAt })',
  /** Projects (QuickBooks Online Plus/Advanced) for the project dictionary. */
  listProjects: 'async ({ companyId }) => [{ id, name, customer, status }]',
};

/** @interface ReadOnlyBankConnector */
const BankConnectorInterface = {
  name: 'string',
  status: 'async () => ...',
  exportStatement: 'async ({ accountId, periodStart, periodEnd }) => ({ filename, csv, openingCents, closingCents, retrievedAt })',
};

function notConnected(name) {
  const fail = async () => { throw new Error(`${name} connector is not connected in this MVP. Export a CSV and use the Workbench.`); };
  return { name, status: async () => ({ connected: false, company: null, scopes: [] }), listAccounts: fail, exportTransactions: fail, exportOpenBills: fail, listProjects: fail, exportStatement: fail };
}

const CONNECTORS = [
  { key: 'quickbooks_online', label: 'QuickBooks Online (read-only)', kind: 'ledger', planned_scopes: ['com.intuit.quickbooks.accounting (read only)'], impl: notConnected('QuickBooks Online') },
  { key: 'bank_statements', label: 'Bank statement feed (read-only)', kind: 'bank', planned_scopes: ['statements:read'], impl: notConnected('Bank') },
];

module.exports = { CONNECTORS, LedgerConnectorInterface, BankConnectorInterface };
