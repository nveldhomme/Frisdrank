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
