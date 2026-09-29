"""Tiny numpy ray-tracer for the 8'10" x 5'1" bath, using real KZ tile photos."""
import sys, numpy as np
from PIL import Image, ImageFilter

IMG = 'img/'
W, D, H = 8.833, 5.083, 8.0          # room: x right, y up, z depth (front wall z=0)
TUB_X, TUB_H = 2.42, 1.33
VX0, VX1, VD, VH = 2.92, 5.42, 1.75, 2.83   # vanity 30" wide, 21" deep, 34" tall
DOOR = (3.7, 5.35)
CAM, LOOK, FOV = (4.95, 5.2, -0.3), (2.85, 2.7, D), 97
WIN_Z0, WIN_Z1, WIN_Y0, WIN_Y1 = 0.75, 3.75, 3.4, 6.7

def load_tex(name, w_in, h_in, ppi=10, crop=None):
    im = Image.open(IMG + name).convert('RGB')
    if crop: im = im.crop(crop)
    iw, ih = im.size
    if (iw > ih) != (w_in > h_in) and w_in != h_in:
        im = im.rotate(90, expand=True)
    if w_in == h_in:
        s = min(im.size); im = im.crop((0, 0, s, s))
    im = im.resize((int(w_in * ppi), int(h_in * ppi)), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0

def sample(tex, u, v):
    th, tw = tex.shape[:2]
    x = np.clip((u * (tw - 1)).astype(int), 0, tw - 1)
    y = np.clip((v * (th - 1)).astype(int), 0, th - 1)
    return tex[y, x]

def h2(a, b):  # per-tile hash in [0,1)
    return ((np.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1.0 + 1.0) % 1.0

def tiled(tex, u, v, tw, th, offset, grout=0.09, gcol=(0.80, 0.79, 0.76)):
    row = np.floor(v / th)
    uu = u + row * offset * tw
    col = np.floor(uu / tw)
    fu = (uu - col * tw) / tw; fv = (v - row * th) / th
    r = h2(col, row)
    flip = r > 0.5
    fu = np.where(flip, 1 - fu, fu); fv = np.where(flip, 1 - fv, fv)
    c = sample(tex, fu, fv) * (0.97 + 0.06 * h2(row, col))[:, None]
    gu = np.minimum(uu - col * tw, (col + 1) * tw - uu)
    gv = np.minimum(v - row * th, (row + 1) * th - v)
    g = (np.minimum(gu, gv) < grout / 2)
    c[g] = np.array(gcol)
    return c

# ---------------------------------------------------------------- scene
prims = []  # rect: (axis, value, (lo0,hi0,lo1,hi1), mat)  other axes in order
OTH = {0: (1, 2), 1: (0, 2), 2: (0, 1)}
def rect(axis, val, b, mat, hole=None):
    prims.append(('r', axis, val, b, mat, hole))
def box(x0, x1, y0, y1, z0, z1, mat, skip=()):
    for ax, lo, hi in ((0, x0, x1), (1, y0, y1), (2, z0, z1)):
        a, b_ = OTH[ax]; lim = [(x0, x1), (y0, y1), (z0, z1)]
        bb = (*lim[a], *lim[b_])
        for v, tag in ((lo, ax * 2), (hi, ax * 2 + 1)):
            if tag not in skip: rect(ax, v, bb, mat)
def ecyl(cx, cz, rx, rz, y0, y1, mat):
    prims.append(('c', cx, cz, rx, rz, y0, y1, mat))

NICHE = (2.3, 3.3, 3.9, 5.1, 0.33)  # on left wall x=0: z0,z1,y0,y1,depth
def build():
    prims.clear()
    rect(1, 0.0, (0, W, 0, D), 'floor')
    rect(1, H, (0, W, 0, D), 'ceil')
    # left wall: tile above tub, with niche hole
    rect(0, 0.0, (TUB_H, H, 0, D), 'wtile', hole=('niche',))
    rect(0, 0.0, (0, TUB_H, 0, D), 'tub')
    n = NICHE
    rect(0, -n[4], (n[2], n[3], n[0], n[1]), 'ntile')
    rect(1, n[2], (-n[4], 0, n[0], n[1]), 'nshelf'); rect(1, n[3], (-n[4], 0, n[0], n[1]), 'ntile')
    rect(2, n[0], (-n[4], 0, n[2], n[3]), 'ntile'); rect(2, n[1], (-n[4], 0, n[2], n[3]), 'ntile')
    # back wall
    rect(2, D, (0, TUB_X, TUB_H, H), 'wtile'); rect(2, D, (TUB_X, W, 0, H), 'paint_back')
    # front wall
    rect(2, 0.0, (0, TUB_X, TUB_H, H), 'wtile'); rect(2, 0.0, (TUB_X, W, 0, H), 'paint', hole=('door',))
    box(DOOR[0]-0.3, DOOR[0], 0, 6.9, -0.35, 0.0, 'trim'); box(DOOR[1], DOOR[1]+0.3, 0, 6.9, -0.35, 0.0, 'trim'); box(DOOR[0]-0.3, DOOR[1]+0.3, 6.9, 7.2, -0.35, 0.0, 'trim')
    rect(1, 0.0, (DOOR[0], DOOR[1], -3, 0), 'hallfloor'); rect(0, DOOR[0]-0.3, (0, 7.2, -3, -0.35), 'paint'); rect(0, DOOR[1]+0.3, (0, 7.2, -3, -0.35), 'paint')
    # right wall with window
    rect(0, W, (0, H, 0, D), 'paint', hole=('win',))
    rect(0, W + 0.35, (WIN_Y0, WIN_Y1, WIN_Z0, WIN_Z1), 'window')
    for (a, b, c, d_) in ((WIN_Y0, WIN_Y0, WIN_Z0, WIN_Z1), (WIN_Y1, WIN_Y1, WIN_Z0, WIN_Z1)):
        rect(1, a, (W, W + 0.35, WIN_Z0, WIN_Z1), 'trim')
    rect(2, WIN_Z0, (W, W + 0.35, WIN_Y0, WIN_Y1), 'trim'); rect(2, WIN_Z1, (W, W + 0.35, WIN_Y0, WIN_Y1), 'trim')
    box(W - 0.25, W, WIN_Y0 - 0.12, WIN_Y0, WIN_Z0 - 0.1, WIN_Z1 + 0.1, 'trim')
    # tub: outer shell + basin
    rect(0, TUB_X, (0, TUB_H, 0, D), 'tub')
    rect(1, TUB_H, (0, TUB_X, 0, D), 'tub', hole=('basin',))
    rect(1, 0.5, (0.22, 2.2, 0.25, D - 0.22), 'tubin')
    rect(0, 0.22, (0.5, TUB_H, 0.25, D - 0.22), 'tubin'); rect(0, 2.2, (0.5, TUB_H, 0.25, D - 0.22), 'tubin')
    rect(2, 0.25, (0.22, 2.2, 0.5, TUB_H), 'tubin'); rect(2, D - 0.22, (0.22, 2.2, 0.5, TUB_H), 'tubin')
    # glass door frame (brushed brass) + handle
    box(TUB_X - 0.05, TUB_X + 0.03, 6.55, 6.65, 0.0, D, 'gold')
    box(TUB_X - 0.05, TUB_X + 0.03, TUB_H, 6.6, D - 0.05, D, 'gold')
    box(TUB_X - 0.05, TUB_X + 0.03, TUB_H, 6.6, 0.0, 0.05, 'gold')
    box(TUB_X + 0.03, TUB_X + 0.07, 4.1, 4.16, 0.6, 1.9, 'gold')
    box(TUB_X + 0.03, TUB_X + 0.07, 4.05, 4.2, 0.6, 0.66, 'gold'); box(TUB_X + 0.03, TUB_X + 0.07, 4.05, 4.2, 1.84, 1.9, 'gold')
    # shower fixtures on back wall
    box(1.13, 1.23, 6.5, 6.58, D - 0.55, D, 'gold')
    ecyl(1.18, D - 0.62, 0.3, 0.3, 6.42, 6.5, 'gold')
    ecyl(1.18, D - 0.03, 0.2, 0.03, 3.7, 4.1, 'gold')
    box(1.1, 1.26, 1.62, 1.72, D - 0.5, D, 'gold')
    # vanity: white-oak box, quartz top
    box(VX0, VX1, 0.35, VH, D - VD, D, 'wood', skip=(3,))
    box(VX0 + 0.06, VX1 - 0.06, 0.0, 0.35, D - VD + 0.2, D, 'shadow')
    box(VX0 - 0.03, VX1 + 0.03, VH, VH + 0.13, D - VD - 0.05, D, 'quartz', skip=(3,))
    rect(1, VH + 0.13, (VX0 - 0.03, VX1 + 0.03, D - VD - 0.05, D), 'quartz', hole=('sink',))
    rect(1, VH - 0.25, (VX0, VX1, D - VD, D), 'sinkin')
    ecyl(4.17, D - 0.45, 0.04, 0.04, VH + 0.13, VH + 0.75, 'gold')
    box(4.14, 4.2, VH + 0.66, VH + 0.73, D - 0.95, D - 0.45, 'gold')
    box(4.4, 4.46, VH + 0.13, VH + 0.42, D - 0.48, D - 0.42, 'gold')
    box(VX0 + 0.05, VX1 - 0.05, 1.55, 1.58, D - VD - 0.02, D - VD + 0.01, 'woodgap')
    box(3.6, 4.75, 2.25, 2.29, D - VD - 0.06, D - VD, 'gold'); box(3.6, 4.75, 0.95, 0.99, D - VD - 0.06, D - VD, 'gold')
    # mirror + light
    rect(2, D - 0.06, (3.47, 4.87, 3.55, 6.05), 'mirror', hole=('pill',))
    rect(2, D - 0.055, (3.40, 4.94, 3.48, 6.12), 'gold', hole=('pillframe',))
    box(3.35, 4.99, 6.4, 6.47, D - 0.35, D, 'gold')
    for cx in (3.6, 4.17, 4.74):
        ecyl(cx, D - 0.3, 0.13, 0.13, 6.05, 6.4, 'globe')
    # toilet
    box(6.75, 7.92, 1.35, 2.6, D - 0.72, D - 0.05, 'porc')
    box(6.72, 7.95, 2.6, 2.68, D - 0.75, D - 0.03, 'porc')
    ecyl(7.33, D - 1.3, 0.36, 0.55, 0.0, 0.95, 'porc')
    ecyl(7.33, D - 1.45, 0.6, 0.88, 0.95, 1.32, 'porc')
    ecyl(7.33, D - 1.45, 0.66, 0.95, 1.32, 1.4, 'porc2')
    box(7.05, 7.2, 2.5, 2.54, D - 0.78, D - 0.72, 'gold')
    # bath mat + towel ring + plant pot
    rect(1, 0.02, (2.75, 4.95, 0.9, 2.3), 'mat')
    ecyl(8.2, 4.55, 0.35, 0.35, 0.0, 1.0, 'pot')
    rect(1, 1.0, (7.9, 8.5, 4.25, 4.85), 'plant')
    box(W - 0.2, W, 4.8, 5.2, 4.3, 4.35, 'gold')
    box(W - 0.35, W - 0.15, 2.7, 4.95, 4.05, 4.6, 'towel')

def holes(tag, P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    if tag == 'niche':
        n = NICHE; return (z > n[0]) & (z < n[1]) & (y > n[2]) & (y < n[3])
    if tag == 'door':
        return (x > DOOR[0]) & (x < DOOR[1]) & (y < 6.9)
    if tag == 'win':
        return (z > WIN_Z0) & (z < WIN_Z1) & (y > WIN_Y0) & (y < WIN_Y1)
    if tag == 'basin':
        return (x > 0.22) & (x < 2.2) & (z > 0.25) & (z < D - 0.22)
    if tag == 'sink':
        return ((x - 4.17) / 0.72) ** 2 + ((z - (D - VD / 2 - 0.05)) / 0.5) ** 2 < 1
    if tag in ('pill', 'pillframe'):
        r = 0.7 if tag == 'pill' else 0.77
        cx, top, bot = 4.17, (6.05 if tag == 'pill' else 6.12) - r, (3.55 if tag == 'pill' else 3.48) + r
        yy = np.clip(y, bot, top)
        ins = (x - cx) ** 2 + (y - yy) ** 2 < r * r
        if tag == 'pill': return ~ins
        inner = (x - cx) ** 2 + (y - np.clip(y, 3.55 + 0.7, 6.05 - 0.7)) ** 2 < 0.7 ** 2
        return ~ins | inner
    return np.zeros(len(P), bool)

def trace(O, Dd, tmax=None):
    n = len(Dd)
    tb = np.full(n, np.inf) if tmax is None else tmax.copy()
    mid = np.full(n, -1); nrm = np.zeros((n, 3))
    for i, p in enumerate(prims):
        if p[0] == 'r':
            _, ax, val, b, mat, hole = p
            with np.errstate(divide='ignore', invalid='ignore'):
                t = (val - O[:, ax]) / Dd[:, ax]
            ok = (t > 1e-4) & (t < tb)
            if not ok.any(): continue
            idx = np.nonzero(ok)[0]
            P = O[idx] + t[idx, None] * Dd[idx]
            a, c = OTH[ax]
            inb = (P[:, a] >= b[0]) & (P[:, a] <= b[1]) & (P[:, c] >= b[2]) & (P[:, c] <= b[3])
            if hole: inb &= ~holes(hole[0], P)
            idx = idx[inb]
            tb[idx] = t[idx]; mid[idx] = i
            nn = np.zeros((len(idx), 3)); nn[:, ax] = -np.sign(Dd[idx, ax]); nrm[idx] = nn
        else:
            _, cx, cz, rx, rz, y0, y1, mat = p
            ox = (O[:, 0] - cx) / rx; oz = (O[:, 2] - cz) / rz
            dx = Dd[:, 0] / rx; dz = Dd[:, 2] / rz
            A = dx * dx + dz * dz; B = 2 * (ox * dx + oz * dz); C = ox * ox + oz * oz - 1
            disc = B * B - 4 * A * C
            with np.errstate(invalid='ignore', divide='ignore'):
                sq = np.sqrt(np.maximum(disc, 0))
                t1 = (-B - sq) / (2 * A)
            y = O[:, 1] + t1 * Dd[:, 1]
            ok = (disc > 0) & (t1 > 1e-4) & (t1 < tb) & (y >= y0) & (y <= y1)
            idx = np.nonzero(ok)[0]
            tb[idx] = t1[idx]; mid[idx] = i
            P = O[idx] + t1[idx, None] * Dd[idx]
            nn = np.stack([(P[:, 0] - cx) / rx ** 2, np.zeros(len(idx)), (P[:, 2] - cz) / rz ** 2], 1)
            nrm[idx] = nn / (np.linalg.norm(nn, axis=1, keepdims=True) + 1e-9)
            # top cap
            with np.errstate(divide='ignore', invalid='ignore'):
                t = (y1 - O[:, 1]) / Dd[:, 1]
            P2 = O + t[:, None] * Dd
            ok = (t > 1e-4) & (t < tb) & (((P2[:, 0] - cx) / rx) ** 2 + ((P2[:, 2] - cz) / rz) ** 2 < 1)
            idx = np.nonzero(ok)[0]
            tb[idx] = t[idx]; mid[idx] = i; nrm[idx] = [0, 1, 0]
    return tb, mid, nrm

def mat_of(mid):
    names = np.array([p[4] if p[0] == 'r' else p[7] for p in prims] + ['none'])
    out = names[mid]; return out

GLOSS = {'floor': 0.10, 'wtile': 0.10, 'ntile': 0.08, 'tub': 0.06, 'tubin': 0.05, 'quartz': 0.10,
         'porc': 0.07, 'porc2': 0.07, 'gold': 0.25}

def albedo(S, mats, P, N, V):
    col = np.zeros((len(P), 3))
    x, y, z = P[:, 0] * 12, P[:, 1] * 12, P[:, 2] * 12
    def put(name, c):
        m = mats == name
        if m.any(): col[m] = c(m) if callable(c) else c
    f = S['floor']
    put('floor', lambda m: tiled(f['tex'], (x[m] if not f.get('along_z') else z[m]), (z[m] if not f.get('along_z') else x[m]),
                                 f['w'], f['h'], f['off'], gcol=f['grout']))
    wt = S['wall']
    def wall(m):
        u = np.where(np.abs(N[m, 0]) > 0.5, (D * 12 - z[m]), x[m])
        return tiled(wt['tex'], u, y[m] - TUB_H * 12, wt['w'], wt['h'], wt['off'], gcol=wt['grout'])
    put('wtile', wall)
    nt = S['niche']
    put('ntile', lambda m: tiled(nt['tex'], np.where(np.abs(N[m, 0]) > 0.5, z[m], np.where(np.abs(N[m, 2]) > .5, -x[m], z[m])), y[m] + np.where(np.abs(N[m, 1]) > .5, x[m], 0), nt['w'], nt['h'], 0.0, gcol=nt['grout']))
    put('nshelf', np.array(S['quartz']))
    put('paint', np.array(S['paint'])); put('paint_back', np.array(S.get('paint_back', S['paint'])))
    put('hallfloor', np.array([0.62, 0.55, 0.47]))
    put('ceil', np.array([0.95, 0.95, 0.93]))
    put('trim', np.array([0.95, 0.95, 0.93]))
    put('window', lambda m: np.array([1.0, 1.0, 0.99]) * 1.0)
    put('tub', np.array([0.95, 0.95, 0.94])); put('tubin', np.array([0.93, 0.93, 0.92]))
    put('porc', np.array([0.96, 0.96, 0.95])); put('porc2', np.array([0.97, 0.97, 0.96]))
    put('gold', np.array(S['metal']))
    put('globe', np.array([1.0, 0.93, 0.78]))
    wd = S['wood']
    put('wood', lambda m: sample(wd, (np.where(np.abs(N[m, 0]) > .5, z[m], x[m]) / 30.0) % 1.0, (y[m] / 34.0) % 1.0))
    put('woodgap', np.array([0.25, 0.2, 0.15]))
    put('shadow', np.array([0.12, 0.11, 0.10]))
    put('quartz', lambda m: sample(S['qtex'], (x[m] / 40) % 1, (z[m] / 40) % 1))
    put('sinkin', np.array([0.9, 0.9, 0.9]))
    put('mat', lambda m: np.where(((np.floor(z[m] / 1.2) % 5) == 0)[:, None], np.array(S['mat2']), np.array(S['mat'])))
    put('pot', np.array([0.82, 0.74, 0.62])); put('plant', np.array([0.28, 0.42, 0.26]))
    put('towel', np.array(S['towel']))
    put('mirror', np.array([0.0, 0.0, 0.0]))
    put('none', np.array([0.85, 0.83, 0.79]))
    return col

LIGHTS = [((4.4, 7.7, 2.4), (1.0, 0.94, 0.84), 1.05), ((4.17, 6.2, D - 0.7), (1.0, 0.9, 0.72), 0.55),
          ((W + 1.5, 5.2, 2.25), (0.95, 0.97, 1.0), 0.75)]

def shade(S, O, Dd, depth=0):
    t, mid, N = trace(O, Dd)
    P = O + np.nan_to_num(t, posinf=0)[:, None] * Dd
    mats = mat_of(mid)
    V = -Dd
    col = albedo(S, mats, P, N, V)
    light = np.full((len(P), 3), 0.46)
    for (lp, lc, li) in LIGHTS:
        L = np.array(lp) - P; dist = np.linalg.norm(L, axis=1, keepdims=True); L = L / dist
        ndl = np.clip((N * L).sum(1), 0, 1)
        if lp[0] > W:  # window light only through window, soft
            vis = ((P[:, 0] < W - 0.01) & (P[:, 2] < 4.6)).astype(float)
            ndl = ndl * vis * (0.6 + 0.4 * np.clip(1 - P[:, 1] / 9, 0, 1))
        else:
            if depth == 0:
                ts, ms, _ = trace(P + N * 1e-3, L, tmax=dist[:, 0] - 0.05)
                sh = (ms >= 0) & ~np.isin(mat_of(ms), ['globe', 'window', 'gold'])
                ndl = np.where(sh, ndl * 0.25, ndl)
        att = li * 6.0 / (dist[:, 0] ** 2 + 5.0)
        light += (ndl * att)[:, None] * np.array(lc)
        # specular
        Hh = L + V; Hh /= np.linalg.norm(Hh, axis=1, keepdims=True) + 1e-9
        spec = np.clip((N * Hh).sum(1), 0, 1) ** 60
        g = np.vectorize(lambda m: GLOSS.get(m, 0.0))(mats) if len(mats) else np.zeros(0)
        light += (spec * g * 2.2 * att)[:, None] * np.array(lc)
    # cheap AO from room corners
    ao = np.ones(len(P))
    for dd in (P[:, 0], W - P[:, 0], P[:, 1], H - P[:, 1], P[:, 2], D - P[:, 2]):
        dd = np.where(dd < 0.02, 9, dd)
        ao *= 1 - 0.28 * np.exp(-dd / 0.45)
    near_tub = (P[:, 0] > TUB_X) & (P[:, 1] < 0.05)
    ao *= np.where(near_tub, 1 - 0.3 * np.exp(-(P[:, 0] - TUB_X) / 0.3), 1)
    base_v = (P[:, 1] < 0.05) & (P[:, 0] > VX0 - .3) & (P[:, 0] < VX1 + .3) & (P[:, 2] > D - VD - .5)
    ao *= np.where(base_v, 0.75, 1)
    out = col * light * ao[:, None]
    emissive = np.isin(mats, ['globe', 'window'])
    out[emissive] = col[emissive] * 1.02
    if depth == 0:
        # reflections (mirror full, glossy partial)
        g = np.vectorize(lambda m: 0.92 if m == 'mirror' else GLOSS.get(m, 0.0))(mats)
        m = g > 0
        if m.any():
            idx = np.nonzero(m)[0]
            R = Dd[idx] - 2 * (Dd[idx] * N[idx]).sum(1, keepdims=True) * N[idx]
            rc = shade(S, P[idx] + N[idx] * 1e-3, R, depth=1)
            k = g[idx][:, None] * (1.0 if True else 1)
            k = np.where(mats[idx][:, None] == 'mirror', 0.9, k * 0.9)
            out[idx] = out[idx] * (1 - k) + rc * k
            out[idx[mats[idx] == 'mirror']] += 0.02
        # glass panel (clear, low-iron) at x = TUB_X
        with np.errstate(divide='ignore', invalid='ignore'):
            tg = (TUB_X - O[:, 0]) / Dd[:, 0]
        Pg = O + np.nan_to_num(tg)[:, None] * Dd
        hitg = (tg > 0) & (tg < t) & (Pg[:, 1] > TUB_H) & (Pg[:, 1] < 6.55) & (Pg[:, 2] > 0.05) & (Pg[:, 2] < D - 0.05)
        out[hitg] = out[hitg] * 0.93 + 0.045
        edge = hitg & ((np.abs(Pg[:, 2] - 2.75) < 0.012) | (np.abs(Pg[:, 2] - 2.35) < 0.012))
        out[edge] = out[edge] * 0.75 + 0.18
    return np.clip(out, 0, 1.2)

def render(S, out, w=1200, h=800, ss=2):
    build()
    cam = np.array(CAM)
    look = np.array(LOOK)
    f = look - cam; f /= np.linalg.norm(f)
    r = np.cross([0, 1, 0], f); r /= np.linalg.norm(r)
    u = np.cross(f, r)
    fov = np.radians(FOV); fpx = (w * ss / 2) / np.tan(fov / 2)
    ys, xs = np.mgrid[0:h * ss, 0:w * ss]
    dx = (xs - w * ss / 2 + 0.5) / fpx; dy = -(ys - h * ss / 2 + 0.5) / fpx
    Dd = f[None] + dx.reshape(-1, 1) * r[None] + dy.reshape(-1, 1) * u[None]
    Dd /= np.linalg.norm(Dd, axis=1, keepdims=True)
    O = np.repeat(cam[None], len(Dd), 0)
    res = np.zeros((len(Dd), 3))
    CH = 400000
    for i in range(0, len(Dd), CH):
        res[i:i + CH] = shade(S, O[i:i + CH], Dd[i:i + CH])
        print('.', end='', flush=True)
    img = res.reshape(h * ss, w * ss, 3)
    img = img / (1 + 0.25 * img)  # gentle tone map
    img = np.clip(img * 1.38, 0, 1) ** (1 / 1.05)
    im = Image.fromarray((img * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1, percent=40))
    im.save(out, quality=90); print(' ->', out)
