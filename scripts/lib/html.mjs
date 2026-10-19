// Eenvoudige HTML -> tekstregels conversie zonder externe afhankelijkheden.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', shy: '' };

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}

export function htmlToLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<(br|\/p|\/div|\/h\d|\/li|\/a|\/button|\/section|\/article|\/header|\/footer|\/span|\/strong|\/b|\/sup|\/td|\/tr)\s*\/?>/gi, '$&\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
