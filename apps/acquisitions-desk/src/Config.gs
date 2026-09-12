/**
 * Config.gs — constants shared by every service.
 * Sheet names, exact headers, statuses, roles, action types.
 * Nothing here talks to Sheets; it is pure configuration.
 */

var APP_NAME = 'THB Acquisitions Desk';
var APP_VERSION = '1.4.0';
var DB_NAME = 'THB Acquisitions Desk — Production Database';
var BACKUP_FOLDER_NAME = 'THB Acquisitions Desk Backups';

// Script Properties keys
var PROP_DB_ID = 'THB_DB_SPREADSHEET_ID';
var PROP_ENV = 'THB_ENV'; // 'production' | 'development'

var SHEETS = {
  USERS: 'USERS',
  LEADS: 'LEADS',
  LEAD_ACTIVITY: 'LEAD_ACTIVITY',
  APPOINTMENTS: 'APPOINTMENTS',
  DAILY_METRICS: 'DAILY_METRICS',
  TOOL_INVENTORY: 'TOOL_INVENTORY',
  TOOL_TRAINING: 'TOOL_TRAINING',
  TOOL_RUNS: 'TOOL_RUNS',
  SETTINGS: 'SETTINGS',
  AUDIT_LOG: 'AUDIT_LOG',
  ERROR_LOG: 'ERROR_LOG',
  BACKUP_LOG: 'BACKUP_LOG'
};

var HEADERS = {
  USERS: ['user_id','name','email','team','role','active','permission_level','created_at','updated_at'],
  LEADS: ['lead_id','address','seller_name','phone','source','equity_note','status','assigned_to','team',
          'flag_juan','compliance_mailer_check','contact_attempts','next_action','due_date','arv','repairs',
          'asking_price','offer','appointment_date','appointment_outcome','archive_reason','created_by',
          'created_at','updated_by','updated_at','last_touched_at','version','exit_strategy','disposition','purchase_price','closing_date','sale_price'],
  LEAD_ACTIVITY: ['activity_id','lead_id','user_id','user_name','user_email','business_date','timestamp_utc',
                  'action_type','field_changed','old_value','new_value','note'],
  APPOINTMENTS: ['appointment_id','lead_id','appointment_date','appointment_time','timezone','assigned_to',
                 'status','outcome','notes','created_by','created_at','updated_by','updated_at'],
  DAILY_METRICS: ['business_date','tv_spend','ppc_spend','ppl_spend','other_spend','new_leads','inbound_calls',
                  'missed_calls','sellers_reached','appointments_set','contracts_signed','contracts_fell_out',
                  'deals_closed','minutes_to_first_call','created_by','created_at','updated_by','updated_at',
                  'seo_spend','mail_spend'],
  TOOL_INVENTORY: ['tool_id','name','description','built_by','operator','backup_operator','status','steps',
                   'expected_output','cadence','link','recommendation','handoff_date','verdict','proof_last_week',
                   'asked_date','created_at','updated_at'],
  TOOL_TRAINING: ['record_id','tool_id','user_id','trained','certified_date','certified_by','notes'],
  TOOL_RUNS: ['run_id','tool_id','business_date','run_by','run_at','status','result','proof'],
  SETTINGS: ['setting_key','setting_value','updated_by','updated_at'],
  AUDIT_LOG: ['event_id','timestamp_utc','business_date','user_id','user_email','entity_type','entity_id','action','details'],
  ERROR_LOG: ['error_id','timestamp_utc','user_id','function','entity_type','entity_id','error','details'],
  BACKUP_LOG: ['backup_id','timestamp','backup_file_id','backup_name','status','error']
};

// Primary key column per sheet
var ID_COLUMN = {
  USERS: 'user_id', LEADS: 'lead_id', LEAD_ACTIVITY: 'activity_id', APPOINTMENTS: 'appointment_id',
  DAILY_METRICS: 'business_date', TOOL_INVENTORY: 'tool_id', TOOL_TRAINING: 'record_id', TOOL_RUNS: 'run_id',
  SETTINGS: 'setting_key', AUDIT_LOG: 'event_id', ERROR_LOG: 'error_id', BACKUP_LOG: 'backup_id'
};

var ROLES = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', REP: 'REP', TECHNICAL: 'TECHNICAL' };
var PERMISSION_LEVEL = { ADMIN: 100, MANAGER: 70, TECHNICAL: 50, REP: 40 };

// Capability matrix. Anything not listed is denied.
var CAPABILITIES = {
  view_leads:        ['ADMIN','MANAGER','REP','TECHNICAL'],
  work_leads:        ['ADMIN','MANAGER','REP'],
  create_leads:      ['ADMIN','MANAGER','REP'],
  assign_leads:      ['ADMIN','MANAGER'],
  archive_leads:     ['ADMIN','MANAGER','REP'],
  restore_leads:     ['ADMIN','MANAGER'],
  underwrite:        ['ADMIN','MANAGER','REP'],
  view_team:         ['ADMIN','MANAGER'],
  view_numbers:      ['ADMIN','MANAGER','REP','TECHNICAL'],
  enter_metrics:     ['ADMIN','MANAGER','REP'],
  manage_settings:   ['ADMIN'],
  manage_targets:    ['ADMIN','MANAGER'],
  manage_users:      ['ADMIN'],
  view_audit:        ['ADMIN','MANAGER'],
  view_tools:        ['ADMIN','MANAGER','REP','TECHNICAL'],
  manage_tools:      ['ADMIN','MANAGER','TECHNICAL'],
  run_tools:         ['ADMIN','MANAGER','REP','TECHNICAL'],
  backup:            ['ADMIN']
};

var LEAD_STATUS = {
  NEW: 'NEW', INVESTIGATING: 'INVESTIGATING', CONTACT_MADE: 'CONTACT_MADE', APPOINTMENT_SET: 'APPOINTMENT_SET',
  UNDER_CONTRACT: 'UNDER_CONTRACT', CLOSED: 'CLOSED', ARCHIVED_SOLD: 'ARCHIVED_SOLD',
  ARCHIVED_NO_EQUITY: 'ARCHIVED_NO_EQUITY', ARCHIVED_NOT_INTERESTED: 'ARCHIVED_NOT_INTERESTED',
  ARCHIVED_BAD_DATA: 'ARCHIVED_BAD_DATA'
};
var STATUS_LABELS = {
  NEW: 'New', INVESTIGATING: 'Investigating', CONTACT_MADE: 'Contact made', APPOINTMENT_SET: 'Appointment set',
  UNDER_CONTRACT: 'Under contract', CLOSED: 'Closed', ARCHIVED_SOLD: 'Archived: sold',
  ARCHIVED_NO_EQUITY: 'Archived: no equity', ARCHIVED_NOT_INTERESTED: 'Archived: not interested',
  ARCHIVED_BAD_DATA: 'Archived: bad data'
};
var STATUS_ORDER = ['NEW','INVESTIGATING','CONTACT_MADE','APPOINTMENT_SET','UNDER_CONTRACT','CLOSED',
                    'ARCHIVED_SOLD','ARCHIVED_NO_EQUITY','ARCHIVED_NOT_INTERESTED','ARCHIVED_BAD_DATA'];
var LIVE_STATUSES = ['NEW','INVESTIGATING','CONTACT_MADE','APPOINTMENT_SET','UNDER_CONTRACT'];
var ARCHIVED_STATUSES = ['ARCHIVED_SOLD','ARCHIVED_NO_EQUITY','ARCHIVED_NOT_INTERESTED','ARCHIVED_BAD_DATA'];

var APPOINTMENT_OUTCOMES = ['Not visited yet','Offer made','Thinking about it','Too high on price','No deal','Signed'];
var APPOINTMENT_STATUS = { SCHEDULED: 'SCHEDULED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', RESCHEDULED: 'RESCHEDULED' };

var ACTION = {
  LEAD_CREATED: 'LEAD_CREATED', LEAD_IMPORTED: 'LEAD_IMPORTED', CALL_ATTEMPT: 'CALL_ATTEMPT', NOTE_ADDED: 'NOTE_ADDED',
  STATUS_CHANGED: 'STATUS_CHANGED', ASSIGNED: 'ASSIGNED', NEXT_ACTION_CHANGED: 'NEXT_ACTION_CHANGED',
  NEXT_ACTION_DONE: 'NEXT_ACTION_DONE', DUE_DATE_CHANGED: 'DUE_DATE_CHANGED', APPOINTMENT_SET: 'APPOINTMENT_SET',
  APPOINTMENT_UPDATED: 'APPOINTMENT_UPDATED', UNDERWRITING_CHANGED: 'UNDERWRITING_CHANGED', OFFER_CHANGED: 'OFFER_CHANGED',
  FLAGGED_FOR_JUAN: 'FLAGGED_FOR_JUAN', JUAN_FLAG_CLEARED: 'JUAN_FLAG_CLEARED', COMPLIANCE_FLAGGED: 'COMPLIANCE_FLAGGED',
  COMPLIANCE_CLEARED: 'COMPLIANCE_CLEARED', ARCHIVED: 'ARCHIVED', RESTORED: 'RESTORED', FIELD_CHANGED: 'FIELD_CHANGED', OFFER_SENT: 'OFFER_SENT'
};

// Fields a REP may patch through updateLead. Everything else needs a dedicated function or a higher role.
var LEAD_PATCHABLE = ['address','seller_name','phone','source','equity_note','status','next_action','due_date',
                      'arv','repairs','asking_price','offer','appointment_date','appointment_outcome','team',
                      'exit_strategy','disposition','purchase_price','closing_date','sale_price'];
/** What we plan to do with the house once we control it (whiteboard: Exit Strategy). */
var EXIT_STRATEGIES = ['Wholesale','Wholetail','Fix & Flip','Wholetail / Flip','Hold'];
/** Where an acquired property is in disposition (whiteboard: Status). */
var DISPOSITIONS = ['Under construction','Listed','Listed - pending','Sold','Wholesaled'];
var LEAD_NUMERIC = ['arv','repairs','asking_price','offer','purchase_price','sale_price','contact_attempts','version'];
var LEAD_DATE = ['due_date','appointment_date','closing_date'];
var LEAD_BOOL = ['flag_juan','compliance_mailer_check'];

var MAX_LEN = { short: 200, address: 300, note: 4000, steps: 8000, url: 2000 };

/** Spend channels: [metrics field prefix, label]. DAILY_METRICS has one <key>_spend column per channel. */
var CHANNELS = [['tv','TV'],['ppc','PPC'],['seo','SEO'],['ppl','Motivated Leads'],['mail','Direct mail'],['other','Other']];
/** Lead sources: [label, spend channel]. Each source rolls up into one spend channel for cost-per-lead. */
var LEAD_SOURCES = [['PPC','ppc'],['TV','tv'],['SEO','seo'],['Motivated Leads','ppl'],['Property Leads','other'],
                    ['DM Postcard','mail'],['DM Letters','mail'],['DM Checks','mail'],['MLS/Redfin','other'],
                    ['Realtor','other'],['Other','other']];
/** Spellings we accept from REI BlackBook tags, the whiteboard and old data → canonical source label. */
var SOURCE_ALIASES = { 'ppl': 'Motivated Leads', 'motivated lead': 'Motivated Leads', 'pay per lead': 'Motivated Leads',
  'ppc - google ads': 'PPC', 'ppc-google ads': 'PPC', 'google ads': 'PPC', 'ppc lead': 'PPC', 'tv commercial': 'TV',
  'postcard': 'DM Postcard', 'post card': 'DM Postcard', 'dm post card': 'DM Postcard', 'dm-post card': 'DM Postcard', 'dm-postcard': 'DM Postcard',
  'letters': 'DM Letters', 'letter': 'DM Letters', 'dm letter': 'DM Letters', 'checks': 'DM Checks', 'check': 'DM Checks', 'dm check': 'DM Checks',
  'agent': 'Realtor', 'agent/realtor': 'Realtor', 'realtor/agent': 'Realtor', 'mls': 'Realtor', 'mls lead': 'Realtor',
  'mls/redfin': 'MLS/Redfin', 'mls / redfin': 'MLS/Redfin', 'redfin': 'MLS/Redfin',
  'property leads': 'Property Leads', 'propertyleads': 'Property Leads', 'propertyleads.com': 'Property Leads' };
/**
 * How many of the newest LEAD_ACTIVITY rows a summary read looks at. The sheet is append-only and in time order,
 * so recent activity always lives at the end. Full history reads are separate and still complete.
 */
var ACTIVITY_TAIL_ROWS = 1500;
/** Small, hot tables kept in CacheService between requests, in seconds. Every write clears them. */
var TABLE_CACHE_SECONDS = { SETTINGS: 300, USERS: 300 };
/** Tool fields stored as a business date (yyyy-MM-dd), not free text. */
var TOOL_DATE_FIELDS = ['asked_date','handoff_date'];
var METRIC_FIELDS = ['tv_spend','ppc_spend','seo_spend','ppl_spend','mail_spend','other_spend','new_leads','inbound_calls','missed_calls',
                     'sellers_reached','appointments_set','contracts_signed','contracts_fell_out','deals_closed',
                     'minutes_to_first_call'];

var TOOL_STATUS = ['Unconfirmed','Live and used daily','Live but nobody uses it','Built, never launched','Waiting on legal clearance','Retired'];
var TOOL_RECOMMENDATION = ['Decide','Use it daily','Wire it into the desk','Wrong lane, leave it','Retire it'];
var TOOL_CADENCE = ['Not set','Every day','Every weekday','Weekly','On each new lead','As needed'];
var TOOL_DAILY_CADENCE = ['Every day','Every weekday'];
var TOOL_VERDICT = ['Not handed over yet','Works, in use','Broken, sent back','Needs training first'];
var TOOL_PATCHABLE = ['name','description','built_by','operator','backup_operator','status','steps','expected_output',
                      'cadence','link','recommendation','handoff_date','verdict','proof_last_week','asked_date'];

var PILLARS = [
  {id:'p_score',name:'Lead scoring',what:'Every lead scored on value, repairs and profit so the winners surface'},
  {id:'p_out',name:'Seller outreach',what:'First-touch texts and calls drafted and sent without anyone typing'},
  {id:'p_follow',name:'Follow-up',what:'Nothing in the 8,000 goes cold unattended'},
  {id:'p_contract',name:'Contract generation',what:'Offers and paperwork filled from our own data'},
  {id:'p_report',name:'Reporting',what:'The numbers on this desk assembled without a person'}
];
var PILLAR_STATES = ['Not started','Built, not in use','Partly running','Running every day'];
var BUILDERS = ['Seth','Jonathan','Bryan'];

var DEFAULT_SETTINGS = {
  monthly_deal_target: '3',
  monthly_marketing_budget: '0',
  mao_percentage: '70',
  stale_lead_days: '7',
  business_timezone: 'America/Los_Angeles',
  auto_refresh_seconds: '30',
  app_version: APP_VERSION,
  live_list_target: '200',
  page_size: '150',
  cpl_ceiling: '100',
  speed_target_minutes: '10'
};

var PAGE_SIZE_DEFAULT = 150;
var PAGE_SIZE_MAX = 200;
var LOCK_TIMEOUT_MS = 15000;

// Seed data — the 22 builds from the prototype. Emails are NOT invented here; USERS seed is in Setup.gs.
var SEED_TOOLS = [
  {tool_id:'retell',name:'Retell conversation flow and intent routing',built_by:'Seth',operator:'',description:'How the AI speaks, and whether a call is a new seller, existing seller or other'},
  {tool_id:'retellback',name:'Retell functions, Zapier and Chat alerts',built_by:'Jonathan',operator:'',description:'Caller mapping, live transfer, callback logic, notifications'},
  {tool_id:'plbids',name:'PropertyLeads bid monitoring',built_by:'Seth',operator:'Seth',cadence:'Every day',description:'Check the top bid morning, lunch and end of day so we do not lose the feed'},
  {tool_id:'pldispute',name:'PropertyLeads dispute filing',built_by:'Seth',operator:'Seth',cadence:'Every day',description:'File disputes on bad leads in Monday every day, or we pay for junk'},
  {tool_id:'gui',name:'GUI and mouse automation (Claude Code)',built_by:'Seth',operator:'',description:'Clicks through screens that have no API'},
  {tool_id:'webhook',name:'Webhook receiver (main.py)',built_by:'',operator:'Bryan',description:'Pushes Retell calls into Monday with duplicate checking and mailer alerts'},
  {tool_id:'console',name:'Inbound call operations console',built_by:'',operator:'Cherry',description:'Live call handling screen for the PH desk'},
  {tool_id:'academy',name:'Phone Academy',built_by:'',operator:'Cherry',description:'Trains a new caller before they touch a live line'},
  {tool_id:'rebuttals',name:'Seller rebuttal library',built_by:'',operator:'Cherry',description:'21 rebuttals, never-say list, consent and DNC rules'},
  {tool_id:'simulator',name:'Juan Simulator certification',built_by:'',operator:'Cherry',description:'Reps practice seller calls and get graded before going live'},
  {tool_id:'trainingboard',name:'Team training board and 17-question certification',built_by:'',operator:'Bryan',description:'Nobody takes a live call without a perfect score'},
  {tool_id:'qa',name:'Phone QA workbook',built_by:'',operator:'Bryan',description:'Tests every published number and form so leads do not vanish'},
  {tool_id:'website',name:'Website alignment spec',built_by:'',operator:'Christine',description:'Fixes the number and availability conflicts across the site'},
  {tool_id:'opsdash',name:'Operations dashboard',built_by:'',operator:'Bryan',description:'Who owns what across people, departments and properties'},
  {tool_id:'kpidash',name:'KPI dashboard',built_by:'Seth',operator:'',description:'The earlier metrics build'},
  {tool_id:'revival',name:'Revival AI lead screening',built_by:'',operator:'Juan',description:'List cleaning only, no live texting until counsel clears it'},
  {tool_id:'blackbook',name:'REI BlackBook',built_by:'',operator:'Cherry',description:'The CRM of record where the 8,000 live'},
  {tool_id:'monday',name:'Monday.com',built_by:'',operator:'Bryan',description:'Operations hub'},
  {tool_id:'deepseek',name:'Local DeepSeek agent system',built_by:'Seth',operator:'',description:'Runs automation without paying per task'},
  {tool_id:'dispo',name:'Dispositions training site',built_by:'',operator:'Danny',description:'Wholesale fundamentals and call scripts for dispo'},
  {tool_id:'closeracademy',name:'Closer recruiting and academy sites',built_by:'',operator:'MC',description:'Hiring and ramping closers in Jalisco and the Philippines'},
  {tool_id:'agentdesk',name:'Agent Desk Academy and outreach playbook',built_by:'',operator:'MC',description:'Agent outreach with a three-minute reply standard'}
];

// Seed users. Emails come only from company records; blank email = needs configuration (inactive until set).
var SEED_USERS = [
  {name:'Juan Diaz', email:'juan@twinhomebuyer.com', team:'Leadership', role:'ADMIN', active:true},
  {name:'Seth', email:'seth@twinhomebuyer.com', team:'Technical', role:'ADMIN', active:true},
  {name:'Cherry', email:'cherry@twinhomebuyer.com', team:'Acquisitions PH', role:'MANAGER', active:true},
  {name:'David', email:'', team:'Acquisitions', role:'REP', active:false},
  {name:'Diego', email:'', team:'Acquisitions MX', role:'REP', active:false},
  {name:'Era', email:'', team:'Acquisitions PH', role:'REP', active:false},
  {name:'Barbie', email:'', team:'Acquisitions PH', role:'REP', active:false},
  {name:'Thea', email:'', team:'Acquisitions PH', role:'REP', active:false},
  {name:'Jonathan', email:'', team:'Technical', role:'TECHNICAL', active:false},
  {name:'Bryan', email:'', team:'Technical', role:'TECHNICAL', active:false},
  // The rest of the team, from the PC board. No emails invented — each stays inactive until an admin sets one,
  // and the role is a starting point the admin confirms at that moment.
  {name:'Genesis', email:'', team:'Acquisitions', role:'REP', active:false},
  {name:'Gian', email:'', team:'AI & Systems', role:'TECHNICAL', active:false},
  {name:'Lawrence', email:'', team:'AI & Systems', role:'TECHNICAL', active:false},
  {name:'Christine Joy', email:'', team:'AI & Systems', role:'TECHNICAL', active:false},
  {name:'Mc', email:'', team:'AI & Systems', role:'TECHNICAL', active:false},
  {name:'Jesery', email:'', team:'Operations', role:'TECHNICAL', active:false},
  {name:'Arjane', email:'', team:'Operations', role:'TECHNICAL', active:false},
  {name:'John', email:'', team:'Operations', role:'TECHNICAL', active:false},
  {name:'Kristine', email:'', team:'Operations', role:'TECHNICAL', active:false},
  {name:'Denzel', email:'', team:'Operations', role:'TECHNICAL', active:false},
  {name:'Darlyn', email:'', team:'Operations', role:'TECHNICAL', active:false},
  {name:'Leo', email:'', team:'Other', role:'TECHNICAL', active:false},
  {name:'Marieflor', email:'', team:'Other', role:'TECHNICAL', active:false}
];
