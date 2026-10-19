// EDEKA: officiële aanbiedingen-API per filiaal.
// Endpoint: https://www.edeka.de/eh/service/eh/offers?limit=999&marketId=<id>
// Velden (gecontroleerd 2026-10-19): docs[].titel, .beschreibung, .preis, .basicPrice, .zusatztext, .nachlass, .gueltig_bis (ms);
// top-level gueltig_von / gueltig_bis (ms), anzahl.

import { normalizeRaw } from '../lib/normalize.mjs';
import { msToBerlinDate } from '../lib/dates.mjs';

const ENDPOINT = 'https://www.edeka.de/eh/service/eh/offers';

export default async function edeka(ctx) {
  const markets = ctx.stores.filter((s) => s.chain === 'edeka' && s.active && s.edekaMarketId);
  const offers = [];
  const rejected = [];
  const failed = [];
  const failedStoreIds = [];
  let rawCount = 0;
  for (const store of markets) {
    const url = `${ENDPOINT}?limit=999&marketId=${encodeURIComponent(store.edekaMarketId)}`;
    try {
      const data = await ctx.fetchJson(url);
      const docs = Array.isArray(data?.docs) ? data.docs : null;
      if (!docs) throw new Error('onverwacht antwoord (geen "docs")');
      if (!docs.length) throw new Error('0 aanbiedingen ontvangen');
      rawCount += docs.length;
      const validFrom = data.gueltig_von ? msToBerlinDate(data.gueltig_von) : null;
      for (const d of docs) {
        const validTo = d.gueltig_bis ? msToBerlinDate(d.gueltig_bis) : data.gueltig_bis ? msToBerlinDate(data.gueltig_bis) : null;
        const extra = [d.zusatztext, d.nachlass].filter(Boolean).join(' ');
        const r = normalizeRaw({
          title: d.titel,
          description: d.beschreibung,
          price: d.preis,
          extraText: extra,
          sourceId: ctx.source.id,
          chain: 'edeka',
          chainName: ctx.chains.edeka,
          scope: 'store',
          storeIds: [store.id],
          validFrom,
          validTo,
          sourceUrl: 'https://www.edeka.de/eh/angebote.jsp',
          checkedAt: ctx.nowISO,
        });
        offers.push(...r.offers);
        if (r.rejected) rejected.push(`${store.name}: ${r.rejected}`);
      }
    } catch (e) {
      failed.push(`${store.name} (${store.city}): ${e.message}`);
      failedStoreIds.push(store.id);
    }
    await ctx.sleep(800);
  }
  if (!rawCount) return { status: 'error', offers: [], rawCount, rejected, message: `Geen enkel EDEKA-filiaal kon worden gecontroleerd. ${failed.join('; ')}` };
  const msg = `${markets.length - failed.length} van ${markets.length} filialen gecontroleerd.` + (failed.length ? ` Niet gelukt: ${failed.join('; ')}` : '');
  return { status: 'ok', offers, rawCount, rejected, message: msg, failedStoreIds };
}
