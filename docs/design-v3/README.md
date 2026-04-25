# Handoff: TackBird v3 — koko sovellus

> Tämä paketti sisältää **TackBird-naapurustosovelluksen v3-redesignin**: viimeistellyt
> hi-fi-mockupit kaikille kahdeksalle päänäytölle (Feed, Post Detail, Create,
> Search, Messages, Profile, Notifications, Onboarding) sekä neljä reunatapausta
> (skeleton, ei verkkoa, tyhjä tila, ei kuvaa). Tavoitteena on ohjata olemassa
> olevan **Expo / React Native -koodikannan** UX kohti tarkkuutta, hierarkiaa ja
> aitoa Helsinki-sisältöä.

---

## Tietoa designista

Tämän nipun tiedostot ovat **HTML-pohjaisia design-referenssejä** — toimivia
prototyyppejä, jotka osoittavat halutun ulkoasun, typografian, värimaailman,
kortti-rytmin ja vuorovaikutuksen. **Niitä ei kopioida sellaisinaan tuotantoon.**

Kohdekoodikanta on **Expo / React Native + expo-router** (TypeScript). Tehtäväsi on
**toteuttaa nämä HTML-designit React Nativessa** käyttäen koodikannan olemassa
olevia kirjastoja, komponentteja ja `lib/theme.ts`-tokeneita. Feed / Detail / Create
ovat saaneet täydellisen v3-päivityksen (uudet kortit, kategoriavalitsija,
photo-grid). Search / Messages / Profile / Notifications / Onboarding noudattavat
v2-tason määrittelyä, joka on tässä README:ssä alla — ja sama löytyy
yksityiskohtaisemmin `design_files/HANDOFF.md`-tiedostosta.

## Fideliteetti

**High-fidelity (hifi)** — pikselintarkat mockupit, valmiit värit, fontit,
välistykset, kategoriarakenne ja sisältö. Toteuta UI mahdollisimman tarkasti
HTML-mallin mukaan käyttäen `lib/theme.ts`-tokeneita ja olemassa olevia
RN-komponentteja. Älä keksi uusia värejä tai välistyksiä.

---

## Näytöt

### 1. Feed (`app/(tabs)/index.tsx`)

**Tarkoitus**: pääfeed jossa naapurit selaavat aktiivisia ilmoituksia ja tapahtumia.

**Layout (ylhäältä alas)**:

1. **Status header** — turvallinen alue + 14px alaspaina.
2. **Otsikko-blokki**:
   - `Naapurusto` (uppercase, 11px, 0.08em letter-spacing, `--tertiary-foreground`)
   - `Kallio` (Bricolage Grotesque, 32px/1.05, weight 500) + map-icon-button (40×40, ympyrä, ohut border)
3. **Pulssirivi**: `●` (8px, success-väri, sykkii) + `12 naapuria juuri nyt · 47 ilmoitusta tällä viikolla` (13px, muted-foreground)
4. **Hakurivi**: search-input-pill (44px, full-width minus icon-button) + filter-button. Input on Pressable joka vie `/search`-näyttöön.
5. **Building-card**: oma blokki naapurin pikatiedoille (talon nimi + 3 chip-actionia: Pesutupa, Sauna, Ilmoitustaulu).
6. **Kategoria-pillit** (vaakavieritettävä):
   - Kaikki / Tarjoan / Tarvitsen / Ilmaista / Lainaa / Tapahtuma
   - Active = ink-fill; inactive = ohut border, label-väri kategoriasta
7. **Sort-rivi**: vasen `47 ilmoitusta` · oikea `Suositus ›` (tekstiriviksi, ei circle-button)
8. **Banner-slot** (max 1 kerrallaan): error → newPosts → missed → poll. **Ei pinota.**
9. **Photo-grid**: 2 saraketta, 12px gap, kolme korttityyppiä:
   - **IMAGE** (4:5 photo, hinta päälle alaoikealle, otsikko alla)
   - **INK** (musta tapahtumakortti — päivämäärä iso visual anchor, location alla)
   - **TINT** (warm-tint text-only — kun kuvaa ei ole)
10. **Floating bottom nav**: 5 ikonia (Feed · Explore · Plus · Messages · Profile)

**Kortti-rytmin sääntö**: Älä laita kahta samanlaista korttia peräkkäin.
Sekoita IMAGE / INK / TINT visuaalisen rytmin vuoksi.

**Kategoria-pillin headerin yläpuolella**:
- Map-icon-button (oikea), pulssirivi vasen-keskellä.

**Toteutus-referenssi**: `design_files/screen-feed-v3.jsx`

---

### 2. Post Detail (`app/post/[id].tsx`)

**Tarkoitus**: yksittäisen ilmoituksen koko-ruudun näkymä viestinlähetystä varten.

**Layout**:

1. **Hero-kuva** 16:10, single image (carousel toissijaisena swipe-eleenä jos useita).
2. **Float-back-button** vasen-yläoikea (44×44, blur-bg).
3. **Like + Save + Share** float-actions oikea-yläoikea (44×44, blur-bg).
4. **Kategoria-pill** kuvan päällä alavasemmalla (ei route-headerissä).
5. **Otsikko-blokki** (kuvan alla):
   - 22px Bricolage 600
   - Hinta 18px (jos `post.price`) — tabular-nums
6. **Author-card** (oma blokki, ei meta-rivissä):
   - Avatar 52 + nimi + ShieldCheck + ★4.8 + arvioiden määrä + vastausaika
7. **Kuvaus-blokki** (16px body, line-height 1.5).
8. **Sijainti-kortti**: mini-map placeholder + osoite + etäisyys.
9. **Sticky bottom action bar**:
   - Like (heart-toggle) · Save (bookmark-toggle) · `Lähetä viesti` -primary CTA (full-width)

**Avoinna olevat actionit** noudattavat Fitts-lakia: peukalon tavoitettavissa.

**Toteutus-referenssi**: `design_files/screen-detail-v3.jsx`

---

### 3. Create (`app/(tabs)/create.tsx`)

**Tarkoitus**: uuden ilmoituksen luominen yhdellä ruudulla.

**Layout**:

1. **Header**: `Uusi ilmoitus` + close (X)
2. **Kategoria-valitsija** (ensimmäisenä blokkina — määrittää alapuoliset kentät):
   - 5 isoa korttia 2-col grid: Tarjoan / Tarvitsen / Ilmaista / Lainaa / Tapahtuma
   - Iso ikoni + label + 1-rivin kuvaus
   - Active = kategoria-color border 2px + tinttaus
3. **Kuva-grid**: 1 iso slot (2× kokoinen, vasen) + 3 pientä (oikea pylväs).
   Kannustaa lisäämään pääkuvan, ei 4 yhtä laihaa placeholderia.
   - Camera + Image-icon-buttonit
4. **Otsikko-input** (single-line, 18px placeholder)
5. **Kuvaus-textarea** (4 riviä alkuun, kasvava)
6. **Sijainti-rivi**: pin-icon + osoite-input + chevron (avaa map-picker)
7. **Hinta-kentät** (vain `lainaa` tai `tarjoan`): Hinta + Vakuus
8. **Tapahtuman ajankohta** (vain `tapahtuma`): date-picker + time-picker
9. **Sticky `Julkaise` -CTA** alalaidassa (full-width, ink-fill)

**Validointi**: CTA on disabloitu kunnes kategoria + otsikko + kuvaus on annettu.

**Toteutus-referenssi**: `design_files/screen-create-v3.jsx`

---

### 4. Search (`app/search.tsx`)

**Tarkoitus**: aktiivinen haku ja kategoria-selailu.

**Layout**:

1. **Sticky top-bar** — back-button + hakukenttä (auto-focus mountilla) + close (X tyhjentää syötteen).
2. **Recent searches** — chip-rivi (max 6), tap = täytä input + suorita haku.
3. **Selaa kategorioittain** — chip-rivi 5 kategoriasta + sub-categories (esim. Lainaa → Työkalut, Pyörät, Lastentarvikkeet).
4. **Tulokset** — 2-col grid (sama kuin filtteröity feed); inline-otsikko "X tulosta hakusanalle '…'".
5. **Tyhjä tila** — sama empty-state kuin Feedissä, ehdottaa "Luo ilmoitus tarpeestasi" -CTA:ta.

**Toteutus-referenssi**: `design_files/screen-search.jsx`

---

### 5. Messages thread (`app/messages/[id].tsx`)

**Tarkoitus**: viestiketju tietyn ilmoituksen ympärillä.

**Layout**:

1. **Sticky header**: back + avatar (36) + nimi + presence-piste.
2. **Konteksti-rivi** (heti headerin alla): mini-thumbnail (32×32, r-chip) + ilmoituksen otsikko + chevron (avaa ilmoituksen). **Tämä on kriittinen** — se vastaa kysymykseen "mistä asiasta puhumme".
3. **Viestilista**: bubblet 16px body, oma viesti = ink-fill oikealla, vastaanotettu = card-bg vasemmalla. Max 75% leveys.
4. **Päivän erotin**: pieni pill ("Tänään"), keskellä, ei full-width-rivi.
5. **Composer aina näkyvillä**: Image + Mic + auto-grow input + Send-button. Mic on optional mutta arvokas ikääntyville (kohderyhmä).

**Toteutus-referenssi**: `design_files/screens-rest.jsx` → `MessagesThread`

---

### 6. Profile (`app/(tabs)/profile.tsx`)

**Tarkoitus**: oma profiili + omat ilmoitukset, arviot, tallennetut.

**Layout**:

1. **Top-rivi**: settings-icon vasen + bell-icon oikea (badge-counter jos lukemattomia).
2. **Hero**: iso avatar 88 + nimi (22px) + naapurusto + trust-tier shield + ★4.9 (15 arviota).
3. **Stats-rivi** (3 saraketta, divider välissä):
   - Ilmoitukset · Arviot · Vastausaika
4. **Segmented tabs**: Ilmoitukset / Arviot / Tallennetut (ink-fill aktiivinen).
5. **Tab-content**: 2-col grid (Ilmoitukset, Tallennetut) tai lista (Arviot — avatar 28 + nimi + ★ + kommentti + aika).

**Toteutus-referenssi**: `design_files/screens-rest.jsx` → `ProfileV2`

---

### 7. Notifications (`app/notifications.tsx`)

**Tarkoitus**: aktiviteetti-feed (viestit, tykkäykset, varaukset, arviot, seuraajat).

**Layout**:

1. **Header**: title + "Merkitse luetuksi" -text-button.
2. **Segmented control**: Kaikki / Lukemattomat (ei filter-modaalia).
3. **Aikaryhmät inline-otsikoina**: "Tänään", "Aiemmin tällä viikolla".
4. **Rivi**: unread-dot (vasen, 6px ink) + avatar 40 + 2-rivinen text (`{nimi} {action} {context}` + aika muted).
5. **Ei full-row-tinttausta** unread-tilalle — pelkkä piste riittää.

**Toteutus-referenssi**: `design_files/screens-rest.jsx` → `NotificationsV2`

---

### 8. Onboarding (`app/onboarding.tsx`)

**Tarkoitus**: 3-step intro uusille käyttäjille.

**Layout (per step)**:

1. **Top-rivi**: progress (3 dottia, aktiivinen täynnä) + "Skip" oikeassa (vain step 1).
2. **Iso ilustaation slotti** (placeholder, käytä olemassa olevia onboarding-assetteja).
3. **Otsikko** 28px Bricolage 600 + **kuvaus** 16px body, max 3 riviä.
4. **Primary CTA** sticky alalaidassa (`Jatka` / `Aloita`), aina enabled.

**Stepit**:
1. **Tervetuloa** — mitä TackBird on (1 lauseessa).
2. **Naapurustosi** — anna sijainti / valitse kaupunginosa.
3. **Trust** — kerro luottamus-systeemistä (shield + ★) + lupaus että tietoja ei jaeta.

**Toteutus-referenssi**: `design_files/screens-rest.jsx` → `OnboardingV2`

---

## Reunatapaukset (`design_files/edge-cases.jsx`)

Toteuta nämä **omina näkyminä tai komponentteina**, älä jätä huomiotta:

### Skeleton-feed (ensilataus)
- Header- ja pulssirivi paikallaan, mutta otsikko + chip-rivi ovat shimmer-pelkistyksiä.
- 4 placeholder-korttia 2-col gridissä (vaihtelevat korkeudet IMAGE/TINT-rytmiä mukaillen).
- Shimmer-animaatio: 1.4s lineaarinen gradient siirtyy vasemmalta oikealle.

### Ei verkkoa
- Sama header (offline-tilassa map-icon korvautuu wifi-off-iconilla).
- Iso keskitetty placeholder: WifiOff-ikoni 56px + `Ei yhteyttä` -otsikko + `Tarkista verkkoyhteytesi…` -kuvaus + `Yritä uudelleen` -secondary-button.
- Tausta käyttää `--muted`-täytöstä (ei pelkkää `--background`).

### Tyhjä haku (esim. Tapahtuma-filtteri ilman tuloksia)
- Header + pillit + suodatin näkyvissä.
- Keskitetty empty-state: kategoria-värin sumea ympyrä + Calendar-icon + `Ei tapahtumia juuri nyt` + `Ole ensimmäinen järjestäjä — luo ilmoitus` + `+ Uusi tapahtuma`-primary-CTA.
- Tämä on **proaktiivinen**: ehdottaa toiminnan vaihtoa tyhjän tilanteen sijaan.

### Kortti ilman kuvaa
- Käytä **TINT**-varianttia (warm-tint background, ei placeholder-image).
- Otsikon koko isompi (18px), koska kortin painopiste on tekstissä, ei kuvassa.

---

## Vuorovaikutukset & käyttäytyminen

- **Pressable**: oletuksena scale 0.96 + opacity 0.96 painalluksessa (200ms). Ei rippleä.
- **Kategoria-pillit**: tap = filter-päivitys + smooth scroll-to-top (250ms easeOut).
- **Banner**: dismiss-animaatio = slide-up + fade (180ms).
- **Floating-nav**: aktiivinen tab kasvaa scale 1.05, label fade-in 120ms.
- **Like/Save**: optimistinen toggle + haptic light.
- **Kuvan zoom (Detail)**: pinch-to-zoom carousel-näkymässä (jos useita kuvia).

## Tila ja data

- **Feed**: `usePosts({ category, sort, neighborhood })`-hook → infinite-scroll, 20 / sivu.
- **Pulssirivi**: `useNeighborhoodPulse()` — palauttaa { onlineCount, weeklyPostCount }; refresh 60s välein. Jos data on vanhempi kuin 5min, näytä "viimeisen tunnin aikana" -teksti.
- **Categories**: kova lista (`constants.ts` → `CATEGORIES`).
- **Filter-state** persistoidaan `AsyncStorage`:een avaimella `feed:filter`.
- **Banner-priority**: `errorMessage > newPostCount > missedCount > poll`.
- **Posti**: `usePost(id)` + `useAuthor(post.author_id)`.

## Design-tokenit

**Älä lisää uusia tokeneita.** Käytä `lib/theme.ts`-arvoja, jotka vastaavat
`design_files/tokens.css`-tiedostoa:

### Värit (light)
| Token | Hex |
|---|---|
| `--primary` / `--foreground` | `#1A1D1F` |
| `--background` | `#F5F6F7` |
| `--card` | `#FFFFFF` |
| `--border` | `#E8EAEC` |
| `--muted-foreground` | `#535A60` |
| `--tertiary-foreground` | `#848B93` |
| `--success` | `#2D7A4F` |
| `--destructive` | `#C44536` |
| `--warm-tint` | `#F0EEE9` |
| `--surface-tinted` | `rgba(26,29,31,0.04)` |

### Kategoriavärit
| Token | Light | Dark |
|---|---|---|
| `--cat-tarvitsen` | `#C75B3A` | `#D4734F` |
| `--cat-tarjoan` | `#7C5CBF` | `#9B7DD4` |
| `--cat-ilmaista` | `#3B7DD8` | `#5B9BF0` |
| `--cat-lainaa` | `#A97A1E` | `#C99A3E` |
| `--cat-tapahtuma` | `#2B8A62` | `#3AAE7A` |

### Typografia
- **Display / heading**: `Bricolage Grotesque`, weights 500/600. Sizes: 32 (page), 22 (card title large), 18 (card title), 15 (card title small).
- **Body**: `Instrument Sans`, weights 400/500/600. Sizes: 16 (body), 13 (meta), 11 (eyebrow uppercase + 0.08em tracking).
- **Tabular-nums** numerosisällössä (hinnat, ajat, etäisyydet).

### Spacing-skaala
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 (tokenit `--s-1`…`--s-8`).

### Radii
- pill: 999px
- card: 20px
- input: 14px
- chip: 10px

### Dark mode
Toimii samasta tokenisetistä — `useColorScheme()` valitsee `theme.dark` /
`theme.light`. Älä toteuta omaa toggle-logiikkaa; järjestelmäteema riittää.

## Assetit

- **Avatarit**: pravatar.cc-stub-URL:t **vaihdetaan oikeisiin Supabase-storage**-avatarurleihin
  (taulu `profiles.avatar_url`).
- **Kuvat**: unsplash-stubit korvataan `posts.image_url`-kentällä.
- **Ikonit**: käytä olemassa olevaa `lucide-react-native` -kirjastoa. Stroke 1.6 default; aktiivisille tiloille 2.0.

## Tiedostot tässä paketissa

- `README.md` — tämä dokumentti.
- `design_files/v3.html` — pääcanvas, sisältää Feed / Detail / Create + dark mode + reunatapaukset.
- `design_files/screen-feed-v3.jsx` — Feed-näytön referenssitoteutus.
- `design_files/screen-detail-v3.jsx` — Post Detail -näytön referenssitoteutus.
- `design_files/screen-create-v3.jsx` — Create-näytön referenssitoteutus.
- `design_files/screen-search.jsx` — Search-näytön referenssitoteutus.
- `design_files/screens-rest.jsx` — Messages, Profile, Notifications, Onboarding.
- `design_files/edge-cases.jsx` — Skeleton / NoNetwork / Empty / NoImage.
- `design_files/post-card.jsx` — kortti-varianttien (IMAGE/INK/TINT) toteutus.
- `design_files/primitives.jsx` — Pressable, FloatingNav, Avatar, ikonit, CATEGORY-meta.
- `design_files/seed-v3.jsx` — realistinen Helsinki-sisältö (Vaasankatu, Sturenkatu, Brahenkenttä jne.).
- `design_files/tokens.css` — design-tokenit, peili `lib/theme.ts`:stä.
- `design_files/HANDOFF.md` — alkuperäinen v2-handoff (Messages, Profile, Notifications, Onboarding).

## Avaaminen

```bash
cd design_files
python3 -m http.server 8000
# avaa http://localhost:8000/v3.html
```

## Hyväksymiskriteerit (v3)

### Feed
- [ ] Otsikko-blokki: `Naapurusto`-eyebrow + `Kallio` + map-icon-button.
- [ ] Pulssirivi pulssaavalla success-pisteellä.
- [ ] Search on input-pillinä, ei circle-buttonina.
- [ ] Photo-grid 2-col, 12px gap, sekoittaa IMAGE/INK/TINT.
- [ ] Vain yksi banneri kerrallaan (priority order toteutettu).
- [ ] Sort tekstirivinä, ei circle-buttonina.
- [ ] FAB poistettu (Plus on floating-navissa).
- [ ] Bricolage Grotesque otsikoissa, Instrument Sans body.

### Detail
- [ ] Hero 16:10 single-image, kategoria-pill kuvan päällä.
- [ ] Author-card omana blokkinaan (avatar 52 + nimi + shield + ★ + vastausaika).
- [ ] Sticky bottom action bar (Like + Save + Lähetä viesti).

### Create
- [ ] Kategoria-valitsija ensimmäisenä blokkina, 5 isoa korttia.
- [ ] Photo-grid 1+3 layout (1 iso, 3 pientä).
- [ ] Hinta-kentät vain `lainaa` / `tarjoan`.
- [ ] Sticky `Julkaise` -CTA, disabled kunnes pakolliset täytetty.

### Search
- [ ] Top-bar sticky, hakukenttä auto-focus.
- [ ] Recent + Selaa kategorioittain chip-riveinä.
- [ ] Tulokset 2-col grid.

### Messages thread
- [ ] Header näyttää avatar + nimi + konteksti-rivi (mini-thumbnail + ilmoitus).
- [ ] Composer aina näkyvillä (Image + Mic + input + Send).

### Profile
- [ ] Iso avatar 88 + trust-tier-rivi.
- [ ] Stats-rivi 3 saraketta.
- [ ] Tabs segmented controllina.

### Notifications
- [ ] Segmented control "Kaikki / Lukemattomat".
- [ ] Aikaryhmät inline-otsikoina.
- [ ] Unread = ink-dot, ei full-row-tinttaus.

### Onboarding
- [ ] 3 stepiä, ei 4.
- [ ] Skip vain ensimmäisellä.
- [ ] Primary CTA aina enabled.

### Reunatapaukset
- [ ] Skeleton-feed shimmer-animaatiolla.
- [ ] No-network: WifiOff-icon + retry-button.
- [ ] Empty-haku: kategoriaväri + proaktiivinen CTA.
- [ ] No-image: TINT-variant 18px otsikolla.

### Yleiset
- [ ] Dark mode toimii samasta tokenisetistä, `useColorScheme()`-pohjalta.
- [ ] Tabular-nums numerosisällössä.
- [ ] Ei uusia design-tokeneita.
- [ ] expo-router-polut säilyvät.

---

## Avoimet kysymykset

1. **Pulssirivi-data**: onko `online_count` reaaliaikainen vai 60s-cache?
   Jos cache, vaihda teksti muotoon "viime tunnin aikana".
2. **Building-card**: onko taloyhtiötieto kaikilla käyttäjillä? Jos ei,
   placeholder `Lisää taloyhtiösi`.
3. **Vastausaika** (Detail author-card): lasketaanko jo? Jos ei, hide.

Kysy tarkennuksia ennen koodausta. Jokainen visuaalinen päätös tässä paketissa
on käytettävyys- tai hierarkiaperusteinen, ei makukysymys.
