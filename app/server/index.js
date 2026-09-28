'use strict';
const { openDb } = require('./db');
const { createApp } = require('./app');
const { seed } = require('./seed');

const db = openDb();
if (process.env.KCA_NO_SEED !== '1') seed(db, { log: m => console.log(`[seed] ${m}`) });

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4400);
createApp(db).server().listen(port, host, () => {
  console.log(`Kristine AI Controller Academy running at http://${host}:${port}`);
  console.log('Synthetic demo data. Not connected to QuickBooks, banks, payroll or payments.');
});
