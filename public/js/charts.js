/**
 * Small hand-drawn charts.
 *
 * No charting library: every chart here is a few dozen lines of SVG, which
 * keeps the page weight and the serverless bundle exactly where they were.
 *
 * The rules these follow, so they read as one set rather than six pictures:
 *   - 2px lines, markers at least 8px across with a 2px ring in the surface
 *     colour, so a point stays legible where it crosses a line.
 *   - Gridlines are solid hairlines one step off the surface. Never dashed:
 *     a dashed grid reads as a threshold when it is only a grid.
 *   - Labels are sparing. The ends and the extreme, never a number on every
 *     point, and labels wear text colours rather than the series colour.
 *   - Every chart has a table twin, so no value is reachable only by hovering.
 *   - Colours come from the tokens in app.css, which are stepped separately
 *     for dark mode and checked for colour blindness.
 */
import { esc } from './ui.js';

/** The people series, in fixed order. Colour follows the person, not the rank. */
export const SERIES_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'];
/** Pipeline stages read as one ordered ramp, earliest to latest. */
export const STAGE_COLORS = {
  'Not started': 'var(--stage-1)',
  Building: 'var(--stage-2)',
  Testing: 'var(--stage-3)',
  Ready: 'var(--stage-4)',
  Live: 'var(--stage-5)',
  Blocked: 'var(--stage-blocked)'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayOf = (iso) => DAYS[new Date(`${iso}T12:00:00`).getDay()];
const shortDate = (iso) => `${iso.split('-')[2]} ${MONTHS[Number(iso.split('-')[1]) - 1]}`;
const dayNum = (iso) => iso.split('-')[2];
const svg = (w, h, inner) =>
  `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img">${inner}</svg>`;

/** One tooltip per chart, positioned inside the chart's own box. */
function tooltipFor(host) {
  let tip = host.querySelector(':scope > .viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    host.appendChild(tip);
  }
  return {
    show(x, y, html) {
      tip.innerHTML = html;
      tip.style.opacity = '1';
      const box = host.getBoundingClientRect();
      tip.style.left = `${Math.max(2, Math.min(x - tip.offsetWidth / 2, box.width - tip.offsetWidth - 2))}px`;
      tip.style.top = `${Math.max(2, y - tip.offsetHeight - 10)}px`;
    },
    hide() { tip.style.opacity = '0'; }
  };
}

const tipRow = (color, label, value) =>
  `<div class="l"><i style="background:${color}"></i>${esc(label)}<b>${esc(value)}</b></div>`;

/* ------------------------------------------------------------ Sparkline */
/**
 * The trend inside a stat tile. The line is de-emphasised and only the current
 * point is in the accent colour, because the tile's own number is the value
 * being read — the line is just its shape.
 */
export function sparkline(values, width = 120, height = 20) {
  const points = values.filter((v) => Number.isFinite(v));
  if (points.length < 2) return '';
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = (max - min) || 1;
  const x = (i) => (i / (points.length - 1)) * (width - 6) + 3;
  const y = (v) => height - 3 - ((v - min) / span) * (height - 6);
  return svg(width, height,
    `<path d="${points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"
       fill="none" stroke="var(--viz-deemph)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(points.at(-1)).toFixed(1)}" r="3.5"
       fill="var(--viz-1)" stroke="var(--surface)" stroke-width="2"/>`);
}

/* ----------------------------------------------------------- Line chart */
/**
 * A trend over days. One series or several; with two or more the legend is
 * always drawn by the caller, so identity never rests on colour alone.
 *
 * @param {HTMLElement} host    where to draw
 * @param {object} opts
 *   labels   ISO dates along the x axis
 *   series   [{ name, color, values }]
 *   max      y ceiling, or null to fit the data
 *   ticks    y values to rule and label
 *   rule     optional { value, label } drawn as a target line
 *   area     fill under a single series
 *   ends     label the first and last point of each series
 */
export function lineChart(host, { labels, series, max = null, ticks = null, rule = null, area = false, ends = true }) {
  if (!labels.length) { host.innerHTML = '<p class="viz-empty">Nothing recorded yet.</p>'; return; }
  const W = 420, H = 132, L = 26, R = ends && series.length > 1 ? 30 : 14, T = 12, B = 20;
  const pw = W - L - R, ph = H - T - B;
  const values = series.flatMap((s) => s.values).filter(Number.isFinite);
  const peak = max ?? Math.max(1, ...values);
  const marks = ticks ?? [0, Math.round(peak / 2), peak];
  const x = (i) => (labels.length === 1 ? L + pw / 2 : L + (i / (labels.length - 1)) * pw);
  const y = (v) => T + ph - (v / (peak || 1)) * ph;

  let out = '';
  for (const t of [...new Set(marks)]) {
    out += `<line x1="${L}" y1="${y(t).toFixed(1)}" x2="${W - R}" y2="${y(t).toFixed(1)}" stroke="var(--viz-grid)" stroke-width="1"/>`
         + `<text class="viz-axis" x="${L - 5}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${t}</text>`;
  }
  if (rule) {
    out += `<line x1="${L}" y1="${y(rule.value).toFixed(1)}" x2="${W - R}" y2="${y(rule.value).toFixed(1)}"
              stroke="var(--viz-good)" stroke-width="2" stroke-linecap="round" opacity=".5"/>`
         + `<text class="viz-label" x="${W - R}" y="${(y(rule.value) - 5).toFixed(1)}" text-anchor="end"
              fill="var(--viz-good)">${esc(rule.label ?? rule.value)}</text>`;
  }
  if (area && series.length === 1) {
    const pts = series[0].values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    out += `<polygon points="${L},${T + ph} ${pts} ${W - R},${T + ph}" fill="${series[0].color}" opacity=".10"/>`;
  }
  /* Thirty labels on a 420px axis collide into a grey smear, so show about
     eight of them and let the tooltip name the rest. */
  const every = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((iso, i) => {
    if (i % every !== 0 && i !== labels.length - 1) return;
    out += `<text class="viz-axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${dayNum(iso)}</text>`;
  });
  for (const s of series) {
    out += `<path d="${s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"
              fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => {
      out += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${s.color}"
                stroke="var(--surface)" stroke-width="2"/>`;
    });
    if (ends && series.length > 1) {
      out += `<text class="viz-label" x="${W - R + 5}" y="${(y(s.values.at(-1)) + 3.5).toFixed(1)}"
                fill="var(--text-2)">${s.values.at(-1)}</text>`;
    }
  }
  if (ends && series.length === 1 && labels.length > 1) {
    const v = series[0].values;
    out += `<text class="viz-label" x="${x(0) + 2}" y="${(y(v[0]) - 8).toFixed(1)}" fill="var(--text-2)">${v[0]}</text>`
         + `<text class="viz-label" x="${x(v.length - 1) - 2}" y="${(y(v.at(-1)) - 8).toFixed(1)}"
              text-anchor="end" fill="var(--text-2)">${v.at(-1)}</text>`;
  }
  /* A band per day, so the hit target is the column and not the 7px dot. */
  const band = labels.length > 1 ? pw / (labels.length - 1) : pw;
  labels.forEach((iso, i) => {
    out += `<rect x="${(x(i) - band / 2).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ph}"
              fill="transparent" data-day="${i}"/>`;
  });

  host.innerHTML = svg(W, H, out);
  const tip = tooltipFor(host);
  host.querySelectorAll('[data-day]').forEach((band_) => {
    const enter = () => {
      const i = Number(band_.dataset.day);
      const box = host.getBoundingClientRect();
      const rect = band_.getBoundingClientRect();
      tip.show(rect.left - box.left + rect.width / 2, box.height * 0.45,
        `<div class="t">${dayOf(labels[i])} ${shortDate(labels[i])}</div>`
        + series.map((s) => tipRow(s.color, s.name, s.values[i])).join('')
        + (series[0].extra ? series[0].extra(i) : ''));
    };
    band_.addEventListener('mouseenter', enter);
    band_.addEventListener('mouseleave', tip.hide);
  });
}

/* ---------------------------------------------------------------- Donut */
/**
 * Part to whole, at a glance. Always drawn beside its own table: with one
 * stage holding most of the projects the small arcs cannot be read off the
 * ring, and the numbers beside it are what people actually use.
 */
export function donut(host, segments, total) {
  const R = 46, WIDTH = 17, C = 52, circumference = 2 * Math.PI * R, GAP = 3;
  const live = segments.filter((s) => s.value > 0);
  let offset = 0;
  let out = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--gray-bg)" stroke-width="${WIDTH}"/>`;
  live.forEach((s, i) => {
    const fraction = s.value / (total || 1);
    const length = Math.max(1, fraction * circumference - (live.length > 1 ? GAP : 0));
    out += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${WIDTH}"
              stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}"
              stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${C} ${C})" data-seg="${i}"/>`;
    offset += fraction * circumference;
  });
  out += `<text x="${C}" y="${C + 2}" text-anchor="middle" font-size="21" font-weight="650" fill="var(--text)">${total}</text>`
       + `<text x="${C}" y="${C + 16}" text-anchor="middle" font-size="9.5" fill="var(--text-3)">projects</text>`;

  host.innerHTML = `<svg viewBox="0 0 104 104" width="104" height="104" role="img">${out}</svg>`;
  const tip = tooltipFor(host);
  host.querySelectorAll('[data-seg]').forEach((seg) => {
    seg.addEventListener('mouseenter', () => {
      const s = live[Number(seg.dataset.seg)];
      tip.show(56, 52, `<div class="t">${esc(s.label)}</div>`
        + tipRow(s.color, 'Projects', s.value)
        + tipRow('var(--viz-deemph)', 'Share', `${Math.round((s.value / (total || 1)) * 100)}%`));
    });
    seg.addEventListener('mouseleave', tip.hide);
  });
}

export { shortDate, dayOf, dayNum };
