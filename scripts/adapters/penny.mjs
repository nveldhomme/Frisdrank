// PENNY: officiële aanbiedingen per verkoopregio.
// 1. https://www.penny.de/angebote  -> huidige week (data-current-week="2026-43") en categorieën
//    met hun periode (id="ab-montag--getraenke", id="ab-donnerstag--getraenke1", ...).
// 2. https://www.penny.de/.rest/offers/by-category/<week>/<categorie>?region=<sellingRegion>
// De verkoopregio staat per filiaal in config/stores.json (pennyRegion), afkomstig uit PENNY's eigen filialenlijst.
// robots.txt van penny.de: Allow: /

import { normalizeRaw } from '../lib/normalize.mjs';

const SKIP = /pflanzen|multimedia|haushalt-und-wohnen|kinderwelt|sport|drogerie|fleisch|baecker|mike-mitchells|obst|kuehlregal|kochen/;
const PERIOD_OFFSET = { 'ab-montag': 0, 'ab-dienstag': 1, 'ab-mittwoch': 2, 'ab-donnerstag': 3, 'ab-freitag': 4, 'ab-samstag': 5 };

/** ISO-week "2026-43" -> maandag als YYYY-MM-DD */
export function isoWeekMonday(week) {
  const [y, w] = week.split('-').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  return mon.toISOString().slice(0, 10);
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function parsePennyPage(html) {
  const week = /data-current-week="(\d{4}-\d{1,2})"/.exec(html)?.[1] || null;
  const cats = new Map();
  for (const m of html.matchAll(/id="(ab-[a-z]+)--([a-z0-9-]+)"/g)) if (!cats.has(m[2])) cats.set(m[2], m[1]);
  return { week, categories: [...cats.entries()].map(([name, period]) => ({ name, period })) };
}

export function pennyTileToRaws(t) {
  const fix = (s) => String(s || '').replace(/(\d)\s*I\b/g, '$1 l'); // "je 0,5 I" -> "je 0,5 l"
  const title = String(t.title || '').replace(/\*+$/, '').trim();
  const base = { title, description: `${fix(t.quantity)} ${t.basePrice || ''}` };
  const out = [];
  const price = Number(String(t.price).replace(',', '.'));
  if (price > 0) out.push({ ...base, price });
  // App-voordeelprijs (PENNY App / coupon), bv. benefitPrice "0.88²"
  const benefit = t.benefitPrice ? Number(String(t.benefitPrice).replace(/[^\d.]/g, '')) : null;
  if (benefit && benefit < price) out.push({ ...base, price: benefit, app: true });
  return out;
}

export default async function penny(ctx) {
  const regions = new Map();
  for (const s of ctx.stores.filter((s) => s.chain === 'penny' && s.active && s.pennyRegion)) {
    if (!regions.has(s.pennyRegion)) regions.set(s.pennyRegion, []);
    regions.get(s.pennyRegion).push(s.id);
  }
  let page;
  try {
    page = parsePennyPage(await ctx.fetchText('https://www.penny.de/angebote'));
  } catch (e) {
    return { status: 'error', offers: [], rawCount: 0, rejected: [], message: `penny.de niet bereikbaar: ${e.message}` };
  }
  if (!page.week || !page.categories.length) return { status: 'error', offers: [], rawCount: 0, rejected: [], message: 'Week of categorieën niet gevonden op penny.de (structuur gewijzigd?).' };
  const monday = isoWeekMonday(page.week);
  const offers = [];
  const rejected = [];
  const failed = [];
  const failedStoreIds = [];
  let rawCount = 0;
  for (const [region, storeIds] of regions) {
    let regionOk = false;
    for (const cat of page.categories.filter((c) => !SKIP.test(c.name))) {
      const url = `https://www.penny.de/.rest/offers/by-category/${page.week}/${cat.name}?region=${encodeURIComponent(region)}`;
      try {
        const data = await ctx.fetchJson(url);
        const tiles = Array.isArray(data?.offerTiles) ? data.offerTiles : [];
        rawCount += tiles.length;
        regionOk = true;
        const validFrom = addDays(monday, PERIOD_OFFSET[cat.period] ?? 0);
        const validTo = addDays(monday, 5); // zaterdag
        for (const t of tiles) {
          for (const raw of pennyTileToRaws(t)) {
            const r = normalizeRaw({ ...raw, extraText: raw.app ? 'PENNY App Coupon' : '', conditionsText: raw.app ? 'Prijs alleen met coupon in de PENNY App.' : '', sourceId: ctx.source.id, chain: 'penny', chainName: ctx.chains.penny, scope: 'store', storeIds, validFrom, validTo, sourceUrl: `https://www.penny.de${t.linkHref || '/angebote'}`, checkedAt: ctx.nowISO });
            for (const o of r.offers) { if (raw.app) { o.id += 'a'; o.conditions.appCoupon = true; } }
            offers.push(...r.offers);
            if (r.rejected) rejected.push(r.rejected);
          }
        }
      } catch (e) {
        failed.push(`${region}/${cat.name}: ${e.message}`);
      }
      await ctx.sleep(700);
    }
    if (!regionOk) failedStoreIds.push(...storeIds);
  }
  if (!rawCount) return { status: 'error', offers: [], rawCount, rejected, message: `Geen PENNY-aanbiedingen ontvangen. ${failed.slice(0, 5).join('; ')}` };
  const uniq = [...new Map(offers.map((o) => [o.id, o])).values()];
  return { status: 'ok', offers: uniq, rawCount, rejected, failedStoreIds, message: `Week ${page.week}, ${regions.size} verkoopregio('s).` + (failed.length ? ` ${failed.length} categorie(ën) niet gelukt.` : '') };
}
