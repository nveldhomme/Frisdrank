# Bronnen en beperkingen

Stand: 19 oktober 2026. De app toont zelf per bron de actuele status (tabblad **Bronnen**).

## Overzicht

| Keten | Filialen in regio | Automatisch? | Bron | Niveau | Opmerking |
|---|---|---|---|---|---|
| **EDEKA** | 17 (Emmerich, Kleve, Goch, Rees, Bocholt, Rhede) | **Ja** | Officiële aanbiedingen-API van edeka.de, per filiaalnummer | Per filiaal | Structuur gecontroleerd; echte lokale aanbiedingen. Startdatum wordt niet altijd meegegeven (dan “startdatum niet vermeld”). EDEKA Kusenberg Goch nog zonder filiaalnummer. |
| **REWE** | 8 | **Ja** | rewe.de/angebote/nationale-angebote/… (robots.txt staat deze paden expliciet toe) | Landelijk | Alleen de landelijke folder, niet per filiaal bevestigd. Pagina-indeling is HTML; als REWE die wijzigt of het verzoek blokkeert (403 vanaf datacenter-IP's komt voor), blijven de laatste gegevens staan. **Eerste live run controleren.** |
| **Kaufland** | 5 | Nee | — | — | Website toont een Cloudflare-botcontrole. Niet omzeild. Handmatige invoer. |
| **Lidl** | 10 | Nee | — | — | Online folder bevat productnamen maar geen prijzen in machineleesbare vorm. Handmatige invoer. |
| **Netto** | 18 | Nee | — | — | Bot-bescherming en robots.txt sluit de data-endpoints uit. Handmatige invoer. |
| **ALDI SÜD** | 13 | Nog niet | — | — | Er bestaat een product-API, maar het dataformaat kon niet worden geverifieerd. Liever geen koppeling op basis van gegokte velden. Kandidaat voor een volgende versie. |
| **PENNY** | 5 | Nog niet | — | — | Aanbiedingen per markt via JavaScript; formaat niet geverifieerd. Kandidaat voor een volgende versie. |
| **trinkgut** | 5 | Nee | — | — | Drankenspeciaalzaak; niet onderzocht. Handmatig. |
| **Getränke Hoffmann** | 1 | Nee | — | — | Handmatig. |
| **K+K** | 1 (Isselburg) | Nee | — | — | Handmatig. |

Alle filialen zijn bevestigd via EDEKA's eigen filiaalzoeker of via Google Maps (zie `config/stores.json`, veld `confirmedBy`). In het zoekgebied zitten ALDI SÜD-filialen (geen ALDI Nord).

## Aanbiedingenplatforms

Platforms zoals marktguru en kaufDA bundelen folders van alle ketens, ook Kaufland en Lidl. Ze zijn niet gebruikt: er is geen officiële, openbare API en automatisch uitlezen valt niet duidelijk binnen hun voorwaarden. Wil je dit later toch, gebruik dan een betaalde, officiële databron en zet de sleutel in een *repository secret* (nooit in de code).

## Wat “gecontroleerd” betekent

- **✓ Gecontroleerd** – de bron is bij de laatste update bevraagd. Staat er geen aanbieding, dan is er niets gevonden voor deze producten.
- **! Niet gecontroleerd** – de bron gaf een fout. Oude aanbiedingen blijven zichtbaar met het label “Uit eerdere controle”.
- **… Nog niet gecontroleerd** – de eerste automatische update heeft nog niet gedraaid.
- **– Geen automatische bron** – alleen handmatig ingevoerde aanbiedingen.
- **✎ Handmatig** – uit `data/manual-offers.csv`.

## Bekende beperkingen

- **2 liter is zeldzaam.** In de huidige folders gaat het bij cola meestal om 1,25 l. De app toont standaard alleen 2 l, zoals gevraagd; zet “Andere flesformaten tonen” aan voor de rest.
- **“Versch. Sorten”.** Veel aanbiedingen gelden voor meerdere smaken zonder ze op te sommen. Die staan onder “Diverse smaken” met het label “Smaak in winkel controleren”. “Goedkoopste kiezen” gebruikt zo'n aanbieding wel voor een gekozen smaak, maar met dat label.
- **Statiegeld.** Als het niet in de folder staat: bij blikjes € 0,25 (wettelijk Einwegpfand, gemarkeerd als “afgeleid”), bij flessen “onbekend”.
- **Klantenkaart / app-prijzen** worden herkend aan tekst in de folder (“App”, “Coupon”, “Kaufland Card”, “PAYBACK” …). Niet elke formulering wordt herkend; controleer de voorwaarden.
- **Aankooplimieten** worden alleen overgenomen als ze in de tekst staan.
- **Aanvullende REWE Bonus-tegoeden** worden als opmerking getoond, niet van de prijs afgetrokken.
- **De automatische koppelingen zijn vanuit de ontwikkelomgeving niet live gedraaid** (geen toegang tot die websites daar). De EDEKA-structuur is wel vooraf gecontroleerd; voor REWE is de paginatekst gecontroleerd maar niet de exacte HTML. Kijk na de eerste run in *Actions* en op het tabblad Bronnen.
- De startgegevens in `data/manual-offers.csv` (REWE Red Bull/Coca-Cola, EDEKA E center Schroff Kleve Coca-Cola/Fanta/Sprite blikjes) zijn op 19-10-2026 overgenomen van de officiële bronnen en verlopen vanzelf.
