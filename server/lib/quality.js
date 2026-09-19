/**
 * Measurable-progress rule engine.
 *
 * The dashboard must not reward activity. "Worked on Retell" is an activity;
 * "Completed Retell webhook integration and passed all transfer tests" is a
 * measurable result. Everything written into a commitment or a progress log is
 * scored here, and progress logs that fail the check do NOT count the project
 * as having progressed.
 */

/** Phrases that describe activity rather than an outcome. */
const VAGUE_PATTERNS = [
  /\bworked?\s+on\b/, /\bworking\s+on\b/, /\bresearch(ed|ing)?\b/, /\blook(ed|ing)?\s+into\b/,
  /\bcheck(ed|ing)?\s+(the\s+)?(system|status|logs?|things?)\b/, /\bcontinued?\s+(coding|work|working|building)\b/,
  /\bhad\s+(a\s+)?meeting\b/, /\bmeeting\s+with\b/, /\bmade\s+(some\s+)?progress\b/, /\bsome\s+progress\b/,
  /\bkept\s+going\b/, /\bstarted\s+looking\b/, /\bexplor(ed|ing)\b/, /\breview(ed|ing)?\s+(stuff|things|it)\b/,
  /\bspent\s+time\b/, /\bbusy\s+with\b/, /\bthought\s+about\b/, /\bplanning\b/, /\bmisc\b/, /\bvarious\b/,
  /\bstuff\b/, /\bthings\b/, /\bgeneral\b/, /\bongoing\b/, /\betc\.?$/
];

/** Verbs that describe a finished, verifiable outcome. */
const OUTCOME_PATTERNS = [
  /\bcomplet(e|ed|ing)\b/, /\bfinish(ed|ing)?\b/, /\bfix(ed|es)?\b/, /\bbuil[td]\b/, /\bdeploy(ed|ment)?\b/,
  /\bship(ped)?\b/, /\blaunch(ed)?\b/, /\bintegrat(e|ed|ion)\b/, /\bconnect(ed)?\b/, /\bimplement(ed)?\b/,
  /\bpass(ed|ing)?\b/, /\bresolv(e|ed)\b/, /\bdocument(ed)?\b/, /\bmigrat(e|ed)\b/, /\bconfigur(e|ed)\b/,
  /\bautomat(e|ed)\b/, /\breduc(e|ed)\b/, /\breplac(e|ed)\b/, /\bcreat(e|ed)\b/, /\bwrote\b/, /\bwritten\b/,
  /\brelease[d]?\b/, /\bpublish(ed)?\b/, /\bvalidat(e|ed)\b/, /\bset\s+up\b/, /\brolled?\s+out\b/,
  /\badd(ed)?\b/, /\benabl(e|ed)\b/, /\bverif(y|ied)\b/, /\bsign(ed)?\s+off\b/, /\bapprov(e|ed)\b/,
  /\btest(ed|ing)?\b/, /\bmerg(e|ed)\b/, /\bdeliver(ed)?\b/, /\bhand(ed)?\s+off\b/, /\bclos(e|ed)\b/,
  /\bconfirm(ed)?\b/, /\bfinali[sz]ed\b/, /\bagreed\b/, /\brewrote\b/, /\brewritten\b/,
  /\bupgrad(e|ed)\b/, /\bremov(e|ed)\b/, /\bcut\b/, /\brestor(e|ed)\b/, /\bswitch(ed)?\b/
];

/**
 * Completed work is often described as the new state rather than the action:
 * "transfer calls are now recorded", "leads no longer drop off", "cut from 8
 * steps to 3". These are results, so they count - but only alongside a named
 * artifact, which keeps "now looking into it" out.
 */
const STATE_CHANGE_PATTERNS = [
  /\bnow\s+\w+/, /\bno longer\b/, /\bfrom\s+[^.]{1,40}\s+to\s+/, /\bstay(s)?\s+\w+/,
  /\bare\s+(?:recorded|captured|tracked|scored|logged|excluded|included|attached|routed)\b/
];

/** Concrete nouns that suggest a real artifact was touched. */
const ARTIFACT_PATTERNS = [
  /\bapis?\b/, /\bwebhooks?\b/, /\bendpoints?\b/, /\bintegrations?\b/, /\bautomations?\b/,
  /\bscripts?\b/, /\bworkflows?\b/, /\bdashboards?\b/, /\bpages?\b/, /\bforms?\b/,
  /\breports?\b/, /\btests?\b/, /\btest\s*cases?\b/, /\bbugs?\b/, /\broutes?|routing\b/,
  /\blogins?\b/, /\bdatabases?\b/, /\btables?\b/, /\bsheets?\b/, /\bagents?\b/, /\bprompts?\b/,
  /\bschemas?\b/, /\bcrm\b/, /\bsyncs?\b/, /\bnotifications?\b/, /\bpipelines?\b/, /\btriggers?\b/,
  /\bfields?\b/, /\bscenarios?\b/, /\bmilestones?\b/, /\bfeatures?\b/, /\bmodules?\b/,
  /\bscreens?\b/, /\bexports?\b/, /\bimports?\b/, /\bdocs?\b/, /\btransfers?\b/,
  /\bcalls?\b|\bcalled\b/, /\bleads?\b/, /\bpayroll\b/, /\bui\b/, /\bqueues?\b/, /\bjobs?\b/,
  /\bsystems?\b/, /\btesting\b/, /\bdocumentation\b/, /\bdeployments?\b/, /\benvironments?\b/,
  /\bcredentials?\b/, /\bapps?\b/,
  // Domain nouns this team actually writes about
  /\bcampaigns?\b/, /\bsellers?\b/, /\breps?\b/, /\bcallers?\b/, /\bnumbers?\b/,
  /\bscores?\b/, /\boutcomes?\b/, /\bappointments?\b/, /\brecordings?\b/, /\bcontacts?\b/
];

/** Numeric evidence: "3 of 4", "18/20", "40%", "8 steps to 3". */
const QUANTITY_PATTERN = /\d+\s*(of|\/|out of)\s*\d+|\b\d+\s*%|\b\d+\s+(steps?|tests?|cases?|scenarios?|bugs?|fields?|records?|rows?|minutes?|hours?|endpoints?|users?|leads?|runs?|pages?)\b|\bfrom\s+\d+\s+\w+\s+to\s+\d+/i;

const FILLER = /\b(the|a|an|and|to|for|on|of|in|with|it|its|this|that|some|more|our|my|today|project|work)\b/g;

export function scoreText(rawText, { kind = 'progress' } = {}) {
  const text = String(rawText || '').trim();
  const lower = text.toLowerCase();
  const reasons = [];
  const hints = [];

  if (!text) {
    return { score: 0, level: 'weak', measurable: false, reasons: ['Nothing was written.'], hints: hintsFor(kind) };
  }

  const words = lower.split(/\s+/).filter(Boolean);
  const vagueHits = VAGUE_PATTERNS.filter((re) => re.test(lower));
  const hasOutcome = OUTCOME_PATTERNS.some((re) => re.test(lower));
  const hasStateChange = STATE_CHANGE_PATTERNS.some((re) => re.test(lower));
  const hasArtifact = ARTIFACT_PATTERNS.some((re) => re.test(lower));
  const hasQuantity = QUANTITY_PATTERN.test(lower);

  // How much text is left once the vague phrasing and filler words are removed?
  let residue = lower;
  for (const re of vagueHits) residue = residue.replace(new RegExp(re.source, 'g'), ' ');
  residue = residue.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const vagueOnly = vagueHits.length > 0 && residue.length < 12 && !hasQuantity;

  let score = 0;
  const statesResult = hasOutcome || (hasStateChange && hasArtifact);
  if (hasOutcome) score += 35;
  else if (statesResult) score += 28;
  else reasons.push('No completed outcome — say what was finished, not what was touched.');
  if (hasQuantity) score += 25;
  if (hasArtifact) score += 20; else reasons.push('No specific system, feature or file named.');
  if (words.length >= 5) score += 12;
  else if (words.length >= 2) score += 6;
  else reasons.push('Too short to describe a result.');
  if (text.length >= 45) score += 8;
  if (vagueHits.length) {
    score -= vagueOnly ? 60 : 18;
    reasons.push(`Reads as activity, not a result ("${matchedPhrase(text, vagueHits)}").`);
  }
  score = Math.max(0, Math.min(100, score));

  const measurable = !vagueOnly && statesResult && score >= 50;
  const level = measurable ? (score >= 75 ? 'strong' : 'ok') : 'weak';
  if (!measurable) hints.push(...hintsFor(kind));

  return { score, level, measurable, reasons: measurable ? [] : reasons, hints };
}

function matchedPhrase(text, patterns) {
  for (const re of patterns) {
    const m = text.match(new RegExp(re.source, 'i'));
    if (m) return m[0];
  }
  return '';
}

function hintsFor(kind) {
  return kind === 'commitment'
    ? [
        'Name the deliverable and the finished state.',
        'Example: "Complete Retell webhook integration and pass all transfer test cases."'
      ]
    : [
        'Describe the measurable output: what is now working that was not before?',
        'Example: "Fixed 3 of 4 routing scenarios" or "Deployed lead automation to production."'
      ];
}

export const HELPER_MESSAGE =
  'A daily commitment should describe a measurable result, not just an activity.';

export const NON_PROGRESS_EXAMPLES = [
  'Worked on it', 'Researched', 'Checked system', 'Continued coding', 'Had meeting', 'Looked into issue'
];

export const PROGRESS_EXAMPLES = [
  'Completed webhook integration',
  'Fixed 3 of 4 routing scenarios',
  'Passed 18 of 20 test cases',
  'Built login page',
  'Connected Google Sheets API',
  'Deployed automation to production',
  'Fixed production bug',
  'Completed user testing',
  'Documented system',
  'Reduced workflow from 8 steps to 3'
];
