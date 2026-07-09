import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`thb-integration-bridge listening on :${config.port}`);
  console.log(`  POST /webhooks/reiblackbook  (REI Blackbook → Monday board ${config.monday.boardId})`);
  console.log(`  POST /webhooks/monday        (Monday stage ${config.monday.closedStageLabels.join('/')} → QuickBooks)`);
});
