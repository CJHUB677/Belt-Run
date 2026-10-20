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

// Body motion (per car instance)
export function createMotion() { return { pitch: 0, pv: 0, heave: 0, hv: 0, ang: 0, lastV: 0, acc: 0, blur: 0 }; }
export function stepMotion(m, st, dt, live, wheelR) {
  if (dt <= 0) return m;
  const a = live ? st.a : 0;
  m.acc += (Math.max(-9, Math.min(14, a)) - m.acc) * Math.min(1, dt * 18);
  // Squat: rear drops / nose rises under acceleration (~1.7 Hz pitch mode, ζ≈0.38)
  const w = 2 * Math.PI * 1.7, z = 0.38, target = -m.acc * 0.0019;
  m.pv += (w * w * (target - m.pitch) - 2 * z * w * m.pv) * dt; m.pitch += m.pv * dt;
  const hw = 2 * Math.PI * 2.4, ht = live ? Math.sin(st.x * 2.1) * Math.min(0.5, st.v / 60) + Math.sin(st.x * 5.3) * Math.min(0.25, st.v / 90) : 0;
  m.hv += (hw * hw * (ht - m.heave) - 2 * 0.3 * hw * m.hv) * dt; m.heave += m.hv * dt;
  // Wheel spin comes from the simulated wheel speed (includes wheelspin)
  m.ang = st.wheelAngle ?? (m.ang + st.v / wheelR * dt);
  m.blur = Math.min(1, (st.wOmega || 0) * wheelR / 16);
  m.lastV = st.v;
  return m;
}

/**
 * Draw a car. x = centre, ground = road y, widthPx = drawn body length in px.
 * opts: { motion, shadow:true, smoke:0..1, nos:bool, flip:false, dim:1 }
 */
export function drawCar(ctx, car, x, ground, widthPx, opts = {}) {
  const s = loadSprite(car);
  if (!s.ready) {
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '600 12px "Barlow Condensed",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(s.error ? 'ART UNAVAILABLE' : 'LOADING…', x, ground - 20); ctx.restore(); return;
  }
  const k = widthPx / s.w, height = s.h * k, left = x - widthPx / 2;
  // Wheels sit on the road: put the lowest tire bottom at ground
  let top = ground - height;
  if (s.wheels) { const lowest = Math.max(...s.wheels.map(w => w.y + w.r)); top = ground - lowest * k; }
  const m = opts.motion, wh = s.wheels;
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
  // Body pitches about the rear axle and rides on its springs; wheels stay planted.
  const pitch = m ? m.pitch : 0, heave = m ? m.heave : 0;
  const rear = wh ? { x: left + wh[0].x * k, y: top + wh[0].y * k } : { x: left + widthPx * 0.2, y: ground - height * 0.25 };
  ctx.save(); ctx.translate(rear.x, rear.y + heave); ctx.rotate(pitch); ctx.translate(-rear.x, -rear.y);
  if (opts.dim && opts.dim < 1) ctx.globalAlpha = 1;
  ctx.drawImage(s.image, left, top, widthPx, height);
  ctx.restore();
  if (wh) {
    const ang = m ? m.ang : 0, blur = m ? m.blur : 0;
    for (const w of wh) {
      const cx = left + w.x * k, cy = top + w.y * k, cr = w.r * k * 0.985;
      const disc = a => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.arc(0, 0, cr, 0, 7); ctx.clip(); ctx.drawImage(s.image, -w.x * k, -w.y * k, widthPx, height); ctx.restore(); };
      disc(ang);
      if (blur > 0.15) { ctx.globalAlpha = 0.3 * blur; disc(ang + 0.17); disc(ang + 0.34); ctx.globalAlpha = 1; }
    }
  }
  // Nitrous: blue exhaust flame at the rear bumper
  if (opts.nos) {
    const ex = left + 2, ey = rear.y - height * 0.02;
    const L = widthPx * (0.10 + Math.random() * 0.04);
    const g = ctx.createLinearGradient(ex, 0, ex - L, 0);
    g.addColorStop(0, 'rgba(210,235,255,.95)'); g.addColorStop(0.35, 'rgba(80,150,255,.75)'); g.addColorStop(1, 'rgba(40,80,255,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ex, ey - height * 0.04); ctx.quadraticCurveTo(ex - L * 0.6, ey - height * 0.03, ex - L, ey); ctx.quadraticCurveTo(ex - L * 0.6, ey + height * 0.03, ex, ey + height * 0.04); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  return { left, top, k, height, rearX: wh ? left + wh[0].x * k : left + widthPx * 0.2, wheelR: wh ? wh[0].r * k : height * 0.18 };
}

export function preload(cars) { return Promise.all(cars.map(c => loadSprite(c).promise)); }
