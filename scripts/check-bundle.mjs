/**
 * Catch bundling failures before they reach production.
 *
 * Two bugs have now shipped that local testing could not see, because running
 * from source is not the same as running from a bundle: reading a .sql file
 * that the bundler leaves behind, and declaring `__dirname`, which collides
 * with the shim bundlers inject into ES modules.
 *
 * This bundles the function the way Netlify does — same format, same shim —
 * and loads it. Run it before deploying.
 *
 *   npm run check:bundle
 */
import { build } from 'esbuild';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

// The CommonJS shim Netlify's bundler prepends to ES module functions.
const NETLIFY_BANNER = `
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);
`;

const dir = await mkdtemp(join(tmpdir(), 'kpi-bundle-'));
const outfile = join(dir, 'api.mjs');

await build({
  entryPoints: [join(ROOT, 'netlify/functions/api.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pg', 'pg-native', '@electric-sql/pglite'],
  banner: { js: NETLIFY_BANNER },
  outfile
});

// External packages are resolved from node_modules at runtime, as on Netlify.
await symlink(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir').catch(() => {});
await writeFile(join(dir, 'package.json'), '{"type":"module"}');

const fail = (message) => { console.error(`\n  FAIL  ${message}\n`); process.exit(1); };

let handler;
try {
  ({ default: handler } = await import(pathToFileURL(outfile).href));
} catch (err) {
  fail(`the bundle does not load: ${err.message}`);
}
if (typeof handler !== 'function') fail('the bundle has no default export');

// Without a database URL a serverless run must report the reason, not crash.
process.env.NETLIFY = '1';
const res = await handler(new Request('https://example.test/api/bootstrap'));
const body = await res.text();

if (res.status === 502 || res.status >= 500 && !body.includes('DATABASE_URL')) {
  fail(`the bundled function crashed instead of reporting its configuration: ${body.slice(0, 200)}`);
}

console.log(`\n  Bundle loads and responds (${res.status}).`);
console.log('  Safe to deploy.\n');
