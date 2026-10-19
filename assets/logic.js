// Gedeelde, pure rekenlogica. Wordt gebruikt door de frontend én door het verzamelscript en de tests.
// Geen DOM, geen netwerk.

export const EPS = 0.0001;

/** Rond een geldbedrag af op hele centen. */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Rond een prijs per liter af op hele centen. */
export function roundPerLiter(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Berekent afgeleide prijzen voor een aanbieding.
 * @param {{packPrice:number, unitsPerPack:number, unitVolumeL:number}} o
 */
export function computePrices(o) {
  const units = Math.max(1, Number(o.unitsPerPack) || 1);
  const vol = Number(o.unitVolumeL);
  const unitPrice = o.packPrice / units;
  const totalLiters = units * vol;
  const pricePerLiter = totalLiters > 0 ? o.packPrice / totalLiters : null;
  return {
    unitPrice: round2(unitPrice),
    unitPriceExact: unitPrice,
    pricePerLiter: pricePerLiter == null ? null : roundPerLiter(pricePerLiter),
    pricePerLiterExact: pricePerLiter,
    totalLiters,
  };
}

/** Statiegeld voor één verpakking (alle eenheden samen). null = onbekend. */
export function depositPerPack(o) {
  if (o.depositPerUnit == null) return null;
  return round2(o.depositPerUnit * Math.max(1, o.unitsPerPack || 1));
}

/** Formatteert ISO-datum (YYYY-MM-DD) als 19-10-2026. */
export function fmtDate(iso) {
  if (!iso) return '?';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/** Formatteert een bedrag als € 1,23. */
export function fmtEuro(n) {
  if (n == null || Number.isNaN(n)) return '€ ?';
  return '€ ' + n.toFixed(2).replace('.', ',');
}

/** Formatteert inhoud: 0.25 -> "0,25 l", 2 -> "2 l". */
export function fmtVolume(l) {
  if (l == null) return '?';
  return String(Number(l.toFixed(3))).replace('.', ',') + ' l';
}

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function todayISO(tz = 'Europe/Amsterdam', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Geldigheid van een aanbieding op een datum.
 * @returns {'actueel'|'toekomstig'|'verlopen'}
 */
export function validityOn(offer, dateISO) {
  if (offer.validTo && dateISO > offer.validTo) return 'verlopen';
  if (offer.validFrom && dateISO < offer.validFrom) return 'toekomstig';
  return 'actueel';
}

/** Is dit een gewone frisdrank in het standaardformaat (exact 2 liter)? */
export function isStandardSize(offer) {
  if (offer.category !== 'frisdrank') return true;
  return Math.abs(offer.unitVolumeL - 2) < EPS;
}

/** Komt de aanbieding overeen met een gekozen smaak? */
export function coversVariant(offer, variant) {
  if (!variant) return true;
  if ((offer.variants || []).some((v) => v.toLowerCase() === variant.toLowerCase())) return true;
  return !!offer.variantsOpen; // "versch. Sorten": smaak niet uitgesloten, wel controleren in winkel
}

/**
 * Filtert aanbiedingen volgens de instellingen van de gebruiker.
 * @param {object[]} offers
 * @param {object} f filterstate
 * @param {object[]} stores  winkels uit de configuratie
 */
export function applyFilters(offers, f, stores) {
  const storeById = new Map(stores.map((s) => [s.id, s]));
  return offers.filter((o) => {
    if (!f.showOtherSizes && !isStandardSize(o)) return false;
    if (f.chains?.length && !f.chains.includes(o.chain)) return false;
    if (f.brands?.length && !f.brands.includes(o.brand)) return false;
    if (f.category && f.category !== 'alle' && o.category !== f.category) return false;
    if (f.packType && f.packType !== 'alle') {
      if (f.packType === 'los' && o.unitsPerPack !== 1) return false;
      if (f.packType === 'multipack' && o.unitsPerPack === 1) return false;
    }
    if (f.sugar && f.sugar !== 'alle') {
      const s = o.sugarTypes || [];
      if (!s.includes(f.sugar) && !o.variantsOpen) return false;
    }
    if (f.variant && !coversVariant(o, f.variant)) return false;
    if (f.noConditions && (o.conditions?.loyaltyCard || o.conditions?.appCoupon)) return false;
    if (f.cities?.length) {
      if (o.scope === 'store') {
        const ok = (o.storeIds || []).some((id) => f.cities.includes(storeById.get(id)?.city));
        if (!ok) return false;
      } else {
        // Landelijke aanbieding: alleen tonen als de keten een bevestigd filiaal in de gekozen plaatsen heeft.
        const ok = stores.some((s) => s.chain === o.chain && f.cities.includes(s.city));
        if (!ok) return false;
      }
    }
    if (f.storeIds?.length && o.scope === 'store') {
      if (!(o.storeIds || []).some((id) => f.storeIds.includes(id))) return false;
    }
    return true;
  });
}

/** Verdeelt aanbiedingen over actueel / toekomstig / verlopen voor een datum. */
export function splitByValidity(offers, dateISO) {
  const out = { actueel: [], toekomstig: [], verlopen: [] };
  for (const o of offers) out[validityOn(o, dateISO)].push(o);
  return out;
}

/** Sleutel voor "gelijkwaardige verpakking": zelfde inhoud per eenheid en zelfde aantal. */
export function packKey(o) {
  return `${o.packType}|${o.unitVolumeL}|${o.unitsPerPack}`;
}

/**
 * Vergelijkingswaarde binnen een groep. Als alle aanbiedingen dezelfde inhoud per eenheid hebben,
 * vergelijken we op prijs per fles/blik; anders op prijs per liter.
 */
export function comparisonBasis(groupOffers) {
  const vols = new Set(groupOffers.map((o) => o.unitVolumeL));
  return vols.size <= 1 ? 'unit' : 'liter';
}

export function sortGroup(groupOffers) {
  const basis = comparisonBasis(groupOffers);
  const val = (o) => (basis === 'unit' ? o.unitPriceExact ?? o.unitPrice : o.pricePerLiterExact ?? o.pricePerLiter);
  return {
    basis,
    offers: [...groupOffers].sort((a, b) => val(a) - val(b) || a.packPrice - b.packPrice || a.chainName.localeCompare(b.chainName)),
  };
}

/** Groepeert per categorie > merk > variant. Aanbiedingen met meerdere smaken komen in de groep "Diverse smaken". */
export function groupByProduct(offers) {
  const groups = new Map();
  for (const o of offers) {
    const variantLabel = o.variantsOpen || (o.variants || []).length !== 1 ? 'Diverse smaken' : o.variants[0];
    const key = `${o.category}|${o.brand}|${variantLabel}`;
    if (!groups.has(key)) groups.set(key, { key, category: o.category, brand: o.brand, variant: variantLabel, offers: [] });
    groups.get(key).offers.push(o);
  }
  const arr = [...groups.values()].map((g) => ({ ...g, ...sortGroup(g.offers) }));
  const catOrder = { frisdrank: 0, energy: 1 };
  arr.sort((a, b) => catOrder[a.category] - catOrder[b.category] || a.brand.localeCompare(b.brand) || a.variant.localeCompare(b.variant));
  for (const g of arr) {
    const best = g.offers[0];
    g.cheapestId = best ? best.id : null;
  }
  return arr;
}

/** Locatiesleutel voor groepering per winkel: filiaal of landelijke folder van een keten. */
export function locationKeys(offer) {
  if (offer.scope === 'store' && offer.storeIds?.length) return offer.storeIds.map((id) => `store:${id}`);
  return [`chain:${offer.chain}`];
}

export function groupByStore(offers) {
  const map = new Map();
  for (const o of offers) {
    for (const k of locationKeys(o)) {
      if (!map.has(k)) map.set(k, { key: k, chain: o.chain, chainName: o.chainName, storeId: k.startsWith('store:') ? k.slice(6) : null, offers: [] });
      map.get(k).offers.push(o);
    }
  }
  for (const g of map.values()) {
    g.offers.sort((a, b) => (a.category === b.category ? 0 : a.category === 'frisdrank' ? -1 : 1) || a.brand.localeCompare(b.brand) || a.unitPriceExact - b.unitPriceExact);
  }
  return [...map.values()].sort((a, b) => a.chainName.localeCompare(b.chainName) || String(a.storeId).localeCompare(String(b.storeId)));
}

/**
 * Hoeveel verpakkingen moeten er gekocht worden voor een gewenst aantal eenheden?
 * Rondt naar boven af op hele verpakkingen en geeft het aantal extra eenheden terug.
 */
export function packsForUnits(desiredUnits, unitsPerPack) {
  const upp = Math.max(1, unitsPerPack || 1);
  const want = Math.max(0, Math.floor(desiredUnits));
  const packs = Math.ceil(want / upp);
  return { packs, units: packs * upp, extraUnits: packs * upp - want };
}

/** Respecteert minimale afname en aankooplimiet. */
export function checkQuantity(packs, conditions = {}) {
  const warnings = [];
  if (conditions.minQty && packs > 0 && packs < conditions.minQty) warnings.push(`Aanbiedingsprijs pas vanaf ${conditions.minQty} stuks.`);
  if (conditions.maxQty && packs > conditions.maxQty) warnings.push(`Aankooplimiet: maximaal ${conditions.maxQty} stuks per klant.`);
  return warnings;
}

/** Past de aanbieding bij het gewenste product (zelfde merk, smaak, inhoud, verpakkingssoort)? */
export function matchesWanted(offer, wanted) {
  if (offer.brand !== wanted.brand) return false;
  if (offer.packType !== wanted.packType) return false;
  if (Math.abs(offer.unitVolumeL - wanted.unitVolumeL) > EPS) return false;
  if (wanted.lockPack && offer.unitsPerPack !== wanted.unitsPerPack) return false;
  if (wanted.variant && !coversVariant(offer, wanted.variant)) return false;
  return true;
}

/**
 * Kosten om een gewenst aantal eenheden via een aanbieding te kopen.
 * Houdt rekening met multipacks (naar boven afronden) en aankoopvoorwaarden.
 */
export function costFor(offer, desiredUnits) {
  const { packs, units, extraUnits } = packsForUnits(desiredUnits, offer.unitsPerPack);
  const subtotal = round2(packs * offer.packPrice);
  const dpp = depositPerPack(offer);
  const deposit = dpp == null ? null : round2(packs * dpp);
  return { packs, units, extraUnits, subtotal, deposit, depositKnown: dpp != null, total: round2(subtotal + (deposit || 0)) };
}

/**
 * Kiest per lijstregel de goedkoopste passende aanbieding.
 * Merken en smaken worden nooit omgewisseld. Een aanbieding met een aankooplimiet die te laag is, wordt overgeslagen.
 * @returns {{itemId:string, offerId:string|null, reason:string, cost?:object}[]}
 */
export function chooseCheapest(items, offers) {
  return items.map((item) => {
    if (!item.wanted.variant) return { itemId: item.id, offerId: null, reason: 'Kies eerst een smaak; anders zou er een andere smaak gekozen kunnen worden.' };
    const candidates = offers
      .filter((o) => matchesWanted(o, item.wanted))
      .map((o) => ({ o, c: costFor(o, item.desiredUnits) }))
      .filter(({ o, c }) => !(o.conditions?.maxQty && c.packs > o.conditions.maxQty))
      .filter(({ o, c }) => !(o.conditions?.minQty && c.packs < o.conditions.minQty));
    if (!candidates.length) return { itemId: item.id, offerId: null, reason: 'Geen passende geldige aanbieding binnen de huidige filters.' };
    candidates.sort((a, b) => a.c.subtotal - b.c.subtotal || (a.c.deposit ?? 0) - (b.c.deposit ?? 0) || a.c.extraUnits - b.c.extraUnits);
    const best = candidates[0];
    return { itemId: item.id, offerId: best.o.id, reason: 'goedkoopste', cost: best.c };
  });
}

/**
 * Controleert een lijstregel tegen de actuele data.
 * @returns {string[]} waarschuwingen
 */
export function checkListItem(item, offersById, plannedDate) {
  const w = [];
  const cur = offersById.get(item.offerId);
  if (!cur) {
    w.push('Deze aanbieding staat niet meer in de laatste gegevens. Controleer de prijs opnieuw of kies een andere aanbieding.');
    if (item.snapshot?.validTo && plannedDate > item.snapshot.validTo) w.push(`Was geldig t/m ${fmtDate(item.snapshot.validTo)}.`);
    return w;
  }
  if (Math.abs(cur.packPrice - item.snapshot.packPrice) > EPS) w.push(`Prijs gewijzigd: was ${fmtEuro(item.snapshot.packPrice)}, nu ${fmtEuro(cur.packPrice)}.`);
  const v = validityOn(cur, plannedDate);
  if (v === 'verlopen') w.push(`Verlopen op je winkeldatum (geldig t/m ${fmtDate(cur.validTo)}).`);
  if (v === 'toekomstig') w.push(`Nog niet geldig op je winkeldatum (vanaf ${fmtDate(cur.validFrom)}).`);
  if (cur.stale) w.push('Bron kon bij de laatste update niet worden gecontroleerd; prijs is van een eerdere controle.');
  return w;
}

/**
 * Totalen van de boodschappenlijst, gegroepeerd per winkel/filiaal.
 */
export function listTotals(items, offersById) {
  const groups = new Map();
  const grand = { subtotal: 0, deposit: 0, total: 0, depositUnknown: false };
  for (const item of items) {
    const offer = offersById.get(item.offerId) || item.snapshot;
    const cost = costFor(offer, item.desiredUnits);
    const key = item.locationKey || locationKeys(offer)[0];
    if (!groups.has(key)) groups.set(key, { key, chain: offer.chain, chainName: offer.chainName, items: [], subtotal: 0, deposit: 0, total: 0, depositUnknown: false });
    const g = groups.get(key);
    g.items.push({ item, offer, cost });
    g.subtotal = round2(g.subtotal + cost.subtotal);
    g.deposit = round2(g.deposit + (cost.deposit || 0));
    if (!cost.depositKnown) g.depositUnknown = true;
    g.total = round2(g.subtotal + g.deposit);
  }
  for (const g of groups.values()) {
    grand.subtotal = round2(grand.subtotal + g.subtotal);
    grand.deposit = round2(grand.deposit + g.deposit);
    if (g.depositUnknown) grand.depositUnknown = true;
  }
  grand.total = round2(grand.subtotal + grand.deposit);
  return { groups: [...groups.values()], grand };
}
