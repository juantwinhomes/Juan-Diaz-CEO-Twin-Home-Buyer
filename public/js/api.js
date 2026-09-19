const qs = (params = {}) => {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return usable.length ? `?${new URLSearchParams(Object.fromEntries(usable))}` : '';
};

// Anything that writes should be reflected in the shell's counters; anything
// that only reads should not cost extra requests. This says which just happened.
let wrote = false;
/** True once if something has been written since the last check. */
export const tookAWrite = () => { const was = wrote; wrote = false; return was; };

async function request(method, path, { params, body } = {}) {
  if (method !== 'GET') wrote = true;
  const res = await fetch(`/api${path}${qs(params)}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    // The session has expired, or the password gate is on and nobody has signed
    // in yet. The login page lives behind the same gate, so go there.
    location.href = '/login';
    return null;
  }
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }
  if (!res.ok) throw new Error((payload && payload.error) || `Request failed (${res.status})`);
  return payload;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body, params) => request('POST', path, { body, params }),
  patch: (path, body, params) => request('PATCH', path, { body, params }),
  del: (path, params) => request('DELETE', path, { params })
};
