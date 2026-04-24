# TackBird Mobile — Masterplan

**Pvm:** 2026-04-25
**Tila:** DRAFT — odottaa hyväksyntää
**Konteksti:** Kriittinen tuoteauditointi paljasti 58 näyttöä, 0 käyttäjää, 40-50% dead code, ei retentiomekanismeja. Kilpailuikkuna auki (Nextdoor ei Suomessa, Nappi Naapuri kuollut 12/2022). Tarvitaan kokonaisvaltainen suunnitelma.

---

## Osa 1 — LEIKKAA: Feature-siivous

### 1.1 Poista feature-flagatut näytöt koodista

**Miksi:** 13 feature flagia, joista 8 on `false`. Nämä näytöt kuluttavat ylläpitobudjettia, kasvattavat bundle-kokoa ja lisäävät tsc-aikaa. Ne eivät tuota arvoa ennen kuin käyttäjiä on satoja.

**Toimenpide:** Poista seuraavat tiedostot ja niihin liittyvät komponentit:

| Tiedosto | Feature flag | Syy poistoon |
|----------|-------------|-------------|
| `app/forum.tsx` | `FORUM: false` | Ei käyttäjiä keskustelemassa |
| `app/groups.tsx` | `GROUPS: false` | Ei yhteisöä jolle ryhmiä |
| `app/groups/[id].tsx` | `GROUPS: false` | ^ |
| `app/leaderboard.tsx` | `LEADERBOARD: false` | Ei dataa rankattavaksi |
| `app/create-ad.tsx` | `AD_CAMPAIGNS: false` | Ei mainostajia |
| `app/create-poll.tsx` | `POLLS: true` | Pidetään — mutta arvioidaan käyttöaste |
| `app/boosts.tsx` | `BOOSTS: false` | IAP vaatii native buildin |
| `app/pro.tsx` | `PRO_SUBSCRIPTION: false` | Monetisaatio myöhemmin |
| `app/upgrade-business.tsx` | `BUSINESS_ACCOUNT: false` | B2B myöhemmin |
| `app/organization.tsx` | `BUSINESS_ACCOUNT: false` | ^ |
| `app/create-table.tsx` | — | Ei käytössä |
| `app/map.tsx` | — | Orphan, ei navigaatiota |

**Liittyvät komponentit (poista myös):**

| Komponentti | Syy |
|-------------|-----|
| `src/components/forum/ForumCreateModal.tsx` | Forum pois |
| `src/components/forum/ForumPostCard.tsx` | ^ |
| `src/components/forum/ForumThreadView.tsx` | ^ |
| `src/components/groups/GroupCommentList.tsx` | Groups pois |
| `src/components/groups/GroupEditModal.tsx` | ^ |
| `src/components/groups/GroupMembersModal.tsx` | ^ |
| `src/components/groups/GroupPostCard.tsx` | ^ |
| `src/components/map/MapNative.tsx` | Map orphan |
| `src/components/map/MapNative.web.tsx` | ^ |
| `src/components/map/MapFilters.tsx` | ^ |
| `src/components/map/DetailModal.tsx` | ^ |
| `src/components/map/NeighborhoodModal.tsx` | ^ |
| `src/components/AdCard.tsx` | Ads pois |

**Liittyvät hookit (poista):**
- `usePoints()` — 0 kutsua
- `useDemandInsights()` — 2 kutsua, molemmat poistetuista näytöistä

**Liittyvät lib-tiedostot (poista):**
- `src/lib/abuseDetection.ts` — premature
- `src/lib/speedBadges.ts` — premature
- `src/lib/expirePrediction.ts` — premature

**Vaikutus:**
- ~15 näyttöä, ~13 komponenttia, ~3 hookia, ~3 lib-tiedostoa pois
- Arviolta 3000-5000 riviä vähemmän
- Bundle pienenee ~10-15%
- tsc nopeutuu ~20%

**Ei poisteta:**
- Feature flags -järjestelmä itsessään (on hyvä arkkitehtuuri tulevaisuuteen)
- Edge Functions jotka tukevat poistettuja ominaisuuksia (ei haittaa backendissä)

### 1.2 Yksinkertaista feature flags

**Nykyinen (13):**
```
LENDING: true, LENDING_PAYMENTS: false, PAYMENTS: false,
PRO_SUBSCRIPTION: false, BUSINESS_ACCOUNT: false, AD_CAMPAIGNS: false,
IDENTITY_VERIFICATION: false, EVENTS_TAPAHTUMA_TYPE: true,
BOOSTS: false, FORUM: false, GROUPS: false, LEADERBOARD: false,
POLLS: true
```

**Uusi (5):**
```
LENDING: true,
EVENTS: true,
POLLS: true,
PAYMENTS: false,        // Kaikki maksuominaisuudet
SOCIAL_FEATURES: false, // Forum, Groups, Leaderboard — palautetaan myöhemmin
```

---

## Osa 2 — KORJAA: Feed & Hero

### 2.1 Hero näkyy aina

**Ongelma:** `WeeklyPopularCarousel` näkyy vain kun `feed.cityEvents.length > 0 || heroCommunityEvents.length > 0`. Jos API-kutsut epäonnistuvat tai tapahtumia ei ole → käyttäjä näkee cold start -viestin.

**Ratkaisu:** Kolmiportainen fallback:

```
Prioriteetti 1: Tapahtumat (cityEvents + communityEvents)
  → 4 lähteestä: LinkedEvents, Ticketmaster, Kide, Meteli
  → Näytä aina kun > 0 tapahtumaa

Prioriteetti 2: Viikon suosituimmat postaukset
  → Top-5 eniten klikattua/tykättyä postausta viimeiseltä 7 päivältä
  → Näytä kun tapahtumia ei ole mutta postauksia on

Prioriteetti 3: Onboarding CTA
  → "Luo ensimmäinen ilmoitus naapurustollesi"
  → Näytä vain kun sekä tapahtumat että postaukset puuttuvat
```

**Tiedostot:**
- `app/(tabs)/index.tsx` rivit 732-757 — muuta render-logiikka
- `src/components/WeeklyPopularCarousel.tsx` — lisää suositut-postaus-tuki
- `src/hooks/useFeedData.ts` — lisää "viikon suosituimmat" query

**Tekninen toteutus:**

```typescript
// useFeedData.ts — uusi query
const fetchWeeklyPopular = async () => {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data } = await supabase
    .from('posts')
    .select('*, user:profiles!posts_user_id_fkey(id, name, avatar_url), images:post_images(*)')
    .eq('is_active', true)
    .gte('created_at', weekAgo)
    .order('like_count', { ascending: false })
    .limit(8)
  return data ?? []
}
```

### 2.2 Tapahtumahero — "Viikon tapahtumat lähellä sinua"

**Konsepti:** Hero-carousel näyttää tapahtumia 4 lähteestä yhdistettynä, rankattuina 7-tekijäisellä algoritmilla (jo olemassa `eventAlgorithm.ts`). Otsikko on "Tapahtumat lähellä" tai "Viikon tapahtumat".

**Data-lähteet (kaikki pidetään):**
1. **LinkedEvents** (Helsinki avoin data) — ilmaiset kulttuuritapahtumat, näyttelyt
2. **Ticketmaster** — isot konsertit, urheilutapahtumat
3. **Kide.app** — opiskelijatapahtumat, bileet, underground
4. **Meteli.net** — musiikkitapahtumat, keikat

**Carousel-kortti:**
```
┌─────────────────────┐
│ [Tapahtumakuva]     │  ← image_url tai category-placeholder
│                     │
│ Ma 28.4.            │  ← päivä + pvm
│ Kallio Block Party  │  ← title (max 2 riviä)
│ Sörnaisten rantatie │  ← venue
│ Ilmainen ● Kide     │  ← hinta + lähde
└─────────────────────┘
```

**Kortin koko:** 280px leveä, 200px korkea, `snapToInterval={296}` (280 + 16 gap)

### 2.3 Postauskorttien Wolt-tyylinen kategoria-layout

**Nykyinen:** FlatList 2-column grid — kortit vuotavat oikealle, layout rikkoutuu.

**Uusi:** Vertikaalisesti scrollattava feed, jossa jokainen kategoria on oma horisontaali-sektioinsa.

```
┌─ Tapahtumat lähellä ─ Näytä kaikki → ──┐
│ [card] [card] [card] [card →            │  ← horisontaali scroll
└─────────────────────────────────────────┘

┌─ Ilmaista ─ 3 uutta ─ Näytä kaikki → ─┐
│ [card] [card] [card] [card →            │  ← horisontaali scroll
└─────────────────────────────────────────┘

┌─ Tarvitsen ── Näytä kaikki → ──────────┐
│ [card] [card] [card →                   │  ← horisontaali scroll
└─────────────────────────────────────────┘

┌─ Tarjoan ── Näytä kaikki → ────────────┐
│ [card] [card] [card →                   │  ← horisontaali scroll
└─────────────────────────────────────────┘
```

**Kategoriat ja järjestys:**
1. **Tapahtumat lähellä** — yhdistetty 4 API:sta + community events
2. **Ilmaista** — `type === 'ilmaista'`
3. **Tarvitsen** — `type === 'tarvitsen'`
4. **Tarjoan** — `type === 'tarjoan'`
5. **Lainaa** — `type === 'lainaa'` (jos LENDING on)
6. **Nappaa** — `type === 'nappaa'` (24h pikapostaukset)

**Säännöt:**
- Tyhjät kategoriat piilotetaan (ei "Ei ilmoituksia" -rivejä)
- Jokainen kategoriarivi näyttää 1-10 korttia
- Viimeinen kortti "peek" oikealta reunalta (Wolt-tyyli: kortti on puoliksi näkyvissä)
- "Näytä kaikki →" linkki ohjaa hakuun suodatettuna kyseiseen kategoriaan
- Kortin koko: 160px leveä (phone) / 200px (tablet), vakiokorkeus

**Komponenttirakenne:**

```
<CategorySection>
  ├── <SectionHeader title="Ilmaista" count={3} onViewAll={() => ...} />
  └── <ScrollView horizontal snapToInterval={176}>
       ├── <CompactPostCard post={...} />
       ├── <CompactPostCard post={...} />
       └── <CompactPostCard post={...} />
      </ScrollView>
</CategorySection>
```

**Uudet komponentit:**
- `src/components/CategorySection.tsx` — sektio-wrapper (otsikko + horizontal scroll)
- `src/components/CompactPostCard.tsx` — pienempi kortti horisontaali-scrolliin (160x200)

**Poistetaan:**
- `src/components/PostCardGrid.tsx` — 2-column grid (korvataan CategorySection:eilla)
- `src/components/DiscoveryStack.tsx` — Tinder-swipe (overengineered)

### 2.4 Feed-arkkitehtuuri kokonaisuutena

**Uusi feed-rakenne (ylhäältä alas):**

```
FlatList (vertical scroll, single column)
├── ListHeaderComponent:
│   ├── Header (logo, notification bell, presence count)
│   ├── FilterBar (optional — category pills)
│   ├── InlineEventStrip (3 lähintä tapahtumaa, kompakti)
│   ├── PollCard (jos aktiivinen poll)
│   ├── WeeklyPopularCarousel (hero — tapahtumat tai suositut postaukset)
│   ├── CategorySection "Ilmaista"
│   ├── CategorySection "Tarvitsen"
│   ├── CategorySection "Tarjoan"
│   ├── CategorySection "Lainaa"
│   └── CategorySection "Nappaa"
├── data={[]}  ← FlatList on tyhjä, kaikki sisältö on headerissä
└── ListFooterComponent:
    └── "Olet nähnyt kaikki ilmoitukset" + CTA
```

**Vaihtoehtoinen rakenne (suositeltu):**
Käytä `ScrollView` + `FlatList`-replacementin sijaan. Koska jokainen kategoriarivi on horisontaali ScrollView eikä tarvitse virtualisointia (max 10 korttia per rivi), koko feed voi olla yksi `ScrollView`.

**Päätös:** Käytä `ScrollView` + `RefreshControl`. FlatList-virtualisointi ei tarvita kun yhteensä on ~50 korttia (10 per 5 kategoriaa) eikä pitkää vertikaalilistaa.

---

## Osa 3 — RAKENNA: Retentio

### 3.1 Viikkodigest push-notifikaatio

**Miksi:** Tällä hetkellä 0 syytä palata sovellukseen paitsi lukematon viesti. Viikkodigest antaa syyn avata sovellus viikoittain.

**Toteutus:**
- `send-digest` Edge Function on jo olemassa (189 riviä) mutta **ei ole kytketty croniin**
- Lisää Supabase cron job: `SELECT cron.schedule('send-weekly-digest', '0 9 * * 1', ...)` (maanantai klo 9)
- Digest sisältö: "Tällä viikolla [naapurusto]: X uutta ilmoitusta, Y tapahtumaa"

**Tiedostot:**
- `supabase/migrations/YYYYMMDD_weekly_digest_cron.sql` — cron job
- `supabase/functions/send-digest/index.ts` — tarkista ja päivitä sisältö

**Push-notifikaation rakenne:**
```json
{
  "title": "Viikon kooste — Kallio",
  "body": "3 uutta ilmaista, 2 tapahtumaa, 1 lainattava",
  "data": { "screen": "/(tabs)/index" }
}
```

### 3.2 "Naapuri julkaisi" -notifikaatio

**Miksi:** Sosiaalinen trigger. Kun seuraamasi henkilö julkaisee, saat pushin.

**Toteutus:**
- `user_follows` -taulu on olemassa
- Lisää trigger: `INSERT INTO notifications` kun uusi postaus + seurattava käyttäjä
- Push via olemassaoleva `send-push` Edge Function

**SQL trigger:**
```sql
CREATE OR REPLACE FUNCTION notify_followers()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, from_user_id, type, title, body, link_type, link_id)
  SELECT uf.follower_id, NEW.user_id, 'new_post',
    'Uusi ilmoitus seuraamaltasi', NEW.title, 'post', NEW.id
  FROM user_follows uf WHERE uf.following_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_post_created_notify_followers
AFTER INSERT ON posts
FOR EACH ROW
WHEN (NEW.is_active = true AND NEW.is_seed IS NOT TRUE)
EXECUTE FUNCTION notify_followers();
```

### 3.3 Naapurusto-aktiivisuusmittari

**Miksi:** Antaa käyttäjälle tunteen yhteisöstä. "12 naapuria aktiivisena tällä viikolla Kalliossa."

**Toteutus:** Lisää feedin header-osaan aktiivisuusteksti.

```
"Kallio — 12 naapuria aktiivisena tällä viikolla"
```

**Data:** `SELECT COUNT(DISTINCT user_id) FROM posts WHERE naapurusto = $1 AND created_at > now() - interval '7 days'`

**Tiedosto:** `app/(tabs)/index.tsx` — header-komponentti

---

## Osa 4 — KORJAA: Tekninen velka

### 4.1 Cold start -parannukset

**Nykyinen:** 10 seed-postausta tekaistulla engagementillä (like_count: 3-12).

**Parannus:**
1. Poista tekaistut engagement-luvut seed-postauksista
2. Merkitse seed-postaukset visuaalisesti: "Esimerkkipostaus" -badge
3. Lisää "Luo oma ilmoitus" CTA jokaisen seed-postauksen perään
4. Kun naapurustossa on > 5 oikeaa postausta, piilota seedit

**Tiedostot:**
- `src/lib/getSeedPosts.ts` — muokkaa seed-dataa
- `src/components/CompactPostCard.tsx` — lisää "Esimerkki" -badge

### 4.2 Onboarding-virtaus

**Nykyinen:** Onboarding on modaali joka näyttää yleisesittelyn ja pyydetään skip.

**Uusi:**
1. Naapuruston valinta (pakollinen): "Missä naapurustossa asut?"
2. Kiinnostukset (valinnainen): "Mitä etsit?" (ilmaista, tapahtumia, lainaa, jne.)
3. Push-notifikaation pyyntö: "Haluatko kuulla kun naapurustossasi tapahtuu?"
4. Feed — suoraan personoitu sisältö

**Aikataulu:** 3 näyttöä, max 30s läpimenoaika.

### 4.3 Hero always-visible -toteutus (index.tsx rivit 732-757)

**Muutos:**

```typescript
// NYKYINEN (rivit 732-757):
feed.loading ? skeleton
: (cityEvents.length > 0 || heroCommunityEvents.length > 0) ? WeeklyPopularCarousel
: !feed.loading ? coldStart
: null

// UUSI:
feed.loading ? skeleton
: <WeeklyPopularCarousel
    cityEvents={feed.cityEvents}
    communityEvents={heroCommunityEvents}
    popularPosts={feed.weeklyPopular}  // ← uusi fallback
    locale={locale}
  />
```

Carousel-komponentti päättää sisäisesti mitä näyttää:
- Jos tapahtumia > 0 → tapahtumakortteja
- Jos tapahtumia == 0 mutta popularPosts > 0 → suosittuja postauksia
- Jos molemmat == 0 → onboarding CTA (ei koskaan tyhjä)

### 4.4 Mounted guardit kaikissa async-efekteissä

**Jo korjattu (tämä sessio):**
- `settings.tsx` ✓
- `post/[id].tsx` fetchBlockedDates ✓
- `create-event.tsx` getCachedUserId ✓

**Vielä tarkistettava:**
- `app/(tabs)/profile.tsx` — päälataus
- `app/community-events.tsx` — tapahtumien lataus
- `app/bookings.tsx` — varausten lataus
- `app/my-listings.tsx` — omien ilmoitusten lataus
- `app/activities.tsx` — aktiviteettien lataus

**Toimenpide per tiedosto:** Lisää `let mounted = true` + `return () => { mounted = false }` jokaiseen async-useEffectiin jossa on setState-kutsuja.

### 4.5 Edge Function -turvallisuus

**Jo korjattu (tämä sessio):**
- meteli-proxy: SSRF fix + cache limit ✓
- ticketmaster-proxy: CORS + error sanitization ✓
- kide-proxy: error sanitization ✓

**Vielä korjattava:**
- `send-push`: Tarkista ettei user input päädy push-viestiin sanitoimattomana
- `stripe-checkout`: Tarkista CORS (pitäisi olla `*` mobiilille)
- `send-email`: Tarkista ettei viestisisältö vuoda

---

## Osa 5 — JULKAISE: Kallio-strategia

### 5.1 EAS Build → TestFlight

**Vaiheet:**
1. `eas build --platform ios --profile preview` → TestFlight-build
2. Jaa TestFlight-linkki 20 henkilölle (henkilökohtaiset kontaktit Kalliossa)
3. Kerää palaute 1 viikon ajan
4. Iteroi palautteen perusteella

**Vaatii ensin:**
- Apple Developer -tili (99$/vuosi) — onko jo?
- `app.json` icon + splash kunnossa
- EAS-konfiguraatio (`eas.json`)

### 5.2 Kallio-fokus (MVP-naapurusto)

**Miksi:** 50 aktiivista käyttäjää Kalliossa > 5 käyttäjää jokaisessa 40 naapurustossa.

**Toimenpide:**
1. Onboardingissa ehdota "Kallio" oletusnaapurustoksi (geolokaation perusteella)
2. LinkedEvents + Ticketmaster + Kide + Meteli suodatus: priorisoi Kallio-alueen tapahtumat (geo-bbox Kallio + 1km)
3. Seed-postaukset räätälöi Kallio-kontekstiin: "Onko Vaasankadulla kellään porakonetta?"
4. Viikkodigest: "Tällä viikolla Kalliossa: ..."

### 5.3 Flyeri-kampanja

**Materiaali:**
- A5-flyeri, QR-koodi → App Store (tai TestFlight)
- Teksti: "TackBird — Kallion oma ilmoitustaulu. Lainaa naapurilta. Löydä ilmaista. Löydä tapahtumat."
- 50 kpl Kallion rappukäytäviin (Vaasankatu, Fleminginkatu, Hämeentie)

**Seuranta:**
- QR-koodiin UTM-parametri: `?utm_source=flyer&utm_campaign=kallio`
- Analysoi: kuinka moni skannaa → lataa → rekisteröityy → julkaisee

### 5.4 Instagram-tili

**@tackbird_kallio:**
- Postaa viikoittain: "Tällä viikolla Kalliossa: 3 uutta ilmaista, 2 tapahtumaa"
- Jaa käyttäjien (anonymisoituja) postauksia: "Naapuri etsii porakonetta Kalliossa 🔨"
- Story: Kallio-alueen tapahtumat viikon alussa

---

## Osa 6 — MITTAA: Metriikat

### 6.1 KPI:t (ensimmäiset 30 päivää)

| Metriikka | Tavoite | Miten mitataan |
|-----------|---------|----------------|
| Rekisteröityneet | 50 | `profiles` COUNT |
| DAU (päivittäin aktiiviset) | 10 | `last_seen_at` tänään |
| WAU (viikottain aktiiviset) | 30 | `last_seen_at` 7pv sisällä |
| Postaukset/viikko | 5 | `posts` COUNT viikossa |
| Viestit/viikko | 10 | `messages` COUNT viikossa |
| D1 retentio | > 40% | Palaa seuraavana päivänä |
| D7 retentio | > 20% | Palaa viikon sisällä |

### 6.2 Analytics-toteutus

**Nykyinen:** `src/lib/analytics.ts` — `trackEvent()` kirjoittaa `analytics_events` tauluun.

**Lisää:**
- Screen view tracking: jokainen näyttö lähettää `screen_view` eventin
- Funnel: onboarding → first_post → first_message → first_transaction
- Retention: päivittäinen batch-query `last_seen_at` perusteella

**Dashboard:** Supabase SQL + manuaalinen query (ei erillistä analytics-palvelua vielä).

---

## Osa 7 — AIKATAULU

### Viikko 1: Leikkaa + Feed-uudistus

| Päivä | Tehtävä | Tiedostot |
|-------|---------|-----------|
| Ma | Poista feature-flagatut näytöt + komponentit (Osa 1.1) | ~15 tiedostoa |
| Ma | Yksinkertaista feature flags (Osa 1.2) | `featureFlags.ts` |
| Ti | Hero always-visible (Osa 2.1, 2.3) | `index.tsx`, `WeeklyPopularCarousel.tsx` |
| Ti | useFeedData: weekly popular query (Osa 2.1) | `useFeedData.ts` |
| Ke | CategorySection + CompactPostCard (Osa 2.3) | 2 uutta tiedostoa |
| Ke | Feed-arkkitehtuuri: FlatList → ScrollView + kategoriat (Osa 2.4) | `index.tsx` |
| To | Poista PostCardGrid + DiscoveryStack (Osa 2.3) | 2 tiedostoa |
| To | Cold start -parannus: seed-postausten cleanup (Osa 4.1) | `getSeedPosts.ts` |
| Pe | Mounted guardit kaikkiin async-efekteihin (Osa 4.4) | ~5 tiedostoa |
| Pe | tsc + smoke test koko sovellus | — |

### Viikko 2: Retentio + Onboarding

| Päivä | Tehtävä | Tiedostot |
|-------|---------|-----------|
| Ma | Viikkodigest cron job (Osa 3.1) | migration + Edge Function |
| Ma | Naapuri-notifikaatio trigger (Osa 3.2) | migration |
| Ti | Naapurusto-aktiivisuusmittari feed headeriin (Osa 3.3) | `index.tsx` |
| Ti | Onboarding-virtaus: 3 näyttöä (Osa 4.2) | `onboarding.tsx` |
| Ke | Push-notifikaation pyyntö onboardingissa | `onboarding.tsx` |
| Ke | Analytics: screen view tracking (Osa 6.2) | `analytics.ts` + jokainen näyttö |
| To | Edge Function -turvallisuus (Osa 4.5) | 2-3 Edge Functionia |
| Pe | tsc + koko sovelluksen tarkistus | — |

### Viikko 3: Julkaisu

| Päivä | Tehtävä |
|-------|---------|
| Ma | EAS Build konfiguraatio + ensimmäinen TestFlight build |
| Ti | TestFlight jakelu 20 henkilölle |
| Ke | Flyeri-suunnittelu + painatus |
| To | Kallion rappukäytävät: 50 flyeriä |
| Pe | Instagram-tili: ensimmäinen postaus |

### Viikko 4: Mittaus + Iterointi

| Päivä | Tehtävä |
|-------|---------|
| Ma | Metriikat: DAU, rekisteröitymiset, postaukset |
| Ti-To | Palautteen perusteella bugfix + UX-parannus |
| Pe | D7-retentio mittaus → päätös: jatka / pivotoi |

---

## Osa 8 — TEKNISET YKSITYISKOHDAT

### 8.1 CompactPostCard-spesifikaatio

```typescript
interface CompactPostCardProps {
  post: Post
  onPress: () => void
  width?: number  // default 160
}
```

**Layout:**
```
┌──────────────┐
│ [Kuva/Icon]  │  120px korkea
│              │
├──────────────┤
│ Otsikko      │  max 2 riviä, ellipsis
│ Kallio • 2h  │  naapurusto + aika
│ ♥ 3          │  tykkäykset
└──────────────┘
```

**Kuva-fallback:** Jos `image_url` puuttuu → kategoriaväri taustalla + Lucide-ikoni keskellä (kuten DiscoveryStack teki).

### 8.2 CategorySection-spesifikaatio

```typescript
interface CategorySectionProps {
  title: string
  count?: number
  posts: Post[]
  onViewAll: () => void
  onPostPress: (post: Post) => void
}
```

**Sisäinen rakenne:**
```
<View>
  <View style={s.header}>
    <Text style={s.title}>{title}</Text>
    {count > 0 && <Text style={s.count}>{count} uutta</Text>}
    <PressableOpacity onPress={onViewAll}>
      <Text>Näytä kaikki →</Text>
    </PressableOpacity>
  </View>
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
    snapToInterval={176}  // 160 + 16 gap
    decelerationRate="fast"
  >
    {posts.map(post => (
      <CompactPostCard key={post.id} post={post} onPress={() => onPostPress(post)} />
    ))}
  </ScrollView>
</View>
```

### 8.3 WeeklyPopularCarousel-muutos

**Nykyinen:** Näyttää vain tapahtumia.

**Uusi:** Props laajennus:
```typescript
interface WeeklyPopularCarouselProps {
  cityEvents: CityEvent[]
  communityEvents: CommunityEvent[]
  popularPosts?: Post[]  // ← UUSI: fallback kun tapahtumia ei ole
  locale: string
}
```

**Render-logiikka:**
```typescript
const items = useMemo(() => {
  const eventCards = [...cityEvents, ...communityEvents].slice(0, 8)
  if (eventCards.length > 0) return { type: 'events', data: eventCards }
  if (popularPosts && popularPosts.length > 0) return { type: 'posts', data: popularPosts }
  return { type: 'empty', data: [] }
}, [cityEvents, communityEvents, popularPosts])
```

### 8.4 Tapahtumakortti-data

**Yhdistetty tyyppi kortteja varten:**
```typescript
interface HeroCardData {
  id: string
  title: string
  imageUrl: string | null
  date: string
  venue: string | null
  isFree: boolean
  source: 'linkedevents' | 'ticketmaster' | 'kide' | 'meteli' | 'community'
  infoUrl: string | null
}
```

**Mapperit:**
- `CityEvent → HeroCardData`: `name_fi` → title, `start_time` → date, `location_name` → venue
- `CommunityEvent → HeroCardData`: `title` → title, `event_date` → date, `location_name` → venue
- `Post → HeroCardData`: `title` → title, `created_at` → date, `location` → venue

---

## Osa 9 — RISKIT JA VAROTOIMET

| Riski | Todennäköisyys | Vaikutus | Varotoimenpide |
|-------|---------------|---------|---------------|
| Apple hylkää TestFlight-buildin | Keskitaso | Viivästys 1-2 viikkoa | Tee "Review Guidelines" -tarkistus ennen submitia |
| LinkedEvents API kaatuu | Matala | Hero tyhjänä | 3-portainen fallback (Osa 2.1) |
| Kallion käyttäjät eivät rekisteröidy | Korkea | Koko strategia epäonnistuu | Vaihtoehto: kokeile toista naapurustoa |
| Feed-uudistus rikkoo olemassaolevan UX:n | Keskitaso | Regressio | tsc + Playwright audit ennen pushia |
| Push-notifikaatiot eivät toimi Expo Go:ssa | Varma | Ei pusheja devissä | Testaa vain TestFlight/EAS buildissa |

---

## Osa 10 — EI TEHDÄ (YAGNI)

Näitä EI rakenneta seuraavan 30 päivän aikana:

1. ~~Pro-tilaus~~ — ei käyttäjiä joilta periä
2. ~~Boostit~~ — ei riittävästi sisältöä boostattavaksi
3. ~~Forum~~ — ei yhteisöä keskustelemaan
4. ~~Groups~~ — ei kriittistä massaa ryhmille
5. ~~Leaderboard~~ — ei dataa rankattavaksi
6. ~~Business-tilit~~ — ei yrityskäyttäjiä
7. ~~Ads~~ — ei mainostajia
8. ~~Identity verification~~ — ei tarvita ennen lainaustoimintoja
9. ~~Stripe Connect payouts~~ — ei transaktioita
10. ~~Multi-city~~ — vain Helsinki/Kallio
11. ~~Admin dashboard~~ — manuaalinen Supabase Dashboard riittää
12. ~~Kartta (Map)~~ — Explore-tab riittää discoveryyn
13. ~~A/B-testaus~~ — ei riittävästi käyttäjiä tilastolliseen merkitsevyyteen

---

## Yhteenveto

**3 tärkeintä asiaa:**
1. **Leikkaa** — poista 15-20 näyttöä, yksinkertaista koodikanta
2. **Feed toimii aina** — hero näyttää aina jotain, Wolt-tyylinen kategoria-layout
3. **Julkaise Kallioon** — 50 käyttäjää > 58 näyttöä

**Onnistumismetriikka:** D7 retentio > 20% Kalliossa 30 päivän sisällä julkaisusta.
