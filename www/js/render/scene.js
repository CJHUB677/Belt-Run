// Side-on drag strip renderer: five venues with parallax layers (pre-rendered tiles), two lanes,
// distance boards, lamp posts, start/finish, tire smoke. World units are metres; everything is
// placed by real distance so speed on screen matches simulated speed.
import { rng } from '../sim/race.js';

export const VENUE_STYLE = {
  ny: { sky: ['#03060f', '#0b1530', '#1d2b4f'], glow: '#ffb35c', water: '#06101f', fog: 'rgba(120,150,220,.10)', road: '#1b1d22', wall: '#2c3038', lamp: '#ffd9a0', accent: '#ffcc33' },
  fl: { sky: ['#1c0f3a', '#6a2a6b', '#f07a4f'], glow: '#ff9a62', water: '#1d1e46', fog: 'rgba(255,140,120,.10)', road: '#24232a', wall: '#3a3440', lamp: '#ffe7b0', accent: '#2ee6d6' },
  ga: { sky: ['#05070a', '#121a22', '#22303a'], glow: '#9fd1ff', water: null, fog: 'rgba(160,200,255,.07)', road: '#1e1f21', wall: '#33352f', lamp: '#d8ecff', accent: '#ff5a3c' },
  tx: { sky: ['#07050c', '#1c1226', '#3b2236'], glow: '#ff7a3c', water: null, fog: 'rgba(255,140,90,.08)', road: '#202024', wall: '#3b3a3c', lamp: '#ffc070', accent: '#ff4d4d' },
  ja: { sky: ['#0f1d3a', '#3f5a8f', '#f3a35c'], glow: '#ffcf70', water: '#0f3550', fog: 'rgba(255,200,140,.08)', road: '#2a2724', wall: '#4a4036', lamp: '#fff0c0', accent: '#2fd36b' },
  det: { sky: ['#06070b', '#141922', '#2a2f38'], glow: '#ffd7a0', water: '#0a1220', fog: 'rgba(200,210,230,.10)', road: '#1c1d20', wall: '#3a2f2a', lamp: '#ffd6a0', accent: '#4aa8ff', win: 'rgba(255,214,150,.5)' },
  la: { sky: ['#1a1640', '#a0466e', '#ffb07a'], glow: '#ffb07a', water: null, fog: 'rgba(255,160,120,.10)', road: '#232226', wall: '#4a4440', lamp: '#ffe2b0', accent: '#ff6aa8', win: 'rgba(255,200,170,.55)' },
  lv: { sky: ['#05030c', '#170c2e', '#3a1650'], glow: '#ff4fd8', water: null, fog: 'rgba(255,80,220,.08)', road: '#1f1d24', wall: '#3a3346', lamp: '#ffd0f5', accent: '#ff4fd8', win: 'neon' },
  tk: { sky: ['#02040a', '#0b1426', '#1b2a44'], glow: '#7fd4ff', water: '#06121f', fog: 'rgba(120,200,255,.08)', road: '#1a1b1f', wall: '#2c3038', lamp: '#e0f4ff', accent: '#ff3355', win: 'rgba(210,235,255,.55)' },
  dxb: { sky: ['#2a1d3a', '#c0627a', '#ffcf8a'], glow: '#ffd59a', water: null, fog: 'rgba(255,200,150,.12)', road: '#2b2723', wall: '#5a4a38', lamp: '#fff2d0', accent: '#ffb000', win: 'rgba(255,230,180,.5)' },
};

function tile(w, h, draw) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); draw(c.getContext('2d'), c.width, c.height); return c; }

// ── far layer (skyline / hills / bridge), drawn once per venue & size ──
function farLayer(id, W, H, horizon, st, dpr) {
  const w = Math.round(W * 1.6 * dpr), h = Math.round(horizon * dpr);
  return tile(w, h, (g, w, h) => {
    const r = rng(id.charCodeAt(0) * 97 + 3);
    g.scale(1, 1);
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, st.sky[0]); sky.addColorStop(0.6, st.sky[1]); sky.addColorStop(1, st.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // stars on night venues
    if (['ny', 'ga', 'tx', 'det', 'lv', 'tk'].includes(id)) { g.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 70; i++) g.fillRect(r() * w, r() * h * 0.5, 1.2 * dpr, 1.2 * dpr); }
    if (['fl', 'ja', 'la', 'dxb'].includes(id)) { // low sun
      const sx = w * 0.7, sy = h * 0.92, sg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.6);
      sg.addColorStop(0, 'rgba(255,220,150,.9)'); sg.addColorStop(0.15, 'rgba(255,170,100,.45)'); sg.addColorStop(1, 'rgba(255,120,80,0)');
      g.fillStyle = sg; g.fillRect(0, 0, w, h);
    }
    const base = h;
    if (id === 'ja') { // Blue Mountains
      for (const [amp, col, off] of [[0.42, '#2b3a63', 0], [0.30, '#1e2a48', 1.7]]) { g.fillStyle = col; g.beginPath(); g.moveTo(0, base); for (let x = 0; x <= w; x += 8) g.lineTo(x, base - h * amp * (0.55 + 0.25 * Math.sin(x / w * 7 + off) + 0.2 * Math.sin(x / w * 19 + off * 3))); g.lineTo(w, base); g.fill(); }
    } else { // skyline
      if (id === 'la' || id === 'lv' || id === 'dxb') { // hills / desert mountains / dunes behind the city
        const cols = id === 'la' ? ['#5a3a5e', '#3a2a48'] : id === 'lv' ? ['#2a1638', '#1a0e28'] : ['#b07a5a', '#8a5a44'];
        cols.forEach((col, j) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, base); for (let x = 0; x <= w; x += 8) g.lineTo(x, base - h * (id === 'dxb' ? 0.12 : 0.3 - j * 0.08) * (0.6 + 0.25 * Math.sin(x / w * (5 + j * 4) + j) + 0.15 * Math.sin(x / w * 23 + j * 2))); g.lineTo(w, base); g.fill(); });
      }
      const towers = id === 'ny' || id === 'tk' ? 70 : id === 'tx' ? 40 : id === 'fl' || id === 'la' ? 34 : id === 'dxb' ? 30 : 46;
      for (let layer = 0; layer < 2; layer++) {
        g.fillStyle = layer ? '#06080e' : (id === 'fl' ? '#3a2350' : '#0b1222');
        let x = -20;
        while (x < w) {
          const bw = (14 + r() * 40) * dpr, bh = h * (layer ? 0.12 + r() * 0.28 : 0.2 + r() * (id === 'ny' ? 0.55 : 0.38)) * (towers / 60 + 0.4);
          g.fillRect(x, base - bh, bw, bh);
          if (layer === 1 || r() < 0.6) { const neon = st.win === 'neon'; g.fillStyle = st.win && !neon ? st.win : id === 'fl' ? 'rgba(255,210,170,.55)' : 'rgba(255,214,140,.55)'; for (let wy = base - bh + 4 * dpr; wy < base - 3 * dpr; wy += 5 * dpr) for (let wx = x + 3 * dpr; wx < x + bw - 3 * dpr; wx += 5 * dpr) if (r() < 0.22) { if (neon) g.fillStyle = ['#ff4fd8', '#4fe0ff', '#ffd84f', '#ff7a4f'][(r() * 4) | 0]; g.fillRect(wx, wy, 1.6 * dpr, 2 * dpr); } g.fillStyle = layer ? '#06080e' : (id === 'fl' ? '#3a2350' : '#0b1222'); }
          x += bw + r() * 6 * dpr;
        }
      }
    }
    if (id === 'det') { // round glass towers by the river + smokestacks
      g.fillStyle = '#121a26'; const cx = w * 0.42;
      for (const [dx, tw, th] of [[0, 34, 0.78], [-46, 22, 0.58], [46, 22, 0.58]]) { g.fillRect(cx + dx * dpr - tw * dpr / 2, base - h * th, tw * dpr, h * th); g.fillStyle = 'rgba(160,210,255,.35)'; for (let y = base - h * th + 6; y < base; y += 6 * dpr) g.fillRect(cx + dx * dpr - tw * dpr / 2 + 2, y, tw * dpr - 4, 1); g.fillStyle = '#121a26'; }
      g.fillStyle = '#1b1414'; for (const sx of [w * 0.08, w * 0.12, w * 0.8]) { g.fillRect(sx, base - h * 0.5, 8 * dpr, h * 0.5); g.fillStyle = 'rgba(200,200,210,.12)'; g.beginPath(); g.arc(sx + 4 * dpr, base - h * 0.56, 14 * dpr, 0, 7); g.fill(); g.fillStyle = '#1b1414'; }
    }
    if (id === 'lv') { // observation tower with pod + spotlight beam
      const tx = w * 0.66; g.fillStyle = '#140c22'; g.fillRect(tx - 4 * dpr, base - h * 0.9, 8 * dpr, h * 0.9);
      g.beginPath(); g.ellipse(tx, base - h * 0.84, 22 * dpr, 9 * dpr, 0, 0, 7); g.fill(); g.fillStyle = '#ff4fd8'; g.fillRect(tx - 20 * dpr, base - h * 0.84, 40 * dpr, 2 * dpr);
      const bm = g.createLinearGradient(0, base, 0, 0); bm.addColorStop(0, 'rgba(255,255,255,.25)'); bm.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = bm; g.beginPath(); g.moveTo(w * 0.3 - 6, base - h * 0.4); g.lineTo(w * 0.3 + 6, base - h * 0.4); g.lineTo(w * 0.3 + 30 * dpr, 0); g.lineTo(w * 0.3 - 30 * dpr, 0); g.fill();
    }
    if (id === 'tk') { // red-and-white lattice tower, blinking aircraft lights
      const tx = w * 0.3, th = h * 0.85; g.strokeStyle = '#ff5533'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.moveTo(tx - 24 * dpr, base); g.lineTo(tx, base - th); g.lineTo(tx + 24 * dpr, base); g.stroke();
      for (let k = 1; k < 9; k++) { const y = base - th * k / 9, hw = 24 * dpr * (1 - k / 9); g.strokeStyle = k % 2 ? '#ff5533' : '#f2f2f2'; g.beginPath(); g.moveTo(tx - hw, y); g.lineTo(tx + hw, y); g.stroke(); }
      g.fillStyle = '#ff2a2a'; for (let i = 0; i < 26; i++) g.fillRect(r() * w, base - h * (0.3 + r() * 0.5), 2 * dpr, 2 * dpr);
    }
    if (id === 'dxb') { // super-tall tapered tower
      const tx = w * 0.58, th = h * 0.98; g.fillStyle = '#3a2a3a';
      g.beginPath(); g.moveTo(tx - 22 * dpr, base); g.lineTo(tx - 8 * dpr, base - th * 0.6); g.lineTo(tx - 3 * dpr, base - th * 0.85); g.lineTo(tx, base - th); g.lineTo(tx + 3 * dpr, base - th * 0.85); g.lineTo(tx + 8 * dpr, base - th * 0.6); g.lineTo(tx + 22 * dpr, base); g.fill();
      g.fillStyle = 'rgba(255,230,180,.45)'; for (let y = base - th * 0.85; y < base; y += 5 * dpr) g.fillRect(tx - 2 * dpr, y, 4 * dpr, 1.5 * dpr);
    }
    if (id === 'ny') { // suspension bridge
      const y0 = base - h * 0.18, t1 = w * 0.22, t2 = w * 0.62, th = h * 0.55;
      g.strokeStyle = '#8ea3c8'; g.lineWidth = 1.2 * dpr; g.fillStyle = '#6f83a8';
      for (const tx of [t1, t2]) { g.fillRect(tx - 3 * dpr, y0 - th, 6 * dpr, th); g.fillRect(tx - 6 * dpr, y0 - th * 0.62, 12 * dpr, 2 * dpr); }
      g.beginPath(); g.moveTo(0, y0 - th * 0.4); g.quadraticCurveTo((t1) / 2, y0 + 4, t1, y0 - th); g.quadraticCurveTo((t1 + t2) / 2, y0 + 8, t2, y0 - th); g.quadraticCurveTo(t2 + (w - t2) / 2, y0 + 4, w, y0 - th * 0.4); g.stroke();
      g.fillStyle = '#2a3958'; g.fillRect(0, y0, w, 3 * dpr);
      g.fillStyle = '#ffdca0'; for (let x = 0; x < w; x += 9 * dpr) g.fillRect(x, y0 - 1.5 * dpr, 1.6 * dpr, 1.6 * dpr);
    }
    // haze at horizon
    const hz = g.createLinearGradient(0, base - h * 0.25, 0, base); hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, st.fog.replace(/[\d.]+\)$/, '.35)'));
    g.fillStyle = hz; g.fillRect(0, base - h * 0.25, w, h * 0.25);
  });
}

// ── mid layer: palms, freight cars, highway ramps, cranes… (repeats every tile width) ──
function midLayer(id, W, H, horizon, st, dpr) {
  const w = Math.round(W * 1.4 * dpr), h = Math.round(horizon * 1.18 * dpr);
  return tile(w, h, (g, w, h) => {
    const r = rng(id.charCodeAt(0) * 31 + 11), base = h;
    if (st.water) { const wy = h * 0.86; g.fillStyle = st.water; g.fillRect(0, wy, w, h - wy); g.fillStyle = 'rgba(255,200,140,.18)'; for (let i = 0; i < 90; i++) g.fillRect(r() * w, wy + r() * (h - wy), (6 + r() * 20) * dpr, 1 * dpr); }
    const palm = (x, s) => {
      g.strokeStyle = '#140d18'; g.lineWidth = 3 * dpr * s; g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + 8 * dpr * s, base - 40 * dpr * s, x + 4 * dpr * s, base - 80 * dpr * s); g.stroke();
      g.fillStyle = '#140d18'; const cx = x + 4 * dpr * s, cy = base - 80 * dpr * s;
      for (let a = 0; a < 7; a++) { const ang = -Math.PI / 2 + (a - 3) * 0.48; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(ang) * 26 * dpr * s, cy + Math.sin(ang) * 18 * dpr * s - 4, cx + Math.cos(ang) * 40 * dpr * s, cy + Math.sin(ang) * 14 * dpr * s + 14 * dpr * s); g.lineTo(cx + Math.cos(ang) * 30 * dpr * s, cy + Math.sin(ang) * 14 * dpr * s + 4 * dpr * s); g.fill(); }
    };
    if (id === 'fl' || id === 'ja') for (let x = 10 * dpr; x < w; x += (60 + r() * 120) * dpr) palm(x, 0.7 + r() * 0.5);
    if (id === 'ja') { g.fillStyle = '#1a2230'; for (const cx of [w * 0.3, w * 0.75]) { g.fillRect(cx, base - 110 * dpr, 6 * dpr, 110 * dpr); g.fillRect(cx - 40 * dpr, base - 110 * dpr, 90 * dpr, 6 * dpr); g.fillRect(cx + 40 * dpr, base - 104 * dpr, 2 * dpr, 40 * dpr); } }
    if (id === 'ga') { // freight cars + light towers
      for (let x = 0; x < w; x += 92 * dpr) { g.fillStyle = ['#3b2a22', '#26323d', '#41301c', '#2b2f2a'][(r() * 4) | 0]; g.fillRect(x, base - 34 * dpr, 86 * dpr, 28 * dpr); g.fillStyle = '#0a0a0a'; g.fillRect(x, base - 6 * dpr, 86 * dpr, 6 * dpr); g.fillStyle = 'rgba(255,255,255,.06)'; for (let k = 0; k < 6; k++) g.fillRect(x + 6 * dpr + k * 13 * dpr, base - 32 * dpr, 2 * dpr, 24 * dpr); }
      g.fillStyle = '#1b1f24'; for (const x of [w * 0.15, w * 0.55, w * 0.9]) { g.fillRect(x, base - 130 * dpr, 4 * dpr, 130 * dpr); g.fillStyle = '#d8ecff'; g.fillRect(x - 10 * dpr, base - 134 * dpr, 24 * dpr, 6 * dpr); g.fillStyle = '#1b1f24'; }
    }
    if (id === 'tx') { // stacked interchange ramps
      for (const [yy, ph] of [[0.45, 0], [0.62, 1.4], [0.78, 2.6]]) {
        g.strokeStyle = '#4a4648'; g.lineWidth = 9 * dpr; g.beginPath();
        for (let x = 0; x <= w; x += 10) { const y = base - h * yy + Math.sin(x / w * Math.PI * 2 + ph) * h * 0.08; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        g.fillStyle = 'rgba(255,190,110,.8)'; for (let x = 0; x <= w; x += 22 * dpr) g.fillRect(x, base - h * yy + Math.sin(x / w * Math.PI * 2 + ph) * h * 0.08 - 7 * dpr, 2 * dpr, 2 * dpr);
      }
      g.fillStyle = '#2c2a2c'; for (let x = 30 * dpr; x < w; x += 140 * dpr) g.fillRect(x, base - h * 0.5, 10 * dpr, h * 0.5);
    }
    if (id === 'la' || id === 'dxb') for (let x = 10 * dpr; x < w; x += (80 + r() * 140) * dpr) palm(x, 0.8 + r() * 0.5);
    if (id === 'la') { // concrete viaduct arches over the river
      g.fillStyle = '#3a3036'; g.fillRect(0, base - 46 * dpr, w, 8 * dpr);
      for (let x = 0; x < w; x += 70 * dpr) { g.fillRect(x, base - 40 * dpr, 6 * dpr, 40 * dpr); g.strokeStyle = '#3a3036'; g.lineWidth = 4 * dpr; g.beginPath(); g.arc(x + 35 * dpr, base - 38 * dpr, 30 * dpr, Math.PI, 0); g.stroke(); }
    }
    if (id === 'det') { // brick factory blocks with lit windows
      for (let x = 0; x < w; x += (110 + r() * 60) * dpr) { const bw = (90 + r() * 40) * dpr, bh = (40 + r() * 34) * dpr; g.fillStyle = '#3a2420'; g.fillRect(x, base - bh, bw, bh); g.fillStyle = 'rgba(255,200,120,.35)'; for (let wx = x + 6 * dpr; wx < x + bw - 8 * dpr; wx += 12 * dpr) g.fillRect(wx, base - bh + 8 * dpr, 6 * dpr, 10 * dpr); g.fillStyle = '#2a1a16'; for (let k = 0; k < 4; k++) g.fillRect(x + k * bw / 4, base - bh - 8 * dpr, bw / 4 - 2 * dpr, 8 * dpr); }
    }
    if (id === 'lv') { // neon signs and billboards
      for (let x = 20 * dpr; x < w; x += (120 + r() * 80) * dpr) { const col = ['#ff4fd8', '#4fe0ff', '#ffd84f', '#7aff4f'][(r() * 4) | 0], bw = (50 + r() * 40) * dpr, bh = (24 + r() * 16) * dpr, y = base - (60 + r() * 40) * dpr;
        g.fillStyle = '#12091c'; g.fillRect(x + bw / 2 - 3 * dpr, y + bh, 6 * dpr, base - y - bh); g.fillStyle = '#0c0614'; g.fillRect(x, y, bw, bh); g.strokeStyle = col; g.lineWidth = 2 * dpr; g.strokeRect(x + 3, y + 3, bw - 6, bh - 6); g.shadowColor = col; g.shadowBlur = 10 * dpr; g.fillStyle = col; g.fillRect(x + 8 * dpr, y + bh / 2 - 2 * dpr, bw - 16 * dpr, 4 * dpr); g.shadowBlur = 0; }
    }
    if (id === 'tk') { // elevated expressway loop with neon edge lights
      g.strokeStyle = '#2a2e38'; g.lineWidth = 10 * dpr; g.beginPath(); g.ellipse(w * 0.5, base - h * 0.45, w * 0.32, h * 0.22, 0, 0, 7); g.stroke();
      g.fillStyle = 'rgba(120,220,255,.85)'; for (let a = 0; a < Math.PI * 2; a += 0.05) g.fillRect(w * 0.5 + Math.cos(a) * w * 0.32, base - h * 0.45 + Math.sin(a) * h * 0.22 - 6 * dpr, 2 * dpr, 2 * dpr);
      g.fillStyle = '#20232b'; for (let x = 40 * dpr; x < w; x += 120 * dpr) g.fillRect(x, base - h * 0.4, 12 * dpr, h * 0.4);
    }
    if (id === 'dxb') { g.fillStyle = '#c99a6a'; g.beginPath(); g.moveTo(0, base); for (let x = 0; x <= w; x += 10) g.lineTo(x, base - 18 * dpr - Math.sin(x / w * 9) * 8 * dpr); g.lineTo(w, base); g.fill(); }
    if (id === 'ny') { g.fillStyle = '#0b0f17'; for (let x = 0; x < w; x += (20 + r() * 50) * dpr) { const th = (16 + r() * 26) * dpr; g.beginPath(); g.arc(x, base - th * 0.5, th * 0.6, 0, 7); g.fill(); } }
  });
}

export function createScene(venueId) {
  const st = VENUE_STYLE[venueId] || VENUE_STYLE.ny;
  const S = { id: venueId, st, size: null, far: null, mid: null, particles: [], marks: [], r: rng(99) };
  return S;
}

// Lanes: index 0 is the near (player) lane. Two lanes keep the classic look; three or four lanes
// squeeze the far lanes toward the wall and draw them smaller for depth.
const LANE_SETS = {
  1: [[0.665, 1]], 2: [[0.665, 1], [0.50, 0.78]],
  3: [[0.665, 1], [0.555, 0.82], [0.47, 0.68]],
  4: [[0.665, 1], [0.585, 0.86], [0.515, 0.74], [0.455, 0.64]],
};
export function layout(W, H, n = 2) {
  const set = LANE_SETS[Math.max(1, Math.min(4, n))] || LANE_SETS[2];
  const lanes = set.map(([g, scale]) => ({ ground: H * g, scale }));
  const top = n >= 3 ? 0.35 : 0.37;
  return { horizon: H * top, roadTop: H * top, farGround: (lanes[1] || { ground: H * 0.5 }).ground, nearGround: lanes[0].ground, roadBottom: H * 0.71, farScale: (lanes[1] || { scale: 0.78 }).scale, lanes };
}

/**
 * Render background + road for the camera.
 * cam = { x: world metres at screen anchor, anchorX: px, ppm: px per metre at near lane, distM }
 */
export function drawScene(g, S, W, H, dpr, cam) {
  const L = layout(W, H, cam.lanes || 2), st = S.st;
  const key = W + 'x' + H + '@' + dpr + '#' + L.roadTop;
  if (S.size !== key) { S.size = key; S.far = farLayer(S.id, W, H, L.roadTop, st, dpr); S.mid = midLayer(S.id, W, H, L.roadTop * 0.62, st, dpr); }
  const cx = cam.x * cam.ppm;
  // far (0.03× parallax)
  const fw = S.far.width / dpr, fo = -((cx * 0.03) % fw);
  for (let x = fo; x < W; x += fw) g.drawImage(S.far, x, 0, fw, L.roadTop);
  // mid (0.22×)
  const mw = S.mid.width / dpr, mh = S.mid.height / dpr, mo = -((cx * 0.22) % mw);
  for (let x = mo - mw; x < W; x += mw) g.drawImage(S.mid, x, L.roadTop - mh, mw, mh);
  // far wall + lamp posts (moving at far-lane depth)
  const fp = cam.ppm * L.farScale * 0.9;
  g.fillStyle = st.wall; g.fillRect(0, L.roadTop - 14, W, 14);
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, L.roadTop - 14, W, 2);
  const lampSp = 36, sx0 = cam.anchorX - cam.x * fp;
  const first = Math.floor((-sx0) / (lampSp * fp)) - 1;
  for (let i = first; i < first + W / (lampSp * fp) + 3; i++) {
    const x = sx0 + i * lampSp * fp;
    g.fillStyle = '#1a1c22'; g.fillRect(x - 1.5, L.roadTop - 14 - H * 0.24, 3, H * 0.24);
    g.fillRect(x - 1.5, L.roadTop - 14 - H * 0.24, 22, 3);
    const lg = g.createRadialGradient(x + 20, L.roadTop + 6, 0, x + 20, L.roadTop + 6, H * 0.22);
    lg.addColorStop(0, st.lamp + '40'); lg.addColorStop(1, st.lamp + '00'); g.fillStyle = lg; g.fillRect(x - H * 0.2, L.roadTop - 10, H * 0.45, H * 0.3);
    g.fillStyle = st.lamp; g.fillRect(x + 16, L.roadTop - 12 - H * 0.24, 9, 3);
  }
  // road
  const rg = g.createLinearGradient(0, L.roadTop, 0, H); rg.addColorStop(0, shade(st.road, -8)); rg.addColorStop(0.5, st.road); rg.addColorStop(1, shade(st.road, -14));
  g.fillStyle = rg; g.fillRect(0, L.roadTop, W, H - L.roadTop);
  // asphalt texture (scrolling at near-lane speed)
  g.fillStyle = 'rgba(255,255,255,.035)';
  const tex = 3.1, t0 = Math.floor((cam.x - cam.anchorX / cam.ppm) / tex);
  for (let i = t0; i < t0 + W / (tex * cam.ppm) + 2; i++) { const x = cam.anchorX + (i * tex - cam.x) * cam.ppm; const h = ((i * 7919) % 13) / 13; g.fillRect(x, L.roadTop + 8 + h * (L.roadBottom - L.roadTop), 2 + h * 10, 1); }
  // fresh rubber from this run's wheelspin (world-space streaks under the driven wheels)
  for (const mk of S.marks) {
    const ln = L.lanes[mk.lane] || L.lanes[L.lanes.length - 1], sc = cam.ppm * ln.scale, gy = ln.ground;
    const ax = cam.anchorX + (mk.x0 - cam.x) * sc, bx = cam.anchorX + (mk.x1 - cam.x) * sc;
    if (bx < -20 || ax > W + 20) continue;
    g.fillStyle = `rgba(5,5,6,${Math.min(0.75, mk.a).toFixed(2)})`; g.fillRect(Math.min(ax, bx), gy - 3, Math.abs(bx - ax) + 1, mk.lane ? 3 : 4);
  }
  // rubber laid down near the start line
  if (cam.x < 120) { const s0 = cam.anchorX + (0 - cam.x) * cam.ppm; const rb = g.createLinearGradient(s0, 0, s0 + 60 * cam.ppm, 0); rb.addColorStop(0, 'rgba(0,0,0,.45)'); rb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rb; for (const ln of L.lanes) g.fillRect(s0 - 10 * cam.ppm, ln.ground - 18 * ln.scale, 70 * cam.ppm, 14 * ln.scale); }
  // lane lines
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 1; i < L.lanes.length; i++) { const y = (L.lanes[i - 1].ground + L.lanes[i].ground) / 2 + 2 * L.lanes[i].scale; g.fillRect(0, y, W, i === 1 ? 2 : 1.5); }
  g.fillStyle = 'rgba(255,214,0,.6)'; g.fillRect(0, L.roadTop + 3, W, 2); g.fillRect(0, L.roadBottom - 2, W, 2);
  // foreground: curb, gravel and a concrete barrier along the near side (scrolls with the road)
  g.fillStyle = '#d8d8d8'; g.fillRect(0, L.roadBottom, W, 4);
  const curb = 2.0, c0 = Math.floor((cam.x - cam.anchorX / cam.ppm) / curb);
  g.fillStyle = '#b8262b'; for (let i = c0; i < c0 + W / (curb * cam.ppm) + 2; i++) if (i % 2 === 0) g.fillRect(cam.anchorX + (i * curb - cam.x) * cam.ppm, L.roadBottom, curb * cam.ppm, 4);
  const fg = g.createLinearGradient(0, L.roadBottom + 4, 0, H); fg.addColorStop(0, shade(st.wall, -6)); fg.addColorStop(1, '#050506');
  g.fillStyle = fg; g.fillRect(0, L.roadBottom + 4, W, H - L.roadBottom - 4);
  g.fillStyle = 'rgba(255,255,255,.05)'; const bs = 4.0, b0 = Math.floor((cam.x - cam.anchorX / (cam.ppm * 1.15)) / bs);
  for (let i = b0; i < b0 + W / (bs * cam.ppm * 1.15) + 2; i++) g.fillRect(cam.anchorX + (i * bs - cam.x) * cam.ppm * 1.15, L.roadBottom + 10, 2, H);
  // marks: start, 60ft, 330ft, 1/8, 1000ft, finish
  const FT = 0.3048, marks = [[0, 'START'], [60 * FT, '60′'], [330 * FT, '330′'], [201.168, '⅛'], [1000 * FT, '1000′'], [402.336, '¼'], [804.672, '½'], [1207.008, '¾'], [1609.344, '1 MI']].filter(m => m[0] <= cam.distM + 1);
  for (const [d, label] of marks) {
    const x = cam.anchorX + (d - cam.x) * cam.ppm;
    if (x < -80 || x > W + 80) continue;
    const isFinish = Math.abs(d - cam.distM) < 0.5;
    if (d === 0) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(x - 2, L.roadTop + 4); g.lineTo(x + 2, L.roadTop + 4); g.lineTo(x + 2, L.roadBottom - 2); g.lineTo(x - 2, L.roadBottom - 2); g.fill(); }
    else if (isFinish) {
      // checkered strip slanted across both lanes
      const sq = 6;
      for (let y = L.roadTop + 4; y < L.roadBottom - 2; y += sq) {
        const off = 0;
        for (let k = 0; k < 3; k++) { g.fillStyle = ((y / sq | 0) + k) % 2 ? '#fff' : '#111'; g.fillRect(x + off + k * sq, y, sq, sq); }
      }
    } else { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, L.roadTop + 4, 3, L.roadBottom - L.roadTop - 6); }
    // board on the far wall
    g.fillStyle = isFinish ? st.accent : '#e8e8e8'; g.fillRect(x - 16, L.roadTop - 46, 32, 18);
    g.fillStyle = '#111'; g.font = '800 12px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.fillText(isFinish ? 'FINISH' : label, x, L.roadTop - 33);
    g.fillStyle = '#222'; g.fillRect(x - 1, L.roadTop - 28, 2, 14);
    if (isFinish) { // timing gantry
      g.fillStyle = '#15171c'; g.fillRect(x - 4, L.roadTop - H * 0.3, 8, H * 0.3 + 6); g.fillRect(x - 4, L.roadTop - H * 0.3, 70, 22);
      g.fillStyle = st.accent; g.fillRect(x + 4, L.roadTop - H * 0.3 + 4, 58, 14);
    }
  }
  g.textAlign = 'left';
}

// Christmas tree near the start line (world x = -3 m, between lanes)
export function drawTree(g, W, H, cam, lights, phase) {
  const L = layout(W, H), x = cam.anchorX + (-4 - cam.x) * cam.ppm;
  if (x < -40 || x > W + 40) return;
  const top = L.roadTop - H * 0.34, w = 18;
  g.fillStyle = '#16181d'; g.fillRect(x - 3, top + 10, 6, (L.farGround + L.nearGround) / 2 - top - 10);
  g.fillStyle = '#0d0e11'; g.fillRect(x - w / 2, top, w, H * 0.26);
  const bulbs = [['pre', '#ffd84a'], ['stage', '#ffd84a'], [3, '#ff9a1f'], [2, '#ff9a1f'], [1, '#ff9a1f'], ['go', '#2bff6a']];
  bulbs.forEach(([k, col], i) => {
    const on = k === 'pre' || k === 'stage' ? phase !== 'staging' || true : k === 'go' ? phase === 'run' || phase === 'finished' : phase === 'countdown' && lights <= k;
    const y = top + 8 + i * (H * 0.26 - 12) / 6;
    g.fillStyle = on ? col : '#2b2b2b'; g.beginPath(); g.arc(x, y + 4, 4.5, 0, 7); g.fill();
    if (on) { g.fillStyle = col + '55'; g.beginPath(); g.arc(x, y + 4, 9, 0, 7); g.fill(); }
  });
}

// Tire smoke particles
export function emitSmoke(S, x, y, amount, vx, scale = 1) {
  const n = Math.round(amount * 5);
  for (let i = 0; i < n; i++) S.particles.push({ x: x + (S.r() - 0.5) * 10 * scale, y: y - S.r() * 6 * scale, vx: vx * (0.08 + S.r() * 0.12) - 10 - S.r() * 40, vy: -6 - S.r() * 22, r: (7 + S.r() * 10) * scale, grow: (22 + S.r() * 26) * scale, life: 0, max: 1.6 + S.r() * 1.8, shade: 200 + (S.r() * 40 | 0) });
  if (S.particles.length > 420) S.particles.splice(0, S.particles.length - 420);
}
// Rubber streak: extend the last mark in this lane if it's continuous, else start a new one.
export function addMark(S, lane, x0, x1, a) {
  const last = S.marks.findLast?.(m => m.lane === lane) || [...S.marks].reverse().find(m => m.lane === lane);
  if (last && Math.abs(last.x1 - x0) < 0.6) { last.x1 = x1; last.a = Math.min(0.75, (last.a + a) / 2 + 0.02); }
  else S.marks.push({ lane, x0, x1, a });
  if (S.marks.length > 200) S.marks.shift();
}
export function drawSmoke(g, S, dt, scrollPx) {
  for (const p of S.particles) { p.life += dt; p.x += p.vx * dt - scrollPx; p.y += p.vy * dt; p.vy *= 0.985; p.vx *= 0.99; p.r += (p.grow || 26) * dt; }
  S.particles = S.particles.filter(p => p.life < p.max);
  for (const p of S.particles) {
    const k = p.life / p.max, a = 0.42 * (1 - k) * Math.min(1, p.life * 8);
    const c = p.shade || 215, rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    rg.addColorStop(0, `rgba(${c},${c},${c + 5},${a.toFixed(3)})`); rg.addColorStop(1, `rgba(${c},${c},${c + 5},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
  }
}

function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const c = k => Math.max(0, Math.min(255, ((n >> k) & 255) + d)); return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0'); }
