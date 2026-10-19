#!/usr/bin/env node
// Verzamelt aanbiedingen uit alle bronnen, normaliseert ze en schrijft data/offers.json.
// Gebruik:  node scripts/collect.mjs            (alle bronnen)
//           node scripts/collect.mjs --offline  (alleen handmatige invoer; handig om lokaal te testen)
//           node scripts/collect.mjs --manual-only (alleen data/manual-offers.csv opnieuw inlezen; rest ongewijzigd)
//           node scripts/collect.mjs --dry-run  (niets wegschrijven)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergeResults, shouldWrite } from './lib/merge.mjs';
import { todayISO } from '../assets/logic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const DRY = args.has('--dry-run');
const MANUAL_ONLY = args.has('--manual-only');
const inActions = !!process.env.GITHUB_ACTIONS;

const readJson = async (p, fallback = null) => {
  try {
    return JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
  } catch {
    return fallback;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, OFFLINE ? 0 : ms));

function makeFetchers(userAgent) {
  async function get(url, accept) {
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: accept, 'Accept-Language': 'de-DE,de;q=0.9' }, signal: AbortSignal.timeout(25000) });
        if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status} (toegang geweigerd of te veel verzoeken; niet omzeild)`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (e) {
        lastErr = e;
        if (attempt === 1) await sleep(3000);
      }
    }
    throw lastErr;
  }
  return {
    fetchText: async (url) => (await get(url, 'text/html,application/xhtml+xml')).text(),
    fetchJson: async (url) => (await get(url, 'application/json')).json(),
  };
}

async function main() {
  const storesCfg = await readJson('config/stores.json');
  const sourcesCfg = await readJson('config/sources.json');
  const previous = await readJson('data/offers.json');
  const nowISO = new Date().toISOString();
  const today = todayISO();
  const stores = storesCfg.stores.filter((s) => s.active !== false);
  const { fetchText, fetchJson } = makeFetchers(sourcesCfg.userAgent);

  const results = [];
  for (const source of sourcesCfg.sources.filter((s) => s.enabled)) {
    const ctx = {
      source,
      stores,
      chains: storesCfg.chains,
      nowISO,
      today,
      sleep,
      fetchText,
      fetchJson,
      manualCsvPath: path.join(ROOT, 'data/manual-offers.csv'),
    };
    let result;
    if (MANUAL_ONLY && !['manual', 'unsupported'].includes(source.adapter)) {
      result = { status: 'keep', offers: [], rawCount: null, rejected: [], message: 'Niet opnieuw bevraagd (alleen handmatige invoer verwerkt).' };
    } else if (OFFLINE && !['manual', 'unsupported'].includes(source.adapter)) {
      result = { status: 'error', offers: [], rawCount: null, rejected: [], message: 'Niet gecontroleerd (offline-modus).' };
    } else {
      try {
        const mod = await import(`./adapters/${source.adapter}.mjs`);
        result = await mod.default(ctx);
      } catch (e) {
        // Een fout in één bron mag de rest nooit stoppen.
        result = { status: 'error', offers: [], rawCount: null, rejected: [], message: `Fout in koppeling: ${e.message}` };
      }
    }
    results.push({ source, ...result });
    const line = `[${source.id}] ${result.status} – ${result.offers.length} relevante aanbiedingen – ${result.message}`;
    console.log(line);
    if (inActions && result.status === 'error') console.log(`::warning title=Bron ${source.id}::${result.message}`);
    for (const r of (result.rejected || []).slice(0, 20)) console.log(`   overgeslagen: ${r}`);
  }

  const next = mergeResults(previous, results, nowISO);
  next.region = { cities: storesCfg.cities };
  const check = shouldWrite(previous, next);
  if (!check.ok) {
    console.log(`NIET weggeschreven: ${check.reason}`);
    if (inActions) console.log(`::error title=Update niet opgeslagen::${check.reason}`);
    process.exitCode = 0;
    return;
  }
  if (DRY) {
    console.log(`(dry-run) ${next.offers.length} aanbiedingen, niets weggeschreven.`);
    return;
  }
  await writeFile(path.join(ROOT, 'data/offers.json'), JSON.stringify(next, null, 1) + '\n');
  console.log(`Klaar: ${next.offers.length} aanbiedingen weggeschreven (${next.offers.filter((o) => o.stale).length} uit eerdere controle).`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
