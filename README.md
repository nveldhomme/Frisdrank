# Frisdrank Radar

Webapp waarmee Pieter frisdrank- en energydrankaanbiedingen in de Duitse grensstreek (Emmerich am Rhein, Kleve, Goch, Kalkar, Rees, Isselburg, Bocholt, Rhede) vergelijkt en een boodschappenlijst per supermarkt maakt.

- **Statische site** (HTML/CSS/JavaScript, geen build-stap, geen account) via GitHub Pages.
- **Verzamelscript** (Node.js, geen externe pakketten) dat aanbiedingen ophaalt, normaliseert en opslaat in `data/offers.json`.
- **GitHub Actions** werkt de gegevens elke maandag rond 06:00 (Nederlandse tijd) bij en publiceert de site opnieuw. Ook handmatig te starten.

Zie [BRONNEN.md](BRONNEN.md) voor welke winkels automatisch worden gecontroleerd en waar de beperkingen zitten.

---

## Wat de app doet

| Weergave | Inhoud |
|---|---|
| **Goedkoopst** (startscherm) | Per product en smaak de laagste geldige prijs op de gekozen winkeldatum: “Waar koop ik deze week mijn frisdrank het goedkoopst?” |
| **Per product** | Alle aanbiedingen per merk/smaak, goedkoopste bovenaan met label. Gelijke inhoud → vergeleken per fles/blik; verschillende inhoud → per liter. |
| **Per winkel** | Alles per filiaal (of per landelijke folder), zodat je ziet wat je kunt combineren. |
| **Lijst** | Boodschappenlijst per winkel met aantallen, multipacks, subtotaal, statiegeld en totaal. Knop “Kies de goedkoopste aanbiedingen voor mijn lijst”. Afvinken, printen, kopiëren als tekst. Wordt in de browser bewaard. |
| **Bronnen** | Welke bronnen wanneer gecontroleerd zijn, met resultaat, plus alle bevestigde filialen. |

Belangrijke regels in de app:

- Frisdrank toont standaard alleen **flessen van exact 2 liter**. 1,25 / 1,5 / 1,75 liter alleen via het filter “Andere flesformaten tonen”.
- Monster en Red Bull: losse blikjes én multipacks, altijd met inhoud per blik en aantal per verpakking.
- Statiegeld staat altijd apart. “Afgeleid” = niet vermeld in de folder, maar bij blikjes wettelijk € 0,25. Bij flessen zonder vermelding staat “onbekend”.
- Een **landelijke** aanbieding (REWE-folder, Lidl-folder) wordt nooit als bevestigd voor een specifiek filiaal getoond.
- Toekomstige en verlopen aanbiedingen staan niet tussen de actuele resultaten.
- “Goedkoopste kiezen” wisselt nooit van merk, smaak of inhoud, rondt af op hele multipacks (extra eenheden worden getoond), respecteert aankooplimieten en rekent géén brandstof of reistijd mee.
- Als een aanbieding op de lijst verloopt, van prijs verandert of uit de gegevens verdwijnt, staat er een waarschuwing.
- Bij een mislukte update blijven de laatste succesvolle gegevens staan, duidelijk gemarkeerd als “uit eerdere controle”.

Demonstratiegegevens (verzonnen) zijn alleen zichtbaar via `?demo=1` en dan met een opvallende DEMO-balk.

---

## Online zetten (eenmalig, ±10 minuten)

De code staat al in [github.com/nveldhomme/frisdrank](https://github.com/nveldhomme/frisdrank). Nog te doen in GitHub:

1. **Pages aanzetten**: *Settings → Pages → Build and deployment → Source:* kies **GitHub Actions**.
2. **Schrijfrechten voor de workflow**: *Settings → Actions → General → Workflow permissions:* kies **Read and write permissions** en sla op.
3. **Eerste update draaien**: *Actions → “Aanbiedingen bijwerken en publiceren” → Run workflow*. Na een paar minuten staat de site op `https://nveldhomme.github.io/frisdrank/`.
4. Kijk daarna in de app op het tabblad **Bronnen** of EDEKA en REWE “✓ Gecontroleerd” tonen.

Er zijn **geen API-sleutels of secrets** nodig. GitHub Pages is gratis voor openbare repositories; voor een privé-repository is een betaald GitHub-plan nodig.

### Over de planning

- De workflow staat op maandag 05:47 met `timezone: Europe/Amsterdam`; zomer- en wintertijd gaan dus automatisch goed.
- GitHub garandeert **geen exact tijdstip**: geplande runs kunnen 15–60 minuten (soms meer) later starten. Daarom is gekozen voor 05:47 en niet voor precies 06:00 (het hele uur is het drukst).
- GitHub schakelt geplande workflows uit na **60 dagen zonder activiteit** in een openbare repository. De wekelijkse data-commit telt als activiteit. Staat er toch een melding in het tabblad Actions, klik dan op *Enable workflow*.
- Werkt het lokaal maar niet volgens schema: kijk in *Actions* of de workflow is uitgeschakeld.

---

## Lokaal draaien

Benodigd: Node.js 20 of nieuwer, Python 3 (alleen voor de lokale webserver).

```bash
npm test                       # controles op berekeningen, multipacks, statiegeld, datums, sortering
npm run collect                # alle bronnen ophalen (internet nodig)
npm run collect -- --manual-only   # alleen data/manual-offers.csv opnieuw inlezen
npm run demo                   # demo-gegevens opnieuw maken
npm run serve                  # open http://localhost:8080 (demo: http://localhost:8080/?demo=1)
```

---

## Handmatig aanbiedingen invoeren

Voor Kaufland, Lidl, Netto, ALDI SÜD, PENNY en drankenzaken is er (nog) geen betrouwbare automatische bron. Zie je een goede aanbieding in de folder of app, voeg dan een regel toe aan `data/manual-offers.csv`. Dat kan direct op GitHub: open het bestand → potloodje → regel toevoegen → *Commit changes*. De site wordt dan automatisch opnieuw gepubliceerd.

Scheidingsteken is `;`, decimalen mogen met komma. Voorbeeld:

```
kaufland;kaufland-emmerich;Coca-Cola;Coca-Cola;Original;nee;fles;2;1;1,49;0,25;2026-10-19;2026-10-24;nee;ja;;6;Alleen met Kaufland Card-coupon;https://filiale.kaufland.de/angebote/aktuelle-woche.html;2026-10-19
```

| Kolom | Betekenis |
|---|---|
| keten | `kaufland`, `lidl`, `netto`, `aldi-sued`, `penny`, `edeka`, `rewe`, `trinkgut`, `getraenke-hoffmann`, `kk` |
| filialen | filiaal-id's uit `config/stores.json` (komma-gescheiden), of `landelijk` |
| merk | Coca-Cola, Fanta, Sprite, Mezzo Mix, Pepsi, 7UP, Schwip Schwap, Mirinda, Monster Energy, Red Bull |
| smaak | bv. `Original`, `Zero / suikervrij`, `Mango Loco`; of `divers` bij “versch. Sorten” |
| suikervrij | `ja` / `nee` |
| verpakking | `fles` of `blik` |
| inhoud_l | inhoud per fles/blik in liter (2, 0,5, 0,25) |
| aantal_per_verpakking | 1 voor los, 4/6/24 voor multipacks |
| prijs_verpakking | aanbiedingsprijs van de hele verpakking, zonder statiegeld |
| statiegeld_per_eenheid | per fles/blik; leeg = niet vermeld |
| geldig_van / geldig_tot | `JJJJ-MM-DD` of `DD.MM.JJJJ` |
| klantenkaart / app_coupon | `ja` / `nee` |
| min_aantal / max_aantal | minimale afname / aankooplimiet (leeg = geen) |
| voorwaarden | vrije tekst |
| bron_url | link naar folder of website (verplicht) |
| gecontroleerd_op | datum waarop je het hebt gezien |

Foute regels worden overgeslagen en in de workflow-log genoemd (bijv. onbekend filiaal of ontbrekende datum). Verlopen regels kun je laten staan; de app verbergt ze automatisch. Ruim ze af en toe op.

---

## Onderhoud

**Een winkel toevoegen of verbergen** — `config/stores.json`. Voeg een filiaal toe met een unieke `id`, `chain`, `name`, `address`, `city` en `confirmedBy`. Zet `"active": false` om een filiaal te verbergen. Plaatsen in het filter komen uit `cities`.

**Een EDEKA-filiaal toevoegen** — zoek het filiaalnummer op via
`https://www.edeka.de/api/marketsearch/markets?searchstring=<postcode>` en zet het als `edekaMarketId` bij het filiaal. EDEKA Kusenberg in Goch staat er al in, maar nog zonder nummer.

**Een plaats toevoegen** — voeg de plaatsnaam toe aan `cities` en de filialen aan `stores`.

**Een nieuwe automatische bron toevoegen**
1. Maak `scripts/adapters/<naam>.mjs` met een `default async function (ctx)`. Gebruik `ctx.fetchJson`/`ctx.fetchText` en geef elke ruwe aanbieding aan `normalizeRaw()` (zie `edeka.mjs` als voorbeeld).
2. Geef terug: `{ status: 'ok' | 'error', offers, rawCount, rejected, message }`. Zet `status: 'error'` als je geen enkele ruwe aanbieding kreeg; dan blijven de oude gegevens staan.
3. Voeg de bron toe in `config/sources.json` (`adapter: "<naam>"`).
4. Voeg een test toe in `tests/` met een echt voorbeeld uit de bron.
5. Controleer eerst de gebruiksvoorwaarden en `robots.txt` van de site. Omzeil geen botcontroles of logins.

**Een bron werkt niet meer** — de app blijft werken met de laatste gegevens van die bron (gemarkeerd). In *Actions* staat in de log een waarschuwing met de reden. Meestal is de website veranderd; pas dan de koppeling aan.

**Andere merken** — `BRANDS` in `scripts/lib/normalize.mjs` en de lijst in `assets/app.js` (`renderFilterControls`).

---

## Projectstructuur

```
index.html                  app (één pagina)
assets/app.js               weergave en interactie
assets/logic.js             rekenregels: prijzen, statiegeld, geldigheid, filters, sorteren, goedkoopste, totalen
assets/styles.css           opmaak (mobiel eerst, printvriendelijke lijst, donkere modus)
config/stores.json          bevestigde filialen per plaats
config/sources.json         bronnen en koppelingen
data/offers.json            gegenereerde aanbiedingen (niet met de hand wijzigen)
data/manual-offers.csv      handmatige aanbiedingen
data/demo-offers.json       verzonnen demo-gegevens (alleen met ?demo=1)
scripts/collect.mjs         verzamelscript
scripts/adapters/*.mjs      één koppeling per bron
scripts/lib/*.mjs           normaliseren, samenvoegen, datums, HTML
tests/*.test.mjs            controles (npm test)
.github/workflows/          wekelijkse + handmatige update en publicatie
```
