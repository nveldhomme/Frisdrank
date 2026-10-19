import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../assets/logic.js';

const mk = (over) => {
  const o = { id: Math.random().toString(36).slice(2), sourceId: 's', chain: 'kaufland', chainName: 'Kaufland', scope: 'store', storeIds: ['kaufland-emmerich'], category: 'frisdrank', brand: 'Coca-Cola', variants: ['Original'], variantsOpen: false, sugarTypes: ['regular'], packType: 'fles', unitVolumeL: 2, unitsPerPack: 1, packPrice: 1.49, depositPerUnit: 0.25, validFrom: '2026-10-19', validTo: '2026-10-24', conditions: {}, ...over };
  return { ...o, ...L.computePrices(o) };
};
const stores = [{ id: 'kaufland-emmerich', chain: 'kaufland', city: 'Emmerich am Rhein' }, { id: 'lidl-kleve', chain: 'lidl', city: 'Kleve' }];

test('prijs per eenheid en per liter, ook bij multipacks', () => {
  assert.deepEqual(L.computePrices({ packPrice: 4.44, unitsPerPack: 4, unitVolumeL: 0.5 }).unitPrice, 1.11);
  assert.equal(L.computePrices({ packPrice: 4.44, unitsPerPack: 4, unitVolumeL: 0.5 }).pricePerLiter, 2.22);
  assert.equal(L.computePrices({ packPrice: 1.49, unitsPerPack: 1, unitVolumeL: 2 }).pricePerLiter, 0.75);
  assert.equal(L.computePrices({ packPrice: 0.99, unitsPerPack: 1, unitVolumeL: 0.25 }).pricePerLiter, 3.96);
});

test('statiegeld per verpakking', () => {
  assert.equal(L.depositPerPack(mk({ unitsPerPack: 6, depositPerUnit: 0.25 })), 1.5);
  assert.equal(L.depositPerPack(mk({ depositPerUnit: null })), null);
});

test('afronden op hele multipacks met zichtbare extra eenheden', () => {
  assert.deepEqual(L.packsForUnits(6, 4), { packs: 2, units: 8, extraUnits: 2 });
  assert.deepEqual(L.packsForUnits(8, 4), { packs: 2, units: 8, extraUnits: 0 });
  assert.deepEqual(L.packsForUnits(3, 1), { packs: 3, units: 3, extraUnits: 0 });
  const c = L.costFor(mk({ unitsPerPack: 4, unitVolumeL: 0.5, packPrice: 4.44, packType: 'blik', category: 'energy' }), 6);
  assert.equal(c.packs, 2);
  assert.equal(c.subtotal, 8.88);
  assert.equal(c.deposit, 2);
  assert.equal(c.total, 10.88);
});

test('geldigheid: grenzen inclusief, toekomstig en verlopen apart', () => {
  const o = mk({});
  assert.equal(L.validityOn(o, '2026-10-19'), 'actueel');
  assert.equal(L.validityOn(o, '2026-10-24'), 'actueel');
  assert.equal(L.validityOn(o, '2026-10-25'), 'verlopen');
  assert.equal(L.validityOn(o, '2026-10-18'), 'toekomstig');
  assert.equal(L.validityOn(mk({ validFrom: null }), '2026-10-01'), 'actueel');
  const split = L.splitByValidity([o, mk({ validFrom: '2026-10-26', validTo: '2026-10-31' }), mk({ validFrom: '2026-10-12', validTo: '2026-10-17' })], '2026-10-20');
  assert.equal(split.actueel.length, 1);
  assert.equal(split.toekomstig.length, 1);
  assert.equal(split.verlopen.length, 1);
});

test('standaard alleen 2 liter; 1,5 en 1,75 liter alleen met optie', () => {
  const offers = [mk({ unitVolumeL: 2 }), mk({ unitVolumeL: 1.5 }), mk({ unitVolumeL: 1.75 }), mk({ category: 'energy', brand: 'Red Bull', packType: 'blik', unitVolumeL: 0.25 })];
  assert.equal(L.applyFilters(offers, { showOtherSizes: false }, stores).length, 2);
  assert.equal(L.applyFilters(offers, { showOtherSizes: true }, stores).length, 4);
});

test('filters: plaats, klantenkaart/app, landelijke aanbieding alleen bij filiaal in regio', () => {
  const offers = [mk({}), mk({ chain: 'lidl', chainName: 'Lidl', scope: 'national', storeIds: [], conditions: { appCoupon: true } }), mk({ chain: 'netto', scope: 'national', storeIds: [] })];
  assert.equal(L.applyFilters(offers, { cities: ['Kleve'] }, stores).length, 1); // alleen Lidl (landelijk, filiaal in Kleve)
  assert.equal(L.applyFilters(offers, { noConditions: true }, stores).length, 2);
});

test('sortering: goedkoopste eerst; per eenheid bij gelijke inhoud, per liter bij verschillende inhoud', () => {
  const a = mk({ packPrice: 1.59 });
  const b = mk({ packPrice: 1.29, chain: 'lidl', chainName: 'Lidl' });
  const g1 = L.sortGroup([a, b]);
  assert.equal(g1.basis, 'unit');
  assert.equal(g1.offers[0], b);
  const c = mk({ unitVolumeL: 0.25, unitsPerPack: 1, packPrice: 0.99, brand: 'Red Bull', category: 'energy' });
  const d = mk({ unitVolumeL: 0.473, unitsPerPack: 1, packPrice: 1.69, brand: 'Red Bull', category: 'energy' });
  const g2 = L.sortGroup([c, d]);
  assert.equal(g2.basis, 'liter');
  assert.equal(g2.offers[0], d); // 3,57/l < 3,96/l
  const groups = L.groupByProduct([a, b]);
  assert.equal(groups[0].cheapestId, b.id);
});

test('goedkoopste kiezen: geen merk- of smaakwissel, aankooplimiet gerespecteerd', () => {
  const wanted = { brand: 'Coca-Cola', variant: 'Original', packType: 'fles', unitVolumeL: 2 };
  const own = mk({ packPrice: 1.59 });
  const cheaperPepsi = mk({ brand: 'Pepsi', packPrice: 0.99 });
  const cheaperZero = mk({ variants: ['Zero / suikervrij'], sugarTypes: ['zero'], packPrice: 0.89 });
  const limited = mk({ packPrice: 1.19, conditions: { maxQty: 4 } });
  const ok = mk({ packPrice: 1.39, chain: 'lidl', chainName: 'Lidl' });
  const items = [{ id: 'i1', offerId: own.id, wanted, desiredUnits: 6 }];
  const res = L.chooseCheapest(items, [own, cheaperPepsi, cheaperZero, limited, ok]);
  assert.equal(res[0].offerId, ok.id); // limited (max 4) valt af bij 6 flessen
  const res2 = L.chooseCheapest([{ ...items[0], desiredUnits: 4 }], [own, cheaperPepsi, cheaperZero, limited, ok]);
  assert.equal(res2[0].offerId, limited.id);
  const res3 = L.chooseCheapest([{ ...items[0], wanted: { ...wanted, variant: null } }], [own]);
  assert.equal(res3[0].offerId, null);
});

test('goedkoopste kiezen: los vs. multipack vergelijkt werkelijk te betalen bedrag', () => {
  const wanted = { brand: 'Red Bull', variant: 'Original', packType: 'blik', unitVolumeL: 0.25 };
  const single = mk({ brand: 'Red Bull', category: 'energy', packType: 'blik', unitVolumeL: 0.25, unitsPerPack: 1, packPrice: 0.99 });
  const four = mk({ brand: 'Red Bull', category: 'energy', packType: 'blik', unitVolumeL: 0.25, unitsPerPack: 4, packPrice: 3.79 });
  // 5 blikjes: los 4,95 ; via 4-pack 2 packs = 7,58 -> los wint
  assert.equal(L.chooseCheapest([{ id: 'x', wanted, desiredUnits: 5 }], [single, four])[0].offerId, single.id);
  // 8 blikjes: los 7,92 ; 2x 4-pack 7,58 -> multipack wint
  assert.equal(L.chooseCheapest([{ id: 'x', wanted, desiredUnits: 8 }], [single, four])[0].offerId, four.id);
  // vast verpakkingsformaat
  assert.equal(L.chooseCheapest([{ id: 'x', wanted: { ...wanted, lockPack: true, unitsPerPack: 4 }, desiredUnits: 5 }], [single, four])[0].offerId, four.id);
});

test('lijsttotalen per winkel en totaal, statiegeld apart', () => {
  const a = mk({ packPrice: 1.49 });
  const b = mk({ chain: 'lidl', chainName: 'Lidl', scope: 'national', storeIds: [], brand: 'Monster Energy', category: 'energy', packType: 'blik', unitVolumeL: 0.5, unitsPerPack: 4, packPrice: 4.44 });
  const byId = new Map([[a.id, a], [b.id, b]]);
  const items = [
    { id: '1', offerId: a.id, snapshot: a, desiredUnits: 3, locationKey: 'store:kaufland-emmerich' },
    { id: '2', offerId: b.id, snapshot: b, desiredUnits: 4, locationKey: 'chain:lidl' },
  ];
  const t = L.listTotals(items, byId);
  assert.equal(t.groups.length, 2);
  const k = t.groups.find((g) => g.chain === 'kaufland');
  assert.equal(k.subtotal, 4.47);
  assert.equal(k.deposit, 0.75);
  assert.equal(k.total, 5.22);
  assert.equal(t.grand.subtotal, 8.91);
  assert.equal(t.grand.deposit, 1.75);
  assert.equal(t.grand.total, 10.66);
});

test('waarschuwingen bij gewijzigde, verlopen of verdwenen aanbieding', () => {
  const cur = mk({ packPrice: 1.59 });
  const item = { offerId: cur.id, snapshot: { ...cur, packPrice: 1.49 } };
  const w = L.checkListItem(item, new Map([[cur.id, cur]]), '2026-10-20');
  assert.ok(w.some((x) => /Prijs gewijzigd/.test(x)));
  const w2 = L.checkListItem({ offerId: cur.id, snapshot: cur }, new Map([[cur.id, cur]]), '2026-10-26');
  assert.ok(w2.some((x) => /Verlopen/.test(x)));
  const w3 = L.checkListItem({ offerId: 'weg', snapshot: cur }, new Map(), '2026-10-20');
  assert.ok(w3.some((x) => /niet meer/.test(x)));
});

test('aankooplimiet en minimale afname geven waarschuwing', () => {
  assert.equal(L.checkQuantity(7, { maxQty: 6 }).length, 1);
  assert.equal(L.checkQuantity(1, { minQty: 2 }).length, 1);
  assert.equal(L.checkQuantity(3, {}).length, 0);
});
