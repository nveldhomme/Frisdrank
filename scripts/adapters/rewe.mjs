// REWE: landelijke aanbiedingen van rewe.de/angebote/nationale-angebote/<categorie>/
// robots.txt van rewe.de staat deze paden expliciet toe. De pagina's zijn server-side gerenderd.
// Belangrijk: dit zijn LANDELIJKE aanbiedingen ("in fast allen Märkten"), niet per filiaal bevestigd.
// Daarom scope = 'national'; de app toont ze als "REWE – landelijke folder".

import { normalizeRaw, detectBrands, parseSizes } from '../lib/normalize.mjs';
import { htmlToLines } from '../lib/html.mjs';
import { parseGermanRange } from '../lib/dates.mjs';

const PRICE_RE = /(\d{1,3}),(\d{2})\s*€|€\s*(\d{1,3}),(\d{2})/;

function cleanForPrice(text) {
  return text
    .replace(/\(\s*1\s*(?:l|kg)\s*=[^)]*\)/gi, ' ')
    .replace(/zzgl\.?[^.]*?pfand/gi, ' ')
    .replace(/\d+,\d{2}\s*€\s*(?:rewe\s*)?bonus/gi, ' ')
    .replace(/bonus[^\d]{0,25}\d+,\d{2}\s*€/gi, ' ');
}

/** Exporteerd voor tests: haalt kandidaat-aanbiedingen uit tekstregels. */
export function extractReweOffers(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const title = lines[i];
    if (title.length > 90 || !detectBrands(title, lines.slice(i + 1, i + 4).join(' ')).length) continue;
    const window = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 14); j++) {
      if (detectBrands(lines[j]).length && lines[j].length < 90 && !/versch|je\s|sorten/i.test(lines[j])) break; // volgende productkop
      window.push(lines[j]);
    }
    const description = window.find((l) => parseSizes(l).length) || '';
    if (!description) continue;
    const descIdx = window.indexOf(description);
    const afterDesc = cleanForPrice(window.slice(descIdx + 1).join(' '));
    const pm = PRICE_RE.exec(afterDesc) || /(?:^|\s)(\d{1,3}),(\d{2})(?:\s|$)/.exec(afterDesc);
    if (!pm) continue;
    const euros = pm[1] ?? pm[3];
    const cents = pm[2] ?? pm[4];
    const bonus = /bonus/i.test(window.join(' '));
    found.push({ title, description, price: Number(`${euros}.${cents}`), bonus });
  }
  return found;
}

export default async function rewe(ctx) {
  const base = ctx.source.url;
  const pages = ctx.source.pages || ['alkoholfreie-getraenke/'];
  const offers = [];
  const rejected = [];
  let rawCount = 0;
  let range = null;
  const failed = [];
  for (const p of pages) {
    const url = base + p;
    try {
      const html = await ctx.fetchText(url);
      const lines = htmlToLines(html);
      // Telt prijsachtige regels: als dit 0 is, is de paginastructuur waarschijnlijk veranderd.
      rawCount += lines.filter((l) => PRICE_RE.test(l) || /^\d{1,3},\d{2}$/.test(l)).length;
      range = range || parseGermanRange(lines.join(' '), ctx.today);
      for (const c of extractReweOffers(lines)) {
        const r = normalizeRaw({
          title: c.title,
          description: c.description,
          price: c.price,
          conditionsText: c.bonus ? 'Extra REWE Bonus-tegoed mogelijk via de REWE-app (prijs geldt ook zonder app).' : '',
          sourceId: ctx.source.id,
          chain: 'rewe',
          chainName: ctx.chains.rewe,
          scope: 'national',
          storeIds: [],
          validFrom: range?.validFrom || null,
          validTo: range?.validTo || null,
          sourceUrl: url,
          checkedAt: ctx.nowISO,
        });
        offers.push(...r.offers);
        if (r.rejected) rejected.push(r.rejected);
      }
    } catch (e) {
      failed.push(`${p}: ${e.message}`);
    }
    await ctx.sleep(1500);
  }
  if (!rawCount) return { status: 'error', offers: [], rawCount, rejected, message: `Geen prijzen gevonden op rewe.de (structuur gewijzigd of geblokkeerd). ${failed.join('; ')}` };
  if (!range) return { status: 'error', offers: [], rawCount, rejected, message: 'Geldigheidsperiode niet gevonden op rewe.de; aanbiedingen niet overgenomen.' };
  // Dubbele (zelfde aanbieding op meerdere categoriepagina's) verwijderen
  const uniq = [...new Map(offers.map((o) => [o.id, o])).values()];
  return { status: 'ok', offers: uniq, rawCount, rejected, message: `Landelijke folder ${range.validFrom} t/m ${range.validTo}.` + (failed.length ? ` Niet gelukt: ${failed.join('; ')}` : '') };
}
