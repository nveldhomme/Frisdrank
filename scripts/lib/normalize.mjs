// Zet ruwe aanbiedingstekst (titel + omschrijving + prijs) om naar genormaliseerde aanbiedingen.
// Strikt: wat niet betrouwbaar te herkennen is (inhoud, prijs) wordt NIET geraden maar overgeslagen.

import { computePrices, round2 } from '../../assets/logic.js';
import { createHash } from 'node:crypto';

export const BRANDS = [
  { brand: 'Coca-Cola', category: 'frisdrank', re: /\bcoca[\s-]?cola\b|\bcoke\b/i },
  { brand: 'Fanta', category: 'frisdrank', re: /\bfanta\b/i },
  { brand: 'Sprite', category: 'frisdrank', re: /\bsprite\b/i },
  { brand: 'Mezzo Mix', category: 'frisdrank', re: /\bmezzo[\s-]?mix\b/i },
  { brand: 'Pepsi', category: 'frisdrank', re: /\bpepsi\b/i },
  { brand: '7UP', category: 'frisdrank', re: /\b7[\s-]?up\b|\bseven[\s-]?up\b/i },
  { brand: 'Schwip Schwap', category: 'frisdrank', re: /\bschwip[\s-]?schwap\b/i },
  { brand: 'Mirinda', category: 'frisdrank', re: /\bmirinda\b/i },
  // "Monster" alleen als het duidelijk om de energiedrank gaat (niet "Monster Munch").
  { brand: 'Monster Energy', category: 'energy', re: /\bmonster\b(?!\s*munch)/i, needs: /energy|dose|taurin|koffein|ultra|juice/i },
  { brand: 'Red Bull', category: 'energy', re: /\bred[\s-]?bull\b/i },
];

const VARIANT_RULES = [
  { re: /\bzero\b|ohne zucker|zuckerfrei|sugar[\s-]?free|sugarfree|\blight\b/i, variant: 'Zero / suikervrij', sugar: 'zero' },
  { re: /\bclassic\b|\boriginal\b/i, variant: 'Original', sugar: 'regular' },
  { re: /\bcherry\b|kirsch/i, variant: 'Cherry' },
  { re: /\bvanill/i, variant: 'Vanilla' },
  { re: /\borange\b/i, variant: 'Orange' },
  { re: /\bexotic\b/i, variant: 'Exotic' },
  { re: /\bmango\b/i, variant: 'Mango' },
  { re: /\blemon\b|zitron/i, variant: 'Lemon' },
  { re: /\bultra\b/i, variant: 'Ultra' },
  { re: /\bjuice\b|mango loco|pipeline punch/i, variant: 'Juice' },
  { re: /\bwatermelon\b|wassermelone/i, variant: 'Watermelon' },
];

const OPEN_VARIANTS = /versch\.?\s*sorten|verschiedene sorten|weitere sorten|div\.?\s*sorten|alle sorten|oder\b/i;

const CONDITION_RULES = [
  { key: 'appCoupon', re: /\bapp\b|coupon|lidl plus|kaufland card|netto app|penny app/i },
  { key: 'loyaltyCard', re: /mit karte|kundenkarte|payback|deutschlandcard|card[- ]?preis|mitglieder/i },
];

/** Verwijdert basisprijs-uitdrukkingen zoals "(1 l = 0,89 €)" zodat "1 l" niet als inhoud wordt gelezen. */
function stripBasePrice(text) {
  return text
    .replace(/\(\s*1\s*(?:l|liter|kg)\s*=\s*[^)]*\)/gi, ' ')
    .replace(/\b1\s*(?:l|liter|kg)\s*=\s*(?:€\s*)?[\d.,]+(?:\s*€)?(?:\s*\/\s*(?:€\s*)?[\d.,]+(?:\s*€)?)*/gi, ' ');
}

const num = (s) => Number(String(s).replace(',', '.'));

/**
 * Leest verpakkingsvarianten uit tekst.
 * Voorbeelden: "je 1,25-l-Fl.", "je 0,33 l / 0,5 l Dose", "Packung = 6 x 0,33 l", "4 x 0,25-l-Dose", "Kasten = 20 x 0,5 l"
 * @returns {{unitVolumeL:number, unitsPerPack:number}[]}
 */
export function parseSizes(rawText) {
  const text = stripBasePrice(rawText);
  const out = [];
  const multi = /(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*-?\s*(ml|l|liter)\b/gi;
  let m;
  const consumed = [];
  while ((m = multi.exec(text))) {
    const vol = m[3].toLowerCase() === 'ml' ? num(m[2]) / 1000 : num(m[2]);
    out.push({ unitVolumeL: vol, unitsPerPack: Number(m[1]) });
    consumed.push([m.index, m.index + m[0].length]);
  }
  const single = /(\d+(?:[.,]\d+)?)\s*-?\s*(ml|l|liter)\b/gi;
  while ((m = single.exec(text))) {
    if (consumed.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const vol = m[2].toLowerCase() === 'ml' ? num(m[1]) / 1000 : num(m[1]);
    out.push({ unitVolumeL: vol, unitsPerPack: 1 });
  }
  // "4er-Pack" / "6er Pack" zonder "x"-notatie
  const er = /(\d{1,2})er[\s-]?(?:pack|packung|tray)/i.exec(text);
  if (er) for (const s of out) if (s.unitsPerPack === 1) s.unitsPerPack = Number(er[1]);
  // dubbelen verwijderen
  const seen = new Set();
  return out.filter((s) => {
    const k = `${s.unitVolumeL}|${s.unitsPerPack}`;
    if (seen.has(k) || !(s.unitVolumeL > 0.1 && s.unitVolumeL <= 3)) return false;
    seen.add(k);
    return true;
  });
}

/** Statiegeldbedragen zoals vermeld ("zzgl. 0,25 € Pfand", "zzgl. € 3.10 / € 3.42 Pfand"). */
export function parseDeposits(text) {
  const m = /zzgl\.?\s*((?:€\s*)?\d+[.,]\d{2}(?:\s*€)?(?:\s*\/\s*(?:€\s*)?\d+[.,]\d{2}(?:\s*€)?)*)\s*pfand/i.exec(text);
  if (!m) return [];
  return [...m[1].matchAll(/\d+[.,]\d{2}/g)].map((x) => num(x[0]));
}

export function parsePackType(text, category) {
  if (/\bdose|\bdosen|\bcan\b|\bblik/i.test(text)) return 'blik';
  if (/\bfl\.|flasche|\bpet\b|-fl\b/i.test(text)) return 'fles';
  if (/kasten|kiste/i.test(text)) return 'fles';
  return category === 'energy' ? 'blik' : null;
}

export function parseVariants(text) {
  const variants = [];
  const sugar = new Set();
  for (const r of VARIANT_RULES) {
    if (r.re.test(text)) {
      variants.push(r.variant);
      if (r.sugar) sugar.add(r.sugar);
    }
  }
  const open = OPEN_VARIANTS.test(text);
  let assumed = false;
  if (!variants.length && !open) {
    variants.push('Original');
    sugar.add('regular');
    assumed = true;
  }
  if (!sugar.size && variants.length) sugar.add('regular');
  return { variants, variantsOpen: open, variantAssumed: assumed, sugarTypes: [...sugar] };
}

export function parseConditions(text) {
  const c = { loyaltyCard: false, appCoupon: false, minQty: null, maxQty: null, notes: [] };
  for (const r of CONDITION_RULES) if (r.re.test(text)) c[r.key] = true;
  const max = /(?:max\.?|maximal|höchstens|abgabe\s*(?:nur\s*)?(?:max\.?\s*)?)\s*(\d{1,3})\s*(?:stück|stk|packungen|flaschen|dosen|artikel)/i.exec(text);
  if (max) c.maxQty = Number(max[1]);
  const min = /\bab\s*(\d{1,2})\s*(?:stück|stk|packungen|flaschen|dosen)/i.exec(text);
  if (min) c.minQty = Number(min[1]);
  return c;
}

/** Detecteert merken in een titel. Geeft lijst met {brand, category}. */
export function detectBrands(title, description = '') {
  const both = `${title} ${description}`;
  return BRANDS.filter((b) => b.re.test(title) && (!b.needs || b.needs.test(both)));
}

export function stableId(parts) {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

/**
 * Hoofdfunctie: ruwe aanbieding -> 0..n genormaliseerde aanbiedingen (één per merk × verpakking).
 * @param {object} raw { title, description, price, sourceId, chain, chainName, scope, storeIds, validFrom, validTo, sourceUrl, checkedAt, extraText }
 * @returns {{offers: object[], rejected: string|null}}
 */
export function normalizeRaw(raw) {
  const title = (raw.title || '').trim();
  const desc = (raw.description || '').trim();
  const all = `${title} ${desc} ${raw.extraText || ''}`;
  const brands = detectBrands(title, desc);
  if (!brands.length) return { offers: [], rejected: null }; // geen relevant product
  const price = typeof raw.price === 'number' ? raw.price : num(raw.price);
  if (!(price > 0 && price < 100)) return { offers: [], rejected: `Geen geldige prijs: "${title}"` };
  const sizes = parseSizes(`${title} ${desc}`);
  if (!sizes.length) return { offers: [], rejected: `Inhoud niet herkend: "${title} — ${desc}"` };
  const deposits = parseDeposits(all);
  const conditions = parseConditions(all);
  if (raw.conditionsText) conditions.notes.push(raw.conditionsText);
  const v = parseVariants(`${title} ${desc}`);
  const offers = [];
  sizes.forEach((size, idx) => {
    for (const b of brands) {
      const packType = parsePackType(all, b.category);
      if (!packType) continue;
      // Statiegeld per eenheid bepalen
      let depositPerUnit = null;
      let depositSource = 'onbekend';
      const stated = deposits.length ? deposits[Math.min(idx, deposits.length - 1)] : null;
      if (stated != null) {
        if (size.unitsPerPack === 1) depositPerUnit = stated;
        else if (stated > 0.26) depositPerUnit = round2(stated / size.unitsPerPack); // bedrag voor de hele verpakking
        else depositPerUnit = stated; // "je ... zzgl. 0,25 € Pfand"
        depositSource = 'bron';
      } else if (packType === 'blik') {
        depositPerUnit = 0.25; // Einwegpfand geldt in Duitsland voor alle drankblikjes
        depositSource = 'afgeleid';
      }
      const base = {
        sourceId: raw.sourceId,
        chain: raw.chain,
        chainName: raw.chainName,
        scope: raw.scope,
        storeIds: raw.storeIds || [],
        category: b.category,
        brand: b.brand,
        product: title,
        description: desc,
        variants: v.variants,
        variantsOpen: v.variantsOpen || brands.length > 1,
        variantAssumed: v.variantAssumed,
        sugarTypes: v.sugarTypes,
        packType,
        unitVolumeL: size.unitVolumeL,
        unitsPerPack: size.unitsPerPack,
        packPrice: round2(price),
        depositPerUnit,
        depositSource,
        validFrom: raw.validFrom || null,
        validTo: raw.validTo || null,
        conditions,
        sourceUrl: raw.sourceUrl,
        checkedAt: raw.checkedAt,
      };
      const prices = computePrices(base);
      if (prices.pricePerLiter == null || prices.pricePerLiterExact < 0.1 || prices.pricePerLiterExact > 15) continue; // onwaarschijnlijk: niet tonen
      const id = stableId([raw.sourceId, (raw.storeIds || []).join(','), b.brand, title, size.unitVolumeL, size.unitsPerPack, packType, raw.validFrom, raw.validTo]);
      offers.push({ id, ...base, ...prices });
    }
  });
  return { offers, rejected: offers.length ? null : `Geen bruikbare verpakking: "${title}"` };
}
