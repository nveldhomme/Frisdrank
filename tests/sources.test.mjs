import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGermanRange, msToBerlinDate, parseAnyDate } from '../scripts/lib/dates.mjs';
import { extractReweOffers } from '../scripts/adapters/rewe.mjs';
import { htmlToLines } from '../scripts/lib/html.mjs';
import { parseCsv, rowToOffer, COLUMNS } from '../scripts/adapters/manual.mjs';

test('Duitse periode zonder jaar, ook over de jaargrens', () => {
  assert.deepEqual(parseGermanRange('Gültig 19.10. bis 25.10.', '2026-10-19'), { validFrom: '2026-10-19', validTo: '2026-10-25' });
  assert.deepEqual(parseGermanRange('29.12. bis 03.01.', '2026-12-28'), { validFrom: '2026-12-29', validTo: '2027-01-03' });
  assert.equal(parseGermanRange('geen datum', '2026-10-19'), null);
});

test('EDEKA-tijdstempels naar Duitse datum', () => {
  assert.equal(msToBerlinDate(1792800000000), '2026-10-24');
  assert.equal(msToBerlinDate(1791158400000), '2026-10-05');
  assert.equal(parseAnyDate('24.10.2026'), '2026-10-24');
});

test('REWE-pagina: aanbieding uit tekstregels halen zonder basisprijs of statiegeld als prijs te lezen', () => {
  const html = `<h3><a>Red Bull Energy Drink</a></h3><p>versch. Sorten, koffeinhaltig, je 0,25-l-Dose, (1 l = 3,96 €), zzgl. 0,25 € Pfand</p><span>Aktion</span><div><span>0,99 €</span></div>
  <h3><a>Hohes C Saft</a></h3><p>je 1-l-Fl.</p><div>1,79 €</div>`;
  const res = extractReweOffers(htmlToLines(html));
  assert.equal(res.length, 1);
  assert.equal(res[0].price, 0.99);
});

test('handmatige CSV: geldige regel wordt aanbieding, foute regels worden geweigerd', () => {
  const ctx = { source: { id: 'handmatig' }, chains: { kaufland: 'Kaufland' }, stores: [{ id: 'kaufland-emmerich', chain: 'kaufland' }] };
  const header = COLUMNS.join(';');
  const good = 'kaufland;kaufland-emmerich;Coca-Cola;Coca-Cola;Original;nee;fles;2;1;1,49;0,25;2026-10-19;2026-10-24;nee;ja;;6;Kaufland Card;https://filiale.kaufland.de;2026-10-19';
  const bad = 'kaufland;onbekend;Coca-Cola;Coca-Cola;Original;nee;fles;2;1;1,49;0,25;2026-10-19;2026-10-24;nee;nee;;;;https://x;2026-10-19';
  const rows = parseCsv(`# commentaar\n${header}\n${good}\n${bad}`);
  const h = rows[0].cells;
  const r1 = rowToOffer(rows[1], h, ctx);
  assert.equal(r1.offer.pricePerLiter, 0.75);
  assert.equal(r1.offer.conditions.appCoupon, true);
  assert.equal(r1.offer.conditions.maxQty, 6);
  const r2 = rowToOffer(rows[2], h, ctx);
  assert.match(r2.error, /onbekend filiaal/);
});

import { readFileSync } from 'node:fs';
import { normalizeRaw } from '../scripts/lib/normalize.mjs';
import { extractKauflandOffers, kauflandToRaw } from '../scripts/adapters/kaufland.mjs';
import { aldiToRaw } from '../scripts/adapters/aldi-sued.mjs';
import { pennyTileToRaws, parsePennyPage, isoWeekMonday } from '../scripts/adapters/penny.mjs';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const meta = { sourceId: 't', chain: 'x', chainName: 'X', scope: 'national', storeIds: [], sourceUrl: 'https://x', checkedAt: '2026-10-19T06:00:00Z' };

test('Kaufland: Pepsi 6 x 0,5-l-PET met "(+ 1.50 Pfand)" uit echte paginadata', () => {
  const items = extractKauflandOffers(fx('kaufland-sample.html'));
  const pepsi = items.find((o) => o.title === 'PEPSI');
  const offers = normalizeRaw({ ...meta, ...kauflandToRaw(pepsi) }).offers;
  assert.equal(offers.length, 1);
  const o = offers[0];
  assert.equal(o.unitsPerPack, 6);
  assert.equal(o.unitVolumeL, 0.5);
  assert.equal(o.packPrice, 3.96);
  assert.equal(o.unitPrice, 0.66);
  assert.equal(o.depositPerUnit, 0.25);
  assert.equal(o.validFrom, '2026-10-19');
  // Kleding met "Coca-Cola" in de naam is geen drank
  const sokken = items.filter((x) => /Socken|Pullover|Retroshorts/.test(x.subtitle || ''));
  assert.ok(sokken.length > 0);
  assert.ok(sokken.every((x) => normalizeRaw({ ...meta, ...kauflandToRaw(x) }).offers.length === 0));
});

test('ALDI SÜD: inhoud uit sellingSize, niet uit de traynaam; alleen actieproducten', () => {
  const d = JSON.parse(fx('aldi-cola.json'));
  const raws = d.data.map(aldiToRaw);
  const offers = raws.filter((r) => r.isOffer).flatMap((r) => normalizeRaw({ ...meta, ...r, validTo: null }).offers);
  const cc = offers.find((o) => o.brand === 'Coca-Cola' && o.variants.includes('Zero / suikervrij'));
  assert.equal(cc.unitVolumeL, 0.33);
  assert.equal(cc.packPrice, 0.99);
  assert.equal(cc.depositPerUnit, 0.25);
  assert.equal(cc.validFrom, '2026-10-23');
  assert.ok(offers.some((o) => o.brand === 'Fanta' && o.variants.includes('Exotic')));
  assert.ok(!offers.some((o) => o.brand === 'Pepsi')); // Pepsi staat er tegen normale prijs: geen aanbieding
});

test('PENNY: normale prijs en app-prijs apart; "0,5 I" wordt 0,5 l', () => {
  const top = JSON.parse(fx('penny-top-angebote.json')).offerTiles;
  const rb = pennyTileToRaws(top.find((t) => /RED BULL/.test(t.title)));
  assert.deepEqual(rb.map((r) => [r.price, !!r.app]), [[0.99, false], [0.88, true]]);
  const g = JSON.parse(fx('penny-getraenke1.json')).offerTiles;
  const multi = pennyTileToRaws(g.find((t) => /PEPSI/.test(t.title)))[0];
  const offers = normalizeRaw({ ...meta, ...multi }).offers;
  assert.deepEqual(offers.map((o) => o.brand).sort(), ['7UP', 'Pepsi', 'Schwip Schwap']);
  assert.equal(offers[0].unitVolumeL, 1.25);
  assert.equal(isoWeekMonday('2026-43'), '2026-10-19');
  const page = parsePennyPage('<div data-current-week="2026-43"></div><div id="ab-montag--getraenke"></div><div id="ab-donnerstag--getraenke1"></div>');
  assert.deepEqual(page, { week: '2026-43', categories: [{ name: 'getraenke', period: 'ab-montag' }, { name: 'getraenke1', period: 'ab-donnerstag' }] });
});
