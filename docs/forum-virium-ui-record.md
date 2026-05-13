# TackBird — UI Record

**Puddles Oy** (Y-tunnus 3610705-3)
Versio 1.0.0 | Huhtikuu 2026

---

## 1. Yleiskuvaus

TackBird on hyperlokaalinen naapurustosovellus Helsinkiin. Se yhdistaa ilmoitustaulun, vertaislainauksen, yhteisotapahtumat, taloyhtion hallinnon ja luottamusjarjestelman yhteen mobiilisovellukseen — kaikki rajattu kavelymatkalle.

**Ongelma:** Suomalaiset naapurustot ovat digitaalisesti hajanaisia. Tori.fi on kaupunkitasoinen ja persoonaton, Facebook-ryhmat ovat rakenteettomia, taloyhtion WhatsApp-ryhmat ovat kaoottisia. Yhteenkaankaan ei tarjoa rakenteellista vertaislainausta vakuuksineen ja arvioinnein.

**Ratkaisu:** TackBird tuo naapuruston oman ilmoitustaulun — loyda, lainaa ja jaa lahella, turvallisesti.

### Kohdealue

- **Beachhead:** Kallio, Helsinki (00500-00530)
- **Laajentumispolku:** Kallio → Sornainen-Vallila → Toolo → Kruununhaka → koko Helsinki
- **Strategia:** Rakennus kerrallaan (taloyhtio = luonnollinen yhteiso)

### Avainluvut

| Komponentti | Maara |
|------------|-------|
| Nayttoja | 48 |
| Supabase Edge Functions | 31 |
| Tietokantataulut | 67 |
| RLS-politiikat | 211 |
| Kielet | 3 (fi/en/sv) |
| Postikategoriat | 5 |
| Luottamustasot | 3 |

---

## 2. Teknologia

| Kerros | Teknologia |
|--------|-----------|
| Framework | Expo SDK 54 + Expo Router |
| Kieli | TypeScript (strict) |
| UI | React Native + StyleSheet.create |
| Ikonit | Lucide React Native (vektori-SVG) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| Autentikaatio | Supabase Auth + SecureStore |
| Kuvat | expo-image + expo-image-picker |
| Navigaatio | Expo Router (tiedostopohjainen) |
| Animaatiot | react-native-reanimated |
| i18n | Rakennettu I18nProvider (fi/en/sv) |
| Maksaminen | Stripe Connect + Checkout (aktivointi tulossa) |
| Jakelu | EAS Build (iOS + Android) |

---

## 3. Design-jarjestelma: Helsinki Monochrome v3

### Filosofia

Helsinki Monochrome v3 on **ink-on-warm-neutral** -jarjestelma. Ei tuotemerkin varsavya, ei korostevaria — sisalto tuo varit. Jokainen postikategoria saa oman varinsa, mutta kayttoliittyma itsessaan pysyy rauhallisen monokromaattisena.

### Varit — Light Mode

| Token | Arvo | Kaytto |
|-------|------|--------|
| `primary` | `#1A1D1F` | Paateksti, aktiiviset tilat, CTA-painikkeet |
| `background` | `#F5F6F7` | Lammin neutraali pohja |
| `card` | `#FFFFFF` | Korttipohjat |
| `border` | `#E8EAEC` | Hienot erottimet |
| `mutedForeground` | `#535A60` | Meta-teksti, kuvatekstit (WCAG AA 4.6:1) |
| `destructive` | `#C44536` | Tuhoisa/varoitus (vaimennettu punainen) |
| `success` | `#2D7A4F` | Onnistuminen (vaimennettu vihrea) |
| `warmTint` | `#F0EEE9` | Lammin savy teksti-korteille |

### Varit — Dark Mode

| Token | Arvo | Kaytto |
|-------|------|--------|
| `primary` | `#F5F6F7` | Kaanteinen muste |
| `background` | `#0E1012` | Lammin tumma pohja |
| `card` | `#17191C` | Tumma korttipinta |
| `border` | `#2E3136` | Tumma erotin |
| `mutedForeground` | `#8B8F94` | Tumma meta (WCAG AA 5.4:1 kortilla) |
| `destructive` | `#FF453A` | iOS system red dark |
| `success` | `#34D399` | Tumman tilan onnistuminen |

### Kategoriavarit

| Kategoria | Light | Dark | Kaytto |
|-----------|-------|------|--------|
| **Tarvitsen** | `#C75B3A` | `#D4734F` | Pyynto — "Tarvitsen apua" |
| **Tarjoan** | `#7C5CBF` | `#9B7DD4` | Tarjous — "Tarjoan palvelua" |
| **Ilmaista** | `#3B7DD8` | `#5B9BF0` | Ilmainen — "Jaa ilmaiseksi" |
| **Lainaa** | `#A97A1E` | `#C99A3E` | Lainaus — "Lainaa tai vuokraa" |
| **Tapahtuma** | `#2B8A62` | `#3AAE7A` | Tapahtuma — "Yhteista tekemista" |

Kaikki dark mode -kategoriavarit tayttavat **WCAG AA 4.5:1** kontrastivaatimuksen tummaa korttipintaa (#17191C) vasten.

### Typografia

| Rooli | Fontti | Kaytto |
|-------|--------|--------|
| **Display/Otsikot** | Bricolage Grotesque | Suuret otsikot, ruudun nimet, herot |
| **Body/UI** | Instrument Sans | Leipateksti, painikkeet, labelit, meta |

Tyyppiasteikko: 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 / 32 px

### Muut designtokenit

| Token | Arvo |
|-------|------|
| Kortin pyoristys | 16px |
| Painikkeen pyoristys | 28px (pill) |
| Chippien pyoristys | 20px |
| Varjot | Minimalistiset (0,1–4px, matala opacity) |
| Valilyonnit | 4/8dp-jarjestelma |
| Kosketusalueen minimi | 44x44pt |

---

## 4. Ruutukartta

### 4.1 Navigaatio — Alavalikkopalkki (5 valiletea)

```
[Koti]  [Tutustu]  [+Luo]  [Viestit]  [Profiili]
```

Alavalikkopalkissa on 5 valiletea ikoneineen ja tekstitunnisteineen. Keskella vihrea `+` -painike uuden ilmoituksen luomiseen.

### 4.2 Paanaytot

#### Koti (Feed)
**Tiedosto:** `app/(tabs)/index.tsx`

Naapuruston syote karjistyksella ja suodattimilla.

- **Ylapalkki:** Hakukuvake, sijainti-dropdown (esim. "Helsinki · Katajanokka"), taloyhtiokuvake, ilmoituskello
- **Kategoriachipsit:** Kaikki | Tarvitsen | Tarjoan | Ilmaista | Lainaa | Tapahtuma
- **Lajittelu:** Tuoreus/suosituin/lahin
- **Nayttotilat:** Listanahkuma (1 sarake) ja ruudukkonahkuma (2 saraketta)
- **Kortit:** Kuvavariantti (kuva ylhaalla) ja tekstivariantti (varileimattu reuna)
- **Tapahtumanostot:** Korostetut tapahtumakortit vihrealla taustalla
- **Reaaliaikapaivitys:** Uudet postaukset, tykkays- ja kommenttilaskurit reaaliajassa
- **Dark mode:** Taysi tuki

#### Tutustu (Explore)
**Tiedosto:** `app/(tabs)/explore.tsx`

Kartta- ja loytonaytto.

- **Kolme valiletea:** Kartta | Tapahtumat | Paikat
- **Karttanahkuma:** Integroitu kartta ilmoitusten, tapahtumien ja paikkojen kanssa
- **Yhteisotapahtumat:** Listattu kaynnissa olevat tapahtumat
- **Ryhmat:** Naapurusto- ja aiheryhmat
- **Keskustelut:** Avoimet yhteisokeskustelut

#### Luo (+)
**Tiedosto:** `app/(tabs)/create.tsx`

Uuden ilmoituksen luominen 2-vaiheisella prosessilla.

- **Vaihe 1 — Bento-kategoriavalitsin:** Viisi varirikasta korttia
  - Tarvitsen (oranssi) — "Pyyda apua"
  - Tarjoan (violetti) — "Tarjoa palvelu tai tavara"
  - Ilmaista (sininen) — "Jaa ilmaiseksi"
  - Lainaa (keltainen) — "Lainaa tai vuokraa"
  - Tapahtuma (vihrea) — "Yhteista tekemista"
- **Vaihe 2 — Lomake:**
  - Kuvan lisays
  - Otsikko (pakollinen, max 100 merkka)
  - Kuvaus (pakollinen, max 2000 merkka)
  - "Lisaa tietoja" -progressiivinen paljastus
  - Nosta ilmoitus -vaihtoehto (boost-jarjestelma)
  - Inline-validaatio punaisilla reunoilla

#### Viestit
**Tiedosto:** `app/(tabs)/messages.tsx`

Keskustelulistaus.

- **Haku:** Keskustelujen suodatus
- **Ohjevihje:** "Pyyhkaise sivusuunnassa arkistoidaksesi tai pinnataksesi keskustelu"
- **Keskustelulista:** Avatar, nimi, viimeisin viesti, aikaleima, luettu/lukematon tila
- **Uusi viesti -FAB:** Kelluva vihrea kynakuvake
- **Arkistointi ja pinnaus:** Pyyhkaisyeleet

#### Profiili
**Tiedosto:** `app/(tabs)/profile.tsx`

Kayttajan profiili ja tilastot.

- **Profiilikuva** vaihtomahdollisuudella
- **Nimi + luottamustaso** (esim. "Peruskäyttäjä")
- **Edistymispalkki:** Seuraavaan luottamustasoon (esim. 49/100)
- **Naapurusto:** Linkitetty sijainti
- **Bio + taloyhtio**
- **Tilastot:** Seuraajat | Ilmoitukset | Arviot | Pisteet
- **Valikkokohdat:** Tallennetut, Aktiivisimmat naapurit, Nostot
- **Asetukset-hammaspyora**

### 4.3 Ydinnayttoja

#### Ilmoituksen yksityiskohdat
**Tiedosto:** `app/post/[id].tsx`

Yksittaisen ilmoituksen nakyma.

- **Toimintopalkki:** Tallenna, jaa, ilmianna
- **Kategorialeima** (varikorostettu)
- **Otsikko + kuvaus**
- **Sijainti**
- **Tykkays- ja kommenttilaskuri**
- **Julkaisijan kortti:** Avatar, nimi, naapurusto, aikaleima
- **Samankaltaisia ilmoituksia** -karuselli
- **Kommenttiosio**
- **CTA:** "Laheta viesti" -painike

#### Haku
**Tiedosto:** `app/search.tsx`

Koko sisallon hakuominaisuus.

- **Hakupalkki** filtterikuvakkeella
- **Suositut:** Populaarit hakutermit tykkayslaskureineen
- **Selaa kategorioittain:** Varikorostetut kategoriacellat (Tarvitsen, Tarjoan, Ilmaista, Lainaa, Tapahtuma)
- **Hakutulokset:** Lista relevanteista ilmoituksista

#### Ilmoitukset
**Tiedosto:** `app/notifications.tsx`

Ilmoituskeskus.

- **Suodatinvaliletea:** Kaikki | Viestit | Arvostelut | Lainaukset | Ilmoitukset
- **Aikaryhmat:** Tanaan, Aiemmin, Tama viikko, Vanhemmat
- **Ilmoitustyypit:**
  - Uusi viesti
  - Uusi seuraaja
  - Uusi kommentti ilmoitukseesi
  - Joku tykkasi ilmoituksestasi
  - Uusi jasen aktiviteetissa
- **Hylkaa:** X-kuvake per ilmoitus

#### Asetukset
**Tiedosto:** `app/settings.tsx`

Kayttajan asetukset.

- **Tili-osio**
- **Ulkoasu:**
  - Kieli: Suomi / English / Svenska
  - Teema: Vaalea / Tumma (beta) / Auto
- **Naapuruston valinta:** Helsinki
- **Profiilin nakyvyys:** Kaikille / Vain naapurustoni / Piilotettu
- **Turvallisuus + yksityisyys**
- **GDPR-tietojen poisto**
- **Kirjaudu ulos**

### 4.4 Taloyhtionayttoja

#### Taloyhtiohubi
**Tiedosto:** `app/building/[id].tsx`

Rakennuksen hallintonakeuma.

- **Tiedotteet:** Taloyhtion viralliset tiedotteet
- **Huoltopyynnot:** Ilmoita ja seuraa huoltotarpeita
- **Jasenluettelo:** Rakennuksen asukkaat
- **Jarjestyssaannot:** Taloyhtion saannot
- **Keskustelu:** Rakennuksen sisainen chat

#### Tiedote
**Tiedosto:** `app/building/announcement/[id].tsx`

Yksittaisen tiedotteen nakyma.

#### Huoltopyynto
**Tiedosto:** `app/building/maintenance/[id].tsx`

Huoltopyynnon yksityiskohdat ja tilanseuranta.

#### Rakennuksen chat
**Tiedosto:** `app/building/chat/[id].tsx`

Reaaliaikainen keskustelunakyma taloyhtion asukkaille.

### 4.5 Kaupankaynnin nayttoja

#### Varaustilat
**Tiedosto:** `app/booking/[id].tsx`

6-vaiheinen varauselinkaarinayma:

```
Odottaa → Vahvistettu → Aktiivinen → Valmis → Arvioitu → Kiistelty
```

#### Omat ilmoitukset
**Tiedosto:** `app/my-listings.tsx`

#### Varaukset
**Tiedosto:** `app/bookings.tsx`

#### Uusi listaus -ohjattu toiminto
**Tiedosto:** `app/new-listing.tsx`

### 4.6 Yhteisonauttoja

#### Yhteisotapahtumat
**Tiedosto:** `app/community-events.tsx`

Selaa ja luo yhteisotapahtumia.

#### Tapahtuman yksityiskohdat
**Tiedosto:** `app/event/[id].tsx`

Osallistu, nae osallistujat, tapahtumakohtainen chat.

#### Pollit (Kyselyt)
**Tiedosto:** `app/create-poll.tsx`

Yhteisopollit aanestamistaominaisuudella.

### 4.7 Autentikointinalytot

#### Kirjautuminen / Rekisteroityminen
**Tiedosto:** `app/(auth)/login.tsx`

- Sahkoposti + salasana
- Google-kirjautuminen (tulossa)
- Apple Sign In
- Virhetilat inline-validaatiolla

#### Onboarding
**Tiedosto:** `app/onboarding.tsx`

4-vaiheinen tervetulovirta:

1. **Tervetuloa TackBirdiin** — Logo, slogan, "Naapurustosi ilmoitustaulu"
2. **Naapuruston valinta** — Osoitepohjainen paikannus
3. **Tarkoituksen valinta** — Mita etsit sovelluksesta
4. **Talon liittyminen** — Taloyhtiolinkkaus

### 4.8 Muut naytot

| Naytto | Tiedosto | Kuvaus |
|--------|----------|--------|
| Kayttajaprofiili | `app/profile/[userId].tsx` | Toisen kayttajan profiili |
| Tallennetut | `app/saved.tsx` | Tallennetut ilmoitukset |
| Aktiviteetit | `app/activities.tsx` | Kayttajan toimintahistoria |
| Verificaatio | `app/verification.tsx` | Puhelin + osoite + henkilollisyys |
| Admin-paneeli | `app/admin.tsx` | Sisallonhallinta ja tilastot |
| Estetyt | `app/blocked.tsx` | Estetyt kayttajat |
| Ohje | `app/help.tsx` | UKK ja tuki |
| Tietosuoja | `app/privacy.tsx` | Tietosuojaseloste |
| Kayttoehdot | `app/terms.tsx` | Palvelun kayttoehdot |
| Tietoja | `app/about.tsx` | Tietoja sovelluksesta |

---

## 5. Luottamusjarjestelma

TackBird kayttaa 3-portaista progressiivista luottamusjarjestelmaa, joka mahdollistaa turvallisen vertaiskaupan ilman etukateistuntua.

### Tasot

| Taso | Nimi | Vaatimukset | Oikeudet |
|------|------|-------------|----------|
| **1 — Peruskayttaja** | Tier 1 | Sahkopostin vahvistus | Lainaus (max 50€/pv), perusominaisuudet |
| **2 — Aktiivinen naapuri** | Tier 2 | +Henkilollisyyden vahvistus, 7pv tilika | Maksulliset palvelut (max 200€), edistyneet ominaisuudet |
| **3 — Luotettu naapuri** | Tier 3 | +3 arvostelua (ka. 4.0+), 90% vastausprosentti, 30pv tilika, ei raportteja | Rajoittamaton, feedin prioriteetti, luotettu-merkki |

### Edistymisnakyma

Kayttaja nakee profiilissaan edistymispalkin seuraavaan tasoon. Selkea "49/100" -tyylinen laskuri motivoi.

---

## 6. Ominaisuuskategoriat

### 6.1 Ilmoitustyypit (5 kategoriaa)

| Kategoria | Kuvaus | Kuvake | Esimerkki |
|-----------|--------|--------|-----------|
| **Tarvitsen** | Pyynto naapureilta | HandHelping | "Kuka voisi auttaa koiran ulkoilutuksessa?" |
| **Tarjoan** | Palvelun tai tavaran tarjous | Gift | "Pyoranhuolto ja korjaus" |
| **Ilmaista** | Ilmaislahjoitus | Heart | "Viherkasveja — liikaa kotona" |
| **Lainaa** | Vertaislainaus vakuudella | BookOpen | "Porakone lainattavissa, 5€/pv" |
| **Tapahtuma** | Yhteisotapahtuma | CalendarDays | "Lautapeli-ilta — kaikki tervetulleita" |

### 6.2 Viestinta

- **Kahdenvalinen viestinta:** Kuvaviestit, kirjoitusindikaattori, paivamaaran erottimet, lukukuittaukset
- **Tapahtumachat:** Tapahtumakohtainen ryhmaviestinta
- **Rakennuksen chat:** Taloyhtion sisainen viestinta
- **Pikaviestitemplatet:** "Hei! Kiinnostuisin ilmoituksestasi: [otsikko]"

### 6.3 Taloyhtionhallinta

- **Tiedotteet:** Viralliset rakennuksen tiedotteet
- **Huoltopyynnot:** Ilmoita ja seuraa ongelmia
- **Jasenluettelo:** Nae talosi asukkaat
- **Jarjestyssaannot:** Taloyhtion saannot ja ohjeet
- **Chat:** Reaaliaikainen rakennuksen keskustelu

### 6.4 Yhteisotapahtumat

- **Luominen:** Otsikko, kuvaus, paikka, aika, kategoria
- **Osallistuminen:** Yhden napin osallistuminen
- **Chat:** Tapahtumakohtainen keskustelunakyma
- **Kategoriat:** Sosiaaliset, urheilu, kulttuuri, luonto, lapset, muu

### 6.5 Kaupankaynti ja lainaus

- **6-vaiheinen varauselinkaari:** Odottaa → Vahvistettu → Aktiivinen → Valmis → Arvioitu → Kiistelty
- **Vakuusjarjestelma:** Automaattiset vakuusehdotukset tuotekategorian mukaan
- **Arvioinnit:** Kahdensuuntainen arviointi vaihdon jalkeen
- **Stripe-maksaminen:** Connect + Checkout (tulossa)

### 6.6 Feed-algoritmi

7-tekijainen painotettu pisteytysjärjestelmä:
- Tuoreus, tykkaysten ja kommenttien maara
- Maantieteellinen laheisyys (geohash)
- Kategoriamonimuotoisuus
- Pro-listattujen priorisointi
- Nostettujen ilmoitusten korostus
- Luottamustason vaikutus

---

## 7. Saavutettavuus ja lokalisaatio

### Saavutettavuus

- **Kontrastivaatimus:** WCAG AA 4.5:1 kaikelle tekstille molemmissa teemoissa
- **Kosketusalueet:** Minimi 44x44pt kaikille interaktiivisille elementeille
- **Painamispalaute:** Opacity/ripple-efekti kaikissa painettavissa elementeissa
- **Tyhjat tilat:** Selkeat viestit ja toimintoehdotukset kun sisaltoa ei ole
- **Virhetilat:** Inline-validaatio lomakkeissa, virheviesti laheisen kentan alla
- **Dark mode:** Taysi tuki automaattisella jarjestelman seurannalla

### Lokalisaatio

| Kieli | Tiedosto | Tila |
|-------|----------|------|
| **Suomi** (oletus) | `fi.json` | Taysi |
| **English** | `en.json` | Taysi |
| **Svenska** | `sv.json` | Taysi |

Kaikki kayttoliittyman tekstit ovat kaannettavissa. Suomi on oletuskieli ja ensisijainen suunnittelukieli. Kayttaja voi vaihtaa kielen asetuksista.

---

## 8. Tietoturva ja yksityisyys

### Arkkitehtuuri

- **RLS (Row Level Security):** 211 politiikkaa — kaikki tietokantakyselyt tarkastetaan kayttajatunnisteella
- **Supabase Auth:** JWT-pohjaiset istunnot, SecureStore-tallennnus (fallback AsyncStorage)
- **Edge Functions:** 31 serveritonta funktiota, jotka ajavat Supabasen rajapinnassa (Deno)
- **GDPR:** Tietojen poisto -ominaisuus asetuksissa, tietosuojaseloste Suomi.fi-vaatimusten mukaan

### Feature Flags

Ominaisuusliput mahdollistavat ominaisuuksien hallitun kayttoonoton:

| Lippu | Tila | Kuvaus |
|-------|------|--------|
| LENDING | Paalla | Vertaislainaus |
| LENDING_PAYMENTS | Pois | Vakuus/palkkiot lainauksessa |
| PAYMENTS | Pois | Stripe-maksuvirat |
| AD_CAMPAIGNS | Pois | Yritysten mainosjarjestelma |
| BUSINESS_ACCOUNT | Pois | Pro-yritystilit |
| IDENTITY_VERIFICATION | Pois | Henkilollisyyden vahvistus |
| EVENTS_TAPAHTUMA_TYPE | Paalla | Tapahtumapostityyppi |
| POLLS | Paalla | Yhteisopollit |

---

## 9. Backend-arkkitehtuuri

### Edge Functions (31 kpl)

| Kategoria | Funktiot |
|-----------|----------|
| **Autentikaatio** | auth-verify, send-otp, verify-otp-code, send-phone-otp, verify-phone-otp |
| **Maksut** | stripe-checkout, stripe-webhook, stripe-connect-onboard, pro-subscribe, verify-boost-purchase, use-boost, grant-tier-boosts |
| **Sisalto** | moderate-content, embed-post, semantic-search, semantic-match, price-suggestion |
| **Tapahtumat** | kide-proxy, meteli-proxy, ticketmaster-proxy |
| **Ilmoitukset** | send-push, send-email, send-digest, match-saved-searches |
| **Hallinto** | admin-api, db-backup, ads-scheduler, check-overdue-rentals, validate-business |
| **Kayttaja** | delete-account, verify-identity |
| **Terveys** | health-check |

### Reaaliaikainen infrastruktuuri

- **Supabase Realtime:** WebSocket-yhteydet postgres_changes-tapahtumiin
- **Lasnaolon seuranta:** Online-/offline-tilat keskusteluissa
- **Kirjoitusindikaattorit:** Reaaliaikainen "kirjoittaa..." -naytto
- **Viestien synkronointi:** Uusien viestien valitön naytto
- **Feed-paivitykset:** Uudet postaukset ja tykkays-/kommenttilaskurit

### Cron-tyot (6 kpl)

Ajastetut taustatehtavat tietokannan yllapitoon, ilmoitusten lahettamiseen ja tietojen varmuuskopiointiin.

---

## 10. Kaupallinen malli

### Nykyinen (pre-launch)

| Tulolahde | Tila | Kuvaus |
|-----------|------|--------|
| **Nostot (Boosts)** | Valmis | Ilmoitusten korostaminen feedissa |
| **Pro-tilit** | Suunniteltu | Yrityskayttajien laajennetut ominaisuudet |
| **Mainokset** | Suunniteltu | Hyperlokaali mainonta |
| **Stripe Connect** | Integroitu, aktivointi tulossa | Vertaismaksut |

### Kustannusrakenne

- **Supabase:** Free-plan (kasvatetaan tarpeen mukaan)
- **EAS Build:** Expo-ekosysteemin jakelutyokalu
- **Stripe:** Transaktiopohjainen hinnoittelu (aktivoinnin jalkeen)

---

## 11. Kuvaluettelo (Screenshots)

### Light Mode — Ydinnaytot

| # | Kuva | Kuvaus |
|---|------|--------|
| 1 | `screenshots/final/01-feed-light.png` | Koti-syote, listanahkuma, kategoriachipsit |
| 2 | `screenshots/final/08-grid-layout.png` | Koti-syote, 2-sarakkeinen ruudukko |
| 3 | `screenshots/final/02-create-bento.png` | Ilmoituksen luominen, bento-kategoriavalitsin |
| 4 | `screenshots/final/04-create-inline-validation.png` | Lomakevalidaatio |
| 5 | `screenshots/final/05-messages-swipe-hint.png` | Viestilista pyyhkaisyvihjeella |
| 6 | `screenshots/final/06-notifications-badges.png` | Ilmoituskeskus suodattimilla |
| 7 | `screenshots/final/07-profile-progress-bar.png` | Profiili edistymispalkilla |
| 8 | `screenshots/14-explore-logged-in.png` | Tutustu-nakuma (kartta, tapahtumat, ryhmat) |
| 9 | `screenshots/05-search.png` | Haku suosittuineen ja kategorioittain |
| 10 | `screenshots/19-post-detail.png` | Ilmoituksen yksityiskohdat |
| 11 | `screenshots/07-settings.png` | Asetukset (kieli, teema, naapurusto) |
| 12 | `screenshots/10-onboarding.png` | Tervetulonayto |

### Dark Mode

| # | Kuva | Kuvaus |
|---|------|--------|
| 13 | `screenshots/final/09-threads-dark-feed.png` | Feed dark modessa, 2-sarakkeinen ruudukko |

### UX Audit -kuvasarja (yksityiskohtainen kattavuus)

| # | Kuva | Kuvaus |
|---|------|--------|
| 14 | `ux-audit/01-feed-home.png` | Feed-analyysi |
| 15 | `ux-audit/02-explore.png` | Tutustu-analyysi |
| 16 | `ux-audit/03-messages.png` | Viestit-analyysi |
| 17 | `ux-audit/04-profile.png` | Profiili-analyysi |
| 18 | `ux-audit/05-login.png` | Kirjautuminen |
| 19 | `ux-audit/09-create.png` | Ilmoituksen luominen |
| 20 | `ux-audit/16-community-events.png` | Yhteisotapahtumat |
| 21 | `ux-audit/18-onboarding.png` | Onboarding vaihe 1 |
| 22 | `ux-audit/19-onboarding-step2.png` | Onboarding vaihe 2 |
| 23 | `ux-audit/20-onboarding-step3.png` | Onboarding vaihe 3 |
| 24 | `ux-audit/21-onboarding-step4-neighborhood.png` | Onboarding vaihe 4 |
| 25 | `ux-audit/22-register.png` | Rekisteroityminen |
| 26 | `ux-audit/23-group-detail.png` | Ryhmanakyma |
| 27 | `ux-audit/24-admin.png` | Admin-paneeli |

---

## 12. Yhteystieto

| | |
|---|---|
| **Yritys** | Puddles Oy |
| **Y-tunnus** | 3610705-3 |
| **Kehittaja** | Jesse Parkkonen |
| **Sahkoposti** | tuki@tackbird.com |
| **Verkkosivut** | tackbird.com |
| **Bundle ID** | io.bivoapp.app |
| **EAS Project** | 504a9107-9e8e-4e5d-90fe-ea7564166e33 |

---

*Tama dokumentti on luotu TackBird-mobiilisovelluksen UI-katsauksena Forum Virium Helsingille. Huhtikuu 2026.*
