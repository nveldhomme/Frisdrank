#!/usr/bin/env node
// Maakt data/demo-offers.json: VERZONNEN voorbeeldgegevens, alleen voor ontwikkeling.
// De app toont deze uitsluitend met ?demo=1 en met een duidelijke DEMO-banner.
import { writeFile } from 'node:fs/promises';
import { computePrices, todayISO } from '../assets/logic.js';
import { stableId } from './lib/normalize.mjs';

const t = todayISO();
const add = (d) => { const x = new Date(t + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const chains = { kaufland: 'Kaufland', lidl: 'Lidl', edeka: 'EDEKA', rewe: 'REWE', netto: 'Netto Marken-Discount', 'aldi-sued': 'ALDI SÜD' };
const rows = [
  ['kaufland', ['kaufland-emmerich'], 'frisdrank', 'Coca-Cola', ['Original'], ['regular'], 'fles', 2, 1, 1.49, 0.25, -1, 5, {}],
  ['kaufland', ['kaufland-emmerich'], 'frisdrank', 'Coca-Cola', ['Zero / suikervrij'], ['zero'], 'fles', 2, 1, 1.49, 0.25, -1, 5, {}],
  ['lidl', [], 'frisdrank', 'Pepsi', ['Original'], ['regular'], 'fles', 2, 1, 1.29, 0.25, -1, 5, { appCoupon: true }],
  ['edeka', ['edeka-12096'], 'frisdrank', 'Fanta', ['Orange'], ['regular'], 'fles', 2, 1, 1.39, 0.25, -1, 5, {}],
  ['netto', ['netto-kleve-wiesenstr'], 'frisdrank', 'Coca-Cola', ['Original'], ['regular'], 'fles', 2, 1, 1.59, 0.25, -1, 5, { maxQty: 6 }],
  ['rewe', [], 'frisdrank', 'Coca-Cola', ['Original'], ['regular'], 'fles', 1.25, 1, 1.11, 0.25, -1, 5, {}],
  ['lidl', [], 'energy', 'Monster Energy', ['Original'], ['regular'], 'blik', 0.5, 4, 4.44, 0.25, -1, 5, {}],
  ['aldi-sued', [], 'energy', 'Monster Energy', ['Ultra'], ['zero'], 'blik', 0.5, 1, 1.19, 0.25, -1, 5, {}],
  ['kaufland', ['kaufland-kleve-flutstr'], 'energy', 'Red Bull', ['Original'], ['regular'], 'blik', 0.25, 4, 3.79, 0.25, -1, 5, { loyaltyCard: true }],
  ['rewe', [], 'energy', 'Red Bull', [], ['regular', 'zero'], 'blik', 0.25, 1, 0.99, 0.25, -1, 5, {}],
  ['edeka', ['edeka-12435'], 'energy', 'Red Bull', ['Original'], ['regular'], 'blik', 0.473, 1, 1.69, 0.25, 6, 11, {}],
];
const offers = rows.map(([chain, storeIds, category, brand, variants, sugarTypes, packType, vol, upp, price, dep, from, to, cond]) => {
  const base = { sourceId: 'demo', chain, chainName: chains[chain], scope: storeIds.length ? 'store' : 'national', storeIds, category, brand, product: `${brand} (DEMO)`, description: 'Verzonnen voorbeeld', variants, variantsOpen: variants.length === 0, variantAssumed: false, sugarTypes, packType, unitVolumeL: vol, unitsPerPack: upp, packPrice: price, depositPerUnit: dep, depositSource: 'bron', validFrom: add(from), validTo: add(to), conditions: { loyaltyCard: false, appCoupon: false, minQty: null, maxQty: null, notes: [], ...cond }, sourceUrl: 'https://example.invalid/demo', checkedAt: new Date().toISOString(), stale: false };
  return { id: 'demo-' + stableId([chain, brand, vol, upp, variants.join()]), ...base, ...computePrices(base) };
});
const out = { schemaVersion: 1, isDemo: true, generatedAt: new Date().toISOString(), lastSuccessfulUpdate: null, sources: [{ id: 'demo', label: 'DEMONSTRATIEGEGEVENS (verzonnen)', chain: '*', chainName: 'Demo', type: 'demo', scope: 'mixed', status: 'manual', checkedAt: new Date().toISOString(), message: 'Verzonnen prijzen, alleen voor ontwikkeling.', offerCount: offers.length }], offers };
await writeFile(new URL('../data/demo-offers.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`demo: ${offers.length} verzonnen aanbiedingen`);
