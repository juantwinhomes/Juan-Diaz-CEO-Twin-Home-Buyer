/**
 * THB Build Request — Google Form generator
 * ------------------------------------------
 * Creates the full "THB Build Request — Apps, Automations & AI" intake form
 * per knowledge/automation-request-pipeline.md, plus a linked response
 * spreadsheet with the triage tabs.
 *
 * HOW TO RUN (one time, ~2 minutes):
 *   1. Go to https://script.google.com → New project.
 *   2. Delete the default code, paste this whole file, save.
 *   3. Run → createTHBBuildRequestForm → authorize when prompted.
 *   4. Open View → Logs (Ctrl+Enter) — it prints the form edit URL,
 *      the live (respondent) URL, and the spreadsheet URL.
 *
 * ONE MANUAL STEP AFTER RUNNING (Google API limitation — scripts cannot
 * create file-upload questions):
 *   In the form editor, find the placeholder item in the Evidence section
 *   and replace it with a real "File upload" question titled:
 *   "Upload your SOP, Loom, or Claude/Grok conversation" (allow up to 5
 *   files). File uploads require respondents to sign in — fine for the team.
 */

function createTHBBuildRequestForm() {
  var form = FormApp.create('THB Build Request — Apps, Automations & AI');
  form.setDescription(
    'One request per form. If you have three ideas, submit three forms.\n' +
    'Revenue-generating requests get built first — if your idea makes or ' +
    'recovers money, prove it in the Money section.'
  );
  form.setCollectEmail(true);
  form.setProgressBar(true);

  // ---------- Section 1: Who you are (first page) ----------
  form.addTextItem().setTitle('Your name').setRequired(true);

  form.addListItem()
    .setTitle('Your department')
    .setChoiceValues([
      'Acquisitions',
      'Dispositions',
      'Marketing / SEO',
      'Transaction Coordination / Admin',
      'HR / Recruiting',
      'Finance',
      'Leadership'
    ])
    .setRequired(true);

  form.addTextItem()
    .setTitle('Who will actually use this day to day?')
    .setHelpText('Names + roles. "Me" is fine.')
    .setRequired(true);

  // ---------- Section 2: The request ----------
  form.addPageBreakItem().setTitle('The request');

  form.addTextItem().setTitle('Name your idea').setRequired(true);

  form.addParagraphTextItem()
    .setTitle("What's slow or broken today?")
    .setHelpText('Describe the workflow as it works right now, step by step. ' +
                 'What takes too long, gets dropped, or requires copy-paste?')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('What should it do instead?')
    .setHelpText('Describe the workflow WITH the tool. What happens ' +
                 'automatically? What do you still do by hand?')
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("What happens if we don't build this?")
    .setHelpText("Be honest. 'Nothing, it would just be nice' is an " +
                 'acceptable answer and saves everyone time.')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('How often does this workflow happen?')
    .setChoiceValues([
      'Many times a day',
      'Daily',
      'Weekly',
      'Monthly',
      'Rarely / one-time'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('Systems this touches')
    .setChoiceValues([
      'REI Blackbook',
      'GoHighLevel (GHL)',
      'CallRail',
      'Monday.com',
      'QuickBooks',
      'Instantly / cold email',
      'Google Sheets / Drive / Gmail',
      'Podio / Make.com'
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Is this a brand-new tool, or an add-on to something we already built?')
    .setChoiceValues([
      'New tool',
      'Add-on / feature of an existing project (name it below)',
      'Not sure'
    ])
    .setRequired(true);

  form.addListItem()
    .setTitle('If add-on: which existing project?')
    .setChoiceValues([
      'High Equity Lead Revival Automation',
      'Juan Automated Email Access',
      'Property Visit Automated Update',
      'Directmail Home Scout',
      'Property Leads Dispute Automation',
      'SEO Content System',
      'Directmail KPI Tracker',
      'Lead Review Assistant',
      'REI Blackbook Full Access agent',
      'THB SEO Analyzer',
      'Cold Email Manager',
      'Pipeline Status Cleanup',
      'Other / not sure'
    ]);

  // ---------- Branching: Money details vs. straight to Evidence ----------
  var moneySection = form.addPageBreakItem()
    .setTitle('Money — prove it')
    .setHelpText('You said this makes or recovers money. Revenue-generating ' +
                 'requests get built first, so be specific here.');

  var evidenceSection = form.addPageBreakItem()
    .setTitle('Evidence & urgency');

  // The gate question lives at the end of Section 2; choices route the
  // respondent either through the Money section or straight to Evidence.
  var gate = form.addMultipleChoiceItem()
    .setTitle('Does this make or recover money for THB?')
    .setRequired(true);
  gate.setChoices([
    gate.createChoice('Yes — it generates leads / deals / revenue', moneySection),
    gate.createChoice("Yes — it recovers money we're losing (refunds, wasted spend, dropped leads)", moneySection),
    gate.createChoice('No — it saves time / reduces errors', evidenceSection),
    gate.createChoice('Not sure', evidenceSection)
  ]);
  // Move the gate question above the Money section page break.
  form.moveItem(gate.getIndex(), moneySection.getIndex());

  // ---------- Section 3: Money details (only shown when gate = Yes) ----------
  var howExactly = form.addParagraphTextItem()
    .setTitle('Exactly how does this make or recover money?')
    .setHelpText('Be specific and use numbers if you have them. Good: ' +
                 '"We get ~30 interested sellers per quarter and convert 0 ' +
                 'because follow-up leaks — this fixes follow-up." ' +
                 'Bad: "It will help us grow."')
    .setRequired(true);

  var howMuch = form.addMultipleChoiceItem()
    .setTitle('How much per month, roughly?')
    .setChoiceValues([
      'Under $1K/mo',
      '$1K–$5K/mo',
      '$5K–$25K/mo',
      '$25K+/mo (a deal or more)',
      "Can't estimate"
    ])
    .setRequired(true);

  // Ensure the money questions sit inside the Money section (between the two
  // page breaks), then the flow continues naturally into Evidence.
  form.moveItem(howExactly.getIndex(), moneySection.getIndex() + 1);
  form.moveItem(howMuch.getIndex(), moneySection.getIndex() + 2);

  // ---------- Section 4: Evidence & urgency ----------
  form.addSectionHeaderItem()
    .setTitle('[REPLACE ME — add a File Upload question here]')
    .setHelpText('Manual step: delete this item and add a "File upload" ' +
                 'question titled "Upload your SOP, Loom, or Claude/Grok ' +
                 'conversation" (allow up to 5 files). Scripts are not ' +
                 'allowed to create file-upload questions.');

  form.addParagraphTextItem()
    .setTitle('Anything else we should know?');

  form.addMultipleChoiceItem()
    .setTitle('How urgent is this, honestly?')
    .setChoiceValues([
      'Blocking revenue right now',
      'Hurting us weekly',
      'Annoying but survivable',
      'Whenever you get to it'
    ])
    .setRequired(true);

  form.setConfirmationMessage(
    'Logged. Your request will be triaged within 3 business days. ' +
    'Track its status on the shared Build Requests sheet.'
  );

  // ---------- Linked spreadsheet + triage scaffolding ----------
  var ss = SpreadsheetApp.create('THB Build Requests — Tracker');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var triage = ss.insertSheet('Triage Columns (append to responses)');
  triage.appendRow([
    'Triage: duplicate/feature of',
    'Triage: classification (Revenue Generating / Revenue Supporting / Automation)',
    'Triage: score',
    'Triage: verdict (Build / Merge / Park / Reject + reason)',
    'Build type (Claude Code / Agent / App / Zapier-Make)',
    'Owner',
    'Status (Received/Reviewed/Queued/Building/Testing/Live/Rejected)',
    'Status note / rejection reason',
    'Date live',
    'Revenue attributed (monthly)'
  ]);

  var live = ss.insertSheet('Live Projects');
  live.appendRow([
    'Project', 'Purpose', 'Link', 'Status', 'Notes', 'Delegated to',
    'Classification', 'Revenue attributed (monthly)'
  ]);

  Logger.log('Form editor URL:      ' + form.getEditUrl());
  Logger.log('Form respondent URL:  ' + form.getPublishedUrl());
  Logger.log('Tracker spreadsheet:  ' + ss.getUrl());
  Logger.log('REMINDER: add the File Upload question manually (see header comment).');
}
