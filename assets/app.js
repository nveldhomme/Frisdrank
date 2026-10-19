import {
  applyFilters, splitByValidity, groupByProduct, groupByStore, locationKeys, todayISO, fmtDate, fmtEuro, fmtVolume,
  costFor, packsForUnits, checkQuantity, checkListItem, listTotals, chooseCheapest, matchesWanted, depositPerPack, validityOn,
} from './logic.js';

const LS_LIST = 'frisdrankradar.lijst.v1';
const LS_FILTERS = 'frisdrankradar.filters.v1';
const DEFAULT_FILTERS = { date: null, cities: [], chains: [], brands: [], category: 'alle', sugar: 'alle', packType: 'alle', noConditions: false, showOtherSizes: false };

const state = { data: null, storesCfg: null, storeById: new Map(), offersById: new Map(), filters: { ...DEFAULT_FILTERS }, list: [], tab: 'home', isDemo: false };

/* ---------- Hulpjes ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* opslag niet beschikbaar */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const dayName = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short' }) : '');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'onbekend');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3200);
}

const unitWord = (o, n = 1) => (o.packType === 'blik' ? (n === 1 ? 'blik' : 'blikjes') : n === 1 ? 'fles' : 'flessen');
function packLabel(o) {
  if (o.unitsPerPack > 1) return `${o.unitsPerPack} × ${fmtVolume(o.unitVolumeL)} ${unitWord(o, 2)} (multipack)`;
  return `${o.packType === 'blik' ? 'Los blik' : 'Losse fles'} ${fmtVolume(o.unitVolumeL)}`;
}
function variantLabel(o) {
  if (o.variantsOpen) return 'Diverse smaken' + ((o.variants || []).length ? ` (o.a. ${o.variants.join(', ')})` : '');
  return (o.variants || []).join(' / ') + (o.variantAssumed ? ' · smaak niet vermeld' : '');
}
function storeLabel(id) {
  const s = state.storeById.get(id);
  return s ? `${s.name}, ${s.address}, ${s.city}` : id;
}
function whereLabel(o) {
  if (o.scope === 'store' && o.storeIds?.length) {
    const first = storeLabel(o.storeIds[0]);
    return `${o.chainName} · ${first}${o.storeIds.length > 1 ? ` (+${o.storeIds.length - 1} filialen)` : ''}`;
  }
  return `${o.chainName} · landelijke folder`;
}
function depositLabel(o) {
  if (o.depositPerUnit == null) return 'statiegeld onbekend (niet vermeld)';
  return `+ ${fmtEuro(o.depositPerUnit)} statiegeld per ${unitWord(o)}${o.depositSource === 'afgeleid' ? ' (afgeleid)' : ''}`;
}
function validityLabel(o) {
  if (!o.validTo && o.validFrom) return `vanaf ${dayName(o.validFrom)} ${fmtDate(o.validFrom)}, zolang de voorraad strekt`;
  if (!o.validTo) return 'geldigheid onbekend';
  if (!o.validFrom) return `t/m ${dayName(o.validTo)} ${fmtDate(o.validTo)} (startdatum niet vermeld)`;
  return `${dayName(o.validFrom)} ${fmtDate(o.validFrom)} t/m ${dayName(o.validTo)} ${fmtDate(o.validTo)}`;
}
function conditionBadges(o) {
  const c = o.conditions || {};
  const b = [];
  if (c.loyaltyCard) b.push('<span class="badge warn">Klantenkaart nodig</span>');
  if (c.appCoupon) b.push('<span class="badge warn">App / coupon nodig</span>');
  if (c.minQty) b.push(`<span class="badge warn">Vanaf ${c.minQty} stuks</span>`);
  if (c.maxQty) b.push(`<span class="badge warn">Max. ${c.maxQty} per klant</span>`);
  if (o.scope !== 'store') b.push('<span class="badge info">Landelijk – niet per filiaal bevestigd</span>');
  if (o.variantsOpen) b.push('<span class="badge info">Smaak in winkel controleren</span>');
  if (o.stale) b.push('<span class="badge bad">Uit eerdere controle</span>');
  if (o.manual) b.push('<span class="badge">Handmatig ingevoerd</span>');
  return b.join(' ');
}
function inList(offerId) { return state.list.some((i) => i.offerId === offerId); }

/* ---------- Data ---------- */
async function load() {
  const params = new URLSearchParams(location.search);
  state.isDemo = params.get('demo') === '1';
  const dataUrl = state.isDemo ? 'data/demo-offers.json' : 'data/offers.json';
  try {
    const [d, s] = await Promise.all([
      fetch(dataUrl, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('config/stores.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    state.data = d;
    state.storesCfg = s;
  } catch (e) {
    $('#update-status').textContent = 'Gegevens konden niet worden geladen';
    $('#view-home').innerHTML = `<div class="notice bad">De aanbiedingsgegevens konden niet worden geladen (${esc(e.message)}). Probeer het later opnieuw.</div>`;
    return;
  }
  state.isDemo = state.isDemo || !!state.data.isDemo;
  state.storesCfg.stores = state.storesCfg.stores.filter((x) => x.active !== false);
  state.storeById = new Map(state.storesCfg.stores.map((x) => [x.id, x]));
  state.offersById = new Map(state.data.offers.map((o) => [o.id, o]));
  state.filters = { ...DEFAULT_FILTERS, ...ls.get(LS_FILTERS, {}) };
  if (!state.filters.date || state.filters.date < todayISO()) state.filters.date = todayISO();
  state.list = ls.get(LS_LIST, []);
  renderHeader();
  renderFilterControls();
  render();
}

function currentOffers() {
  const filtered = applyFilters(state.data.offers, state.filters, state.storesCfg.stores);
  return splitByValidity(filtered, state.filters.date);
}

/* ---------- Kop & filters ---------- */
function renderHeader() {
  const d = state.data;
  const st = $('#update-status');
  $('#demo-banner').hidden = !state.isDemo;
  if (state.isDemo) { st.textContent = 'Demonstratiegegevens'; return; }
  if (!d.lastSuccessfulUpdate) {
    st.textContent = 'Nog geen automatische update';
    st.classList.add('old');
    return;
  }
  const ageDays = (Date.now() - new Date(d.lastSuccessfulUpdate).getTime()) / 86400000;
  st.textContent = `Bijgewerkt: ${fmtDateTime(d.lastSuccessfulUpdate)}`;
  st.title = `Laatste succesvolle automatische update. Laatste poging: ${fmtDateTime(d.generatedAt)}`;
  if (ageDays > 8) { st.classList.add('old'); st.textContent += ' (verouderd)'; }
}

function chipGroup(el, values, selected, labelFn = (v) => v) {
  el.innerHTML = values.map((v) => `<button type="button" class="chip" data-value="${esc(v)}" aria-pressed="${selected.includes(v)}">${esc(labelFn(v))}</button>`).join('');
}

function renderFilterControls() {
  const f = state.filters;
  $('#f-date').value = f.date;
  $('#f-date').min = todayISO();
  chipGroup($('#f-cities'), state.storesCfg.cities, f.cities);
  const chainsPresent = Object.keys(state.storesCfg.chains).filter((c) => state.storesCfg.stores.some((s) => s.chain === c));
  chipGroup($('#f-chains'), chainsPresent, f.chains, (c) => state.storesCfg.chains[c]);
  const brands = ['Coca-Cola', 'Fanta', 'Sprite', 'Mezzo Mix', 'Pepsi', '7UP', 'Schwip Schwap', 'Mirinda', 'Monster Energy', 'Red Bull'];
  chipGroup($('#f-brands'), brands, f.brands);
  $('#f-category').value = f.category;
  $('#f-sugar').value = f.sugar;
  $('#f-pack').value = f.packType;
  $('#f-noconditions').checked = f.noConditions;
  $('#f-othersizes').checked = f.showOtherSizes;
  const n = f.cities.length + f.chains.length + f.brands.length + (f.category !== 'alle') + (f.sugar !== 'alle') + (f.packType !== 'alle') + f.noConditions + f.showOtherSizes;
  $('#filter-badge').hidden = !n;
  $('#filter-badge').textContent = n;
}

function saveFilters() {
  ls.set(LS_FILTERS, { ...state.filters, date: state.filters.date });
  renderFilterControls();
  render();
}

function bindControls() {
  $('#toggle-filters').addEventListener('click', (e) => {
    const box = $('#filters');
    box.hidden = !box.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
  });
  $('#f-date').addEventListener('change', (e) => { state.filters.date = e.target.value || todayISO(); saveFilters(); });
  for (const [id, key] of [['#f-cities', 'cities'], ['#f-chains', 'chains'], ['#f-brands', 'brands']]) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const v = b.dataset.value;
      const arr = state.filters[key];
      state.filters[key] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
      saveFilters();
    });
  }
  $('#f-category').addEventListener('change', (e) => { state.filters.category = e.target.value; saveFilters(); });
  $('#f-sugar').addEventListener('change', (e) => { state.filters.sugar = e.target.value; saveFilters(); });
  $('#f-pack').addEventListener('change', (e) => { state.filters.packType = e.target.value; saveFilters(); });
  $('#f-noconditions').addEventListener('change', (e) => { state.filters.noConditions = e.target.checked; saveFilters(); });
  $('#f-othersizes').addEventListener('change', (e) => { state.filters.showOtherSizes = e.target.checked; saveFilters(); });
  $('#reset-filters').addEventListener('click', () => { state.filters = { ...DEFAULT_FILTERS, date: state.filters.date }; saveFilters(); });

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    setTab(b.dataset.tab);
  });
  document.querySelector('main').addEventListener('click', onMainClick);
  document.querySelector('main').addEventListener('change', onMainChange);
}

function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const v of ['home', 'product', 'store', 'list', 'sources']) $('#view-' + v).hidden = v !== tab;
  $('#controls').hidden = tab === 'sources';
  render();
  window.scrollTo({ top: 0 });
}

/* ---------- Kaarten ---------- */
function offerCard(o, { best = false, basis = 'unit' } = {}) {
  const added = inList(o.id);
  const perMain = basis === 'liter' ? `${fmtEuro(o.pricePerLiter)} per liter · ${fmtEuro(o.unitPrice)} per ${unitWord(o)}` : `${fmtEuro(o.unitPrice)} per ${unitWord(o)} · ${fmtEuro(o.pricePerLiter)}/l`;
  return `<article class="card${best ? ' best' : ''}">
    <div class="title">${best ? '<span class="badge best">Goedkoopst gevonden</span> ' : ''}${esc(o.brand)} – ${esc(variantLabel(o))}</div>
    <div class="price-box"><div class="price">${fmtEuro(o.packPrice)}</div><div class="per">${perMain}</div></div>
    <div class="where">${esc(whereLabel(o))}</div>
    <div class="pack">${esc(packLabel(o))} · ${esc(depositLabel(o))}</div>
    <div class="details">
      <span>Geldig ${esc(validityLabel(o))}</span>
      ${conditionBadges(o)}
    </div>
    ${o.conditions?.notes?.length ? `<div class="details">${o.conditions.notes.map(esc).join(' · ')}</div>` : ''}
    <div class="actions">
      <span class="per"><a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">Bron</a> · gecontroleerd ${esc(fmtDateTime(o.checkedAt))}</span>
      <button class="add-btn${added ? ' added' : ''}" data-action="add" data-id="${esc(o.id)}">${added ? '✓ Op lijst' : '+ Op lijst'}</button>
    </div>
  </article>`;
}

function coverageNotice() {
  const s = state.data.sources || [];
  const ok = s.filter((x) => x.status === 'ok').map((x) => x.label);
  const err = s.filter((x) => x.status === 'error').map((x) => x.label);
  const pending = s.filter((x) => x.status === 'pending').map((x) => x.label);
  const uns = s.filter((x) => x.status === 'unsupported').map((x) => x.chainName || x.label);
  let html = '<div class="notice">';
  html += ok.length ? `<strong>Automatisch gecontroleerd:</strong> ${ok.map(esc).join(', ')}. ` : '<strong>Nog geen enkele bron automatisch gecontroleerd.</strong> ';
  if (pending.length) html += `<br><strong>Nog niet automatisch gecontroleerd:</strong> ${pending.map(esc).join(', ')}. `;
  if (err.length) html += `<br><strong>Niet gelukt bij laatste poging:</strong> ${err.map(esc).join(', ')}. `;
  if (uns.length) html += `<br><strong>Alleen via handmatige invoer:</strong> ${uns.map(esc).join(', ')}. `;
  html += '<br><button class="btn link" data-action="goto" data-tab="sources">Wat is er precies gecontroleerd?</button></div>';
  return html;
}

function futureAndExpired(split) {
  let html = '';
  if (split.toekomstig.length) {
    html += `<details class="more"><summary>Binnenkort geldig (${split.toekomstig.length}) – niet geldig op je winkeldatum</summary>${split.toekomstig.map((o) => offerCard(o)).join('')}</details>`;
  }
  if (split.verlopen.length) html += `<p class="lede">${split.verlopen.length} verlopen aanbieding(en) verborgen.</p>`;
  return html;
}

/* ---------- Weergaven ---------- */
function renderHome() {
  const split = currentOffers();
  const groups = groupByProduct(split.actueel);
  const d = state.filters.date;
  let html = `<h2>Waar koop ik ${d === todayISO() ? 'deze week' : 'op ' + dayName(d) + ' ' + fmtDate(d)} mijn frisdrank het goedkoopst?</h2>`;
  html += `<p class="lede">Per product de laagste gevonden prijs die geldig is op je winkeldatum${state.filters.showOtherSizes ? '' : ' (frisdrank: alleen flessen van 2 liter)'}.</p>`;
  if (!groups.length) {
    html += `<div class="empty">Geen geldige aanbiedingen gevonden voor ${esc(fmtDate(d))} met de huidige filters.${state.filters.showOtherSizes ? '' : '<br><button class="btn link" data-action="othersizes">Andere flesformaten tonen</button>'}</div>`;
  } else {
    for (const cat of ['frisdrank', 'energy']) {
      const gs = groups.filter((g) => g.category === cat);
      if (!gs.length) continue;
      html += `<div class="cat-label">${cat === 'frisdrank' ? 'Frisdrank' : 'Energydrank'}</div>`;
      for (const g of gs) {
        const o = g.offers[0];
        const per = g.basis === 'liter' ? `${fmtEuro(o.pricePerLiter)}/l` : `${fmtEuro(o.unitPrice)} per ${unitWord(o)}`;
        html += `<div class="answer">
          <div><div class="what">${esc(g.brand)} – ${esc(g.variant)}</div><div class="where">${esc(whereLabel(o))}</div></div>
          <div style="text-align:right"><div class="price">${fmtEuro(o.packPrice)}</div><div class="per">${per}</div></div>
          <div class="sub2"><span>${esc(packLabel(o))} · ${esc(validityLabel(o))} ${conditionBadges(o)}</span>
          <button class="add-btn${inList(o.id) ? ' added' : ''}" data-action="add" data-id="${esc(o.id)}">${inList(o.id) ? '✓ Op lijst' : '+ Op lijst'}</button></div>
        </div>`;
      }
    }
  }
  html += futureAndExpired(split);
  html += coverageNotice();
  $('#view-home').innerHTML = html;
}

function renderProduct() {
  const split = currentOffers();
  const groups = groupByProduct(split.actueel);
  let html = '<h2>Vergelijken per product</h2><p class="lede">Binnen elke groep staat de laagste prijs bovenaan. Gelijke inhoud: vergeleken per fles/blik. Verschillende inhoud: vergeleken per liter.</p>';
  if (!groups.length) html += '<div class="empty">Geen geldige aanbiedingen met de huidige filters.</div>';
  let lastCat = null;
  for (const g of groups) {
    if (g.category !== lastCat) { html += `<div class="cat-label">${g.category === 'frisdrank' ? 'Frisdrank' : 'Energydrank'}</div>`; lastCat = g.category; }
    html += `<div class="group"><div class="group-head"><h3>${esc(g.brand)} – ${esc(g.variant)}</h3><span class="meta">${g.offers.length} aanbieding(en) · vergeleken ${g.basis === 'liter' ? 'per liter' : 'per ' + unitWord(g.offers[0])}</span></div>`;
    html += g.offers.map((o, i) => offerCard(o, { best: i === 0, basis: g.basis })).join('');
    html += '</div>';
  }
  html += futureAndExpired(split);
  $('#view-product').innerHTML = html;
}

function renderStore() {
  const split = currentOffers();
  const groups = groupByStore(split.actueel);
  let html = '<h2>Bekijken per supermarkt</h2><p class="lede">Zie welke aanbiedingen je bij dezelfde winkel kunt combineren.</p>';
  if (!groups.length) html += '<div class="empty">Geen geldige aanbiedingen met de huidige filters.</div>';
  for (const g of groups) {
    let title, meta;
    if (g.storeId) {
      const s = state.storeById.get(g.storeId);
      const nm = s ? s.name : g.storeId;
      title = nm.toLowerCase().startsWith(g.chainName.toLowerCase().split(' ')[0]) ? nm : `${g.chainName} – ${nm}`;
      meta = s ? `${s.address}, ${s.city}` : '';
    } else {
      title = `${g.chainName} – landelijke folder`;
      const cities = state.filters.cities;
      const fil = state.storesCfg.stores.filter((s) => s.chain === g.chain && (!cities.length || cities.includes(s.city)));
      meta = `Geldt in deelnemende filialen. Bevestigde filialen in je regio: ${fil.map((s) => `${s.address} (${s.city})`).join('; ') || 'geen'}`;
    }
    html += `<div class="group"><div class="group-head"><h3>${esc(title)}</h3><span class="meta">${g.offers.length} aanbieding(en)</span></div><p class="lede">${esc(meta)}</p>`;
    let lastCat = null;
    for (const o of g.offers) {
      if (o.category !== lastCat) { html += `<div class="cat-label">${o.category === 'frisdrank' ? 'Frisdrank' : 'Energydrank'}</div>`; lastCat = o.category; }
      html += offerCard(o);
    }
    html += '</div>';
  }
  html += futureAndExpired(split);
  $('#view-store').innerHTML = html;
}

/* ---------- Boodschappenlijst ---------- */
function knownVariants(brand) {
  const set = new Set(['Original', 'Zero / suikervrij']);
  for (const o of state.data.offers) if (o.brand === brand) for (const v of o.variants || []) set.add(v);
  return [...set];
}

function locationTitle(key, offer) {
  if (key.startsWith('store:')) {
    const s = state.storeById.get(key.slice(6));
    const nm = s ? s.name : key.slice(6);
    return { title: nm.toLowerCase().startsWith(offer.chainName.toLowerCase().split(' ')[0]) ? nm : `${offer.chainName} – ${nm}`, sub: s ? `${s.address}, ${s.city}` : '' };
  }
  return { title: `${offer.chainName} – landelijke folder`, sub: 'Geldt in deelnemende filialen; kies zelf een filiaal in je regio.' };
}

function addToList(offerId) {
  const o = state.offersById.get(offerId);
  if (!o) return;
  if (inList(offerId)) { toast('Staat al op je lijst'); return; }
  const variant = !o.variantsOpen && (o.variants || []).length === 1 ? o.variants[0] : null;
  state.list.push({
    id: uid(), offerId, locationKey: locationKeys(o)[0], snapshot: o,
    wanted: { brand: o.brand, variant, packType: o.packType, unitVolumeL: o.unitVolumeL, unitsPerPack: o.unitsPerPack, lockPack: false },
    desiredUnits: o.unitsPerPack, checked: false,
  });
  saveList();
  toast(`${o.brand} toegevoegd${variant ? '' : ' – kies nog een smaak op je lijst'}`);
  render();
}

function saveList() {
  ls.set(LS_LIST, state.list);
  const n = state.list.length;
  $('#list-count').hidden = !n;
  $('#list-count').textContent = n;
}

function renderList() {
  const items = state.list;
  let html = '<h2>Boodschappenlijst</h2>';
  if (!items.length) {
    $('#view-list').innerHTML = html + '<div class="empty">Je lijst is nog leeg. Tik bij een aanbieding op <strong>+ Op lijst</strong>.</div>';
    return;
  }
  html += `<div class="btn-row no-print">
    <button class="btn primary" data-action="cheapest">Kies de goedkoopste aanbiedingen voor mijn lijst</button>
    <button class="btn ghost" data-action="copy">Kopieer als tekst</button>
    <button class="btn ghost" data-action="print">Printen</button>
    <button class="btn link" data-action="clear">Lijst wissen</button>
  </div>
  <p class="lede no-print">“Goedkoopste” vergelijkt alleen productprijzen binnen je filters en winkeldatum. Brandstofkosten en reistijd worden niet meegerekend. Merk, smaak en inhoud worden nooit omgewisseld.</p>
  <p class="lede">Winkeldatum: <strong>${esc(dayName(state.filters.date))} ${esc(fmtDate(state.filters.date))}</strong></p>`;
  const valid = currentOffers().actueel;
  const { groups, grand } = listTotals(items, state.offersById);
  for (const g of groups) {
    const lt = locationTitle(g.key, g.items[0].offer);
    html += `<section class="list-store"><header><h3>${esc(lt.title)}</h3><p>${esc(lt.sub)}</p></header>`;
    for (const { item, offer, cost } of g.items) {
      const warnings = [...checkListItem(item, state.offersById, state.filters.date), ...checkQuantity(cost.packs, offer.conditions)];
      if (!item.wanted.variant) warnings.push('Kies een smaak.');
      if (cost.extraUnits > 0) warnings.push(`Je krijgt ${cost.extraUnits} ${unitWord(offer, cost.extraUnits)} extra door afronding op hele verpakkingen.`);
      const multi = offer.unitsPerPack > 1;
      const variants = knownVariants(offer.brand);
      const alts = valid.filter((o) => matchesWanted(o, { ...item.wanted, variant: item.wanted.variant }));
      if (!alts.some((a) => a.id === offer.id) && state.offersById.has(offer.id)) alts.unshift(offer);
      html += `<div class="li${item.checked ? ' done' : ''}">
        <input type="checkbox" aria-label="Afvinken" data-action="check" data-item="${item.id}" ${item.checked ? 'checked' : ''}>
        <div>
          <div class="li-name">${esc(offer.brand)} – ${esc(item.wanted.variant || 'smaak nog kiezen')}</div>
          <div class="li-meta">${esc(packLabel(offer))} · ${fmtEuro(offer.packPrice)} per ${multi ? 'verpakking' : unitWord(offer)} · ${esc(validityLabel(offer))}</div>
        </div>
        <div class="li-price">${fmtEuro(cost.subtotal)}<div class="per">${cost.depositKnown ? '+ ' + fmtEuro(cost.deposit) + ' statiegeld' : 'statiegeld onbekend'}</div></div>
        <div class="li-badges">${conditionBadges(offer)}</div>
        <div class="li-ctrl">
          <span class="stepper"><button type="button" aria-label="Minder" data-action="dec" data-item="${item.id}">−</button><output>${cost.packs}</output><button type="button" aria-label="Meer" data-action="inc" data-item="${item.id}">+</button></span>
          <span class="unit-note">${multi ? `${cost.packs === 1 ? 'multipack' : 'multipacks'} = <strong>${cost.units} ${unitWord(offer, cost.units)}</strong>` : `<strong>${unitWord(offer, cost.packs)}</strong> (los)`}</span>
          <select data-action="variant" data-item="${item.id}" aria-label="Smaak">
            <option value="">Smaak kiezen…</option>
            ${variants.map((v) => `<option ${v === item.wanted.variant ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
          ${alts.length > 1 ? `<select data-action="switch" data-item="${item.id}" aria-label="Andere winkel of aanbieding">${alts.map((a) => `<option value="${esc(a.id)}" ${a.id === offer.id ? 'selected' : ''}>${esc(whereLabel(a))} – ${fmtEuro(a.packPrice)} (${a.unitsPerPack}×)</option>`).join('')}</select>` : ''}
          ${offer.unitsPerPack > 1 || alts.some((a) => a.unitsPerPack !== offer.unitsPerPack) ? `<label class="check unit-note"><input type="checkbox" data-action="lock" data-item="${item.id}" ${item.wanted.lockPack ? 'checked' : ''}> Alleen dit verpakkingsformaat</label>` : ''}
          <button class="btn link small" data-action="remove" data-item="${item.id}">Verwijderen</button>
        </div>
        ${warnings.length ? `<div class="li-warn">${warnings.map((w) => `<div class="notice warn">${esc(w)}</div>`).join('')}</div>` : ''}
      </div>`;
    }
    html += `<div class="totals"><div><span>Subtotaal (excl. statiegeld)</span><span>${fmtEuro(g.subtotal)}</span></div><div><span>Statiegeld${g.depositUnknown ? ' (deels onbekend)' : ''}</span><span>${fmtEuro(g.deposit)}</span></div><div class="grand"><span>Te betalen</span><span>${fmtEuro(g.total)}</span></div></div></section>`;
  }
  html += `<section class="grand-box"><div class="totals"><div><span>Totaal producten (excl. statiegeld)</span><span>${fmtEuro(grand.subtotal)}</span></div><div><span>Totaal statiegeld${grand.depositUnknown ? ' (deels onbekend)' : ''}</span><span>${fmtEuro(grand.deposit)}</span></div><div class="grand"><span>Totaal te betalen</span><span>${fmtEuro(grand.total)}</span></div></div></section>`;
  html += '<p class="lede">Statiegeld krijg je terug bij inleveren van de lege flessen/blikjes in Duitsland.</p>';
  $('#view-list').innerHTML = html;
}

function listAsText() {
  const { groups, grand } = listTotals(state.list, state.offersById);
  const lines = [`Boodschappenlijst frisdrank – winkeldatum ${fmtDate(state.filters.date)}`, ''];
  for (const g of groups) {
    const lt = locationTitle(g.key, g.items[0].offer);
    lines.push(`== ${lt.title}${lt.sub ? ' (' + lt.sub + ')' : ''} ==`);
    for (const { item, offer, cost } of g.items) {
      const qty = offer.unitsPerPack > 1 ? `${cost.packs}× ${offer.unitsPerPack}-pack (${cost.units} ${unitWord(offer, cost.units)})` : `${cost.packs} ${unitWord(offer, cost.packs)}`;
      lines.push(`[${item.checked ? 'x' : ' '}] ${offer.brand} ${item.wanted.variant || '(smaak?)'} ${fmtVolume(offer.unitVolumeL)} – ${qty} à ${fmtEuro(offer.packPrice)} = ${fmtEuro(cost.subtotal)} (+ statiegeld ${cost.depositKnown ? fmtEuro(cost.deposit) : 'onbekend'}) – geldig ${validityLabel(offer)}`);
    }
    lines.push(`   Subtotaal ${fmtEuro(g.subtotal)} + statiegeld ${fmtEuro(g.deposit)} = ${fmtEuro(g.total)}`, '');
  }
  lines.push(`TOTAAL: ${fmtEuro(grand.subtotal)} + statiegeld ${fmtEuro(grand.deposit)} = ${fmtEuro(grand.total)}`);
  lines.push('Let op: prijzen uit folders; controleer in de winkel. Brandstof en reistijd niet meegerekend.');
  return lines.join('\n');
}

/* ---------- Bronnen ---------- */
function renderSources() {
  const d = state.data;
  const icon = { ok: '✓ Gecontroleerd', manual: '✎ Handmatig', error: '! Niet gecontroleerd', pending: '… Nog niet gecontroleerd', unsupported: '– Geen automatische bron' };
  const cls = { ok: 'best', manual: '', error: 'bad', pending: 'warn', unsupported: 'warn' };
  let html = '<h2>Bronnen en dekking</h2>';
  html += `<p class="lede">Laatste automatische update: <strong>${d.lastSuccessfulUpdate ? esc(fmtDateTime(d.lastSuccessfulUpdate)) : 'nog niet uitgevoerd'}</strong>. Laatste poging: ${esc(fmtDateTime(d.generatedAt))}.</p>`;
  html += '<div class="notice">Er wordt geen volledige dekking geclaimd. “Geen aanbieding” betekent: niets gevonden in de gecontroleerde bronnen. Ketens zonder automatische bron worden alleen getoond als iemand de aanbieding handmatig heeft ingevoerd.</div>';
  for (const s of d.sources || []) {
    const relevant = d.offers.filter((o) => o.sourceId === s.id && !o.stale).length;
    let result = '';
    if (s.status === 'ok') result = relevant ? `${relevant} relevante aanbieding(en) gevonden.` : 'Gecontroleerd: geen aanbieding voor deze producten gevonden.';
    html += `<div class="src"><h4>${esc(s.label)} <span class="badge ${cls[s.status] || ''}">${icon[s.status] || esc(s.status)}</span></h4>
      <p>${esc(s.type || '')}${s.scope === 'national' ? ' · landelijk, niet per filiaal' : s.scope === 'store' ? ' · per filiaal' : ''}</p>
      ${result ? `<p>${esc(result)}</p>` : ''}
      <p>${esc(s.message || '')}</p>
      <p>Gecontroleerd: ${esc(fmtDateTime(s.checkedAt))}${s.lastSuccessAt ? ` · laatst gelukt: ${esc(fmtDateTime(s.lastSuccessAt))}` : ''}${s.url && /^https?:/.test(s.url) ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">website</a>` : ''}</p>
    </div>`;
  }
  html += '<h3>Bevestigde filialen in het zoekgebied</h3><table class="stores"><thead><tr><th>Keten</th><th>Filiaal</th><th>Plaats</th></tr></thead><tbody>';
  for (const s of [...state.storesCfg.stores].sort((a, b) => a.city.localeCompare(b.city) || a.chain.localeCompare(b.chain))) {
    html += `<tr><td>${esc(state.storesCfg.chains[s.chain])}</td><td>${esc(s.name)}, ${esc(s.address)}</td><td>${esc(s.city)}</td></tr>`;
  }
  html += '</tbody></table>';
  $('#view-sources').innerHTML = html;
}

/* ---------- Events ---------- */
function itemById(id) { return state.list.find((i) => i.id === id); }

function onMainClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'add') return addToList(t.dataset.id);
  if (a === 'goto') return setTab(t.dataset.tab);
  if (a === 'othersizes') { state.filters.showOtherSizes = true; return saveFilters(); }
  if (a === 'cheapest') {
    const valid = currentOffers().actueel;
    const res = chooseCheapest(state.list, valid);
    let changed = 0;
    const missing = [];
    for (const r of res) {
      const item = itemById(r.itemId);
      if (!r.offerId) { missing.push(`${item.wanted.brand}: ${r.reason}`); continue; }
      if (r.offerId !== item.offerId) {
        const o = state.offersById.get(r.offerId);
        item.offerId = o.id;
        item.snapshot = o;
        item.locationKey = locationKeys(o)[0];
        changed++;
      }
    }
    saveList();
    render();
    toast(`${changed} regel(s) omgezet naar een goedkopere aanbieding${missing.length ? `, ${missing.length} niet aangepast` : ''}.`);
    if (missing.length) alert('Niet aangepast:\n' + missing.join('\n'));
    return;
  }
  if (a === 'copy') {
    const txt = listAsText();
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Lijst gekopieerd'), () => prompt('Kopieer de tekst:', txt));
    return;
  }
  if (a === 'print') return window.print();
  if (a === 'clear') {
    if (confirm('Hele boodschappenlijst wissen?')) { state.list = []; saveList(); render(); }
    return;
  }
  const item = itemById(t.dataset.item);
  if (!item) return;
  const offer = state.offersById.get(item.offerId) || item.snapshot;
  const upp = offer.unitsPerPack || 1;
  if (a === 'inc' || a === 'dec') {
    const { packs } = packsForUnits(item.desiredUnits, upp);
    const next = Math.max(1, packs + (a === 'inc' ? 1 : -1));
    item.desiredUnits = next * upp;
  }
  if (a === 'remove') state.list = state.list.filter((i) => i !== item);
  saveList();
  render();
}

function onMainChange(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const item = itemById(t.dataset.item);
  if (!item) return;
  const a = t.dataset.action;
  if (a === 'check') item.checked = t.checked;
  if (a === 'variant') item.wanted.variant = t.value || null;
  if (a === 'lock') {
    const o = state.offersById.get(item.offerId) || item.snapshot;
    item.wanted.lockPack = t.checked;
    item.wanted.unitsPerPack = o.unitsPerPack;
  }
  if (a === 'switch') {
    const o = state.offersById.get(t.value);
    if (o) { item.offerId = o.id; item.snapshot = o; item.locationKey = locationKeys(o)[0]; }
  }
  saveList();
  render();
}

function render() {
  if (!state.data) return;
  saveList();
  ({ home: renderHome, product: renderProduct, store: renderStore, list: renderList, sources: renderSources })[state.tab]();
}

bindControls();
load();

// Exporteer voor handmatige controle in de console
window.__frisdrank = { state, depositPerPack, validityOn, costFor };
