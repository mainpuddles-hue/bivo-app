---
pdf_options:
  format: A4
  margin: 25mm 20mm 25mm 20mm
  printBackground: true
  displayHeaderFooter: true
  headerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:right;padding-right:20mm;">TackBird — UI Record | Puddles Oy</div>'
  footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
stylesheet: []
body_class: tackbird-doc
---

<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  :root {
    --ink: #1A1D1F;
    --ink-soft: #535A60;
    --bg: #F5F6F7;
    --card: #FFFFFF;
    --border: #E8EAEC;
    --primary: #2D6B5E;
    --tarvitsen: #C75B3A;
    --tarjoan: #7C5CBF;
    --ilmaista: #3B7DD8;
    --lainaa: #A97A1E;
    --tapahtuma: #2B8A62;
  }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    color: var(--ink);
    line-height: 1.6;
    font-size: 10pt;
  }

  h1 {
    font-size: 28pt;
    font-weight: 700;
    color: var(--ink);
    border-bottom: 3px solid var(--ink);
    padding-bottom: 8px;
    margin-top: 0;
  }

  h2 {
    font-size: 16pt;
    font-weight: 700;
    color: var(--ink);
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    margin-top: 32px;
    page-break-after: avoid;
  }

  h3 {
    font-size: 12pt;
    font-weight: 600;
    color: var(--ink);
    margin-top: 20px;
    page-break-after: avoid;
  }

  h4 {
    font-size: 11pt;
    font-weight: 600;
    color: var(--ink-soft);
    margin-top: 16px;
    page-break-after: avoid;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 9pt;
    page-break-inside: avoid;
  }

  th {
    background: var(--ink);
    color: white;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  tr:nth-child(even) td {
    background: #FAFBFC;
  }

  code {
    background: #F0F2F4;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 8.5pt;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  pre {
    background: #1A1D1F;
    color: #E8EAEC;
    padding: 14px 18px;
    border-radius: 8px;
    font-size: 8.5pt;
    overflow-x: auto;
    page-break-inside: avoid;
  }

  pre code {
    background: none;
    color: inherit;
    padding: 0;
  }

  blockquote {
    border-left: 3px solid var(--ink);
    margin: 16px 0;
    padding: 8px 16px;
    background: #FAFBFC;
    font-style: italic;
    page-break-inside: avoid;
  }

  .cover-meta {
    color: var(--ink-soft);
    font-size: 11pt;
    margin-top: 4px;
  }

  .color-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    vertical-align: middle;
    margin-right: 6px;
    border: 1px solid rgba(0,0,0,0.1);
  }

  .category-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    color: white;
    font-size: 8pt;
    font-weight: 600;
  }

  .screenshot-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin: 16px 0;
    page-break-inside: avoid;
  }

  .screenshot-grid img {
    width: 100%;
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .screenshot-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 16px 0;
    page-break-inside: avoid;
  }

  .screenshot-pair img {
    width: 100%;
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .screenshot-single {
    text-align: center;
    margin: 16px 0;
    page-break-inside: avoid;
  }

  .screenshot-single img {
    width: 45%;
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .img-caption {
    text-align: center;
    font-size: 8pt;
    color: var(--ink-soft);
    margin-top: 6px;
    font-style: italic;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin: 16px 0;
  }

  .stat-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    text-align: center;
  }

  .stat-number {
    font-size: 22pt;
    font-weight: 700;
    color: var(--ink);
  }

  .stat-label {
    font-size: 8pt;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .page-break {
    page-break-before: always;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }

  .token-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>

# TackBird

<p class="cover-meta"><strong>UI Record — Forum Virium Helsinki</strong></p>
<p class="cover-meta">Puddles Oy (Y-tunnus 3610705-3) | Huhtikuu 2026 | Versio 1.0.0</p>

---

## Yleiskuvaus

**TackBird on hyperlokaalinen naapurustosovellus Helsinkiin.** Se yhdistaa ilmoitustaulun, vertaislainauksen, yhteisotapahtumat, taloyhtion hallinnon ja luottamusjarjestelman yhteen mobiilisovellukseen — kaikki rajattu kavelymatkalle.

> *"TackBird on naapurustosi oma ilmoitustaulu — loyda, lainaa ja jaa lahella, turvallisesti."*

**Ongelma:** Suomalaiset naapurustot ovat digitaalisesti hajanaisia. Tori.fi on kaupunkitasoinen ja persoonaton. Facebook-ryhmat ovat rakenteettomia. Taloyhtion WhatsApp-ryhmat ovat kaoottisia. Mikaan ei tarjoa rakenteellista vertaislainausta vakuuksineen ja arvioinnein.

**Ratkaisu:** TackBird tuo naapuruston oman ilmoitustaulun — viisi sisaltokategoriaa, luottamusjarjestelma, taloyhtiohallinto ja turvallinen viestinta yhdessa paikassa.

**Kohdealue:** Kallio, Helsinki (beachhead) → rakennus kerrallaan → koko Helsinki

<div class="stat-grid">
  <div class="stat-box">
    <div class="stat-number">48</div>
    <div class="stat-label">Nayttoa</div>
  </div>
  <div class="stat-box">
    <div class="stat-number">31</div>
    <div class="stat-label">Edge Functions</div>
  </div>
  <div class="stat-box">
    <div class="stat-number">67</div>
    <div class="stat-label">DB-taulua</div>
  </div>
  <div class="stat-box">
    <div class="stat-number">211</div>
    <div class="stat-label">RLS-politiikkaa</div>
  </div>
  <div class="stat-box">
    <div class="stat-number">3</div>
    <div class="stat-label">Kielta (fi/en/sv)</div>
  </div>
  <div class="stat-box">
    <div class="stat-number">5</div>
    <div class="stat-label">Kategoriaa</div>
  </div>
</div>

---

<div class="page-break"></div>

## Teknologiapino

| Kerros | Teknologia |
|--------|-----------|
| Framework | Expo SDK 54 + Expo Router (tiedostopohjainen navigaatio) |
| Kieli | TypeScript (strict mode) |
| UI | React Native + StyleSheet.create + Lucide React Native (ikonit) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| Autentikaatio | Supabase Auth + SecureStore (JWT-sessiot) |
| Kuvat | expo-image (optimoitu renderaus) + expo-image-picker |
| Animaatiot | react-native-reanimated |
| Lokalisaatio | Rakennettu I18nProvider (fi/en/sv) |
| Maksaminen | Stripe Connect + Checkout (aktivointi tulossa) |
| Jakelu | EAS Build (iOS + Android natiivibinaarit) |

---

## Design-jarjestelma: Helsinki Monochrome v3

### Filosofia

Helsinki Monochrome v3 on **ink-on-warm-neutral** -designjarjestelma. Kayttoliittyma pysyy rauhallisen monokromaattisena — sisalto tuo varit kategoriakohtaisesti. Kaikki kontrastit tayttavat WCAG AA -vaatimukset.

### Typografia

| Rooli | Fontti | Kaytto |
|-------|--------|--------|
| Display / Otsikot | **Bricolage Grotesque** | Nayttojen nimet, suuret otsikot |
| Body / UI | **Instrument Sans** | Leipateksti, painikkeet, labelit, meta |

Tyyppiasteikko: 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 / 32 px

### Varipaletti — Light Mode

| Token | Vari | Kaytto |
|-------|------|--------|
| Primary | <span class="color-swatch" style="background:#1A1D1F"></span> `#1A1D1F` | Ink — paateksti, CTA-painikkeet |
| Background | <span class="color-swatch" style="background:#F5F6F7"></span> `#F5F6F7` | Lammin neutraali pohja |
| Card | <span class="color-swatch" style="background:#FFFFFF; border:1px solid #E8EAEC"></span> `#FFFFFF` | Korttipinnat |
| Border | <span class="color-swatch" style="background:#E8EAEC"></span> `#E8EAEC` | Hienot erottimet |
| Muted text | <span class="color-swatch" style="background:#535A60"></span> `#535A60` | Meta, kuvatekstit (AA 4.6:1) |
| Destructive | <span class="color-swatch" style="background:#C44536"></span> `#C44536` | Varoitukset |
| Success | <span class="color-swatch" style="background:#2D7A4F"></span> `#2D7A4F` | Onnistumiset |

### Varipaletti — Dark Mode

| Token | Vari | Kaytto |
|-------|------|--------|
| Primary | <span class="color-swatch" style="background:#F5F6F7"></span> `#F5F6F7` | Kaanteinen ink |
| Background | <span class="color-swatch" style="background:#0E1012"></span> `#0E1012` | Tumma pohja |
| Card | <span class="color-swatch" style="background:#17191C"></span> `#17191C` | Tumma korttipinta |
| Border | <span class="color-swatch" style="background:#2E3136"></span> `#2E3136` | Tumma erotin |
| Muted text | <span class="color-swatch" style="background:#8B8F94"></span> `#8B8F94` | Tumma meta (AA 5.4:1) |

### Kategoriavarit

| Kategoria | Light | Dark | Vari |
|-----------|-------|------|------|
| **Tarvitsen** | <span class="color-swatch" style="background:#C75B3A"></span> `#C75B3A` | <span class="color-swatch" style="background:#D4734F"></span> `#D4734F` | Oranssinpunainen |
| **Tarjoan** | <span class="color-swatch" style="background:#7C5CBF"></span> `#7C5CBF` | <span class="color-swatch" style="background:#9B7DD4"></span> `#9B7DD4` | Violetti |
| **Ilmaista** | <span class="color-swatch" style="background:#3B7DD8"></span> `#3B7DD8` | <span class="color-swatch" style="background:#5B9BF0"></span> `#5B9BF0` | Sininen |
| **Lainaa** | <span class="color-swatch" style="background:#A97A1E"></span> `#A97A1E` | <span class="color-swatch" style="background:#C99A3E"></span> `#C99A3E` | Kulta |
| **Tapahtuma** | <span class="color-swatch" style="background:#2B8A62"></span> `#2B8A62` | <span class="color-swatch" style="background:#3AAE7A"></span> `#3AAE7A` | Vihrea |

### Muut designtokenit

| Token | Arvo |
|-------|------|
| Kortin pyoristys | 16px |
| Painikkeen pyoristys | 28px (pill) |
| Chippien pyoristys | 20px |
| Kosketusalueen minimi | 44 x 44 pt |
| Valilyontirytmi | 4/8dp-jarjestelma |

---

<div class="page-break"></div>

## Kayttoliittyma — Ydinnaytot

### Koti (Feed)

Naapuruston syote alykkaan algoritmin karjistyksella, kategoriachipseilla ja kahdella layouttinakymalla.

<div class="screenshot-pair">
  <img src="../screenshots/final/01-feed-light.png" alt="Feed - listanahkuma" />
  <img src="../screenshots/final/12-threads-complete.png" alt="Feed - ruudukkonahkuma" />
</div>
<div class="img-caption">Vasemmalla: Listanahkuma kategoriachipseilla. Oikealla: 2-sarakkeinen ruudukkonahkuma.</div>

**Ominaisuudet:**
- Sijaintivalitsin (naapurusto-dropdown)
- Kategoriachipsit: Kaikki | Tarvitsen | Tarjoan | Ilmaista | Lainaa | Tapahtuma
- Lajitteluvalinnat: Tuoreus / Suosituin / Lahin
- Kuva- ja tekstikorttivariantit
- Tapahtumanostot varikoodatulla taustalla
- Reaaliaikapaivitys (tykkays- ja kommenttilaskurit)
- 7-tekijainen feed-algoritmi

### Ilmoituksen luominen

2-vaiheinen prosessi: ensin kategoriavalinta, sitten lomake.

<div class="screenshot-pair">
  <img src="../screenshots/final/02-create-bento.png" alt="Kategoriavalitsin" />
  <img src="../screenshots/final/04-create-inline-validation.png" alt="Lomakevalidaatio" />
</div>
<div class="img-caption">Vasemmalla: Bento-kategoriavalitsin. Oikealla: Lomake inline-validaatiolla.</div>

**5 kategoriaa:**
- <span class="category-badge" style="background:#C75B3A">TARVITSEN</span> Pyyda apua naapureilta
- <span class="category-badge" style="background:#7C5CBF">TARJOAN</span> Tarjoa palvelu tai tavara
- <span class="category-badge" style="background:#3B7DD8">ILMAISTA</span> Jaa ilmaiseksi
- <span class="category-badge" style="background:#A97A1E">LAINAA</span> Lainaa tai vuokraa
- <span class="category-badge" style="background:#2B8A62">TAPAHTUMA</span> Luo yhteisotapahtuma

---

<div class="page-break"></div>

### Viestit, ilmoitukset ja profiili

<div class="screenshot-grid">
  <img src="../screenshots/final/05-messages-swipe-hint.png" alt="Viestit" />
  <img src="../screenshots/final/06-notifications-badges.png" alt="Ilmoitukset" />
  <img src="../screenshots/final/07-profile-progress-bar.png" alt="Profiili" />
</div>
<div class="img-caption">Vasemmalta: Viestilista pyyhkaisyvihjeella. Ilmoituskeskus suodattimilla. Profiili luottamustason edistymispalkilla.</div>

**Viestit:**
- Kahdenvalinen viestinta kuvatuella
- Pyyhkaisyeleet: arkistointi ja pinnaus
- Kirjoitusindikaattori ja lukukuittaukset
- Uusi viesti -FAB

**Ilmoitukset:**
- Suodatinvaliletea: Kaikki | Viestit | Arvostelut | Lainaukset
- Aikaryhmat: Tanaan, Aiemmin, Tama viikko
- Ilmoitustyypit: viestit, seuraajat, kommentit, tykkaysset

**Profiili:**
- Edistymispalkki seuraavaan luottamustasoon
- Tilastot: seuraajat, ilmoitukset, arviot, pisteet
- Naapurusto- ja taloyhtiolinkki

### Tutustu ja haku

<div class="screenshot-pair">
  <img src="../screenshots/14-explore-logged-in.png" alt="Tutustu" />
  <img src="../screenshots/05-search.png" alt="Haku" />
</div>
<div class="img-caption">Vasemmalla: Tutustu-nakyma (kartta, tapahtumat, ryhmat, keskustelut). Oikealla: Haku suosituilla hakutermeilla ja kategoriaselaus.</div>

---

<div class="page-break"></div>

### Ilmoituksen yksityiskohdat ja onboarding

<div class="screenshot-pair">
  <img src="../screenshots/19-post-detail.png" alt="Ilmoituksen yksityiskohdat" />
  <img src="../screenshots/10-onboarding.png" alt="Onboarding" />
</div>
<div class="img-caption">Vasemmalla: Ilmoituksen yksityiskohdat (kategorialeima, julkaisijan kortti, samankaltaiset ilmoitukset, kommenttiosio). Oikealla: Tervetulonayto.</div>

**Ilmoituksen yksityiskohdat:**
- Tallenna, jaa, ilmianna -toimintopalkki
- Kategorialeima varikoodattuna
- Julkaisijan profiilikortti (avatar, nimi, naapurusto)
- "Samankaltaisia ilmoituksia" -karuselli
- Kommenttiosio
- "Laheta viesti" -CTA

**Onboarding (4 vaihetta):**
1. Tervetuloa TackBirdiin — logo ja slogan
2. Naapuruston valinta — osoitepohjainen paikannus
3. Tarkoituksen valinta — mita etsit sovelluksesta
4. Talon liittyminen — taloyhtiolinkki

### Asetukset

<div class="screenshot-single">
  <img src="../screenshots/07-settings.png" alt="Asetukset" />
</div>
<div class="img-caption">Asetukset: kielivalinta (fi/en/sv), teema (vaalea/tumma/auto), naapuruston valinta, profiilin nakyvyys.</div>

---

<div class="page-break"></div>

### Dark Mode

<div class="screenshot-single">
  <img src="../screenshots/final/09-threads-dark-feed.png" alt="Dark mode feed" />
</div>
<div class="img-caption">Feed dark modessa — 2-sarakkeinen ruudukko. Kategoriavarit optimoitu WCAG AA -kontrastille tummaa pintaa vasten.</div>

---

## Luottamusjarjestelma

TackBird kayttaa 3-portaista progressiivista luottamusjarjestelmaa, joka mahdollistaa turvallisen vertaiskaupan.

| Taso | Nimi | Vaatimukset | Oikeudet |
|------|------|-------------|----------|
| **1** | Peruskäyttäjä | Sahkopostin vahvistus | Lainaus (max 50eur/pv), perusominaisuudet |
| **2** | Aktiivinen naapuri | +ID-vahvistus, 7pv tilika | Maksulliset palvelut (max 200eur) |
| **3** | Luotettu naapuri | +3 arvostelua (ka 4.0+), 90% vastausprosentti, 30pv | Rajoittamaton, feedin prioriteetti, merkki |

Edistyminen visualisoidaan profiilissa palkilla ja pisteyttajalla (esim. "49/100").

---

<div class="page-break"></div>

## Taloyhtiohallinto

Taloyhtion digitaalinen hallinta on yksi TackBirdin strategisista erottautumistekijoista. Kun tiedotteet, huoltopyyntohistoria ja jasenhakemisto asuvat TackBirdissa, vaihtokulut ovat korkeat.

### Ominaisuudet

| Ominaisuus | Kuvaus |
|------------|--------|
| **Tiedotteet** | Viralliset rakennuksen tiedotteet pikajakelulla |
| **Huoltopyynnot** | Ilmoita ja seuraa huoltotarpeita tilanpaivityksin |
| **Jasenluettelo** | Nae rakennuksen asukkaat ja profiilit |
| **Jarjestyssaannot** | Taloyhtion saannot ja ohjeet |
| **Rakennuksen chat** | Reaaliaikainen keskustelu asukkaiden kesken |

### Strateginen merkitys

- **Taloyhtion hallitus** on luonnollinen adoptiokanava: yksi hallituspaatos onboardaa koko rakennuksen
- Taloyhtion kokous (yhtiokokous) on tilaisuus pitchata palvelua
- Keskimaarin 20-60 asuntoa per kerrostalo → 10-20 aktiivista kayttajaa riittaa kriittiseen massaan
- Laajentumispolku: rakennus → viereinen rakennus → naapurusto

---

## Backend-arkkitehtuuri

### Edge Functions (31 kpl)

| Kategoria | Funktiot | Kuvaus |
|-----------|----------|--------|
| Autentikaatio (5) | auth-verify, send-otp, verify-otp-code, send-phone-otp, verify-phone-otp | Monivaiheinen tunnistautuminen |
| Maksut (6) | stripe-checkout, stripe-webhook, stripe-connect-onboard, pro-subscribe, verify-boost-purchase, use-boost, grant-tier-boosts | Stripe-integraatio |
| Sisalto (5) | moderate-content, embed-post, semantic-search, semantic-match, price-suggestion | AI-avusteinen sisallonhallinta |
| Tapahtumat (3) | kide-proxy, meteli-proxy, ticketmaster-proxy | Ulkoiset tapahtumaintegraatiot |
| Ilmoitukset (4) | send-push, send-email, send-digest, match-saved-searches | Monikanavainen viestinta |
| Hallinto (5) | admin-api, db-backup, ads-scheduler, check-overdue-rentals, validate-business | Jarjestelman yllapito |
| Kayttaja (2) | delete-account, verify-identity | GDPR ja identiteetti |
| Terveys (1) | health-check | Jarjestelman monitorointi |

### Reaaliaikaisuus

- **Supabase Realtime WebSocketit** — uudet viestit, tykkaysset, kommentit, ilmoitukset
- **Lasnaolon seuranta** — online/offline-tilat keskusteluissa
- **Kirjoitusindikaattorit** — "kirjoittaa..." reaaliajassa
- **Feed-paivitykset** — uudet postaukset ilman sivun paivitysta

### Tietoturva

- **211 RLS-politiikkaa** — jokainen tietokantakysely tarkastetaan kayttajatunnisteella
- **JWT-pohjaiset sessiot** tallennettuna SecureStoreen
- **GDPR-yhteensopiva** — tietojen poisto asetuksissa, Suomi.fi-vaatimusten mukainen tietosuojaseloste
- **Feature flags** — ominaisuuksien hallittu kayttoonotto

---

<div class="page-break"></div>

## Kaupallinen malli

| Tulolahde | Tila | Kuvaus |
|-----------|------|--------|
| Nostot (Boosts) | Valmis | Ilmoitusten korostaminen feedissa (pistepohjainen) |
| Pro-tilit | Suunniteltu | Yrityskayttajien laajennetut ominaisuudet |
| Hyperlokaali mainonta | Suunniteltu | Naapurustotasoinen kohdennus |
| Stripe Connect | Integroitu | Vertaismaksut (aktivointi tulossa) |

---

## Saavutettavuus ja lokalisaatio

### Saavutettavuus

| Ominaisuus | Toteutus |
|------------|----------|
| Kontrastivaatimus | WCAG AA 4.5:1 kaikelle tekstille, molemmissa teemoissa |
| Kosketusalueet | Min 44x44pt kaikille interaktiivisille elementeille |
| Painamispalaute | Opacity-efekti kaikissa painettavissa elementeissa |
| Tyhjat tilat | Selkeat viestit ja toimintoehdotukset |
| Virhetilat | Inline-validaatio, virhe lahimman kentan alla |
| Dark mode | Taysi tuki, auto-seuranta jarjestelman teemalle |

### Lokalisaatio

| Kieli | Tila |
|-------|------|
| Suomi (oletus) | Taysi kattavuus |
| English | Taysi kattavuus |
| Svenska | Taysi kattavuus |

---

## Yhteystiedot

| | |
|---|---|
| **Yritys** | Puddles Oy |
| **Y-tunnus** | 3610705-3 |
| **Kehittaja** | Jesse Parkkonen |
| **Sahkoposti** | tuki@tackbird.com |
| **Verkkosivut** | tackbird.com |
| **Bundle ID** | io.bivoapp.app |

---

<p style="text-align:center; color:#848B93; font-size:8pt; margin-top:40px;">
TackBird UI Record — Puddles Oy — Huhtikuu 2026<br/>
Luotu Forum Virium Helsinki -esittelya varten
</p>
