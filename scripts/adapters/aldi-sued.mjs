// ALDI SÜD: officiële product-API (api.aldi-sued.de), categorie "Getränke".
// Velden (gecontroleerd 2026-10-19): data[].name, brandName, sellingSize, price.amountRelevantDisplay,
// price.bottleDepositDisplay, price.wasPriceDisplay, onSaleDate, badges[].items[].displayText ("Aktion").
// Alleen aanbiedingen: badge "Aktion" of een doorgestreepte prijs (wasPriceDisplay).
// ALDI publiceert geen einddatum: geldig vanaf de startdatum, zolang de voorraad strekt.

import { normalizeRaw, detectBrands } from '../lib/normalize.mjs';

const API = 'https://api.aldi-sued.de/v3/product-search';
const CATEGORY_GETRAENKE = '1588161425467173';
const LIMIT = 60;

const euro = (s) => (s == null ? null : Number(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || null);

export function aldiToRaw(p) {
  const badges = (p.badges || []).flatMap((b) => b.items || []).map((i) => i.displayText || '');
  const isOffer = badges.some((b) => /aktion|angebot/i.test(b)) || !!p.price?.wasPriceDisplay;
  return {
    isOffer,
    // Merk alleen vooraan zetten als de productnaam zelf geen bekend merk noemt (brandName is vaak de fabrikant, bv. COCA-COLA bij Fanta).
    title: detectBrands(p.name || '').length ? p.name : `${p.brandName || ''} ${p.name || ''}`.trim(),
    // Inhoud komt uit sellingSize (de verkoopeenheid); de productnaam kan een trayinhoud noemen.
    description: `je ${p.sellingSize || ''}${p.price?.bottleDepositDisplay ? `, zzgl. ${p.price.bottleDepositDisplay} Pfand` : ''}`,
    sizeText: p.sellingSize || '',
    price: euro(p.price?.amountRelevantDisplay),
    validFrom: p.onSaleDate || null,
    urlSlug: p.urlSlugText ? `https://www.aldi-sued.de/produkt/${p.urlSlugText}-${p.sku}` : 'https://www.aldi-sued.de/de/angebote.html',
  };
}

export default async function aldiSued(ctx) {
  const offers = [];
  const rejected = [];
  let rawCount = 0;
  let total = Infinity;
  for (let offset = 0; offset < total && offset < 1200; offset += LIMIT) {
    let data;
    try {
      data = await ctx.fetchJson(`${API}?currency=EUR&serviceType=walk-in&categoryKey=${CATEGORY_GETRAENKE}&limit=${LIMIT}&offset=${offset}`);
    } catch (e) {
      if (!rawCount) return { status: 'error', offers: [], rawCount, rejected, message: `ALDI SÜD-API niet bereikbaar: ${e.message}` };
      break;
    }
    const items = Array.isArray(data?.data) ? data.data : [];
    total = data?.meta?.pagination?.totalCount ?? 0;
    rawCount += items.length;
    for (const p of items) {
      const raw = aldiToRaw(p);
      if (!raw.isOffer) continue;
      const r = normalizeRaw({ title: raw.title, description: raw.description, sizeText: raw.sizeText, price: raw.price, sourceId: ctx.source.id, chain: 'aldi-sued', chainName: ctx.chains['aldi-sued'], scope: 'national', storeIds: [], validFrom: raw.validFrom, validTo: null, sourceUrl: raw.urlSlug, checkedAt: ctx.nowISO, conditionsText: 'Zolang de voorraad strekt (ALDI noemt geen einddatum).' });
      offers.push(...r.offers);
      if (r.rejected) rejected.push(r.rejected);
    }
    if (!items.length) break;
    await ctx.sleep(1000);
  }
  if (!rawCount) return { status: 'error', offers: [], rawCount, rejected, message: 'ALDI SÜD gaf geen producten terug.' };
  return { status: 'ok', offers, rawCount, rejected, message: `${rawCount} dranken gecontroleerd in de ALDI SÜD-API.` };
}
