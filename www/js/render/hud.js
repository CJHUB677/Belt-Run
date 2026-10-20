// Race HUD drawn on the canvas: big tachometer with the launch / shift green zone, shift lights,
// gear, speed, boost and nitrous gauges, progress bar.
const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;

export function drawTach(g, cx, cy, R, o) {
  const max = Math.ceil((o.limiter + 500) / 1000) * 1000;
  const ang = rpm => A0 + (A1 - A0) * Math.max(0, Math.min(1, rpm / max));
  g.save();
  // body
  const bg = g.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R * 1.08);
  bg.addColorStop(0, 'rgba(30,32,38,.92)'); bg.addColorStop(1, 'rgba(6,7,9,.95)');
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R * 1.06, 0, 7); g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.12)'; g.stroke();
  // green zone (launch window or ideal shift window)
  if (o.zone) { g.lineWidth = R * 0.13; g.strokeStyle = o.zonePerfect ? '#3dff7a' : 'rgba(61,255,122,.8)'; g.beginPath(); g.arc(cx, cy, R * 0.84, ang(o.zone.lo), ang(o.zone.hi)); g.stroke(); }
  // redline band
  g.lineWidth = R * 0.07; g.strokeStyle = '#e3262e'; g.beginPath(); g.arc(cx, cy, R * 0.93, ang(o.limiter - 300), ang(max)); g.stroke();
  // ticks
  for (let r = 0; r <= max; r += 500) {
    const a = ang(r), major = r % 1000 === 0, r0 = R * (major ? 0.78 : 0.84), r1 = R * 0.95;
    g.strokeStyle = r >= o.limiter - 300 ? '#ff5a5f' : 'rgba(255,255,255,.85)'; g.lineWidth = major ? 2.5 : 1.2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    if (major) { g.fillStyle = '#d7dbe2'; g.font = `700 ${Math.round(R * 0.15)}px "Barlow Condensed",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r / 1000, cx + Math.cos(a) * R * 0.64, cy + Math.sin(a) * R * 0.64); }
  }
  // needle
  const a = ang(o.rpm);
  g.strokeStyle = '#ff3b30'; g.lineWidth = 3.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - Math.cos(a) * R * 0.12, cy - Math.sin(a) * R * 0.12); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cy, R * 0.1, 0, 7); g.fill(); g.strokeStyle = '#444'; g.lineWidth = 1.5; g.stroke();
  // gear + speed
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = o.gearFlash ? '#3dff7a' : '#fff'; g.font = `900 ${Math.round(R * 0.46)}px "Barlow Condensed",sans-serif`;
  g.fillText(o.gear === 0 ? 'N' : String(o.gear), cx, cy + R * 0.38);
  g.fillStyle = '#9aa3ad'; g.font = `700 ${Math.round(R * 0.15)}px "Barlow Condensed",sans-serif`;
  g.fillText(`${Math.round(o.speed)} ${o.units}`, cx, cy + R * 0.7);
  g.fillText('×1000 RPM', cx, cy - R * 0.3);
  // shift lights
  const n = 7, frac = o.shiftFrac ?? 0;
  for (let i = 0; i < n; i++) {
    const on = frac * n > i, flash = frac >= 1 && (performance.now() / 70 | 0) % 2;
    const x = cx - R * 0.48 + i * (R * 0.96 / (n - 1)), y = cy - R * 1.24;
    const col = i < 3 ? '#3dff7a' : i < 5 ? '#ffd23f' : '#ff3b30';
    g.fillStyle = on ? (frac >= 1 ? (flash ? '#4aa8ff' : '#123') : col) : '#1b1d22';
    g.beginPath(); g.arc(x, y, R * 0.07, 0, 7); g.fill();
  }
  g.restore();
}

export function drawBoost(g, x, y, w, h, boost, label = 'BOOST') {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.55)'; roundRect(g, x, y, w, h, 4); g.fill();
  g.fillStyle = '#4aa8ff'; roundRect(g, x + 2, y + 2, Math.max(0, (w - 4) * Math.min(1, boost)), h - 4, 3); g.fill();
  g.fillStyle = '#d7dbe2'; g.font = `700 ${Math.round(h * 0.7)}px "Barlow Condensed",sans-serif`; g.textBaseline = 'middle'; g.fillText(label, x + 6, y + h / 2 + 1);
  g.restore();
}

export function drawProgress(g, x, y, w, pFrac, oFrac, labels) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.5)'; roundRect(g, x, y, w, 8, 4); g.fill();
  if (oFrac != null) { g.fillStyle = '#ff5a5f'; g.beginPath(); g.arc(x + w * Math.min(1, oFrac), y + 4, 6, 0, 7); g.fill(); }
  g.fillStyle = '#3dff7a'; g.beginPath(); g.arc(x + w * Math.min(1, pFrac), y + 4, 7, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.fillRect(x + w - 2, y - 4, 3, 16);
  if (labels) { g.font = '700 12px "Barlow Condensed",sans-serif'; g.fillStyle = '#c9ced6'; g.textAlign = 'left'; g.fillText(labels[0], x, y + 24); g.textAlign = 'right'; g.fillText(labels[1], x + w, y + 24); }
  g.restore();
}

export function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// Starting lights (Christmas tree laid out horizontally): stage, three ambers, green.
export function drawLights(g, cx, y, lights, phase) {
  const bulbs = [['#ffd84a', true], ['#ff9a1f', phase === 'countdown' && lights <= 3], ['#ff9a1f', phase === 'countdown' && lights <= 2], ['#ff9a1f', phase === 'countdown' && lights <= 1], ['#2bff6a', phase === 'run' || phase === 'finished']];
  const r = 9, gap = 26, w = gap * (bulbs.length - 1) + r * 2 + 16;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.65)'; roundRect(g, cx - w / 2, y - r - 8, w, r * 2 + 16, 12); g.fill();
  bulbs.forEach(([col, on], i) => {
    const x = cx - gap * (bulbs.length - 1) / 2 + i * gap;
    if (on) { g.fillStyle = col + '55'; g.beginPath(); g.arc(x, y, r * 1.8, 0, 7); g.fill(); }
    g.fillStyle = on ? col : '#2a2a2a'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  });
  g.restore();
}
