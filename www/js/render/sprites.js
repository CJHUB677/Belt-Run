// Car artwork: the supplied side-view images, trimmed to their opaque bounds, with the wheels cut
// out as discs (from measured wheel centres/radii) so they can rotate. Body pitches on a
// spring-damper (squat on launch, nose dip on shift), shadows are drawn under each tire.
const sprites = new Map();
const listeners = new Set();
export const onSpriteLoad = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function loadSprite(car) {
  let s = sprites.get(car.id);
  if (s) return s;
  s = { image: null, w: 0, h: 0, wheels: null, error: false, ready: false, promise: null };
  sprites.set(car.id, s);
  s.promise = new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const f = 320 / img.naturalWidth, sw = 320, sh = Math.round(img.naturalHeight * f);
      const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
      const g = sc.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, sw, sh);
      const px = g.getImageData(0, 0, sw, sh).data;
      let l = sw, r = 0, t = sh, b = 0;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (px[(y * sw + x) * 4 + 3] > 64) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
      if (r < l) { s.error = true; resolve(s); return; }
      const left = Math.max(0, (l - 1) / f), top = Math.max(0, (t - 1) / f);
      const width = Math.min(img.naturalWidth - left, (r - l + 3) / f), height = Math.min(img.naturalHeight - top, (b - t + 3) / f);
      const out = document.createElement('canvas');
      out.width = Math.min(900, Math.round(width)); out.height = Math.max(1, Math.round(out.width * height / width));
      const og = out.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(img, left, top, width, height, 0, 0, out.width, out.height);
      s.image = out; s.w = out.width; s.h = out.height;
      // Wheel calibration is in fractions of the original 1536×1024 image (scale-invariant).
      if (car.wheels) {
        const kx = out.width / width, ky = out.height / height;
        s.wheels = car.wheels.map(([x, y, rr]) => ({ x: (x * img.naturalWidth - left) * kx, y: (y * img.naturalHeight - top) * ky, r: rr * img.naturalHeight * ky }));
      }
      s.ready = true;
      for (const fn of listeners) try { fn(car.id); } catch {}
      resolve(s);
    };
    img.onerror = () => { s.error = true; resolve(s); };
    img.src = car.image;
  });
  return s;
}

// Pixels-per-metre that makes this car's wheelbase match its real wheelbase.
export function spriteMetrics(car, s) {
  if (!s?.ready) return null;
  const wb = s.wheels ? Math.abs(s.wheels[1].x - s.wheels[0].x) : s.w * 0.6;
  return { wbPx: wb, lengthM: s.w / wb * car.phys.WB };
}

// ───────────── customization: paint, wheel finish, stance, underglow, nitrous flame ─────────────
export const PAINTS = {
  factory: { name: 'Factory' }, black: { name: 'Gloss Black', neutral: 'black' }, white: { name: 'Pearl White', neutral: 'white' },
  silver: { name: 'Liquid Silver', neutral: 'silver' }, red: { name: 'Race Red', hue: 356, sat: 0.82 }, orange: { name: 'Sunset Orange', hue: 24, sat: 0.9 },
  yellow: { name: 'Speed Yellow', hue: 50, sat: 0.92 }, lime: { name: 'Acid Lime', hue: 88, sat: 0.85 }, green: { name: 'British Green', hue: 150, sat: 0.55 },
  teal: { name: 'Miami Teal', hue: 178, sat: 0.7 }, blue: { name: 'Estoril Blue', hue: 218, sat: 0.8 }, purple: { name: 'Plum Crazy', hue: 278, sat: 0.65 },
  pink: { name: 'Hot Pink', hue: 325, sat: 0.8 },
};
export const WHEELS = {
  factory: { name: 'Factory' }, black: { name: 'Gloss Black' }, gold: { name: 'Gold', hue: 45, sat: 0.75 }, bronze: { name: 'Bronze', hue: 30, sat: 0.45 },
  chrome: { name: 'Chrome' }, red: { name: 'Candy Red', hue: 355, sat: 0.8 },
};
export const GLOWS = { off: null, blue: '#3d8bff', purple: '#b04dff', green: '#3dff7a', red: '#ff3b3b', gold: '#ffb000' };
export const FLAMES = { blue: ['rgba(210,235,255,.95)', 'rgba(80,150,255,.75)', 'rgba(40,80,255,0)'], purple: ['rgba(245,220,255,.95)', 'rgba(185,90,255,.75)', 'rgba(120,40,255,0)'], green: ['rgba(225,255,225,.95)', 'rgba(80,255,130,.7)', 'rgba(20,200,80,0)'], red: ['rgba(255,235,210,.95)', 'rgba(255,90,40,.75)', 'rgba(255,40,0,0)'] };
export const STANCES = { stock: { name: 'Stock', drop: 0 }, lowered: { name: 'Lowered', drop: 1 }, slammed: { name: 'Slammed', drop: 2 } };
export const defaultLook = () => ({ paint: 'factory', wheels: 'factory', stance: 'stock', glow: 'off', flame: 'blue' });

function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) { const v = l * 255; return [v, v, v]; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)]; }
// Is this car's paint colorful (hue-shift the paint) or black/white/grey (colorize the body)?
function paintProfile(s) {
  if (s.profile) return s.profile;
  const d = s.image.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.w, s.h).data;
  let n = 0, sat = 0, hx = 0, hy = 0;
  for (let i = 0; i < d.length; i += 16) { if (d[i + 3] < 200) continue; const [h, ss, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); if (l < 0.12 || l > 0.92) continue; n++; sat += ss; if (ss > 0.3) { hx += Math.cos(h * Math.PI / 180); hy += Math.sin(h * Math.PI / 180); } }
  s.profile = { colorful: n && sat / n > 0.22, hue: Math.atan2(hy, hx) * 180 / Math.PI };
  return s.profile;
}
function recolor(src, fn) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const o = fn(d[i], d[i + 1], d[i + 2]); if (o) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; } }
  g.putImageData(im, 0, 0); return c;
}
const looks = new Map();
// Body image (wheels cut out, so lowered bodies tuck over the tires) and wheel image for a look.
function lookImages(car, s, look) {
  const key = car.id + '|' + look.paint + '|' + look.wheels;
  if (looks.has(key)) return looks.get(key);
  const P = PAINTS[look.paint] || PAINTS.factory, Wf = WHEELS[look.wheels] || WHEELS.factory;
  let body = s.image;
  if (look.paint !== 'factory') {
    const prof = paintProfile(s);
    body = recolor(s.image, (r, g, b) => {
      const [h, ss, l] = rgb2hsl(r, g, b);
      const isPaint = prof.colorful ? ss > 0.22 && l > 0.08 && l < 0.95 : ss < 0.3 && l > 0.13 && l < 0.9;
      if (!isPaint) return null;
      if (P.neutral === 'black') return hsl2rgb(h, ss * 0.2, Math.min(0.42, l * 0.42));
      if (P.neutral === 'white') return hsl2rgb(h, ss * 0.1, 0.62 + 0.38 * l);
      if (P.neutral === 'silver') return hsl2rgb(210, 0.05, 0.42 + 0.5 * l);
      return hsl2rgb(P.hue, prof.colorful ? Math.max(ss, P.sat * 0.8) : P.sat * (0.5 + 0.5 * (1 - Math.abs(l - 0.5) * 2)), prof.colorful ? l : 0.18 + l * 0.6);
    });
  }
  let wheels = s.image;
  if (look.wheels !== 'factory') wheels = recolor(s.image, (r, g, b) => {
    const [h, ss, l] = rgb2hsl(r, g, b);
    if (l < 0.2) return null;                      // tire rubber stays black
    if (look.wheels === 'black') return hsl2rgb(h, 0, 0.08 + l * 0.18);
    if (look.wheels === 'chrome') return hsl2rgb(210, 0.06, 0.55 + l * 0.45);
    return hsl2rgb(Wf.hue, Wf.sat, 0.2 + l * 0.55);
  });
  // cut wheel holes out of the body so the wheels can sit under the fenders
  const holed = document.createElement('canvas'); holed.width = s.w; holed.height = s.h;
  const hg = holed.getContext('2d'); hg.drawImage(body, 0, 0);
  if (s.wheels) { hg.globalCompositeOperation = 'destination-out'; for (const w of s.wheels) { hg.beginPath(); hg.arc(w.x, w.y, w.r * 0.97, 0, 7); hg.fill(); } }
  const out = { body: holed, wheels };
  looks.set(key, out);
  if (looks.size > 40) looks.delete(looks.keys().next().value);
  return out;
}

// Body motion (per car instance)
export function createMotion() { return { pitch: 0, pv: 0, heave: 0, hv: 0, ang: 0, prevAng: 0, spread: 0, lastV: 0, acc: 0, blur: 0, slip: 0 }; }
export function stepMotion(m, st, dt, live, wheelR) {
  if (dt <= 0) return m;
  const a = live ? st.a : 0;
  m.acc += (Math.max(-9, Math.min(14, a)) - m.acc) * Math.min(1, dt * 18);
  // Squat: rear drops / nose rises under acceleration (~1.7 Hz pitch mode, ζ≈0.38)
  const w = 2 * Math.PI * 1.7, z = 0.38, target = -m.acc * 0.0019;
  m.pv += (w * w * (target - m.pitch) - 2 * z * w * m.pv) * dt; m.pitch += m.pv * dt;
  const hw = 2 * Math.PI * 2.4, ht = live ? Math.sin(st.x * 2.1) * Math.min(0.5, st.v / 60) + Math.sin(st.x * 5.3) * Math.min(0.25, st.v / 90) : 0;
  m.hv += (hw * hw * (ht - m.heave) - 2 * 0.3 * hw * m.hv) * dt; m.heave += m.hv * dt;
  // Wheel angle comes from the simulated wheel speed (so wheelspin shows). The angle swept this
  // frame becomes the blur spread: copies are smeared across it instead of strobing backwards.
  const om = Math.abs(st.wOmega || 0);
  m.prevAng = m.ang;
  m.ang = st.wheelAngle ?? (m.ang + st.v / wheelR * dt);
  m.spread = Math.min(1.4, om * dt);
  m.blur = Math.min(1, om * wheelR / 14);
  m.slip += ((st.spinning ? Math.min(1, (st.slipV || 0) / 4) : 0) - m.slip) * Math.min(1, dt * 10);
  m.lastV = st.v;
  return m;
}

/**
 * Draw a car. x = centre, ground = road y, widthPx = drawn body length in px.
 * opts: { motion, shadow:true, nos:bool, look:{paint,wheels,stance,glow,flame} }
 */
export function drawCar(ctx, car, x, ground, widthPx, opts = {}) {
  const s = loadSprite(car);
  if (!s.ready) {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '600 12px "Barlow Condensed",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(s.error ? 'ART UNAVAILABLE' : 'LOADING…', x, ground - 20); ctx.restore(); return;
  }
  const look = { ...defaultLook(), ...(opts.look || {}) };
  const L = lookImages(car, s, look);
  const k = widthPx / s.w, height = s.h * k, left = x - widthPx / 2;
  // Wheels sit on the road: put the lowest tire bottom at ground
  let top = ground - height;
  if (s.wheels) { const lowest = Math.max(...s.wheels.map(w => w.y + w.r)); top = ground - lowest * k; }
  const m = opts.motion, wh = s.wheels;
  const drop = (STANCES[look.stance]?.drop || 0) * (wh ? wh[0].r * k * 0.09 : 2);
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (opts.shadow !== false) {
    const pool = ctx.createRadialGradient(x, ground, widthPx * 0.05, x, ground, widthPx * 0.56);
    pool.addColorStop(0, 'rgba(0,0,0,.6)'); pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool; ctx.save(); ctx.translate(x, ground); ctx.scale(1, 0.07); ctx.beginPath(); ctx.arc(0, 0, widthPx * 0.56, 0, 7); ctx.fill(); ctx.restore();
    if (wh) for (const w of wh) {
      const cx = left + w.x * k, cr = w.r * k, g = ctx.createRadialGradient(cx, ground, 0, cx, ground, cr);
      g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.save(); ctx.translate(cx, ground); ctx.scale(1, 0.15); ctx.beginPath(); ctx.arc(0, 0, cr, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  const glow = GLOWS[look.glow];
  if (glow) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(x, ground - 2, 0, x, ground - 2, widthPx * 0.56);
    gg.addColorStop(0, glow + 'ee'); gg.addColorStop(0.45, glow + '77'); gg.addColorStop(1, glow + '00');
    ctx.fillStyle = gg; ctx.translate(x, ground - 2); ctx.scale(1, 0.2); ctx.beginPath(); ctx.arc(0, 0, widthPx * 0.56, 0, 7); ctx.fill(); ctx.restore();
  }
  const pitch = m ? m.pitch : 0, heave = m ? m.heave : 0;
  const rear = wh ? { x: left + wh[0].x * k, y: top + wh[0].y * k } : { x: left + widthPx * 0.2, y: ground - height * 0.25 };
  // Wheels first (body has wheel holes and drapes over them): dark wheel wells, then the spinning discs.
  if (wh) {
    const ang = m ? m.ang : 0, spread = m ? m.spread : 0, blur = m ? m.blur : 0, slip = m ? m.slip : 0;
    for (const w of wh) {
      const cx = left + w.x * k, cy = top + w.y * k, cr = w.r * k * 0.985;
      ctx.fillStyle = '#060606'; ctx.beginPath(); ctx.ellipse(cx, cy - cr * 0.08, cr * 1.04, cr * 1.06, 0, 0, 7); ctx.fill();
      const disc = (a, alpha) => { ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.arc(0, 0, cr, 0, 7); ctx.clip(); ctx.drawImage(L.wheels, -w.x * k, -w.y * k, widthPx, height); ctx.restore(); };
      disc(ang, 1);
      // smear across the angle swept this frame (no wagon-wheel strobing)
      if (spread > 0.08) { const n = spread > 0.6 ? 6 : 4; for (let i = 1; i <= n; i++) disc(ang - spread * i / n, 0.5 * blur / (1 + i * 0.35)); }
      // fast spokes read as a soft disc at speed
      if (blur > 0.55) { ctx.save(); ctx.globalAlpha = (blur - 0.55) * 0.5; const rg = ctx.createRadialGradient(cx, cy, cr * 0.15, cx, cy, cr * 0.75); rg.addColorStop(0, 'rgba(140,140,145,.6)'); rg.addColorStop(1, 'rgba(60,60,64,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, cr * 0.75, 0, 7); ctx.fill(); ctx.restore(); }
      // spinning tire: hot glow where rubber meets road
      if (slip > 0.05 && w === wh[(car.phys.drive === 'FWD') ? 1 : 0]) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.7, slip);
        const hg = ctx.createRadialGradient(cx, cy + cr * 0.9, 0, cx, cy + cr * 0.9, cr * 0.7);
        hg.addColorStop(0, 'rgba(255,170,90,.9)'); hg.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy + cr * 0.9, cr * 0.7, 0, 7); ctx.fill(); ctx.restore();
      }
    }
  }
  // Body pitches about the rear axle and rides on its springs; wheels stay planted.
  ctx.save(); ctx.translate(rear.x, rear.y + heave + drop); ctx.rotate(pitch); ctx.translate(-rear.x, -rear.y);
  ctx.drawImage(L.body, left, top, widthPx, height);
  ctx.restore();
  if (glow && wh) { // light spilling from under the sills between the wheels
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const x0 = left + wh[0].x * k + wh[0].r * k, x1 = left + wh[1].x * k - wh[1].r * k, gy = ground - wh[0].r * k * 0.35 + drop;
    const lg = ctx.createLinearGradient(0, gy - 6, 0, ground + 4); lg.addColorStop(0, glow + '00'); lg.addColorStop(0.55, glow + '88'); lg.addColorStop(1, glow + '00');
    ctx.fillStyle = lg; ctx.fillRect(x0, gy - 6, Math.max(0, x1 - x0), ground + 4 - gy + 6); ctx.restore();
  }
  // Nitrous: exhaust flame at the rear bumper
  if (opts.nos) {
    const ex = left + 2, ey = rear.y - height * 0.02 + drop;
    const Ln = widthPx * (0.10 + Math.random() * 0.04), F = FLAMES[look.flame] || FLAMES.blue;
    const g = ctx.createLinearGradient(ex, 0, ex - Ln, 0);
    g.addColorStop(0, F[0]); g.addColorStop(0.35, F[1]); g.addColorStop(1, F[2]);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ex, ey - height * 0.04); ctx.quadraticCurveTo(ex - Ln * 0.6, ey - height * 0.03, ex - Ln, ey); ctx.quadraticCurveTo(ex - Ln * 0.6, ey + height * 0.03, ex, ey + height * 0.04); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  const di = wh ? (car.phys.drive === 'FWD' ? 1 : 0) : 0;
  return { left, top, k, height, rearX: wh ? left + wh[0].x * k : left + widthPx * 0.2, driveX: wh ? left + wh[di].x * k : left + widthPx * 0.2, wheelR: wh ? wh[0].r * k : height * 0.18 };
}

export function preload(cars) { return Promise.all(cars.map(c => loadSprite(c).promise)); }
