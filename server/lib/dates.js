/** Date helpers. All dates are handled as plain 'YYYY-MM-DD' strings. */

export const toISO = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export const today = () => toISO(new Date());

export const parse = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (iso, n) => {
  const dt = parse(iso);
  dt.setDate(dt.getDate() + n);
  return toISO(dt);
};

export const isWeekend = (iso) => [0, 6].includes(parse(iso).getDay());
export const isBusinessDay = (iso) => !isWeekend(iso);

/** Most recent business day on or before `iso`. */
export function previousBusinessDay(iso, includeSelf = false) {
  let cur = includeSelf ? iso : addDays(iso, -1);
  let guard = 0;
  while (isWeekend(cur) && guard++ < 10) cur = addDays(cur, -1);
  return cur;
}

/** Whole business days elapsed between two dates (same day = 0). */
export function businessDaysBetween(fromISO, toISOStr) {
  if (!fromISO || !toISOStr) return 0;
  let count = 0;
  let cur = fromISO;
  let guard = 0;
  while (cur < toISOStr && guard++ < 3650) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur)) count++;
  }
  return count;
}

/** Monday of the week containing `iso`. */
export function weekStart(iso) {
  const dt = parse(iso);
  const day = dt.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + delta);
  return toISO(dt);
}

/** Mon..Fri of the week containing `iso`. */
export function weekDays(iso) {
  const start = weekStart(iso);
  return [0, 1, 2, 3, 4].map((i) => addDays(start, i));
}

/** The last `n` business days ending at (and including) `iso`. */
export function lastBusinessDays(iso, n) {
  const out = [];
  let cur = isBusinessDay(iso) ? iso : previousBusinessDay(iso);
  while (out.length < n) {
    out.unshift(cur);
    cur = previousBusinessDay(cur);
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatLong(iso) {
  if (!iso) return '';
  const dt = parse(iso);
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

export function formatShort(iso) {
  if (!iso) return '';
  const dt = parse(iso);
  return `${MONTHS[dt.getMonth()].slice(0, 3)} ${dt.getDate()}`;
}

export const dayName = (iso) => (iso ? DAYS[parse(iso).getDay()] : '');
