/* Entity forms shared by every page. Each one creates on POST and edits on
   PATCH, so "add" and "edit" never drift apart. */
import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, activeUsers } from '../app.js';

const userOptions = (allowBlank = true) => [
  ...(allowBlank ? [] : []),
  ...activeUsers().map((u) => ({ value: u.id, label: u.name }))
];
const projectOptions = () => state.projects.map((p) => ({ value: p.id, label: p.name }));
const today = () => state.date || state.today;

async function save(path, values, id, successMessage) {
  if (id) await api.patch(`${path}/${id}`, values);
  else await api.post(path, values);
  U.toast(successMessage, 'success');
  refresh();
}

/* ---------------------------------------------------------- Commitment */
export function commitmentForm(values = {}) {
  const e = state.enums;
  U.openForm({
    title: values.id ? 'Edit commitment' : 'Add a daily commitment',
    subtitle: values.id ? null : 'One concrete deliverable you expect to finish today',
    note: `<div class="callout info" style="margin-bottom:15px">${U.icon('target', 16)}
      <div><b>Write it the way you would tell someone it is done.</b>
      <p style="margin-top:4px">"Complete Retell webhook integration and pass all transfer test cases"
      tells the team more than "Work on Retell" — but it is your call.</p></div></div>`,
    fields: [
      { name: 'task', label: 'Task / deliverable', type: 'textarea', required: true, rows: 2,
        placeholder: 'What you expect to have finished' },
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), placeholder: 'No project', half: true },
      { name: 'priority', label: 'Priority', type: 'select', options: e.priorities, default: 'P3', half: true },
      { name: 'user_id', label: 'Team member', type: 'select', options: userOptions(), required: true, half: true },
      { name: 'commit_date', label: 'Date', type: 'date', default: today(), half: true },
      { name: 'status', label: 'Status', type: 'select', options: e.commitment_statuses, default: 'Not Started', half: true },
      { name: 'expected_today', label: 'Expected to complete today', type: 'checkbox', default: true, half: true },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'Optional context' }
    ],
    values: { expected_today: true, commit_date: today(), ...values },
    submitLabel: values.id ? 'Save changes' : 'Add commitment',
    async onSubmit(data, close) {
      const result = values.id
        ? await api.patch(`/commitments/${values.id}`, data, { date: data.commit_date || today() })
        : await api.post('/commitments', data);
      close();
      // Both can be true at once: over the daily limit, and already complete.
      if (result.warning) U.toast(result.warning, 'error');
      if (result.progress || !result.warning) {
        U.toast(...commitmentFeedback(result, values.id ? 'Commitment updated' : 'Commitment added'));
      }
      refresh();
    }
  });
}

/**
 * Ticking a commitment complete writes its own progress entry on the project it
 * belongs to. Say where it landed, so it is never a surprise.
 */
export function commitmentFeedback(result, fallback = 'Marked complete') {
  const p = result && result.progress;
  if (!p) return [fallback, 'success'];
  return [`${fallback} — progress logged on ${p.project_name}`, 'success'];
}

/* ------------------------------------------------------------ Progress */
export async function progressForm(values = {}) {
  const project = state.projects.find((p) => p.id === Number(values.project_id));
  const e = state.enums;
  // Where the to-dos decide the percentage, offering a box to type one in is an
  // invitation to a number that will be overwritten.
  const byTodos = !!project && project.pct_from_commitments !== 0 && Number(project.todo_total || 0) > 0;

  // The milestone framework already carries the percentage for each stage, so
  // picking the stage you reached sets the number for you. Typing a figure by
  // hand still works when the move does not line up with a milestone.
  let milestones = [];
  if (values.project_id && !byTodos) {
    try { milestones = await api.get('/milestones', { project_id: values.project_id }); } catch { /* fall back to manual */ }
  }
  const milestoneOptions = milestones.map((m) => ({
    value: m.id,
    label: `${m.name} — ${m.target_pct}%${m.completed ? ' (already reached)' : ''}`
  }));

  U.openForm({
    title: values.id ? 'Edit progress entry' : `Log progress${project ? ` — ${project.name}` : ''}`,
    subtitle: 'What changed today?',
    note: `<div class="callout info" style="margin-bottom:15px">${U.icon('target', 16)}
      <div><b>Say what moved, so the entry still means something next month.</b>
      <p style="margin-top:4px">${byTodos
        ? `${U.esc(project.name)} counts its percentage from its to-dos (${project.todo_done} of ${project.todo_total} done), so this entry records the work without changing the number. Tick the to-do off to move the bar.`
        : '"Fixed 3 of 4 routing scenarios" reads better in a report than "worked on it".'}</p></div></div>`,
    fields: [
      { name: 'completed_text', label: 'What was completed', type: 'textarea', required: true, rows: 3,
        placeholder: 'e.g. Passed 18 of 20 transfer test cases and fixed the after-hours route' },
      ...(milestoneOptions.length ? [{
        name: 'milestone_id', label: 'Milestone reached', type: 'select', options: milestoneOptions,
        placeholder: 'None — I will set the % myself',
        help: 'Choosing one fills in the completion % below and ticks the milestone off'
      }] : []),
      ...(byTodos ? [] : [{ name: 'new_pct', label: 'New completion %', type: 'number', min: 0, max: 100, step: 1, half: true,
        help: project ? `Currently ${project.completion_pct}%` : '' }]),
      { name: 'status', label: 'Project status', type: 'select', options: e.project_statuses, half: true,
        placeholder: 'Leave unchanged' },
      { name: 'next_text', label: 'What is next', type: 'textarea', rows: 2, placeholder: 'The next concrete step' },
      { name: 'blocker_text', label: 'Blocker (if any)', type: 'text', placeholder: 'Leave empty if nothing is blocked' },
      { name: 'create_blocker', label: 'Also add this to the blockers list', type: 'checkbox' },
      { name: 'blocker_reason', label: 'Blocker reason', type: 'select', options: e.blocker_reasons, half: true },
      { name: 'user_id', label: 'Logged by', type: 'select', options: userOptions(), half: true },
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), required: true, half: true },
      { name: 'log_date', label: 'Date', type: 'date', default: today(), half: true },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: {
      log_date: today(),
      user_id: state.currentUserId,
      ...(byTodos ? {} : { new_pct: project ? project.completion_pct : '' }),
      ...values
    },
    submitLabel: values.id ? 'Save changes' : 'Log progress',
    onReady(form) {
      const picker = form.elements.milestone_id;
      const pct = form.elements.new_pct;
      if (!picker || !pct) return;
      const hint = pct.parentElement.querySelector('.hint');
      picker.addEventListener('change', () => {
        const chosen = milestones.find((m) => String(m.id) === picker.value);
        if (!chosen) return;
        pct.value = chosen.target_pct;
        if (hint) hint.textContent = `Set to ${chosen.target_pct}% by "${chosen.name}" — change it if the real figure differs`;
      });
    },
    async onSubmit(data, close) {
      const result = values.id
        ? await api.patch(`/progress/${values.id}`, data)
        : await api.post('/progress', data);
      close();
      U.toast('Progress logged', 'success');
      refresh();
    }
  });
}

/* ------------------------------------------------------------- Project */
export function projectForm(values = {}) {
  const e = state.enums;
  U.openForm({
    title: values.id ? `Edit ${values.name}` : 'New project',
    wide: true,
    fields: [
      { name: 'name', label: 'Project name', type: 'text', required: true },
      { name: 'owner_id', label: 'Project owner', type: 'select', options: userOptions(), placeholder: 'Unassigned', half: true },
      { name: 'secondary_owner_id', label: 'Secondary owner', type: 'select', options: userOptions(), placeholder: 'None', half: true },
      { name: 'project_type', label: 'Type', type: 'select', options: e.project_types, placeholder: 'Not set', half: true },
      { name: 'requester', label: 'Requester', type: 'text', placeholder: 'Who asked for this?', half: true },
      { name: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Sales, Finance', half: true },
      { name: 'start_date', label: 'Start date', type: 'date', default: today(), half: true },
      { name: 'target_date', label: 'Target completion date', type: 'date', half: true },
      { name: 'priority', label: 'Priority', type: 'select', options: e.priorities, default: 'P3', half: true },
      { name: 'status', label: 'Status', type: 'select', options: e.project_statuses, default: 'Backlog', half: true },
      { name: 'pct_from_commitments', label: 'Count the completion % from this project\'s to-dos', type: 'checkbox',
        default: true,
        help: 'On: the bar is how many of its commitments are done. Off: whatever you type below stands, however many are open.' },
      { name: 'completion_pct', label: 'Completion %', type: 'number', min: 0, max: 100, step: 1, default: 0, half: true,
        help: 'Used when the to-do count above is switched off' },
      { name: 'current_phase', label: 'Current phase', type: 'select', options: e.project_phases, placeholder: 'Not set', half: true },
      { name: 'next_step', label: 'Next step', type: 'text', placeholder: 'The next concrete deliverable' },
      { name: 'business_objective', label: 'Business objective', type: 'textarea', rows: 2 },
      { name: 'expected_impact', label: 'Expected business impact', type: 'textarea', rows: 2 },
      { name: 'production_url', label: 'Production URL or system link', type: 'text', placeholder: 'https://' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: {
      start_date: today(),
      completion_pct: 0,
      ...values,
      pct_from_commitments: values.pct_from_commitments !== 0
    },
    submitLabel: values.id ? 'Save changes' : 'Create project',
    async onSubmit(data, close) {
      await save('/projects', data, values.id, values.id ? 'Project updated' : 'Project created');
      close();
    }
  });
}

/* ---------------------------------------------------------- Deployment */
export function deploymentForm(values = {}) {
  U.openForm({
    title: values.id ? 'Edit deployment' : 'Log a deployment',
    subtitle: 'Features, automations, system launches and fixes pushed to production',
    fields: [
      { name: 'title', label: 'What was deployed', type: 'text', required: true,
        placeholder: 'e.g. Business-hours routing fix' },
      { name: 'kind', label: 'Type', type: 'select', options: state.enums.deployment_kinds, default: 'Feature', half: true },
      { name: 'deploy_date', label: 'Date', type: 'date', default: today(), half: true },
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), placeholder: 'No project', half: true },
      { name: 'user_id', label: 'Deployed by', type: 'select', options: userOptions(), half: true },
      { name: 'description', label: 'What changed', type: 'textarea', rows: 2 },
      { name: 'url', label: 'Link', type: 'text', placeholder: 'https://' }
    ],
    values: { deploy_date: today(), user_id: state.currentUserId, ...values },
    submitLabel: values.id ? 'Save changes' : 'Log deployment',
    async onSubmit(data, close) {
      await save('/deployments', data, values.id, values.id ? 'Deployment updated' : 'Deployment logged');
      close();
    }
  });
}

/* ------------------------------------------------------------- Blocker */
export function blockerForm(values = {}) {
  const e = state.enums;
  U.openForm({
    title: values.id ? 'Edit blocker' : 'Report a blocker',
    fields: [
      { name: 'title', label: 'What is blocked', type: 'text', required: true,
        placeholder: 'e.g. Waiting for CRM production credentials' },
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), placeholder: 'No project', half: true },
      { name: 'owner_id', label: 'Owner', type: 'select', options: userOptions(), half: true },
      { name: 'reason', label: 'Reason', type: 'select', options: e.blocker_reasons, default: 'Other', half: true },
      { name: 'priority', label: 'Priority', type: 'select', options: e.priorities, default: 'P3', half: true },
      { name: 'person_needed', label: 'Person / department needed', type: 'text',
        placeholder: 'Who has to act?', help: 'Blockers with nobody assigned cost blocker-management points' },
      { name: 'date_reported', label: 'Date reported', type: 'date', default: today(), half: true },
      { name: 'status', label: 'Status', type: 'select', options: e.blocker_statuses, default: 'Open', half: true },
      { name: 'resolution', label: 'Resolution', type: 'textarea', rows: 2, placeholder: 'How it was unblocked' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: { date_reported: today(), owner_id: state.currentUserId, ...values },
    submitLabel: values.id ? 'Save changes' : 'Report blocker',
    async onSubmit(data, close) {
      await save('/blockers', data, values.id, values.id ? 'Blocker updated' : 'Blocker reported');
      close();
    }
  });
}

/* ------------------------------------------------------------ Incident */
export function incidentForm(values = {}, systems = []) {
  const e = state.enums;
  U.openForm({
    title: values.id ? 'Edit production issue' : 'Report a production issue',
    fields: [
      { name: 'title', label: 'What is wrong', type: 'text', required: true },
      { name: 'severity', label: 'Severity', type: 'select', options: e.severities, default: 'Low', half: true },
      { name: 'category', label: 'Category', type: 'select', options: e.incident_categories, default: 'Bug', half: true },
      { name: 'system_id', label: 'System', type: 'select', options: systems.map((s) => ({ value: s.id, label: s.name })),
        placeholder: 'No system', half: true },
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), placeholder: 'No project', half: true },
      { name: 'status', label: 'Status', type: 'select', options: e.incident_statuses, default: 'Open', half: true },
      { name: 'reported_date', label: 'Reported', type: 'date', default: today(), half: true },
      { name: 'reported_by', label: 'Reported by', type: 'select', options: userOptions(), half: true },
      { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
      { name: 'resolution', label: 'Resolution', type: 'textarea', rows: 2 }
    ],
    values: { reported_date: today(), reported_by: state.currentUserId, ...values },
    submitLabel: values.id ? 'Save changes' : 'Report issue',
    async onSubmit(data, close) {
      await save('/incidents', data, values.id, values.id ? 'Issue updated' : 'Issue reported');
      close();
    }
  });
}

/* -------------------------------------------------------------- System */
export function systemForm(values = {}) {
  const e = state.enums;
  U.openForm({
    title: values.id ? `Edit ${values.name}` : 'Add a production system',
    fields: [
      { name: 'name', label: 'System name', type: 'text', required: true },
      { name: 'system_type', label: 'System type', type: 'select', options: e.system_types, default: 'Automation', half: true },
      { name: 'status', label: 'Status', type: 'select', options: e.system_statuses, default: 'Healthy', half: true },
      { name: 'owner_id', label: 'Owner', type: 'select', options: userOptions(), half: true },
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), placeholder: 'No project', half: true },
      { name: 'successful_runs', label: 'Successful runs', type: 'number', min: 0, default: 0, half: true },
      { name: 'failed_runs', label: 'Failed runs', type: 'number', min: 0, default: 0, half: true },
      { name: 'last_checked', label: 'Last checked', type: 'date', default: today(), half: true },
      { name: 'url', label: 'System link', type: 'text', placeholder: 'https://', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: { last_checked: today(), successful_runs: 0, failed_runs: 0, ...values },
    submitLabel: values.id ? 'Save changes' : 'Add system',
    async onSubmit(data, close) {
      await save('/systems', data, values.id, values.id ? 'System updated' : 'System added');
      close();
    }
  });
}

/* ---------------------------------------------------------------- User */
export function userForm(values = {}) {
  U.openForm({
    title: values.id ? `Edit ${values.name}` : 'Add a team member',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'text', default: 'AI / Systems', half: true },
      { name: 'email', label: 'Email', type: 'email', half: true },
      { name: 'avatar_url', label: 'Profile photo URL', type: 'text', placeholder: 'https://… (optional)',
        help: 'Leave empty to use coloured initials' },
      { name: 'color', label: 'Avatar colour', type: 'text', default: '#2563eb', placeholder: '#2563eb', half: true },
      { name: 'initials', label: 'Initials', type: 'text', placeholder: 'Auto', half: true },
      { name: 'is_manager', label: 'Manager account (sees everything, has no daily scorecard)', type: 'checkbox' },
      { name: 'active', label: 'Active', type: 'checkbox', default: true }
    ],
    values: { role: 'AI / Systems', color: '#2563eb', active: true, ...values },
    submitLabel: values.id ? 'Save changes' : 'Add member',
    async onSubmit(data, close) {
      await save('/users', data, values.id, values.id ? 'Team member updated' : 'Team member added');
      close();
      const { reloadBootstrap } = await import('../app.js');
      await reloadBootstrap();
      refresh();
    }
  });
}

/* ------------------------------------------------------ Business impact */
export function impactForm(values = {}) {
  U.openForm({
    title: values.id ? 'Edit business impact' : 'Add business impact',
    subtitle: 'Used for weekly and monthly reporting — never affects the daily score',
    fields: [
      { name: 'project_id', label: 'Project', type: 'select', options: projectOptions(), required: true },
      { name: 'manual_process', label: 'Manual process replaced', type: 'textarea', rows: 2 },
      { name: 'minutes_per_run', label: 'Minutes saved per run', type: 'number', min: 0, step: 0.5, default: 0, half: true },
      { name: 'runs_per_week', label: 'Runs per week', type: 'number', min: 0, step: 0.5, default: 0, half: true },
      { name: 'hourly_cost', label: 'Employee hourly cost', type: 'number', min: 0, step: 1, default: 0, half: true },
      { name: 'revenue_supported', label: 'Revenue supported', type: 'number', min: 0, step: 1, default: 0, half: true },
      { name: 'leads_processed', label: 'Leads processed', type: 'number', min: 0, default: 0, half: true },
      { name: 'errors_prevented', label: 'Errors prevented', type: 'number', min: 0, default: 0, half: true },
      { name: 'notes', label: 'Additional notes', type: 'textarea', rows: 2 }
    ],
    values,
    submitLabel: 'Save',
    async onSubmit(data, close) {
      if (values.id) await api.patch(`/impact/${values.id}`, data);
      else await api.post('/impact', data);
      U.toast('Business impact saved', 'success');
      close();
      refresh();
    }
  });
}

/* --------------------------------------------------- Generic removal */
export function removeEntity({ path, id, label, detail, after }) {
  U.confirmRemove({
    title: `Remove ${label}`,
    message: `Remove "${label}"?`,
    detail: detail || 'This cannot be undone.',
    async onConfirm() {
      await api.del(`${path}/${id}`);
      U.toast(`${label} removed`);
      if (after) await after();
      refresh();
    }
  });
}
