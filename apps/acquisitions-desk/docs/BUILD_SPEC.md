# THB ACQUISITIONS DESK

## COMPLETE PRODUCTION BUILD INSTRUCTION FOR CLAUDE CODE

You are responsible for taking the supplied working HTML prototype:

**acquisitions_desk (1)(1).html**

and converting it into a complete, reliable, multi-user production application for Twin Home Buyer.

This is NOT a request to create another prototype.

This is NOT a request to only create a plan.

This is NOT a request to redesign the application from scratch.

The supplied HTML is the product specification and starting frontend.

Your assignment is:

**INSPECT → ARCHITECT → BUILD → CONNECT → TEST → DEPLOY → VERIFY → REPORT COMPLETION**

Continue through the implementation. Do not stop after writing an architecture document.

---

# 1. FINAL SYSTEM WE ARE BUILDING

The final architecture is:

**THB Acquisitions Desk Web Dashboard**

↓

**Google Apps Script**

↓

**Master Google Spreadsheet Database**

Everyone uses the SAME application.

Everyone uses the SAME database.

Everyone uses the SAME production URL.

The team must be able to use it from:

* California
* Mexico
* Philippines
* office computers
* home computers
* laptops
* Chrome
* other modern browsers

Location does not determine access.

Authorization determines access.

---

# 2. NON-NEGOTIABLE SYSTEM RULE

There will be:

**ONE SHARED DASHBOARD**

**ONE APPS SCRIPT BACKEND**

**ONE MASTER GOOGLE SHEET DATABASE**

**ONE PRODUCTION URL**

Do NOT create:

* separate dashboard copies per employee
* separate Sheets per employee
* local HTML copies as the production system
* browser-only databases
* separate team databases
* individual versions of the app
* Claude Artifact storage as production storage

This is a company system.

---

# 3. GOOGLE SHEETS IS THE DATABASE

Version 1 will use Google Sheets as the primary application database.

The Google Sheet stores the data.

The dashboard is where employees actually work.

Employees should NOT need to open the raw database Sheet during normal operations.

Flow:

User opens dashboard

↓

Dashboard requests data

↓

Apps Script validates user

↓

Apps Script reads Google Sheet

↓

Dashboard displays records

Then:

User changes something

↓

Dashboard sends only that change

↓

Apps Script validates request

↓

Apps Script writes the specific affected record

↓

Apps Script writes activity/audit history

↓

Dashboard confirms the save

---

# 4. DO NOT USE GOOGLE SHEETS AS THE USER INTERFACE

The raw Sheet is the database.

The existing Acquisitions Desk HTML is the interface.

Employees must be able to perform their normal work from the dashboard:

* add leads
* edit leads
* assign leads
* change status
* log contact attempts
* write notes
* set next actions
* set due dates
* enter underwriting
* enter appointments
* flag for Juan
* trigger mailer/check compliance flag
* archive leads
* review overdue leads
* see team activity
* enter daily numbers
* review numbers
* manage tools when authorized
* mark tools as run

No normal daily workflow should require editing database cells manually.

---

# 5. PRESERVE THE EXISTING FRONTEND

Do NOT throw away the supplied HTML unnecessarily.

Preserve the existing visual system and workflow as much as practical.

Current major sections must remain:

1. The Plan
2. Today
3. Numbers
4. Lead Board
5. Tools We Own

Improve technical implementation without unnecessarily changing the user experience.

---

# 6. REMOVE WINDOW.STORAGE AS PRODUCTION STORAGE

The prototype currently relies on:

`window.storage.get()`

and:

`window.storage.set()`

This must no longer be the production database.

Replace those calls with Apps Script server calls.

Browser storage may only be used for things such as:

* last selected tab
* harmless UI preference
* temporary cache

It must NEVER be the authoritative copy of:

* leads
* notes
* activity
* daily metrics
* tool data
* assignments
* underwriting
* compliance information
* application settings

Google Sheets is authoritative.

---

# 7. APPS SCRIPT WEB APPLICATION

Create a proper Google Apps Script Web App.

Use:

`doGet()`

to serve the application.

Use Apps Script HTML Service for the frontend.

Use:

`google.script.run`

or the appropriate Apps Script client/server communication mechanism for frontend-to-backend requests.

Separate frontend rendering from database logic.

Do not put all backend logic inside one huge `Code.gs` file if avoidable.

Recommended structure:

`Code.gs`

`Auth.gs`

`Database.gs`

`LeadService.gs`

`ActivityService.gs`

`DashboardService.gs`

`MetricsService.gs`

`ToolService.gs`

`AdminService.gs`

`BackupService.gs`

`Utils.gs`

`Index.html`

`Styles.html`

`Scripts.html`

Use the structure that best fits Apps Script, but maintain clear separation of responsibilities.

---

# 8. ACCESS FROM ANYWHERE

Authorized employees must be able to open the same production URL from anywhere.

The application must NOT use anonymous public access.

Preferred production model:

**Google Workspace authenticated users**

If all approved employees have company Google Workspace accounts under the same Workspace domain:

Use a domain-restricted deployment.

Do not require employees to be physically connected to an office network.

They should only need:

1. Internet connection.
2. Approved Google Workspace account.
3. Production URL.

---

# 9. AUTHENTICATION

The current "On the desk" dropdown must NOT be the authoritative identity system.

Identity should come from the authenticated Google account.

Use a supported Apps Script identity method.

Preferred flow:

Signed-in Google account

↓

determine authenticated email

↓

look up email in USERS

↓

check `active`

↓

load role and permissions

↓

allow application access

If the authenticated email cannot be reliably determined, DO NOT silently fall back to letting the employee select their identity.

Return an access/configuration error instead.

Never allow someone to impersonate Juan, David, Diego, Thea, or another employee by selecting a dropdown.

---

# 10. AUTHENTICATION DEPLOYMENT TEST

Apps Script identity behavior can depend on deployment configuration.

During production testing, specifically confirm:

A normal non-developer authorized employee opens the production `/exec` URL.

↓

Backend identifies that employee correctly.

↓

Their email maps correctly against USERS.

↓

Their actions are logged under THEIR identity.

Do not assume this works.

Test it.

If the deployment identity configuration prevents reliable user identification, fix the deployment configuration before calling the project finished.

---

# 11. RAW DATABASE ACCESS

Normal reps should NOT need Editor access to the Master Google Sheet.

The production design should preferably allow Apps Script to perform database writes while the raw database remains restricted to appropriate administrators.

Use protected Sheets/ranges where useful.

Database administrators may access the raw Sheet.

Regular acquisitions users work from the application.

---

# 12. USERS DATABASE

Create Sheet:

## USERS

Columns:

`user_id`

`name`

`email`

`team`

`role`

`active`

`permission_level`

`created_at`

`updated_at`

Initial people will include members such as:

* Juan
* David
* Diego
* Era
* Barbie
* Thea

Do NOT invent email addresses.

Make the USERS table configurable.

If an employee's actual Google email has not been provided yet, create the database structure but mark that user as needing email configuration.

Do not weaken authentication to work around missing emails.

---

# 13. ROLES

Support at minimum:

### ADMIN

Can:

* see everything
* manage users
* manage settings
* manage tools
* assign/reassign leads
* review audit logs
* review all teams
* review numbers
* archive/restore records
* access administrative functions

### MANAGER

Can:

* view team-wide activity
* see all leads
* assign/reassign leads
* update leads
* review dashboards
* see rep performance
* see overdue work
* see appointments
* see Juan flags

### REP

Can:

* view permitted leads
* work leads
* update permitted lead fields
* add notes
* log attempts
* set next action
* change appropriate statuses
* enter appointment information
* enter underwriting information when authorized

Cannot:

* permanently delete records
* edit users
* edit application settings
* erase audit history

### TECHNICAL

Can manage technical/tool areas where permitted.

---

# 14. MASTER GOOGLE SPREADSHEET

Create one Master Google Spreadsheet.

Recommended name:

**THB Acquisitions Desk — Production Database**

Create the following Sheets.

---

# 15. USERS

Columns:

`user_id`

`name`

`email`

`team`

`role`

`active`

`permission_level`

`created_at`

`updated_at`

---

# 16. LEADS

One row = one lead/property.

Columns:

`lead_id`

`address`

`seller_name`

`phone`

`source`

`equity_note`

`status`

`assigned_to`

`team`

`flag_juan`

`compliance_mailer_check`

`contact_attempts`

`next_action`

`due_date`

`arv`

`repairs`

`asking_price`

`offer`

`appointment_date`

`appointment_outcome`

`archive_reason`

`created_by`

`created_at`

`updated_by`

`updated_at`

`last_touched_at`

`version`

Never use Sheet row number as `lead_id`.

Generate permanent IDs.

Example:

`LEAD-20260911-A82KD`

or another collision-safe ID format.

---

# 17. LEAD STATUSES

Preserve these statuses:

`NEW`

`INVESTIGATING`

`CONTACT_MADE`

`APPOINTMENT_SET`

`UNDER_CONTRACT`

`CLOSED`

`ARCHIVED_SOLD`

`ARCHIVED_NO_EQUITY`

`ARCHIVED_NOT_INTERESTED`

`ARCHIVED_BAD_DATA`

The displayed labels can remain human-friendly:

New

Investigating

Contact Made

Appointment Set

Under Contract

Closed

Archived: Sold

Archived: No Equity

Archived: Not Interested

Archived: Bad Data

Do not use display labels as the internal ID if stable constants are better.

---

# 18. COMPANY LEAD OWNERSHIP RULE

Leads belong to Twin Home Buyer.

Employees WORK leads.

Employees do not permanently own company leads.

`assigned_to` means:

**The person responsible for the current/next action.**

It does not mean the employee owns the lead.

Managers must be able to reassign work.

---

# 19. LEAD_ACTIVITY

Create:

## LEAD_ACTIVITY

This is an append-only activity history.

Columns:

`activity_id`

`lead_id`

`user_id`

`user_name`

`user_email`

`business_date`

`timestamp_utc`

`action_type`

`field_changed`

`old_value`

`new_value`

`note`

Never silently rewrite or destroy this history.

Examples of `action_type`:

`LEAD_CREATED`

`LEAD_IMPORTED`

`CALL_ATTEMPT`

`NOTE_ADDED`

`STATUS_CHANGED`

`ASSIGNED`

`NEXT_ACTION_CHANGED`

`DUE_DATE_CHANGED`

`APPOINTMENT_SET`

`APPOINTMENT_UPDATED`

`UNDERWRITING_CHANGED`

`OFFER_CHANGED`

`FLAGGED_FOR_JUAN`

`JUAN_FLAG_CLEARED`

`COMPLIANCE_FLAGGED`

`COMPLIANCE_CLEARED`

`ARCHIVED`

`RESTORED`

Every important action performed in the dashboard should automatically generate history.

---

# 20. APPOINTMENTS

Create:

## APPOINTMENTS

Columns:

`appointment_id`

`lead_id`

`appointment_date`

`appointment_time`

`timezone`

`assigned_to`

`status`

`outcome`

`notes`

`created_by`

`created_at`

`updated_by`

`updated_at`

This allows appointment history instead of permanently overwriting one appointment.

The LEADS table may still contain current appointment summary fields for fast dashboard display.

---

# 21. DAILY_METRICS

Create:

## DAILY_METRICS

Columns:

`business_date`

`tv_spend`

`ppc_spend`

`ppl_spend`

`other_spend`

`new_leads`

`inbound_calls`

`missed_calls`

`sellers_reached`

`appointments_set`

`contracts_signed`

`contracts_fell_out`

`deals_closed`

`minutes_to_first_call`

`created_by`

`created_at`

`updated_by`

`updated_at`

There should normally be one company Daily Metrics record for each business date.

Saving today again updates today's record instead of accidentally creating duplicates.

---

# 22. TOOL_INVENTORY

Create:

## TOOL_INVENTORY

Columns:

`tool_id`

`name`

`description`

`built_by`

`operator`

`backup_operator`

`status`

`steps`

`expected_output`

`cadence`

`link`

`recommendation`

`handoff_date`

`verdict`

`proof_last_week`

`created_at`

`updated_at`

Preserve the existing tool inventory workflow from the prototype.

---

# 23. TOOL_TRAINING

Create:

## TOOL_TRAINING

Columns:

`record_id`

`tool_id`

`user_id`

`trained`

`certified_date`

`certified_by`

`notes`

One employee/tool relationship per row.

Do not store the trained users as one uncontrolled comma-separated string.

---

# 24. TOOL_RUNS

Create:

## TOOL_RUNS

Columns:

`run_id`

`tool_id`

`business_date`

`run_by`

`run_at`

`status`

`result`

`proof`

Use this to power:

* tools required today
* completed tools today
* who ran the tool
* tool streaks
* proof/results

---

# 25. SETTINGS

Create:

## SETTINGS

Columns:

`setting_key`

`setting_value`

`updated_by`

`updated_at`

Include:

`monthly_deal_target`

`monthly_marketing_budget`

`mao_percentage`

`stale_lead_days`

`business_timezone`

`auto_refresh_seconds`

`app_version`

Recommended starting values:

`stale_lead_days = 7`

`auto_refresh_seconds = 30`

Keep MAO percentage configurable.

Do not permanently hard-code 70%.

---

# 26. AUDIT_LOG

Create:

## AUDIT_LOG

Columns:

`event_id`

`timestamp_utc`

`business_date`

`user_id`

`user_email`

`entity_type`

`entity_id`

`action`

`details`

Record important system/admin actions such as:

* login
* failed access
* lead creation
* bulk import
* archive
* restore
* settings change
* user change
* tool change
* deployment-sensitive administrative action

Do not store passwords or OAuth tokens in audit logs.

---

# 27. ERROR_LOG

Create:

## ERROR_LOG

Columns:

`error_id`

`timestamp_utc`

`user_id`

`function`

`entity_type`

`entity_id`

`error`

`details`

Important server failures should be written here where practical.

Do not expose secrets.

Do not dump unnecessary seller-sensitive information into errors.

---

# 28. BACKUP_LOG

Create:

## BACKUP_LOG

Columns:

`backup_id`

`timestamp`

`backup_file_id`

`backup_name`

`status`

`error`

---

# 29. BUSINESS TIMEZONE

This team works across several countries.

Do NOT let every user's browser determine what "today" means for company reporting.

Create one configurable setting:

`business_timezone`

Default:

`America/Los_Angeles`

Use this for:

* Today tab
* daily metrics
* overdue calculation
* team reporting date
* tool runs
* dashboard day boundaries

Store precise timestamps in UTC.

Example:

`timestamp_utc = 2026-09-11T18:23:15Z`

Then also calculate the correct company:

`business_date`

This prevents California, Mexico, and Philippines users from accidentally writing company activity into different dates.

---

# 30. TODAY TAB

Preserve:

* today's log
* marketing spend
* leads
* inbound calls
* missed calls
* contacts
* appointments
* contracts
* fallout
* deals closed
* speed to first call
* tools that must run today
* work queue
* Waiting on Juan
* team activity

All data must come from the production database.

---

# 31. WORK QUEUE

Every active lead should have a clear next step.

The queue must prioritize:

1. Overdue
2. Due today
3. Upcoming

For active leads, clearly flag:

**NO NEXT ACTION**

and:

**NO DUE DATE**

A lead should not quietly disappear because no follow-up was scheduled.

---

# 32. MARK DONE

When someone marks a next action as complete:

1. Record the completed action in LEAD_ACTIVITY.
2. Clear/update current next action as appropriate.
3. Require/set another next action when the lead remains active where applicable.
4. Update `last_touched_at`.
5. Refresh relevant dashboard counts.

---

# 33. WAITING ON JUAN

The Today dashboard must provide an immediately visible:

**WAITING ON JUAN**

section.

Include active leads where:

`flag_juan = TRUE`

or:

`compliance_mailer_check = TRUE`

Display:

* property
* current status
* current assigned rep
* reason
* most recent relevant note
* time flagged

---

# 34. MAILER / CHECK COMPLIANCE RULE

Preserve the existing:

**Mailer or check mentioned**

workflow.

When selected:

1. Set `compliance_mailer_check = TRUE`.
2. Set `flag_juan = TRUE`.
3. Add LEAD_ACTIVITY.
4. Show it in Waiting on Juan.
5. Make the compliance status visually obvious.
6. Preserve the lead and history.

Do NOT automatically delete it.

Do NOT silently archive it.

---

# 35. LEAD BOARD

Preserve the existing filters:

* Live List
* Due or Overdue
* Needs Juan
* Untouched 7+ Days
* Appointments Set
* Archived
* Everything

Preserve sorting:

* Next Action
* Last Touched
* Offer Room

Search should support at least:

* address
* seller name
* phone
* assignee

---

# 36. DO NOT LOAD ALL 8,000 LEADS ON EVERY SCREEN REFRESH

The system may eventually contain thousands of leads.

The normal Live Board target is only the actual workable list.

Do not repeatedly send the full historic database to every browser.

Default:

Load active/live records necessary for the board.

For archived/everything/search:

Use server-side filtering and pagination where practical.

Recommended:

100–200 records per request.

Provide:

`page`

or:

`cursor`

and:

`has_more`

as needed.

---

# 37. BULK LEAD IMPORT

Preserve Add Leads.

Allow bulk data to be pasted/imported.

Backend must:

1. Validate rows.
2. Normalize obvious whitespace.
3. Create unique IDs.
4. Check duplicates.
5. Insert valid records.
6. Record import activity.
7. Return a summary.

Return:

`Added: X`

`Duplicates skipped: X`

`Failed: X`

For failures provide enough information to correct the row.

Do not silently discard records.

---

# 38. DUPLICATE CHECKING

Check likely duplicates using appropriate combinations of:

* normalized property address
* phone
* existing lead ID where provided

Do not automatically merge two legitimate separate sellers solely because one field looks similar.

Flag uncertain duplicates for review.

---

# 39. UNDERWRITING

Preserve:

* ARV
* Repairs
* Seller Asking
* Our Offer
* MAO
* Offer Room

Formula:

**MAO = ARV × MAO Percentage − Repairs**

Then:

**Offer Room = MAO − Seller Asking**

The MAO percentage comes from SETTINGS.

---

# 40. NUMBERS DASHBOARD

Preserve and calculate:

* monthly pace
* target
* marketing spend
* last 30 days
* funnel
* new leads
* inbound calls
* sellers reached
* appointments
* contracts
* closes
* cost per lead
* cost per appointment
* cost per contract
* cost per closed deal
* contract-to-close rate
* contract fallout percentage
* average speed to first call
* missed call rate
* channel spend
* channel lead production
* channel appointments
* channel contracts
* channel closings

Do not hard-code dashboard totals.

Calculate them from the production data.

---

# 41. ACTIVITY SHOULD BE AUTOMATIC

Do not require reps to manually write separate activity reports when the application already knows what they did.

Example:

David logs an attempt.

System automatically knows David logged an attempt.

Diego posts a note.

System automatically knows Diego posted a note.

Thea changes an appointment.

System automatically records the change.

The application should be capable of calculating per rep:

* leads touched today
* attempts today
* notes today
* status changes
* appointments
* contracts
* closes
* last activity time
* active assigned leads
* overdue assigned leads

---

# 42. JUAN MANAGEMENT VIEW

Juan should be able to open the application and immediately answer:

* Who worked today?
* Who is working what?
* How many leads did each person touch?
* How many contact attempts were logged?
* What changed today?
* What is overdue?
* Which leads have no next action?
* Which leads need Juan?
* Which appointments are coming up?
* How many appointments were set?
* How many contracts were signed?
* How many deals closed?
* How is the month pacing?
* What marketing channels are producing results?

Juan should NOT need another employee to manually compile this every day.

---

# 43. SIMULTANEOUS USERS

Multiple people will be using this at the same time.

The architecture must prevent accidental overwrites.

Never use:

Load entire database

↓

modify one record

↓

rewrite entire database

That is forbidden.

---

# 44. TARGETED WRITES

When a user changes Lead A:

Update Lead A.

Do not rewrite every lead.

When a user posts a note:

Append the note/activity.

Do not rewrite every note in the system.

When one daily metric changes:

Update that daily record.

---

# 45. LOCKSERVICE

Use Apps Script LockService around critical database write sections where appropriate.

Typical process:

1. Acquire lock.
2. Load current record.
3. Validate version.
4. Validate permissions.
5. Apply requested change.
6. Write specific record.
7. Append activity/audit.
8. Flush if necessary.
9. Release lock.

Use a reasonable timeout.

Always release locks safely using `finally`.

---

# 46. OPTIMISTIC CONCURRENCY / RECORD VERSIONING

LEADS contains:

`version`

When browser loads a lead:

version might equal:

`12`

When it attempts to update:

send:

`expectedVersion = 12`

Backend checks current version.

If current version is still 12:

update record.

Set:

`version = 13`

If current version has already become 13:

DO NOT silently overwrite it.

Return a conflict response.

Example:

`CONFLICT_RECORD_CHANGED`

Return latest server copy.

Allow UI to tell user:

**This lead was updated by another team member. Review the latest information before saving your change.**

---

# 47. STANDARD SERVER RESPONSE

Backend functions should return predictable objects.

Success example:

`{ ok: true, data: ..., message: "Saved" }`

Failure example:

`{ ok: false, code: "VALIDATION_ERROR", message: "Due date is required." }`

Conflict:

`{ ok: false, code: "CONFLICT_RECORD_CHANGED", data: latestRecord }`

Access failure:

`{ ok: false, code: "ACCESS_DENIED" }`

Do not let random backend exceptions become blank UI failures.

---

# 48. SAVE STATES

Frontend should visibly support:

Saving...

Saved

Could not save

Record changed by another user

Access denied

Do not tell the user an operation succeeded until the server confirms success.

---

# 49. AUTO REFRESH

The application is shared.

Implement reasonable automatic refreshing.

Starting recommendation:

**30 seconds**

Make configurable through SETTINGS.

Also provide a manual Refresh button.

Do not automatically replace fields while a user is actively typing.

Avoid destructive refresh behavior.

---

# 50. FRONTEND STATE

When refreshing server data:

preserve reasonable UI state such as:

* active tab
* search
* filter
* scroll area where practical
* open lead details where practical

Do not make the app painful to use just to achieve refresh.

---

# 51. SERVER FUNCTION MAP

Implement clean functions similar to:

### AUTH

`getCurrentUser()`

`requireUser()`

`requireRole()`

### BOOTSTRAP

`bootstrapApp()`

Should return things needed to initially load:

* authenticated user
* permissions
* settings
* high-level dashboard
* config

### LEADS

`listLeads(filters)`

`getLead(leadId)`

`createLead(data)`

`updateLead(leadId, patch, expectedVersion)`

`assignLead(...)`

`archiveLead(...)`

`restoreLead(...)`

`addBulkLeads(...)`

`logAttempt(...)`

`addLeadNote(...)`

`setNextAction(...)`

`setJuanFlag(...)`

`setComplianceFlag(...)`

### APPOINTMENTS

`createAppointment(...)`

`updateAppointment(...)`

`listAppointments(...)`

### DASHBOARD

`getTodayDashboard()`

`getJuanDashboard()`

`getRepSnapshot()`

`getWorkQueue()`

### METRICS

`getDailyMetrics(date)`

`saveDailyMetrics(date, data)`

`getNumbersDashboard(range)`

### TOOLS

`getTools()`

`createTool(...)`

`updateTool(...)`

`setToolTraining(...)`

`logToolRun(...)`

`getRunsToday()`

### SETTINGS

`getSettings()`

`saveSetting(...)`

### ADMIN

`getUsers()`

`createUser(...)`

`updateUser(...)`

`disableUser(...)`

### BACKUP

`createDatabaseBackup()`

Do not expose unrestricted generic database-write functions to the client.

---

# 52. SERVER-SIDE VALIDATION

Never trust browser values solely because the UI created them.

Backend should validate:

* IDs
* role permissions
* status values
* required fields
* dates
* numbers
* booleans
* allowed transitions where applicable
* string lengths
* record existence
* version

Reject malformed or unauthorized updates.

---

# 53. OUTPUT ENCODING / XSS PROTECTION

Notes and seller data may contain arbitrary text.

Do not inject unescaped user-entered content directly into HTML.

Keep or improve the existing output escaping.

Avoid creating an XSS vulnerability through:

* seller name
* address
* note
* equity text
* tool description
* URLs

Validate external URLs used in Tools.

---

# 54. NO HARD DELETE

Normal application behavior:

**ARCHIVE, DO NOT DELETE**

Archived records remain in the database.

Their activity history remains.

Restore capability should exist for authorized roles.

Do not expose permanent deletion to ordinary users.

---

# 55. DATABASE UTILITIES

Build reusable utilities for:

* finding row by permanent ID
* reading headers
* mapping row → object
* mapping object → allowed columns
* generating IDs
* normalized dates
* normalized booleans
* business date
* timestamps
* user lookup
* field validation
* sheet access
* error responses
* locks

Avoid copying fragile row-index code into every service.

---

# 56. PERFORMANCE RULES

Apps Script and Sheets have quotas.

Use efficient operations.

Prefer:

`getValues()`

and batch reads/writes.

Avoid repeatedly calling:

`getValue()`

inside large loops.

Avoid searching 8,000 rows several times inside the same request.

Where useful:

* build an ID → row map for the request
* use CacheService for non-authoritative caches
* batch writes
* batch imports

Cache must NEVER become the source of truth.

---

# 57. DAILY BACKUP

Create an installable time-driven Apps Script trigger.

At least once daily:

Create a timestamped copy of the Master Database Spreadsheet.

Preferred folder:

**THB Acquisitions Desk Backups**

Backup name example:

`THB Acquisitions Desk Backup - 2026-09-11`

Record successful/failed backups in BACKUP_LOG.

Do not depend on a single working Spreadsheet with no recovery process.

---

# 58. APP VERSIONING

Store:

`app_version`

in SETTINGS.

Show it discreetly in the app footer/admin area.

Example:

`v1.0.0`

When production changes are deployed:

update version.

Do not confuse development `/dev` deployment with production `/exec`.

---

# 59. DEPLOYMENT OWNERSHIP

Production Apps Script and the Master Google Sheet should be controlled by the company.

Prefer a company-controlled Google Workspace environment.

Avoid making the production application dependent on a personal Google account that could disappear when an employee leaves.

Where company Shared Drive/project governance is available, structure ownership appropriately.

---

# 60. DEVELOPMENT VS PRODUCTION

Maintain a distinction between development and production.

Recommended:

Development database

Production database

or a safe testing mode.

Never test destructive functionality against production seller records when avoidable.

---

# 61. REQUIRED TEST DATA

Create safe test records such as:

`TEST - 100 Main Street`

Do not pretend production data was tested if only static code inspection was done.

---

# 62. REQUIRED MULTI-USER TEST

This test is mandatory.

### TEST A

User A opens Lead 1.

User B opens Lead 2.

Both edit simultaneously.

Expected:

Both changes survive.

### TEST B

User A opens Lead 1 version 10.

User B opens Lead 1 version 10.

User B saves.

Server becomes version 11.

User A tries to save old version 10.

Expected:

Conflict detected.

User B's changes are NOT silently erased.

---

# 63. REQUIRED ACCESS TEST

Authorized user:

Can open app.

Unauthorized account:

Cannot view company data.

Inactive USERS record:

Cannot view company data.

No valid identity:

Cannot view company data.

---

# 64. REQUIRED ACTIVITY TEST

David changes lead status.

Confirm:

LEADS updated.

LEAD_ACTIVITY added.

Audit data identifies David.

Juan dashboard reflects change.

Repeat for:

* note
* attempt
* assignment
* next action
* appointment
* Juan flag
* compliance flag
* archive

---

# 65. REQUIRED REFRESH TEST

User A makes update.

User B is already viewing dashboard.

Within expected refresh period or manual Refresh:

User B sees new information.

No browser restart should be required.

---

# 66. REQUIRED PERSISTENCE TEST

Create test lead.

Close browser.

Reopen production URL.

The lead still exists.

Change status.

Refresh.

Status remains.

Post note.

Refresh.

Note remains.

---

# 67. REQUIRED ARCHIVE TEST

Archive a test lead.

Expected:

Removed from Live List.

Appears in Archived.

History remains.

Restore it.

Expected:

Returns correctly.

---

# 68. REQUIRED WORK QUEUE TEST

Create:

* overdue lead
* due-today lead
* future lead
* lead with no next action

Verify correct priority and warning behavior.

---

# 69. REQUIRED COMPLIANCE TEST

Set:

Mailer or check mentioned.

Verify:

* compliance flag stored
* Juan flag stored
* activity created
* lead appears in Waiting on Juan
* visual warning appears
* lead was NOT deleted

---

# 70. REQUIRED NUMBERS TEST

Enter known test numbers.

Verify calculations for:

* spend
* cost per lead
* cost per appointment
* cost per contract
* cost per close
* missed-call rate
* funnel conversion
* monthly pace

Do not assume calculations work because the functions exist.

---

# 71. REQUIRED TOOL TEST

Create/edit a Tool.

Assign operator.

Set cadence.

Mark user trained.

Mark tool run today.

Verify:

* tool inventory saved
* training saved
* run saved
* Today shows correct completion
* streak logic uses the configured business date

---

# 72. RESPONSIVE TEST

Test at minimum:

desktop width

laptop width

mobile/narrow width

Existing dashboard design should remain usable.

---

# 73. MIGRATION MAP

Before rewriting storage logic, map prototype objects to database tables.

Current prototype examples:

`days`

→ DAILY_METRICS

`leads`

→ LEADS

`lead.notes`

→ LEAD_ACTIVITY

`settings`

→ SETTINGS

`tools`

→ TOOL_INVENTORY

`runs`

→ TOOL_RUNS

`pillars`

→ appropriate Settings/Tool/Project configuration

`me`

→ remove as authoritative identity and replace with authenticated user

Do not lose existing functionality during migration.

---

# 74. EXISTING HTML REVIEW REQUIRED

Before modifying the supplied HTML:

Search the entire file for:

`window.storage`

Identify every read/write operation.

Identify every existing UI control that modifies state.

Identify every render function that depends on current state.

Build a migration checklist.

Then replace storage intentionally.

Do not randomly remove code until you understand what it currently does.

---

# 75. EXISTING FEATURES MUST HAVE A DISPOSITION

For every feature found in the supplied HTML, classify it:

`PRESERVE`

`MIGRATE`

`IMPROVE`

or:

`REMOVE WITH EXPLICIT REASON`

Do not silently drop a feature.

---

# 76. THINGS NOT REQUIRED FOR CORE V1

Do NOT delay the core production system because future integrations are not ready.

Architect so future integrations can be added for:

* REI BlackBook
* Retell
* phone/call data
* Monday.com
* marketing platforms
* automations

But first make the Acquisitions Desk itself reliable.

Do not create unnecessary integrations just because they are possible.

---

# 77. FUTURE INTEGRATION RULE

When integrations are added later:

they should write through controlled service functions or integration ingestion functions.

They should not randomly write raw Sheet cells.

Integration activity should identify its source.

Example:

`updated_by = SYSTEM_RETELL`

or:

`SYSTEM_REIBLACKBOOK`

---

# 78. BUILD SEQUENCE

Follow this order.

## PHASE 0 — INSPECT

Inspect the supplied HTML.

Create migration map.

Identify current storage/state behavior.

Do not modify blindly.

---

## PHASE 1 — CREATE DATABASE

Create Master Spreadsheet.

Create Sheets.

Create exact headers.

Seed settings.

Create safe setup utilities.

---

## PHASE 2 — CREATE APPS SCRIPT BACKEND

Create:

* authentication
* authorization
* database utilities
* lead service
* activity service
* metrics service
* tool service
* dashboard service
* backup service
* admin service

---

## PHASE 3 — MIGRATE FRONTEND

Take existing dashboard.

Replace storage functions.

Connect controls to backend.

Preserve design.

---

## PHASE 4 — AUTHENTICATION

Connect authenticated Google account.

USERS validation.

Permissions.

Remove fake identity behavior.

---

## PHASE 5 — LEAD ACTIVITY ENGINE

Every meaningful action writes history.

Build team activity calculations.

---

## PHASE 6 — JUAN DASHBOARD

Create management snapshot using real activity data.

---

## PHASE 7 — LIVE REFRESH

Add automatic and manual refresh safely.

---

## PHASE 8 — BACKUPS AND LOGGING

Create backup trigger.

Error log.

Audit log.

---

## PHASE 9 — TESTING

Run every required test.

Fix failures.

Re-run tests.

---

## PHASE 10 — PRODUCTION DEPLOYMENT

Create/update production Web App deployment.

Use `/exec` production URL.

Use authorized access only.

---

# 79. DO NOT STOP AT THE PLAN

Important:

Do NOT respond after Phase 0 with:

"Here is the architecture."

That is not completion.

Continue into implementation.

Do NOT stop after:

* creating Sheet headers
* creating Apps Script
* making the HTML load
* creating deployment
* passing one test

Continue until the definition of done is satisfied or there is a true human-only blocker.

---

# 80. HUMAN-ONLY BLOCKERS

If there is something only a human can supply or approve, such as:

* actual employee Google email
* Google authorization screen
* company Workspace administrator permission
* deployment authorization
* Drive folder selection
* ownership permission

Do NOT invent it.

Do everything else that can be completed.

Then report the exact blocker.

Bad report:

"Need access."

Good report:

"Production code and database are complete. Final access test is blocked because the USERS table does not yet contain David's actual Google Workspace email. Add his company email in USERS!C2, then rerun `testAuthorizedUser()`."

Be specific.

---

# 81. DO NOT SAY DONE WHEN SOMETHING IS NOT DONE

Only use:

**PRODUCTION BUILD COMPLETE**

when required production criteria pass.

Otherwise use:

**BUILD COMPLETE EXCEPT FOR HUMAN ACTION**

or:

**BUILD NOT COMPLETE**

and state exactly why.

---

# 82. DEFINITION OF DONE

The system is complete only when:

* one production dashboard exists
* one Master Google Sheet database exists
* one Apps Script backend exists
* one production URL exists
* authorized employees can access from different locations
* unauthorized people cannot see seller/company data
* authenticated identity is reliable
* users can add leads from dashboard
* users can edit leads from dashboard
* users can assign leads
* users can log attempts
* users can post notes
* users can set next actions
* users can set due dates
* users can update statuses
* users can enter underwriting
* users can manage appointments
* users can flag Juan
* compliance flag works
* archived leads remain stored
* Lead Activity records changes
* Juan can see team activity
* Today uses the database
* Numbers uses the database
* Tools use the database
* Tool Runs use the database
* multiple users do not overwrite each other
* browser restart does not lose data
* automatic refresh works
* error handling works
* backup exists
* no production dependency remains on `window.storage`

---

# 83. FINAL COMPLETION REPORT

WHEN YOU ARE FINISHED BUILDING AND TESTING, COME BACK TO ME WITH THIS EXACT STRUCTURE.

# THB ACQUISITIONS DESK — COMPLETION REPORT

## Overall Status

`PRODUCTION BUILD COMPLETE`

or:

`BUILD COMPLETE EXCEPT FOR HUMAN ACTION`

or:

`BUILD NOT COMPLETE`

## Production Web App

Production URL:

Apps Script Project:

Deployment version:

Application version:

Deployment owner/account:

Access policy:

Execution identity:

## Master Database

Spreadsheet name:

Spreadsheet ID:

Spreadsheet location:

Database Sheets created:

## Authentication

Authentication method:

Authorized-user test:

Unauthorized-user test:

Identity test:

## Users

Configured users:

Users still needing actual email:

## Features

Today: PASS/FAIL

Numbers: PASS/FAIL

Lead Board: PASS/FAIL

Add Lead: PASS/FAIL

Bulk Import: PASS/FAIL

Lead Edit: PASS/FAIL

Assignment: PASS/FAIL

Attempts: PASS/FAIL

Notes: PASS/FAIL

Next Action: PASS/FAIL

Due Dates: PASS/FAIL

Underwriting: PASS/FAIL

Appointments: PASS/FAIL

Juan Flag: PASS/FAIL

Compliance Flag: PASS/FAIL

Archive: PASS/FAIL

Restore: PASS/FAIL

Tools: PASS/FAIL

Tool Runs: PASS/FAIL

Juan Dashboard: PASS/FAIL

## Database Protection

Targeted row writes: PASS/FAIL

LockService protection: PASS/FAIL

Record version conflicts: PASS/FAIL

No hard delete: PASS/FAIL

## Multi-User Testing

Different-lead simultaneous editing: PASS/FAIL

Same-lead conflict test: PASS/FAIL

Cross-user visibility: PASS/FAIL

## Persistence

Refresh persistence: PASS/FAIL

Browser restart persistence: PASS/FAIL

## Security

Raw Sheet restricted: PASS/FAIL

Server-side authorization: PASS/FAIL

Server-side validation: PASS/FAIL

Output escaping: PASS/FAIL

## Backup

Daily backup trigger: PASS/FAIL

Backup folder:

Last successful test backup:

## Errors / Logging

Audit Log: PASS/FAIL

Lead Activity Log: PASS/FAIL

Error Log: PASS/FAIL

## Remaining Issues

List each remaining issue.

If none:

`None.`

## Human Actions Still Required

Only list actions that actually require a human.

If none:

`None.`

## Files Created or Changed

List every file created/modified and its purpose.

## Migration

Confirm that production data no longer depends on:

`window.storage`

Result:

PASS/FAIL

## Final Verification

State clearly:

**The THB Acquisitions Desk is now one shared production system. Authorized users can open the same URL from anywhere, add/edit company data through the dashboard, and all users work from the same Google Sheet source of truth.**

Only state this if it is actually true.

---

# 84. FINAL RULE

Do not optimize for showing me code.

Optimize for leaving me with a WORKING SYSTEM.

Do the work.

Test the work.

Fix failures.

Then return the completion report.
