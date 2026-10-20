// BELT RUN: Drag Legends — Railway Function (Bun).
// Serves the game's static files from the project's object-storage bucket.
// One-time setup: open /setup?token=UPLOAD_TOKEN and drop the belt-run-www.tar.gz package; the
// server unpacks it into the bucket. Without UPLOAD_TOKEN set, uploading is switched off.
import { S3Client } from 'bun';

const s3 = new S3Client({
  accessKeyId: Bun.env.S3_ACCESS_KEY_ID,
  secretAccessKey: Bun.env.S3_SECRET_ACCESS_KEY,
  bucket: Bun.env.S3_BUCKET,
  endpoint: Bun.env.S3_ENDPOINT,
  region: Bun.env.S3_REGION || 'auto',
  virtualHostedStyle: true,
});
const PREFIX = 'www/';
const TOKEN = Bun.env.UPLOAD_TOKEN || '';

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', webp: 'image/webp',
  svg: 'image/svg+xml', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8', ico: 'image/x-icon',
};
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self'; media-src 'self' blob:";

const cache = new Map<string, Uint8Array | null>();
async function getFile(key: string): Promise<Uint8Array | null> {
  if (cache.has(key)) return cache.get(key)!;
  const f = s3.file(PREFIX + key);
  let body: Uint8Array | null = null;
  try { if (await f.exists()) body = new Uint8Array(await f.arrayBuffer()); } catch (e) { console.error('s3 read failed', key, String(e)); return null; }
  cache.set(key, body);
  return body;
}

// Minimal ustar reader (files only).
function untar(buf: Uint8Array): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = [];
  const str = (o: number, n: number) => new TextDecoder().decode(buf.subarray(o, o + n)).replace(/\0.*$/s, '');
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = str(off, 100);
    if (!name) break;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(off + 345, 155);
    const full = (prefix ? prefix + '/' : '') + name;
    const start = off + 512;
    if (type === '0' || type === '\0') out.push({ name: full, data: buf.slice(start, start + size) });
    off = start + Math.ceil(size / 512) * 512;
  }
  return out;
}

const SETUP_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Belt Run setup</title><style>body{font:16px system-ui;background:#0b0c0f;color:#eef0f3;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:460px;padding:24px;text-align:center}label{display:block;border:2px dashed #ffb000;border-radius:16px;padding:36px 16px;cursor:pointer}
b{color:#ffb000}#s{margin-top:16px;color:#9aa3ad}</style><main><h1>Belt Run setup</h1>
<label>Choose <b>belt-run-www.tar.gz</b> from your Downloads folder<input id="f" type="file" accept=".gz,.tar" hidden></label><p id="s"></p></main>
<script>const s=document.getElementById('s');document.getElementById('f').onchange=async e=>{const file=e.target.files[0];if(!file)return;s.textContent='Uploading '+(file.size/1e6).toFixed(1)+' MB…';
try{const r=await fetch('/__upload'+location.search,{method:'POST',body:file});const t=await r.text();s.textContent=r.ok?'Done: '+t+' — opening the game…':'Failed: '+t;if(r.ok)setTimeout(()=>location.href='/',1200)}catch(err){s.textContent='Failed: '+err}};</script>`;

Bun.serve({
  port: Number(Bun.env.PORT || 8080),
  maxRequestBodySize: 64 * 1024 * 1024,
  async fetch(req) {
    const url = new URL(req.url);
    const authed = TOKEN && url.searchParams.get('token') === TOKEN;
    if (url.pathname === '/healthz') return Response.json({ ok: true, cached: cache.size });
    if (url.pathname === '/setup') {
      if (!authed) return new Response('Not found', { status: 404 });
      return new Response(SETUP_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/__upload' && req.method === 'POST') {
      if (!authed) return new Response('Forbidden', { status: 403 });
      let buf = new Uint8Array(await req.arrayBuffer());
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = Bun.gunzipSync(buf);
      const files = untar(buf).filter(f => !f.name.includes('..'));
      let n = 0;
      for (const f of files) {
        const name = f.name.replace(/^\.\//, '').replace(/^www\//, '');
        if (!name || name.endsWith('/')) continue;
        await s3.file(PREFIX + name).write(f.data);
        n++;
      }
      cache.clear();
      console.log('uploaded', n, 'files');
      return new Response(n + ' files installed');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    let key = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (key === '' || key.endsWith('/')) key += 'index.html';
    if (key.includes('..')) return new Response('Bad request', { status: 400 });
    const body = await getFile(key);
    if (!body) return new Response('Not found', { status: 404 });
    const ext = key.split('.').pop() || '';
    const headers: Record<string, string> = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === 'html' || key === 'sw.js' ? 'no-cache' : 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    };
    if (ext === 'html') headers['content-security-policy'] = CSP;
    return new Response(body, { headers });
  },
});
console.log('Belt Run server listening');
