// Diagnose: welke bronnen zijn vanaf GitHub Actions bereikbaar en hoe ziet de data eruit?
// Schrijft diagnose/report.json. Alleen voor ontwikkeling; haalt niets op wat geblokkeerd is.
import { writeFile, mkdir } from 'node:fs/promises';
const UA = 'FrisdrankRadar/1.0 (persoonlijke prijsvergelijking; wekelijkse controle)';
const today = new Date().toISOString().slice(0, 10);
const urls = (process.env.DIAG_URLS || '').split('\n').map((s) => s.trim()).filter(Boolean);
const KW = /red\s?bull|monster|coca|fanta|sprite|pepsi|7\s?up|mezzo|schwip/i;
function keysOf(v, depth = 0) {
  if (depth > 3 || v == null || typeof v !== 'object') return typeof v;
  if (Array.isArray(v)) return v.length ? [`len=${v.length}`, keysOf(v[0], depth + 1)] : [];
  return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, keysOf(x, depth + 1)]));
}
const out = [];
for (const url of urls) {
  const r = { url };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'de-DE,de;q=0.9' }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
    r.status = res.status; r.finalUrl = res.url; r.type = res.headers.get('content-type');
    const text = await res.text();
    r.length = text.length;
    r.rawFile = `diagnose/raw-${out.length}.txt`;
    await mkdir('diagnose', { recursive: true });
    await writeFile(r.rawFile, text.slice(0, 6_000_000));
    r.flags = { nextData: text.includes('__NEXT_DATA__'), ldJson: text.includes('application/ld+json'), nuxt: text.includes('__NUXT__'), cloudflare: /cf-chl|challenge-platform|Verifizierung/i.test(text), restPaths: [...new Set((text.match(/\/\.rest\/[a-zA-Z0-9/_-]+/g) || []))].slice(0, 20), apiHosts: [...new Set((text.match(/https?:\/\/[a-z0-9.-]*(api|endpoints)[a-z0-9.-]*\.[a-z]+[^"' <)]{0,80}/gi) || []))].slice(0, 20) };
    if ((r.type || '').includes('json')) { try { r.jsonShape = keysOf(JSON.parse(text)); r.jsonSample = text.slice(0, 3000); } catch {} }
    else if (url.endsWith('robots.txt')) r.body = text.slice(0, 4000);
    else {
      const snips = []; let m; const re = new RegExp(KW.source, 'gi');
      while ((m = re.exec(text)) && snips.length < 12) { snips.push(text.slice(Math.max(0, m.index - 600), m.index + 900)); re.lastIndex = m.index + 900; }
      r.snippets = snips;
      r.head = text.slice(0, 1500);
    }
  } catch (e) { r.error = String(e.message || e); }
  out.push(r);
  await new Promise((s) => setTimeout(s, 1200));
}
await mkdir('diagnose', { recursive: true });
await writeFile('diagnose/report.json', JSON.stringify({ at: new Date().toISOString(), today, results: out }, null, 1));
console.log(out.map((r) => `${r.status ?? 'ERR'} ${r.length ?? ''} ${r.url} ${r.error || ''}`).join('\n'));
