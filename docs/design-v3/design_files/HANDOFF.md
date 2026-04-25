# TackBird v2 — Handoff Claude Codelle

> Tämä paketti sisältää UX-arvion + redesignin TackBird-naapurustosovellukseen.
> Tavoite: pelkistä Feed-näytön kognitiivinen kuorma, anna search-toiminnolle
> ansaitsemansa tila, ja yhtenäistä bannerien hierarkia. **Suunnittelu pysyy
> Helsinki Monochrome -järjestelmässä, theme.ts:ää ei muuteta.**

Liitteet:

- `v2/index.html` — kaikki näytöt design-canvas-pohjalla, sis. ennen/jälkeen-vertailu Feedistä ja dark mode -versiot.
- `v2/screen-feed.jsx`, `v2/post-card.jsx` — referenssitoteutukset jokaiselle näytön muutokselle.
- `v2/screens-rest.jsx` — Create, Messages, Profile, Notifications, Onboarding -ehdotukset.

---

## Pääperiaatteet

1. **Yksi pääsignaali kerralla.** Headerissä on tällä hetkellä 6 informaatiotasoa
   (location, online-count, "X aktiivista", 3 nappia). V2:ssa yksi otsikko
   ("Kallio") + yksi pulssirivi.
2. **Search ansaitsee inputin.** Se on sovelluksen toiseksi tärkein toiminto;
   circle-button ei kunnioita sitä.
3. **Banner-pino → banner-slot.** Maksimi yksi banneri näkyvillä yläosassa.
4. **Visuaalinen paino seuraa toiminnan tärkeyttä.** Sort harvoin → tekstiriviksi.
   Map-näkymä → 44px icon. Search päivittäin → input.

---

## Tiedostokohtaiset muutokset

### `app/(tabs)/index.tsx` (pääfeed)

**Korvaa header-blokki** (rivit jotka renderöivät Search/Map/Sort -ympyrät, "Nearby now"
-otsikon, neighborhoodin ja online-counterin):

```tsx
{/* Header */}
<View style={styles.header}>
  <Text style={styles.locationLabel}>Naapurusto</Text>
  <View style={styles.titleRow}>
    <Text style={styles.title}>{neighborhood?.name ?? "Helsinki"}</Text>
    <Pressable
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityLabel="Avaa kartta"
      onPress={() => router.push("/map")}
    >
      <Map size={18} color={theme.foreground} />
    </Pressable>
  </View>
  <View style={styles.pulseRow}>
    <View style={styles.pulseDot} />
    <Text style={styles.pulseText}>
      {onlineCount} naapuria juuri nyt · {weeklyPostCount} ilmoitusta tällä viikolla
    </Text>
  </View>
</View>

{/* Search bar — full input, not a circle */}
<View style={styles.searchRow}>
  <Pressable
    style={styles.searchInput}
    accessibilityRole="search"
    onPress={() => router.push("/search")}
  >
    <Search size={16} color={theme.mutedForeground} />
    <Text style={styles.searchPlaceholder}>Etsi naapurustosta…</Text>
  </Pressable>
  <Pressable style={styles.iconBtn} onPress={() => setSortOpen(true)}>
    <SlidersHorizontal size={18} color={theme.foreground} />
  </Pressable>
</View>
```

**Sort-rivi**: muuta dark circle button → tekstirivi pillien alle.
Vasen puoli näyttää aktiivisen filtterin nimen + count, oikea puoli "Suositus ›".

**Banner-stack**: vaihda nykyinen ehtokuoppa (`missedBanner && AlertBanner && newBanner && errorRow && polls`) prioriteettijonoksi, jossa renderöidään max 1:

```tsx
const topBanner =
  errorMessage   ? "error"   :
  newPostCount   ? "newPosts":
  missedCount    ? "missed"  :
  showPoll       ? "poll"    : null;
```

**BuildingCard**: siirrä se headerin alta omaan paikkaansa pillien jälkeen — se ei
ole banneri vaan oma tietoryhmänsä.

**Poista FAB**. Floating-navissa on jo Plus.

### `components/PostCardGrid.tsx`

Korjaa visuaalinen hierarkia — image-hero-kortti on tällä hetkellä textiltään
pienempi kuin text-only-kortti, mikä on käänteistä:

| Variantti  | Otsikon nykyinen koko | V2-koko |
| ---------- | --------------------- | ------- |
| image-hero | 13                    | **15** (+ line-height 1.25) |
| text       | 16                    | 18 (otsikkokäyttö, suurempi rivinkorkeus) |
| event      | 13                    | 18 (event-kortin otsikko on korttilaattaa kantava elementti) |

Lisää `image-hero`-varianttiin **price-rivi** otsikon alle (jos `post.price` on olemassa)
— hinta on nyt piilossa metarivissä, vaikka se on kortin tärkein hetki ostopäätöksessä.

Avatar + meta-rivi: yksi rivi (avatar 18px + nimi · sijainti) sen sijaan että
nykyinen 2-rivinen (avatar/nimi yllä, sijainti/aika alla) joka kuluttaa korkeutta.

Tarkka seloste & toteutus: katso `v2/post-card.jsx`.

### `app/search.tsx`

- Tee top-bar `position: sticky` (tällä hetkellä se rullaa pois sisällön mukana).
- Muuta hakukenttä modal-triggeristä **näkyväksi inputiksi** joka saa fokuksen mountilla.
- Vaihda "Recent searches" -lista → chip-rivi (max 6 näkyvissä).
- Lisää "Selaa kategorioittain" chip-rivi käyttäjille jotka eivät tiedä mitä etsivät.
- Tulokset 2-col grid (sama kuin filtteröity feed), ei full-width-rivit.

Toteutus: `v2/screen-search.jsx`.

### `app/post/[id].tsx`

- Hero-kuva 16:10, yksi kuva (carousel toissijaisena swipe-eleenä).
- Kategoria-pillin pois route-headeristä, kuvaan päälle.
- Author-kortti omana blokkinaan (ei uponnut metariville): avatar 48 + nimi +
  shield + ★4.8 + arvioiden määrä + vastausaika.
- **Sticky bottom action bar**: Like + Save + "Lähetä viesti" -primary CTA.
  Tällä hetkellä actionit ovat hajallaan eri paikoissa, mikä rikkoo Fitts-lain.

Toteutus: `v2/screen-post-detail.jsx`.

### `app/(tabs)/create.tsx`

- Poista 1/2-step indicator yläreunasta. Yhden ruudun lomake riittää
  (4 kategoriaa + kuvat + otsikko + kuvaus + sijainti + cta).
- Kategoriavalinta nostetaan ensimmäiseksi blokiksi — se määrittää loput kentät.
- Photo grid: 1 iso (2×) + 3 pientä → kannustaa lisäämään pääkuvan, ei
  4 yhtä laihaa placeholderia.
- "Hinta" + "Vakuus" -kentät renderöidään vain kun kategoria = lainaa tai tarjoan.
- Sticky bottom "Julkaise" -CTA (ei piilossa scrollin alla).

Toteutus: `v2/screens-rest.jsx` → `CreateV2`.

### `app/messages/[id].tsx`

- Header: avatar + nimi + viestiketjun **konteksti-rivi** (mihin ilmoitukseen
  liittyy + mini-thumbnail). Tällä hetkellä konteksti puuttuu kokonaan, mikä
  rikkoo "mistä asiasta puhumme" -odotuksen.
- Päivän erotin: pieni pill ("Tänään") keskellä, ei oma rivinsä taustavärillä.
- Composer aina näkyvillä: Image + Mic + input + Send. Mic on optional mutta
  arvokas ikääntyville käyttäjille (TackBirdin kohderyhmästä iso osa).

### `app/(tabs)/profile.tsx`

- Hero: iso avatar (88), nimi, naapurusto, trust-tier shield. Ei muuta yläosassa.
- Stats-rivi (3 saraketta): Ilmoitukset · Arviot · Vastausaika. Sama data kuin
  nykyinen, tiiviimmin.
- Tabs (Ilmoitukset / Arviot / Tallennetut): segmented control ei full-width
  underline-rivi.
- Settings + Bell -ikonit profiilin yläoikealla, ei alalaidassa.

### `app/notifications.tsx`

- Filter-modal pois — segmented control "Kaikki / Lukemattomat" ylös.
- Aikaryhmät inline-otsikoina ("Tänään", "Aiemmin tällä viikolla").
- Unread = ink dot vasemmalla, ei koko rivin tinttaus.

### `app/onboarding.tsx`

- 4 step → 3 step (Tervetuloa · Naapurusto · Trust).
- Skip vain ensimmäisellä stepillä.
- Primary CTA aina näkyvä, ei harmaa.

---

## Ei kosketa

- `lib/theme.ts` — tokeniavain pysyy samana. V2 käyttää tasan niitä mitä on jo määritelty.
- `lib/supabase.ts` ja kaikki kyselyt — sopimukset pysyvät.
- Reitit (`expo-router`) — kaikki samat polut.
- Tietomallit (`types/*.ts`) — kentät pysyvät samana.

Jos joku muutos näyttää vaativan uuden kentän tietomalliin (esim. event-kortin
`attending`-counter), merkitse se omaan migraatio-issuekseen — älä yhdistä tähän PR:ään.

---

## Hyväksymiskriteerit

### Feed
- [ ] Header sisältää tasan: 1 location-label, 1 neighborhood-otsikko, 1 map-icon, 1 pulssirivi.
- [ ] Search on input-pillinä (44px korkea, full-width minus 1× icon-button).
- [ ] Sort-toiminto on tekstirivinä, ei circle-buttonina.
- [ ] Vain yksi banneri näkyvissä kerrallaan (priority order: error → newPosts → missed → poll).
- [ ] FAB on poistettu.
- [ ] Building-card näkyy omana lohkonaan pillien jälkeen (ei headerin alla).
- [ ] PostCardGrid: image-hero-otsikko 15px, ei 13px. Hinta näkyvillä otsikon alla kun `post.price` on totta.

### Search
- [ ] Top-bar sticky.
- [ ] Hakukenttä saa fokuksen mountilla.
- [ ] Recent + Suggested näkyvillä chip-riveinä.
- [ ] Tulokset 2-col grid.

### Post detail
- [ ] Hero 16:10 single-image.
- [ ] Sticky bottom action bar (Like + Save + Send message CTA).
- [ ] Author-kortti omana blokkinaan ★-rating ja vastausaika näkyvillä.

### Create
- [ ] Ei step-indikaattoria.
- [ ] Kategoria ensimmäisenä blokkina.
- [ ] Hinta-kentät vain lainaa/tarjoan-kategorialla.
- [ ] Sticky "Julkaise" -CTA.

### Messages thread
- [ ] Header näyttää avatar + nimi + viittaus ilmoitukseen.
- [ ] Composer aina näkyvillä.

### Profile
- [ ] Stats-rivi 3 saraketta (Ilmoitukset / Arviot / Vastausaika).
- [ ] Tabs segmented controllina.

### Notifications
- [ ] "Kaikki / Lukemattomat" segmented control.
- [ ] Aikaryhmät inline-otsikoina.

### Onboarding
- [ ] 3 stepiä, ei 4.
- [ ] Skip vain ensimmäisellä.

### Yleiset
- [ ] Dark mode toimii (`useColorScheme()`-hook käytössä, tokens vastaavat `theme.ts`-darkin avaimia).
- [ ] Floating-navin Plus-tab vie create-näyttöön.
- [ ] Kaikki näytöt navigoivat oikealla expo-router-poluille.
- [ ] Ei uusia design-tokeneita — V2 käyttää vain niitä mitä `lib/theme.ts` jo tarjoaa.

---

## Avoimet kysymykset (kysy ennen koodausta)

1. **Online-count-laskuri**: kuinka tuore data tarvitaan? Jos rajoitettu, voi
   pulssiriviin laittaa "X naapuria viime tunnin aikana" sen sijaan että "juuri nyt".
2. **Building card**: onko taloyhtiö-tieto kaikilla käyttäjillä? Jos ei,
   placeholder "Lisää taloyhtiösi" -kortti.
3. **Vastausaika** (profile): lasketaanko tämä jo? Jos ei, hide tilastoriviltä
   kunnes data on saatavilla.

---

Kysy tarvittaessa tarkempia perusteluja tai vaihtoehtoja millekään muutokselle.
Jokainen päätös on käytettävyyspohjainen, ei makukysymys.
