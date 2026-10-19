import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRaw, parseSizes, parseDeposits, detectBrands } from '../scripts/lib/normalize.mjs';

const base = { sourceId: 't', chain: 'rewe', chainName: 'REWE', scope: 'national', storeIds: [], validFrom: '2026-10-19', validTo: '2026-10-24', sourceUrl: 'https://x', checkedAt: '2026-10-19T06:00:00Z' };

test('REWE Red Bull 0,25-l-Dose: prijs per blik, per liter en statiegeld uit bron', () => {
  const { offers } = normalizeRaw({ ...base, title: 'Red Bull Energy Drink', description: 'versch. Sorten, koffeinhaltig, je 0,25-l-Dose, (1 l = 3,96 €), zzgl. 0,25 € Pfand', price: 0.99 });
  assert.equal(offers.length, 1);
  const o = offers[0];
  assert.equal(o.brand, 'Red Bull');
  assert.equal(o.category, 'energy');
  assert.equal(o.packType, 'blik');
  assert.equal(o.unitVolumeL, 0.25);
  assert.equal(o.unitsPerPack, 1);
  assert.equal(o.unitPrice, 0.99);
  assert.equal(o.pricePerLiter, 3.96);
  assert.equal(o.depositPerUnit, 0.25);
  assert.equal(o.depositSource, 'bron');
  assert.equal(o.variantsOpen, true);
});

test('basisprijs "(1 l = 0,89 €)" wordt niet als inhoud gelezen', () => {
  assert.deepEqual(parseSizes('versch. Sorten, je 1,25-l-Fl., (1 l = 0,89 €), zzgl. 0,25 € Pfand'), [{ unitVolumeL: 1.25, unitsPerPack: 1 }]);
  assert.deepEqual(parseSizes('je 0,5 l Dose 1 l = € 1.58'), [{ unitVolumeL: 0.5, unitsPerPack: 1 }]);
});

test('EDEKA: twee formaten en drie merken in één regel', () => {
  const { offers } = normalizeRaw({ ...base, chain: 'edeka', title: 'Coca-Cola, Fanta, Sprite', description: 'und weitere Sorten, teilweise koffeinhaltig, je 0,33 l / 0,5 l Dose zzgl. € 0.25 Pfand', price: 0.79 });
  assert.equal(offers.length, 6);
  assert.deepEqual([...new Set(offers.map((o) => o.brand))].sort(), ['Coca-Cola', 'Fanta', 'Sprite']);
  const c033 = offers.find((o) => o.brand === 'Coca-Cola' && o.unitVolumeL === 0.33);
  assert.equal(c033.pricePerLiter, 2.39);
  assert.ok(offers.every((o) => o.variantsOpen));
});

test('multipack: statiegeld voor de hele verpakking wordt per eenheid omgerekend', () => {
  const { offers } = normalizeRaw({ ...base, title: 'Monster Energy', description: 'versch. Sorten, Packung = 4 x 0,5 l Dose zzgl. 1,00 € Pfand', price: 4.44 });
  const o = offers[0];
  assert.equal(o.unitsPerPack, 4);
  assert.equal(o.unitVolumeL, 0.5);
  assert.equal(o.unitPrice, 1.11);
  assert.equal(o.pricePerLiter, 2.22);
  assert.equal(o.depositPerUnit, 0.25);
});

test('multipack met "je ... zzgl. 0,25 € Pfand" blijft € 0,25 per blik', () => {
  assert.deepEqual(parseDeposits('je 0,25-l-Dose zzgl. 0,25 € Pfand'), [0.25]);
  const { offers } = normalizeRaw({ ...base, title: 'Red Bull', description: '4 x 0,25-l-Dose, zzgl. 0,25 € Pfand je Dose', price: 3.79 });
  assert.equal(offers[0].depositPerUnit, 0.25);
});

test('blik zonder vermeld statiegeld: € 0,25 afgeleid; fles zonder vermelding: onbekend', () => {
  const blik = normalizeRaw({ ...base, title: 'Red Bull', description: 'je 0,25-l-Dose', price: 1.19 }).offers[0];
  assert.equal(blik.depositPerUnit, 0.25);
  assert.equal(blik.depositSource, 'afgeleid');
  const fles = normalizeRaw({ ...base, title: 'Pepsi Cola', description: 'je 2-l-Fl.', price: 1.29 }).offers[0];
  assert.equal(fles.depositPerUnit, null);
  assert.equal(fles.depositSource, 'onbekend');
  assert.equal(fles.unitVolumeL, 2);
});

test('zero-variant wordt herkend en gescheiden', () => {
  const o = normalizeRaw({ ...base, title: 'Coca-Cola Zero Sugar', description: 'je 2-l-Fl. zzgl. 0,25 € Pfand', price: 1.49 }).offers[0];
  assert.deepEqual(o.sugarTypes, ['zero']);
  assert.deepEqual(o.variants, ['Zero / suikervrij']);
  assert.equal(o.variantsOpen, false);
});

test('niet-relevante producten en "Monster Munch" worden genegeerd', () => {
  assert.equal(detectBrands('Monster Munch Chips').length, 0);
  assert.equal(normalizeRaw({ ...base, title: 'Hohes C Saft', description: 'je 1-l-Fl.', price: 1.79 }).offers.length, 0);
});

test('zonder herkenbare inhoud of prijs: overgeslagen, niet geraden', () => {
  const r1 = normalizeRaw({ ...base, title: 'Coca-Cola', description: 'versch. Sorten', price: 1.11 });
  assert.equal(r1.offers.length, 0);
  assert.match(r1.rejected, /Inhoud niet herkend/);
  const r2 = normalizeRaw({ ...base, title: 'Coca-Cola', description: 'je 2-l-Fl.', price: null });
  assert.equal(r2.offers.length, 0);
});

test('ID is stabiel en hangt niet af van de prijs (zodat prijswijzigingen herkend worden)', () => {
  const a = normalizeRaw({ ...base, title: 'Pepsi', description: 'je 2-l-Fl.', price: 1.29 }).offers[0];
  const b = normalizeRaw({ ...base, title: 'Pepsi', description: 'je 2-l-Fl.', price: 1.39 }).offers[0];
  assert.equal(a.id, b.id);
});
