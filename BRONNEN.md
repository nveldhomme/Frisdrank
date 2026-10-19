# Bronnen en beperkingen

Stand: 19 oktober 2026. De app toont zelf per bron de actuele status (tabblad **Bronnen**).

## Overzicht

| Keten | Filialen in regio | Hoe | Bron | Niveau |
|---|---|---|---|---|
| **EDEKA** | 17 | **Automatisch** (maandag ~06:00) | Officiële aanbiedingen-API per filiaal | Per filiaal |
| **Kaufland** | 5 | **Automatisch** | Weekfolder op filiale.kaufland.de (deze + volgende week), incl. Kaufland Card-prijzen | Standaardfolder (zonder filiaalkeuze) |
| **ALDI SÜD** | 13 | **Automatisch** | Officiële product-API, alleen actieproducten; ALDI noemt geen einddatum ("zolang de voorraad strekt") | Landelijk |
| **PENNY** | 7 | **Automatisch** | penny.de per verkoopregio (onze filialen: 15A-09-33 en Rhede 15A-10-31), incl. app-couponprijzen | Per regio = per filiaal |
| **Netto** | 18 | **Wekelijkse folderscan** (maandag ~07:15) | Folderoverzichten (kaufDA/meinprospekt) | Landelijk, regionaal kan afwijken |
| **Lidl** | 10 | **Wekelijkse folderscan** | Folderoverzichten en dealsites (Lidl Plus-voorwaarden) | Landelijk |
| **REWE** | 8 | Koppeling aan, maar geblokkeerd (HTTP 403) → **folderscan** | rewe.de / folderoverzichten | Landelijk |
| **trinkgut, Getränke Hoffmann** | 6 | **Wekelijkse folderscan** (als er iets te vinden is) | Folderoverzichten | Per filiaal/landelijk |

Waarom niet alles automatisch: Netto toont aanbiedingen alleen na filiaalkeuze en sluit de data-endpoints uit in robots.txt; Lidl publiceert de folderprijzen niet als data en weigert GitHub-servers wisselend; REWE weigert GitHub-servers. Dat wordt niet omzeild.

De **wekelijkse folderscan** is een geplande Claude-taak die de folders leest, alleen aanbiedingen met bekende prijs en periode overneemt (formaat soms afgeleid uit de literprijs, dat staat dan bij de voorwaarden), verlopen regels opruimt en `data/manual-offers.csv` bijwerkt.

Alle filialen zijn bevestigd via EDEKA's eigen filiaalzoeker of via Google Maps (zie `config/stores.json`, veld `confirmedBy`). In het zoekgebied zitten ALDI SÜD-filialen (geen ALDI Nord). PENNY-filialen en hun verkoopregio komen uit PENNY's eigen filialenlijst.

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
- **Eerste live run (19-10-2026):** EDEKA gaf 16 van 17 filialen terug (EDEKA Reuling in Bocholt publiceert online geen aanbiedingen) met 90 relevante aanbiedingen, gecontroleerd tegen de bron. REWE: geblokkeerd (zie boven).
- De startgegevens in `data/manual-offers.csv` (REWE Red Bull/Coca-Cola, EDEKA E center Schroff Kleve Coca-Cola/Fanta/Sprite blikjes) zijn op 19-10-2026 overgenomen van de officiële bronnen en verlopen vanzelf.
