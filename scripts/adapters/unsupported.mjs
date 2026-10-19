// Bron zonder (betrouwbare/toegestane) automatische koppeling. Haalt niets op en meldt waarom.
export default async function unsupported(ctx) {
  return { status: 'unsupported', offers: [], rawCount: null, rejected: [], message: ctx.source.reason || 'Geen automatische koppeling.' };
}
