// Datumhulpjes. Alle datums als YYYY-MM-DD in Duitse/Nederlandse tijd (beide Europe/Berlin-zone).

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Unix-milliseconden -> YYYY-MM-DD in Europe/Berlin. */
export function msToBerlinDate(ms) {
  return fmt.format(new Date(Number(ms)));
}

/**
 * "19.10. bis 25.10." (zonder jaar) -> { validFrom, validTo }.
 * Het jaar wordt afgeleid van de rundatum; over de jaargrens heen wordt correct doorgeteld.
 */
export function parseGermanRange(text, todayISO) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*(?:bis|–|-)\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/i.exec(text);
  if (!m) return null;
  const [ty, tm] = todayISO.split('-').map(Number);
  const yearFor = (month, explicit) => {
    if (explicit) return explicit.length === 2 ? 2000 + Number(explicit) : Number(explicit);
    if (tm === 12 && month === 1) return ty + 1;
    if (tm === 1 && month === 12) return ty - 1;
    return ty;
  };
  const p = (n) => String(n).padStart(2, '0');
  const fy = yearFor(Number(m[2]), m[3]);
  let toY = yearFor(Number(m[5]), m[6]);
  if (Number(m[5]) < Number(m[2]) && !m[6]) toY = fy + 1;
  return { validFrom: `${fy}-${p(m[2])}-${p(m[1])}`, validTo: `${toY}-${p(m[5])}-${p(m[4])}` };
}

/** Datum in formaat DD.MM.YYYY, DD-MM-YYYY of YYYY-MM-DD -> YYYY-MM-DD (of null). */
export function parseAnyDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
