// Handmatige invoer uit data/manual-offers.csv (scheidingsteken ;).
// Bedoeld voor ketens zonder betrouwbare automatische bron (Kaufland, Lidl, Netto, ALDI, PENNY, drankenzaken).
// Elke regel wordt streng gecontroleerd; foutieve regels worden overgeslagen en gemeld.

import { readFile } from 'node:fs/promises';
import { BRANDS, stableId } from '../lib/normalize.mjs';
import { computePrices, round2 } from '../../assets/logic.js';
import { parseAnyDate } from '../lib/dates.mjs';

export const COLUMNS = ['keten', 'filialen', 'merk', 'product', 'smaak', 'suikervrij', 'verpakking', 'inhoud_l', 'aantal_per_verpakking', 'prijs_verpakking', 'statiegeld_per_eenheid', 'geldig_van', 'geldig_tot', 'klantenkaart', 'app_coupon', 'min_aantal', 'max_aantal', 'voorwaarden', 'bron_url', 'gecontroleerd_op'];

const num = (s) => (s == null || String(s).trim() === '' ? null : Number(String(s).trim().replace(',', '.')));
const yes = (s) => /^(ja|j|yes|y|1|true)$/i.test(String(s || '').trim());

export function parseCsv(text) {
  const rows = [];
  for (const [n, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if (ch === ';' && !q) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    rows.push({ lineNo: n + 1, cells: cells.map((c) => c.trim()) });
  }
  return rows;
}

export function rowToOffer(row, header, ctx) {
  const r = Object.fromEntries(header.map((h, i) => [h, row.cells[i] ?? '']));
  const err = (m) => ({ error: `regel ${row.lineNo}: ${m}` });
  const chain = r.keten.toLowerCase();
  if (!ctx.chains[chain]) return err(`onbekende keten "${r.keten}"`);
  const brandDef = BRANDS.find((b) => b.brand.toLowerCase() === r.merk.toLowerCase());
  if (!brandDef) return err(`onbekend merk "${r.merk}" (toegestaan: ${BRANDS.map((b) => b.brand).join(', ')})`);
  const scope = r.filialen.toLowerCase() === 'landelijk' ? 'national' : 'store';
  const storeIds = scope === 'store' ? r.filialen.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (scope === 'store') {
    if (!storeIds.length) return err('vul "filialen" in (filiaal-id\'s of "landelijk")');
    for (const id of storeIds) {
      const st = ctx.stores.find((s) => s.id === id);
      if (!st) return err(`onbekend filiaal "${id}" (zie config/stores.json)`);
      if (st.chain !== chain) return err(`filiaal "${id}" hoort niet bij ${r.keten}`);
    }
  }
  const packType = r.verpakking.toLowerCase();
  if (!['fles', 'blik'].includes(packType)) return err('verpakking moet "fles" of "blik" zijn');
  const unitVolumeL = num(r.inhoud_l);
  const unitsPerPack = num(r.aantal_per_verpakking) || 1;
  const packPrice = num(r.prijs_verpakking);
  if (!(unitVolumeL > 0.1 && unitVolumeL <= 3)) return err('inhoud_l ontbreekt of is onwaarschijnlijk');
  if (!(packPrice > 0)) return err('prijs_verpakking ontbreekt');
  const validFrom = parseAnyDate(r.geldig_van);
  const validTo = parseAnyDate(r.geldig_tot);
  if (!validTo) return err('geldig_tot ontbreekt of is ongeldig (gebruik JJJJ-MM-DD of DD.MM.JJJJ)');
  if (validFrom && validFrom > validTo) return err('geldig_van ligt na geldig_tot');
  const checkedAt = parseAnyDate(r.gecontroleerd_op);
  if (!checkedAt) return err('gecontroleerd_op ontbreekt');
  if (!/^https?:\/\//.test(r.bron_url)) return err('bron_url ontbreekt (link naar folder of website)');
  let depositPerUnit = num(r.statiegeld_per_eenheid);
  let depositSource = depositPerUnit == null ? 'onbekend' : 'bron';
  if (depositPerUnit == null && packType === 'blik') { depositPerUnit = 0.25; depositSource = 'afgeleid'; }
  const variantsOpen = /divers|versch|alle smaken/i.test(r.smaak);
  const variants = variantsOpen || !r.smaak ? [] : r.smaak.split('/').map((s) => s.trim()).filter(Boolean);
  const zero = yes(r.suikervrij);
  const base = {
    sourceId: ctx.source.id,
    chain,
    chainName: ctx.chains[chain],
    scope,
    storeIds,
    category: brandDef.category,
    brand: brandDef.brand,
    product: r.product || brandDef.brand,
    description: r.voorwaarden || '',
    variants: variants.length ? variants : variantsOpen ? [] : ['Original'],
    variantsOpen,
    variantAssumed: !r.smaak,
    sugarTypes: variantsOpen ? ['regular', 'zero'] : [zero ? 'zero' : 'regular'],
    packType,
    unitVolumeL,
    unitsPerPack,
    packPrice: round2(packPrice),
    depositPerUnit,
    depositSource,
    validFrom,
    validTo,
    conditions: { loyaltyCard: yes(r.klantenkaart), appCoupon: yes(r.app_coupon), minQty: num(r.min_aantal), maxQty: num(r.max_aantal), notes: r.voorwaarden ? [r.voorwaarden] : [] },
    sourceUrl: r.bron_url,
    checkedAt: `${checkedAt}T00:00:00Z`,
    manual: true,
  };
  const id = stableId([chain, storeIds.join(','), base.brand, base.product, unitVolumeL, unitsPerPack, packType, validFrom, validTo, r.smaak]);
  return { offer: { id, ...base, ...computePrices(base) } };
}

export default async function manual(ctx) {
  const path = ctx.manualCsvPath;
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { status: 'manual', offers: [], rawCount: 0, rejected: [], message: 'Geen handmatige invoer gevonden.' };
  }
  const rows = parseCsv(text);
  if (!rows.length) return { status: 'manual', offers: [], rawCount: 0, rejected: [], message: 'Handmatig bestand is leeg.' };
  const header = rows[0].cells.map((c) => c.toLowerCase());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { status: 'error', offers: [], rawCount: 0, rejected: [], message: `Kolommen ontbreken in manual-offers.csv: ${missing.join(', ')}` };
  const offers = [];
  const rejected = [];
  for (const row of rows.slice(1)) {
    const res = rowToOffer(row, header, ctx);
    if (res.error) rejected.push(res.error);
    else offers.push(res.offer);
  }
  return { status: 'manual', offers, rawCount: rows.length - 1, rejected, message: `${offers.length} handmatige regels ingelezen` + (rejected.length ? `, ${rejected.length} overgeslagen: ${rejected.join(' | ')}` : '.') };
}
