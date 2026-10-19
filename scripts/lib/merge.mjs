// Combineert de resultaten van alle bronnen met de vorige gegevens.
// Regel: een bron die faalt, vervangt zijn oude gegevens NIET door een lege lijst.
// De laatste succesvolle aanbiedingen van die bron blijven staan, gemarkeerd als "stale".

/**
 * @param {object|null} previous  vorige offers.json (of null)
 * @param {object[]} results  per bron: { source, status: 'ok'|'error'|'unsupported'|'manual', offers, rawCount, message, rejected }
 * @param {string} nowISO  tijdstip van deze run
 */
export function mergeResults(previous, results, nowISO) {
  const prevSources = new Map((previous?.sources || []).map((s) => [s.id, s]));
  const prevOffersBySource = new Map();
  for (const o of previous?.offers || []) {
    if (!prevOffersBySource.has(o.sourceId)) prevOffersBySource.set(o.sourceId, []);
    prevOffersBySource.get(o.sourceId).push(o);
  }

  const sources = [];
  let offers = [];
  let anySuccess = false;

  for (const r of results) {
    const prev = prevSources.get(r.source.id);
    const entry = {
      id: r.source.id,
      chain: r.source.chain,
      chainName: r.source.chainName,
      label: r.source.label,
      type: r.source.type,
      scope: r.source.scope,
      url: r.source.url,
      storeIds: r.source.storeIds || [],
      status: r.status,
      checkedAt: nowISO,
      lastSuccessAt: prev?.lastSuccessAt || null,
      message: r.message || '',
      rawCount: r.rawCount ?? null,
      offerCount: 0,
      rejectedCount: (r.rejected || []).length,
    };
    if (r.status === 'ok' || r.status === 'manual') {
      if (r.status === 'ok') anySuccess = true; // handmatige invoer telt niet als automatische update
      entry.lastSuccessAt = nowISO;
      entry.offerCount = r.offers.length;
      offers.push(...r.offers.map((o) => ({ ...o, stale: false })));
      // Gedeeltelijk mislukt (bijv. één filiaal): oude aanbiedingen van díe filialen behouden als stale.
      if (r.failedStoreIds?.length) {
        const keep = (prevOffersBySource.get(r.source.id) || []).filter((o) => (o.storeIds || []).some((id) => r.failedStoreIds.includes(id)));
        offers.push(...keep.map((o) => ({ ...o, stale: true })));
        entry.offerCount += keep.length;
      }
    } else if (r.status === 'keep') {
      // Bron niet opnieuw bevraagd (bijv. alleen handmatige invoer verwerkt): vorige stand ongewijzigd overnemen.
      if (prev) Object.assign(entry, prev);
      else Object.assign(entry, { status: 'pending', message: 'Nog niet gecontroleerd; dit gebeurt bij de eerste automatische update.' });
      const old = prevOffersBySource.get(r.source.id) || [];
      entry.offerCount = old.length;
      offers.push(...old);
    } else if (r.status === 'error') {
      const old = (prevOffersBySource.get(r.source.id) || []).map((o) => ({ ...o, stale: true }));
      entry.offerCount = old.length;
      entry.message = (entry.message || 'Bron kon niet worden gecontroleerd.') + (old.length ? ` Laatste succesvolle gegevens (${old.length}) blijven zichtbaar.` : '');
      offers.push(...old);
    }
    sources.push(entry);
  }

  offers = dedupe(offers);
  offers.sort((a, b) => a.brand.localeCompare(b.brand) || a.unitPriceExact - b.unitPriceExact);

  return {
    schemaVersion: 1,
    isDemo: false,
    lastSuccessfulUpdate: anySuccess ? nowISO : previous?.lastSuccessfulUpdate || null,
    generatedAt: nowISO,
    sources,
    offers,
  };
}

/** Verwijdert dubbele aanbiedingen (zelfde id). Automatische bron wint van handmatige; verse wint van stale. */
export function dedupe(offers) {
  const byId = new Map();
  const rank = (o) => (o.stale ? 0 : 2) + (o.sourceId?.startsWith('handmatig') ? 0 : 1);
  for (const o of offers) {
    const cur = byId.get(o.id);
    if (!cur || rank(o) > rank(cur)) byId.set(o.id, o);
  }
  // Inhoudelijk dubbel (zelfde keten/filiaal/merk/verpakking/prijs/periode) tussen handmatig en automatisch
  const byContent = new Map();
  for (const o of byId.values()) {
    const k = [o.chain, (o.storeIds || []).join(','), o.brand, (o.variants || []).join('/'), o.variantsOpen, o.unitVolumeL, o.unitsPerPack, o.packType, o.packPrice, o.validTo, !!o.conditions?.appCoupon, !!o.conditions?.loyaltyCard].join('|');
    const cur = byContent.get(k);
    if (!cur || rank(o) > rank(cur)) byContent.set(k, o);
  }
  return [...byContent.values()];
}

/** Veiligheidscheck vóór wegschrijven: weiger een resultaat dat alles leegmaakt terwijl er eerder data was. */
export function shouldWrite(previous, next) {
  if (!previous || !(previous.offers || []).length) return { ok: true };
  const okSources = next.sources.filter((s) => s.status === 'ok' || s.status === 'manual').length;
  if (okSources === 0) return { ok: false, reason: 'Geen enkele bron gaf resultaat; vorige gegevens blijven ongewijzigd.' };
  return { ok: true };
}
