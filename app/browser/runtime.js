'use strict';
// Browser runtime for the one-page demo build.
// It lets the same server code (server/*.js) run inside a web page: a tiny CommonJS loader,
// in-memory stand-ins for fs / path / crypto / sqlite (SQLite comes from sql.js), and a fetch()
// shim that routes /api/* calls to the app's own request handler. Nothing leaves the browser.
// Demo data is saved in this browser's localStorage so work survives a reload.
(function () {
  const MODULES = window.__KCA_MODULES;
  const files = new Map(Object.entries(window.__KCA_FILES));
  const STORE_KEY = 'kca-browser-demo-v1';

  // ---------- path ----------
  const normalize = p => {
    const abs = p.startsWith('/'), out = [];
    for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
    return (abs ? '/' : '') + out.join('/');
  };
  const path = {
    sep: '/', normalize,
    join: (...a) => normalize(a.filter(Boolean).join('/')),
    resolve: (...a) => { let r = ''; for (const x of a) r = x.startsWith('/') ? x : `${r}/${x}`; return normalize(r.startsWith('/') ? r : '/' + r); },
    dirname: p => { const n = normalize(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); },
    basename: p => p.split('/').pop(),
    extname: p => { const b = p.split('/').pop(); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
  };

  // ---------- module loader ----------
  const cache = {};
  const BUILTINS = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    const fn = MODULES[id];
    if (!fn) throw new Error(`Module not found: ${id}`);
    const module = { exports: {}, id };
    cache[id] = module;
    fn(module, module.exports, makeRequire(path.dirname(id)), path.dirname(id), id);
    return module.exports;
  }
  function makeRequire(dir) {
    const req = spec => {
      if (BUILTINS[spec]) return BUILTINS[spec]();
      if (MODULES[spec]) return load(spec);
      const base = path.resolve(dir, spec);
      for (const c of [base, base + '.js', base + '/index.js']) if (MODULES[c]) return load(c);
      throw new Error(`Cannot find module '${spec}' from ${dir}`);
    };
    return req;
  }

  window.process = { env: {} };
  const Buffer = load('buffer').Buffer;
  window.Buffer = Buffer;
  const toBuf = v => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v));

  // ---------- fs (in memory) ----------
  const fs = {
    readFileSync(p, enc) {
      p = normalize(p);
      if (!files.has(p)) { const e = new Error(`ENOENT: no such file ${p}`); e.code = 'ENOENT'; throw e; }
      const b = toBuf(files.get(p));
      const e = typeof enc === 'string' ? enc : enc && enc.encoding;
      return e ? b.toString(e) : b;
    },
    writeFileSync(p, data, opts) {
      p = normalize(p);
      if (opts && opts.flag === 'wx' && files.has(p)) { const e = new Error(`EEXIST: ${p}`); e.code = 'EEXIST'; throw e; }
      files.set(p, toBuf(data));
    },
    existsSync: p => { const n = normalize(p); return files.has(n) || [...files.keys()].some(k => k.startsWith(n + '/')); },
    mkdirSync() {},
    readdirSync(d) {
      const pre = normalize(d) + '/', names = new Set();
      for (const k of files.keys()) if (k.startsWith(pre)) names.add(k.slice(pre.length).split('/')[0]);
      return [...names].sort();
    },
    statSync(p) { const f = files.has(normalize(p)); return { isDirectory: () => !f, isFile: () => f }; },
    rmSync() {}, rm() {},
    mkdtempSync: prefix => prefix + Math.random().toString(36).slice(2),
    createReadStream() { throw new Error('File downloads are not available in the browser demo.'); },
  };

  // ---------- crypto ----------
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(bytes) {
    const len = bytes.length, bitLen = len * 8;
    const total = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000)); dv.setUint32(total - 4, bitLen >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32); const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }
  const cryptoShim = {
    randomBytes: n => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return Buffer.from(a); },
    createHash(alg) {
      if (alg !== 'sha256') throw new Error(`Only sha256 is available (asked for ${alg}).`);
      const parts = [];
      return { update(d) { parts.push(toBuf(d)); return this; }, digest(enc) { const h = Buffer.from(sha256(Buffer.concat(parts))); return enc ? h.toString(enc) : h; } };
    },
  };

  // ---------- sqlite (sql.js) ----------
  function restoreSaved() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      for (const [p, b64] of Object.entries(saved.files || {})) files.set(p, Buffer.from(b64, 'base64'));
      return new Uint8Array(Buffer.from(saved.db, 'base64'));
    } catch (e) { return null; }
  }
  class DatabaseSync {
    constructor() {
      const saved = restoreSaved();
      this._db = saved ? new window.SQL.Database(saved) : new window.SQL.Database();
      window.__kcaDb = this._db;
    }
    exec(sql) { this._db.exec(sql); }
    prepare(sql) {
      const db = this._db;
      const norm = p => p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
      return {
        all(...p) {
          const st = db.prepare(sql);
          try { st.bind(norm(p)); const out = []; while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); }
        },
        get(...p) { return this.all(...p)[0]; },
        run(...p) { db.run(sql, norm(p)); return { changes: db.getRowsModified() }; },
      };
    }
  }

  Object.assign(BUILTINS, {
    'node:fs': () => fs, fs: () => fs, 'node:path': () => path, path: () => path,
    'node:crypto': () => cryptoShim, 'node:sqlite': () => ({ DatabaseSync }),
    'node:http': () => ({ createServer() { throw new Error('No server in the browser demo.'); } }),
    'node:os': () => ({ tmpdir: () => '/tmp' }),
  });

  function persist() {
    try {
      const data = window.__kcaDb.export();
      const docs = {};
      for (const [p, v] of files) if (p.startsWith('/app/data/')) docs[p] = toBuf(v).toString('base64');
      localStorage.setItem(STORE_KEY, JSON.stringify({ db: Buffer.from(data).toString('base64'), files: docs, saved_at: new Date().toISOString() }));
    } catch (e) { /* storage full or blocked: the demo still works until the page is closed */ }
  }

  // ---------- fetch shim ----------
  let handler = null;
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  function fakeFetch(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    const listeners = {};
    const req = { method, url, headers, on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return req; }, destroy() {} };
    return new Promise(resolve => {
      const res = {
        headersSent: false, status: 200, hdrs: {},
        writeHead(s, h) { this.status = s; this.hdrs = h || {}; this.headersSent = true; },
        end(body) {
          resolve(new Response(body ?? '', { status: this.status, headers: { 'Content-Type': this.hdrs['Content-Type'] || 'application/json' } }));
          if (method !== 'GET' && this.status < 400) persist();
        },
      };
      Promise.resolve(handler(req, res)).catch(e => resolve(new Response(JSON.stringify({ error: e.message }), { status: 500 })));
      setTimeout(() => {
        if (opts.body) (listeners.data || []).forEach(f => f(Buffer.from(String(opts.body), 'utf8')));
        (listeners.end || []).forEach(f => f());
      }, 0);
    });
  }
  window.fetch = (u, o) => (String(u).startsWith('/api/') ? fakeFetch(String(u), o) : realFetch(u, o));

  window.__KCA_BROWSER = true;
  window.__kcaReset = () => {
    try { localStorage.removeItem(STORE_KEY); sessionStorage.clear(); } catch (e) { /* ignore */ }
    location.reload();
  };

  window.__kcaBoot = async function () {
    const main = document.getElementById('main');
    main.innerHTML = '<p class="muted">Starting the demo…</p>';
    try {
      window.SQL = await window.initSqlJs();
      const req = makeRequire('/app/server');
      const { openDb } = req('./db');
      const { seed } = req('./seed');
      const { createApp } = req('./app');
      const db = openDb(':memory:');
      seed(db);
      handler = createApp(db).handler;
      persist();
    } catch (e) {
      main.innerHTML = `<div class="card"><h2>The demo couldn't start</h2><p>${String(e && e.message).replace(/</g, '&lt;')}</p></div>`;
      return;
    }
    window.__startApp();
  };
})();
