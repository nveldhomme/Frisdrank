import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeResults, shouldWrite, dedupe } from '../scripts/lib/merge.mjs';

const src = (id) => ({ id, chain: id, chainName: id, label: id });
const off = (id, sourceId, extra = {}) => ({ id, sourceId, chain: sourceId, brand: 'Red Bull', unitVolumeL: 0.25, unitsPerPack: 1, packType: 'blik', packPrice: 0.99, validTo: '2026-10-24', unitPriceExact: 0.99, storeIds: [], ...extra });

test('mislukte bron behoudt laatste succesvolle gegevens (gemarkeerd als stale)', () => {
  const prev = { lastSuccessfulUpdate: '2026-10-12T05:00:00Z', sources: [{ id: 'a', lastSuccessAt: '2026-10-12T05:00:00Z' }], offers: [off('o1', 'a')] };
  const next = mergeResults(prev, [{ source: src('a'), status: 'error', offers: [], message: 'HTTP 403' }], '2026-10-19T05:00:00Z');
  assert.equal(next.offers.length, 1);
  assert.equal(next.offers[0].stale, true);
  assert.equal(next.sources[0].lastSuccessAt, '2026-10-12T05:00:00Z');
  assert.equal(next.lastSuccessfulUpdate, '2026-10-12T05:00:00Z');
});

test('succesvolle bron vervangt oude gegevens en zet update-tijd', () => {
  const prev = { offers: [off('o1', 'a')], sources: [] };
  const next = mergeResults(prev, [{ source: src('a'), status: 'ok', offers: [off('o2', 'a')] }], '2026-10-19T05:00:00Z');
  assert.deepEqual(next.offers.map((o) => o.id), ['o2']);
  assert.equal(next.lastSuccessfulUpdate, '2026-10-19T05:00:00Z');
});

test('gedeeltelijk mislukt: oude aanbiedingen van het mislukte filiaal blijven', () => {
  const prev = { offers: [off('x1', 'edeka', { storeIds: ['s1'] }), off('x2', 'edeka', { storeIds: ['s2'], packPrice: 1.09 })], sources: [] };
  const next = mergeResults(prev, [{ source: src('edeka'), status: 'ok', offers: [off('n1', 'edeka', { storeIds: ['s1'], packPrice: 0.89 })], failedStoreIds: ['s2'] }], '2026-10-19T05:00:00Z');
  assert.deepEqual(next.offers.map((o) => [o.id, o.stale]).sort(), [['n1', false], ['x2', true]]);
});

test('handmatige invoer telt niet als automatische update', () => {
  const next = mergeResults(null, [{ source: src('handmatig'), status: 'manual', offers: [off('m1', 'handmatig')] }], '2026-10-19T05:00:00Z');
  assert.equal(next.lastSuccessfulUpdate, null);
});

test('dubbel tussen handmatig en automatisch: automatische bron wint', () => {
  const r = dedupe([off('m', 'handmatig', { chain: 'rewe' }), off('a', 'rewe-nationaal', { chain: 'rewe' })]);
  assert.deepEqual(r.map((o) => o.id), ['a']);
});

test('niets wegschrijven als geen enkele bron werkte terwijl er data was', () => {
  const prev = { offers: [off('o1', 'a')] };
  assert.equal(shouldWrite(prev, { sources: [{ status: 'error' }] }).ok, false);
  assert.equal(shouldWrite(prev, { sources: [{ status: 'ok' }] }).ok, true);
  assert.equal(shouldWrite(null, { sources: [{ status: 'error' }] }).ok, true);
});

test('dedupe houdt verschillende smaken en app-prijzen apart', () => {
  const a = off('r', 'aldi', { variants: ['Original'] });
  const z = off('z', 'aldi', { variants: ['Zero / suikervrij'] });
  const app = off('p', 'aldi', { variants: ['Original'], conditions: { appCoupon: true } });
  assert.equal(dedupe([a, z, app]).length, 3);
});
