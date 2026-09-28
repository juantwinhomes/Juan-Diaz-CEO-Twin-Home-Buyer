'use strict';
// Builds dist/academy.html: the whole app (server code + front end + synthetic data) in one page that
// runs entirely in the browser. Used for the shareable demo link. Run: npm run build:browser
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap(d => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const noScriptClose = (name, s) => { if (/<\/script/i.test(s)) throw new Error(`${name} contains "</script" and can't be inlined.`); return s; };
const safeJson = v => JSON.stringify(v).replace(/</g, '\\u003c');

// Server modules (everything except the Node entry point) plus Buffer and its helpers.
const modules = {};
for (const f of walk('server').filter(f => f.endsWith('.js') && f !== path.join('server', 'index.js'))) modules['/app/' + f.split(path.sep).join('/')] = read(f);
modules.buffer = read('vendor/buffer.js');
modules['base64-js'] = read('vendor/base64-js.js');
modules.ieee754 = read('vendor/ieee754.js');
const moduleJs = 'window.__KCA_MODULES = {\n' + Object.entries(modules).map(([id, src]) =>
  `${JSON.stringify(id)}: function (module, exports, require, __dirname, __filename) {\n${noScriptClose(id, src)}\n}`).join(',\n') + '\n};';

// Files the server reads: schema, lessons, synthetic sample exports.
const files = { '/app/server/schema.sql': read('server/schema.sql') };
for (const f of walk('content/lessons').filter(f => f.endsWith('.json'))) files['/app/' + f.split(path.sep).join('/')] = read(f);
for (const f of walk('samples').filter(f => f.endsWith('.csv'))) files['/app/' + f.split(path.sep).join('/')] = read(f);

// Front end: hash routing becomes in-page routing (the artifact frame owns the URL).
let app = read('public/app.js').replace(/^'use strict';\n/, '');
app = app.replace(/location\.hash = ([^;]+);/g, '__go($1);').replace(/location\.hash/g, '__route');
app = app.replace("window.addEventListener('hashchange', render);", '');
app = app.replace('async backup() {', "async backup() { if (window.__KCA_BROWSER) { toast('Backup works when the app runs on a computer (npm start). In this browser demo, data stays in this browser only.', true); return; }");
app = app.replace('Numbers are made up for training.`;', 'Numbers are made up for training. Runs in your browser; changes are saved in this browser only.`;');
app = app.replace('<div class="muted">AI: ', '<div><button class="btn ghost sm" data-act="resetDemo">Reset demo data</button></div><div class="muted">AI: ');
app = app.replace('const ACTIONS = {', 'const ACTIONS = {\n  resetDemo() { window.__kcaReset(); },');
if (/location\.hash/.test(app)) throw new Error('hash routing left in app.js');
const appJs = `window.__startApp = function () {\n'use strict';\nlet __route = '#/';\nconst __go = h => { __route = h; render(); };\n${noScriptClose('app.js', app)}\ndocument.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a) { e.preventDefault(); __go(a.getAttribute('href')); } });\n};`;

const html = read('public/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="/app.js">'));
const out = `<title>Kristine Controller Academy</title>
<style>
${read('public/styles.css')}
</style>
${body}
<script>
${noScriptClose('sql-asm.js', read('vendor/sql-asm.js'))}
</script>
<script>
${moduleJs}
window.__KCA_FILES = ${safeJson(files)};
</script>
<script>
${read('browser/runtime.js')}
</script>
<script>
${appJs}
window.__kcaBoot();
</script>
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'academy.html'), out);
console.log(`dist/academy.html ${(out.length / 1024 / 1024).toFixed(2)} MB, ${Object.keys(modules).length} modules, ${Object.keys(files).length} files`);
