// Kaufland: de weekfolder op filiale.kaufland.de (deze week + volgende week).
// De pagina bevat de aanbiedingen als JSON-objecten ({"offerId": ...}) in de HTML.
// robots.txt staat /angebote/aktuelle-woche.html en /angebote/naechste-woche.html toe
// (alleen de detailpagina's zijn uitgesloten; die gebruiken we niet).
// Zonder filiaalkeuze toont Kaufland de standaardfolder; daarom scope = 'national'.

import { normalizeRaw } from '../lib/normalize.mjs';
import { decodeEntities } from '../lib/html.mjs';

const PAGES = ['https://filiale.kaufland.de/angebote/aktuelle-woche.html', 'https://filiale.kaufland.de/angebote/naechste-woche.html'];

/** Haalt alle {"offerId": ...}-objecten uit de HTML (accolades tellen, strings respecteren). */
export function extractKauflandOffers(html) {
  const out = [];
  let i = 0;
  while ((i = html.indexOf('{"offerId":', i)) !== -1) {
    let depth = 0;
    let j = i;
    let inStr = false;
    for (; j < html.length; j++) {
      const ch = html[j];
      if (inStr) {
        if (ch === '\\') { j++; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (!depth) break; }
    }
    try { out.push(JSON.parse(html.slice(i, j + 1))); } catch { /* onvolledig object overslaan */ }
    i = j;
  }
  return out;
}

const clean = (s) => decodeEntities(String(s || '')).replace(new RegExp('\\u2028', 'g'), ' ').replace(/\s+/g, ' ').trim();

export function kauflandToRaw(o) {
  const title = clean(`${o.title || ''} ${o.subtitle || ''}`);
  const description = clean(`${o.unit || ''}, ${o.detailDescription || ''} ${o.basePrice || ''}`);
  return { title, description, price: o.price, validFrom: o.salesFrom || o.dateFrom, validTo: o.salesTo || o.dateTo, loyaltyPrice: o.loyaltyFormattedPrice ? Number(String(o.loyaltyFormattedPrice).replace(/[^\d.]/g, '')) : null };
}

export default async function kaufland(ctx) {
  const offers = [];
  const rejected = [];
  const failed = [];
  let rawCount = 0;
  const seen = new Set();
  for (const url of PAGES) {
    try {
      const html = await ctx.fetchText(url);
      if (/challenge-platform|cf-chl|Verifizierung erforderlich/i.test(html)) throw new Error('botcontrole getoond; niet omzeild');
      const items = extractKauflandOffers(html);
      rawCount += items.length;
      for (const it of items) {
        if (seen.has(it.offerId)) continue;
        seen.add(it.offerId);
        const raw = kauflandToRaw(it);
        const base = { ...raw, sourceId: ctx.source.id, chain: 'kaufland', chainName: ctx.chains.kaufland, scope: 'national', storeIds: [], sourceUrl: url, checkedAt: ctx.nowISO };
        const r = normalizeRaw(base);
        offers.push(...r.offers);
        if (r.rejected) rejected.push(r.rejected);
        // Kaufland Card-prijs als aparte aanbieding met voorwaarde
        if (raw.loyaltyPrice && raw.loyaltyPrice < raw.price && r.offers.length) {
          const r2 = normalizeRaw({ ...base, price: raw.loyaltyPrice, extraText: 'Kaufland Card', conditionsText: 'Prijs alleen met Kaufland Card.' });
          for (const o of r2.offers) { o.id += 'k'; o.conditions.loyaltyCard = true; }
          offers.push(...r2.offers);
        }
      }
    } catch (e) {
      failed.push(`${url.split('/').pop()}: ${e.message}`);
    }
    await ctx.sleep(1500);
  }
  if (!rawCount) return { status: 'error', offers: [], rawCount, rejected, message: `Geen Kaufland-aanbiedingen ontvangen. ${failed.join('; ')}` };
  return { status: 'ok', offers, rawCount, rejected, message: `Kaufland-folder (standaard, zonder filiaalkeuze): ${rawCount} aanbiedingen gelezen.` + (failed.length ? ` Niet gelukt: ${failed.join('; ')}` : '') };
}
