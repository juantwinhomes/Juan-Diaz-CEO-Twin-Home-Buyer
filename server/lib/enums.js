/** Single source of truth for every dropdown in the app. */
export const ENUMS = {
  priorities: [
    { value: 'P1', label: 'P1 — Critical' },
    { value: 'P2', label: 'P2 — High' },
    { value: 'P3', label: 'P3 — Normal' },
    { value: 'P4', label: 'P4 — Low' }
  ],
  commitment_statuses: ['Not Started', 'In Progress', 'Completed', 'Blocked', 'Cancelled'],
  carryover_reasons: ['Continue tomorrow', 'Blocked', 'Cancelled', 'Changed priority'],
  project_types: ['System', 'Automation', 'Report'],
  project_statuses: [
    'Backlog', 'Requirements', 'Building', 'Internal Testing', 'User Testing',
    'Ready for Deployment', 'Production', 'Monitoring', 'Blocked', 'Completed', 'Cancelled'
  ],
  project_phases: [
    'Requirements', 'Architecture / Setup', 'Core Build', 'Internal Testing',
    'User Testing', 'Deployment', 'Monitoring'
  ],
  milestone_framework: [
    { name: 'Requirements Confirmed', target_pct: 10 },
    { name: 'Architecture / Setup Complete', target_pct: 20 },
    { name: 'Core Build Started', target_pct: 40 },
    { name: 'Core Build Complete', target_pct: 60 },
    { name: 'Internal Testing Complete', target_pct: 75 },
    { name: 'User Testing Complete', target_pct: 90 },
    { name: 'Production Deployed', target_pct: 100 }
  ],
  blocker_reasons: [
    'Waiting for credentials', 'Waiting for approval', 'API issue',
    'Client/department dependency', 'Missing requirements', 'Technical limitation',
    'Waiting for data', 'Waiting for vendor', 'Other'
  ],
  blocker_statuses: ['Open', 'Waiting', 'Escalated', 'Resolved'],
  deployment_kinds: ['Feature', 'Automation', 'System Launch', 'Fix'],
  system_types: [
    'Automation', 'AI Agent', 'Internal App', 'API Integration',
    'Dashboard', 'Script', 'CRM Workflow', 'Other'
  ],
  system_statuses: ['Healthy', 'Warning', 'Degraded', 'Down'],
  severities: ['Low', 'Medium', 'High', 'Critical'],
  incident_categories: [
    'Critical issue', 'Bug', 'Failed automation', 'Failed integration', 'AI error', 'System downtime'
  ],
  incident_statuses: ['Open', 'Investigating', 'Resolved'],
  report_types: [
    { value: 'daily-team', label: 'Daily Team Report' },
    { value: 'daily-individual', label: 'Individual Daily Report' },
    { value: 'weekly-team', label: 'Weekly Team Report' },
    { value: 'project-status', label: 'Project Status Report' },
    { value: 'blockers', label: 'Blocker Report' },
    { value: 'production-health', label: 'Production Health Report' },
    { value: 'business-impact', label: 'Business Impact Report' }
  ]
};

export const ACTIVE_PROJECT_STATUSES = [
  'Requirements', 'Building', 'Internal Testing', 'User Testing',
  'Ready for Deployment', 'Production', 'Monitoring', 'Blocked'
];
