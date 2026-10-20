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
    if (id === 'ny' || id === 'ga' || id === 'tx') { g.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 70; i++) g.fillRect(r() * w, r() * h * 0.5, 1.2 * dpr, 1.2 * dpr); }
    if (id === 'fl' || id === 'ja') { // low sun
      const sx = w * 0.7, sy = h * 0.92, sg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.6);
      sg.addColorStop(0, 'rgba(255,220,150,.9)'); sg.addColorStop(0.15, 'rgba(255,170,100,.45)'); sg.addColorStop(1, 'rgba(255,120,80,0)');
      g.fillStyle = sg; g.fillRect(0, 0, w, h);
    }
    const base = h;
    if (id === 'ja') { // Blue Mountains
      for (const [amp, col, off] of [[0.42, '#2b3a63', 0], [0.30, '#1e2a48', 1.7]]) { g.fillStyle = col; g.beginPath(); g.moveTo(0, base); for (let x = 0; x <= w; x += 8) g.lineTo(x, base - h * amp * (0.55 + 0.25 * Math.sin(x / w * 7 + off) + 0.2 * Math.sin(x / w * 19 + off * 3))); g.lineTo(w, base); g.fill(); }
    } else { // skyline
      const towers = id === 'ny' ? 70 : id === 'tx' ? 40 : id === 'fl' ? 34 : 46;
      for (let layer = 0; layer < 2; layer++) {
        g.fillStyle = layer ? '#06080e' : (id === 'fl' ? '#3a2350' : '#0b1222');
        let x = -20;
        while (x < w) {
          const bw = (14 + r() * 40) * dpr, bh = h * (layer ? 0.12 + r() * 0.28 : 0.2 + r() * (id === 'ny' ? 0.55 : 0.38)) * (towers / 60 + 0.4);
          g.fillRect(x, base - bh, bw, bh);
          if (layer === 1 || r() < 0.6) { g.fillStyle = id === 'fl' ? 'rgba(255,210,170,.55)' : 'rgba(255,214,140,.55)'; for (let wy = base - bh + 4 * dpr; wy < base - 3 * dpr; wy += 5 * dpr) for (let wx = x + 3 * dpr; wx < x + bw - 3 * dpr; wx += 5 * dpr) if (r() < 0.22) g.fillRect(wx, wy, 1.6 * dpr, 2 * dpr); g.fillStyle = layer ? '#06080e' : (id === 'fl' ? '#3a2350' : '#0b1222'); }
          x += bw + r() * 6 * dpr;
        }
      }
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
    if (id === 'ny') { g.fillStyle = '#0b0f17'; for (let x = 0; x < w; x += (20 + r() * 50) * dpr) { const th = (16 + r() * 26) * dpr; g.beginPath(); g.arc(x, base - th * 0.5, th * 0.6, 0, 7); g.fill(); } }
  });
}

export function createScene(venueId) {
  const st = VENUE_STYLE[venueId] || VENUE_STYLE.ny;
  const S = { id: venueId, st, size: null, far: null, mid: null, particles: [], r: rng(99) };
  return S;
}

export function layout(W, H) {
  return { horizon: H * 0.37, roadTop: H * 0.37, farGround: H * 0.50, nearGround: H * 0.665, roadBottom: H * 0.71, farScale: 0.78 };
}

/**
 * Render background + road for the camera.
 * cam = { x: world metres at screen anchor, anchorX: px, ppm: px per metre at near lane, distM }
 */
export function drawScene(g, S, W, H, dpr, cam) {
  const L = layout(W, H), st = S.st;
  const key = W + 'x' + H + '@' + dpr;
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
  // rubber laid down near the start line
  if (cam.x < 120) { const s0 = cam.anchorX + (0 - cam.x) * cam.ppm; const rb = g.createLinearGradient(s0, 0, s0 + 60 * cam.ppm, 0); rb.addColorStop(0, 'rgba(0,0,0,.45)'); rb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rb; g.fillRect(s0 - 10 * cam.ppm, L.nearGround - 18, 70 * cam.ppm, 14); g.fillRect(s0 - 10 * cam.ppm, L.farGround - 12, 70 * cam.ppm, 9); }
  // lane lines
  const midLine = (L.farGround + L.nearGround) / 2 + 2;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(0, midLine, W, 2);
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
  const FT = 0.3048, marks = [[0, 'START'], [60 * FT, '60′'], [330 * FT, '330′'], [201.168, '⅛'], [1000 * FT, '1000′'], [402.336, '¼'], [804.672, '½']].filter(m => m[0] <= cam.distM + 1);
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
      g.fillStyle = '#15171c'; g.fillRect(x - 4, L.roadTop - H * 0.3, 8, H * 0.3 + (L.nearGround - L.roadTop)); g.fillRect(x - 4, L.roadTop - H * 0.3, 70, 22);
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
export function emitSmoke(S, x, y, amount, vx) {
  const n = Math.round(amount * 3);
  for (let i = 0; i < n; i++) S.particles.push({ x: x + (S.r() - 0.5) * 8, y: y - S.r() * 6, vx: vx * (0.1 + S.r() * 0.15) - 10 - S.r() * 30, vy: -10 - S.r() * 25, r: 6 + S.r() * 8, life: 0, max: 1.2 + S.r() * 1.2 });
  if (S.particles.length > 260) S.particles.splice(0, S.particles.length - 260);
}
export function drawSmoke(g, S, dt, scrollPx) {
  for (const p of S.particles) { p.life += dt; p.x += p.vx * dt - scrollPx; p.y += p.vy * dt; p.vy *= 0.98; p.r += 26 * dt; }
  S.particles = S.particles.filter(p => p.life < p.max);
  for (const p of S.particles) { const a = 0.35 * (1 - p.life / p.max); g.fillStyle = `rgba(215,215,220,${a.toFixed(3)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
}

function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const c = k => Math.max(0, Math.min(255, ((n >> k) & 255) + d)); return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0'); }
