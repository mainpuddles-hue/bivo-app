# TackBird — Pitch Deck Content

**12 slides. Kaikki numerot perustuvat source-of-truth.md -dokumenttiin.**

---

## Slide 1: Kansi

**TackBird**
Naapurustosi ilmoitustaulu

Puddles Oy | Jesse Parkkonen | Huhtikuu 2026
tackbird.com

---

## Slide 2: Ongelma

### Naapurustot ovat digitaalisesti rikki

**3 hajanaista tyokalua, ei yhtaan kokonaista:**

- **Tori.fi** — kaupunkitasoinen, persoonaton, ei lainausta, ei yhteisoa
- **Facebook-ryhmat** — postaukset hautautuvat, ei luottamusjarjestelmaa, ei rakennetta
- **WhatsApp-ryhmat** — kaoottinen, ei hakua, ei profiileja, ei historiaa

**Tulos:** Suomalaiset naapurustot jaavat tuntemattomiksi. Porakone makaa kaapissa 363 pv/v. Ylijaama ruoka menee roskiin. Tapahtumat jaavat loytymaatta.

*"Ei ole olemassa yhtaan alustaa, joka yhdistaa naapuruston ilmoitustaulun, vertaislainauksen ja taloyhtion hallinnon."*

---

## Slide 3: Ratkaisu

### TackBird — yksi sovellus, viisi tarvetta

| | | |
|---|---|---|
| TARVITSEN | Pyyda apua | "Kuka auttaa muutossa?" |
| TARJOAN | Tarjoa palveluja | "Pyoranhuolto edullisesti" |
| ILMAISTA | Lahjoita ilmaiseksi | "Viherkasveja — liikaa kotona" |
| LAINAA | Lainaa vakuudella | "Porakone 5 EUR/pv" |
| TAPAHTUMA | Jarjesta tapahtumia | "Lautapeli-ilta ke klo 18" |

**+ 3-portainen luottamusjarjestelma + taloyhtion hallinto + reaaliaikaiset viestit**

---

## Slide 4: Demo / Tuote

### Rakennettu ja toimiva

[Kuvakaappaukset: Feed, Create, Messages, Profile, Dark Mode]

| Mittari | Arvo |
|---------|------|
| 48 nayttoa | Taysi ominaisuusjoukko |
| 31 backend-funktiota | Skaalautuva arkkitehtuuri |
| 67 tietokantataulua | Kattava datamalli |
| 211 tietoturvapolitiikkaa | RLS joka kyselyssa |
| 3 kielta | Suomi, englanti, ruotsi |

**Design-jarjestelma:** Helsinki Monochrome v3
**Teknologia:** React Native, Supabase, TypeScript, Stripe

---

## Slide 5: Miksi nyt

### Neljä markkinamuutosta

1. **Nextdoor epaonnistui Suomessa** — alle 5000 kayttajaa, ei lokalisoitu, myrkyllinen kulttuuri. Markkina on avoin.

2. **EU:n kiertotalousdirektiivi** (2025) — kuluttajat etsivat tapoja laista, ei ostaa. Vertaislainaus on luonnollinen vastaus.

3. **Taloyhtion digitalisaatio** — lakimuutos 2023: etaosallistuminen yhtiokokouksiin. Digitaaliset kanavat ovat valttamattomia.

4. **Post-pandemian yhteisollisyys** — COVID tuhosi naapurustodynamiikkaa, mutta tarve yhteyteen on kasvanut.

---

## Slide 6: Markkina

### TAM → SAM → SOM

| Taso | Laajuus | Arvio |
|------|---------|-------|
| **TAM** | 90 000 suomalaista taloyhtiota + 310 kuntaa | 95M EUR/v |
| **SAM** | 10 000 Helsingin seudun taloyhtiota + kaupunki | 10M EUR/v |
| **SOM** | 100 maksavaa taloyhtiota + kaupunkipilotti (vuosi 3) | 150K EUR/v |

**Laskenta:** Taloyhtiot avg 59 EUR/kk + kaupunkilisenssi 500-2 000 EUR/kk per naapurusto

**Laajennuspotentiaali:** Tampere, Turku, Oulu, Jyvaskyla → koko Suomi → Pohjoismaat

---

## Slide 7: Liiketoimintamalli

### B2G/B2B — myydaan organisaatioille

Ei Pro-tilauksia, boosteja tai mainoksia. TackBird on tyokalu taloyhtiöille ja kaupungille.

| Lahde | Asiakas | Hinnoittelu | Vuosi 1 arvio |
|-------|---------|-------------|---------------|
| **Taloyhtiolisenssi** | Taloyhtiot (B2B) | 29-99 EUR/kk per rakennus | 7 200 EUR |
| **Kaupunkilisenssi** | Helsinki (B2G) | 500-2 000 EUR/kk per naapurusto | 6 000 EUR |
| **Lainauspalkkio** | Kayttajat (C2C) | 10% valityspalkkio | 1 800 EUR |
| | | **Yhteensa** | **15 000 EUR** |

### Miksi B2G/B2B?

- Taloyhtioilla on jo budjetti digitaalisiin palveluihin (isannointipalvelut 200-500 EUR/kk)
- Helsinki rahoittaa naapuruston innovaatiota Forum Virium -ohjelman kautta
- Organisaatiomyynti = ennustettava toistuva liikevaihto
- Yksi taloyhtiopaatos → koko rakennus kayttajiksi (ei tarvita yksiloviraalius)

**Marginaalirakenne:** Lahes 0 EUR kiinteat kulut (Supabase free, Expo free). Break-even matala.

---

## Slide 8: Traktio

### Tuote rakennettu — julkaisu syyskuussa

| Valmis | Tulossa (touko-elo) |
|--------|---------------------|
| 48 nayttoa | Push-ilmoitukset E2E |
| 31 Edge Functions | App Store -jakelu (EAS Build) |
| 3-portainen luottamus | Guest-selailu (feed ennen rekisteroitymista) |
| Stripe-integraatio | 5 taloyhtion onboarding Kalliossa |
| Helsinki Monochrome v3 | Sisallon esiladaus (30+ postia) |
| Taysi fi/en/sv lokalisaatio | Porraskaytava-QR -tarrat |

**Validointi ennen julkaisua:**
- 8 strategista analyysia (Hook Model, JTBD, Crossing the Chasm, StoryBrand, Retention, UX Audit, Contagious STEPPS, Product Lens)
- Kattava tietoturva-auditointi (211 RLS-politiikkaa)
- Forum Virium Helsinki -yhteistyo

---

## Slide 9: Go-to-Market

### Bowling Pin -strategia: rakennus kerrallaan

```
Pin 1: KALLIO (beachhead)
  → Tihein asutus Helsingissa (~15 000/km2)
  → Vahvin naapurustoidentiteetti ("kalliolainen")
  → Anti-Facebook -demografinen

Pin 2: Sornainen-Vallila → fyysisesti viereinen
Pin 3: Toolo → eri demografinen, validoi laajemmin
Pin 4: Kruununhaka → pienempi, premium
Pin 5+: Pasila → Kapyla → Lauttasaari → ita-Helsinki
```

**Ei koskaan laajenneta ennen kuin edellinen on dominoitu.**
Dominoitu = 150+ WAU, 25%+ D7 retentio, orgaaninen > istutettu sisalto

### Kanava: Taloyhtio (ei yksiloviraalius)

Suomalaiset eivat aggressiivisesti kutsu — K-factor ~0,2. Taloyhtion hallitus on portti: **yksi paatos → koko rakennus liittyy.**

---

## Slide 10: Kilpailu

### Erottautumismatriisi

| | TackBird | Tori.fi | Facebook | Nextdoor |
|---|---------|---------|----------|----------|
| Naapurustotaso | **Kyla** | Kaupunki | Vaihtelee | Kyla |
| Vertaislainaus | **Vakuudella** | Ei | Ei | Ei |
| Luottamusjarjestelma | **3-portainen** | Ei | Ei | Osoite |
| Taloyhtio | **Kyla** | Ei | Ei | Ei |
| Tapahtumat | **Kyla** | Ei | Erillinen | Kyla |
| Suomi-natiivi | **fi/en/sv** | fi/sv | Monikieli | Englanti |
| Suomessa | **Kyla** | Kyla | Kyla | <5000 |

**Sininen meri:** Rakenteellinen vertaislainaus + taloyhtion hallinto. Kukaan muu ei tarjoa tata Suomessa.

---

## Slide 11: Tiimi

### Jesse Parkkonen — Perustaja & kehittaja

- Rakentanut koko tuotteen yksin: 48 nayttoa, 31 backend-funktiota, designjarjestelma, 3 kielta
- Full-stack: React Native, TypeScript, Supabase, Stripe
- Helsinki-pohjainen, asuu Katajanokalla
- Puddles Oy (Y-tunnus 3610705-3)

**Rekrytointitarve (julkaisun jalkeen):**
- Yhteisomanageri (Kallio-pohjainen, naapurustoverkostot)
- Markkinointi/kasvu (sisaltomarkkinointi, taloyhtiosuhteet)

---

## Slide 12: Pyynto & kayttotarkoitus

### [Taytetaan kun rahoitusstrategia on selva]

| Kohde | Osuus | Kuvaus |
|-------|-------|--------|
| Kehitys | 35% | Push-ilmoitukset, App Store, guest-selailu, taloyhtio-hallintapaneeli |
| B2B/B2G myynti | 30% | Taloyhtio-onboarding, kaupunkipilotti (Forum Virium), demo-materiaalit |
| Kasvu | 20% | QR-tarrat, yhteisotapahtumat, naapurustolaajennus |
| Toiminta | 15% | Supabase Pro, Apple/Google -lisenssit, Stripe-kulut |

### Vuoden 1 tavoitteet

| Mittari | Tavoite |
|---------|---------|
| WAU | 1 000+ |
| Maksavat taloyhtiot | 15+ |
| Kaupunkipilotti | 1 naapurusto (Helsinki) |
| MRR | 1 400+ EUR |
| D28 retentio | 25%+ |
| NPS | 40+ |

---

## Liite A: Retentioviitekehys

| Mittari | Huono | OK | Hyva | Erinomainen |
|---------|-------|----|------|-------------|
| D1 retentio | <20% | 20-35% | 35-45% | >45% |
| D7 retentio | <10% | 10-20% | 20-30% | >30% |
| D30 retentio | <5% | 5-12% | 12-20% | >20% |
| DAU/WAU | <20% | 20-35% | 35-45% | >45% |

**Aha-hetki:** Naapurin vastaus 4 tunnin sisalla. Kayttajat jotka saavat vastauksen ensimmaiseen viestiinsa ovat merkittavasti todennakoisemmin aktiivisia D30:ssa.

## Liite B: Feature Flags

| Ominaisuus | Tila | Syy |
|------------|------|-----|
| Vertaislainaus | ON | Ydinominaisuus |
| Lainausmaksut | OFF | Stripe-aktivointi tulossa |
| Stripe-maksut | OFF | Aktivointi tulossa |
| Mainosjarjestelma | OFF | Poistettu liiketoimintamallista |
| Yritystilit | OFF | Poistettu — B2G/B2B-malli |
| Henkilollisyyden vahvistus | OFF | Flow suunnitteilla |
| Tapahtumat | ON | Yhteisotapahtumia |
| Pollit | ON | Yhteisopollit |

## Liite C: Kustannusrakenne

| Kuluera | Nyt | 1000 kayttajaa | 10 000 kayttajaa |
|---------|-----|----------------|-------------------|
| Supabase | 0 EUR | 25 EUR/kk | 75 EUR/kk |
| Expo/EAS | 0 EUR | 0 EUR | 15 EUR/kk |
| Domain | 10 EUR/kk | 10 EUR/kk | 10 EUR/kk |
| Apple Dev | 8 EUR/kk | 8 EUR/kk | 8 EUR/kk |
| Stripe | 0 EUR | ~50 EUR/kk | ~300 EUR/kk |
| **Yhteensa** | **~20 EUR/kk** | **~95 EUR/kk** | **~410 EUR/kk** |

Huomattavan matala burn rate. SaaS-marginaalit (>80%) saavutettavissa pienella volyymilla.
