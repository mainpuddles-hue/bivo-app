# Bivo × Gardi — pilotin koko paketti

> Tämä dokumentti on itsenäinen tietopaketti. Sen voi liittää sellaisenaan
> uuteen Claude-chattiin keskustelun jatkamiseksi, ja sitä voi käyttää
> pohjana Gardin toimitusjohtajalle lähetettävälle viestille. Sisältää
> taustan, lainaustoiminnon nykytilan Bivon koodissa sekä tarvelistan
> Gardilta.

---

## 1. Tilanne pähkinänkuoressa

- Bivo (Puddles Oy) on tehnyt yhteydenottolomakkeen kautta avauksen Gardille.
- Gardin toimitusjohtaja soitti ja oli kiinnostunut: Bivo voisi pilotoida
  tavaroiden **lainaustoimintoa** Gardin tarjoamalla isommalla
  **älylaatikolla**.
- Gardille on juuri saapunut fyysiset **handoffer-kortit** laatikon
  avaamiseen.
- CEO pyysi Bivoa toimittamaan ranskalaisin viivoin listan asioista, joita
  pilottiin tarvitaan. Tämä paketti on sen pohja.

---

## 2. Bivo lyhyesti

- Hyperlokaali naapurustosovellus Suomeen (entinen TackBird).
  Sovellustunnus `com.bivo.app`, tekijä Puddles Oy (Y-tunnus 3610705-3).
- Yhdistää kirpputorin, vertaislainaamisen, naapuruston tapahtumat,
  taloyhtiön hallinnan, viestinnän ja luottamuspohjaisen maineen — kaikki
  oman naapuruston sisällä.
- Suomi ensin, kolme kieltä (fi/en/sv).
- Kohderyhmän kärki: Kallion vuokra-asujat, 25–40 v., kerrostalo,
  kestävyysorientoituneet.
- Tekninen pino: Expo SDK 54 + React Native, TypeScript (strict),
  taustajärjestelmänä Supabase (PostgreSQL, Auth, Realtime, Edge Functions).
- Tavaroiden lainaaminen naapurien kesken on yksi sovelluksen
  ydintoiminnoista.

---

## 3. Lainaustoiminnon nykytila Bivon koodissa

Tärkein viesti Gardille: **Bivon puoli on käytännössä valmis.** Pilotti ei
vaadi Bivolta isoa rakennusurakkaa, vaan olemassa olevan "mock"-koodin
kytkemisen Gardin oikeaan rajapintaan.

### 3.1 Lainausta rakennetaan paloissa ("slices")

Koodissa lainaustoimintoa kehitetään vaiheittain:

- **Slice 1** — oikea Stripe-maksu sekä palautuksen ja arvion uudelleen­
  suunnittelu.
- **Slice 2** — noutopistenoudot ("hub").
- **Slice 3** — **Gardi-älylokero, "mock"-tilassa** — tämä on jo koodissa.
- **Slice 4** — Gardin oikea rajapinta — **tätä ei ole vielä tehty.** Tämä on
  juuri se pala, jonka Gardi-kumppanuus mahdollistaa.

Koodin kommenteissa lukee suoraan: kun Gardi-kumppanuus on solmittu, slice 4
vaihtaa lokeron tarjoajan "mock"-arvosta "gardi"-arvoon ja reitittää saman
logiikan Gardin REST-rajapinnan kautta.

### 3.2 Mitä on jo rakennettu

- Lainan koko elinkaari: pyyntö → maksu → vahvistus → käytössä → palautus →
  arvio.
- Noutotavan valinta: osoite / noutopiste / **Gardi-lokero**.
- Lokerorekisteri ja varauskohtainen lokerotieto tietokannassa.
- Avauskoodien (PIN) luonti, salattu tallennus ja audit-loki.
- Fyysinen luovutus seurattuna neljässä vaiheessa: lainanantaja jättää
  tavaran → lainaaja noutaa → lainaaja palauttaa → lainanantaja noutaa.
- Koodi- ja QR-pohjainen luovutuksen vahvistus.
- Lokeronvalintanäkymä sovelluksessa.
- Omat näkymät sekä lainaajalle että lainanantajalle: pyyntö, luovutus,
  aktiivinen laina, palautus, myöhästyminen, arvio, laina-ajan jatko.

### 3.3 Kaksitasoinen tilakone

- **Iso elinkaari** seuraa varauksen tilaa: pending → paid → confirmed →
  active → completed.
- **Fyysisen luovutuksen mikrovaiheet** seuraavat erikseen: lainanantaja
  jättää → lainaaja noutaa → käytössä → lainaaja palauttaa → lainanantaja
  noutaa → valmis.
- Nämä on pidetty erillään tarkoituksella, jotta lokero-/Gardi-logiikka ei
  riko olemassa olevaa maksu- ja varausvirtaa.

### 3.4 Turvallisuus on jo mietitty

- PIN-koodit: 4-numeroisia, kryptografisesti satunnaisia, tallennetaan vain
  hashattuna, voimassa 48 h, jokaisesta jää audit-rivi.
- QR-/token-luovutus: 256-bittinen kertakäyttötoken, voimassa 2 h,
  vakioaikainen vertailu timing-hyökkäyksiä vastaan.

### 3.5 Lainaus pyörii tällä hetkellä ilman rahaa

- Sovelluksen ominaisuusliput: lainaus on päällä, mutta lainauksen maksut ja
  pantti ovat tällä hetkellä pois päältä pivotin takia. Talletuslogiikka on
  koodattu valmiiksi mutta piilotettu.
- Pilotti voidaan siis ajaa joko ilman maksuja tai maksut päällä — molemmat
  on koodissa tuettu.

### 3.6 Demo on jo pystyssä

- Tietokantaan on syötetty kuusi valmista esimerkki-"Gardi"-lokeroa
  Helsinkiin (Kamppi, Kallio, Sörnäinen, Punavuori, Töölö, Kruununhaka)
  tapaamisen demoa varten.
- Sovelluksessa on toimiva lokeronvalintanäkymä.
- Oikeat Gardin lokerot lisätään kun rajapintasopimus on voimassa.

### 3.7 Luottamustasot (relevantti pilotin rajaukseen)

Bivossa on kolmiportainen luottamusjärjestelmä, joka määrittää kuka saa
lainata ja millä rajoilla:

- **Taso 1** — sähköposti vahvistettu.
- **Taso 2** — puhelin ja osoite vahvistettu.
- **Taso 3** — henkilöllisyys vahvistettu.

Pilotissa voidaan rajata osallistujat haluttuun luottamustasoon.

---

## 4. Mitä tarvitsemme Gardilta

Tämä on varsinainen ranskalaisin viivoin oleva lista CEO:lle.

### 4.1 Tekninen rajapinta (API)

- API-dokumentaatio.
- Testi-/sandbox-ympäristö sekä tuotantotunnukset (API-avaimet tai OAuth).
- Rajapinta kertakäyttöisen avauskoodin luontiin tietylle lokerolle ja
  aikaikkunalle.
- Rajapinta koodin mitätöintiin tai korvaamiseen.
- Rajapinta lokeron tilan kyselyyn (ovi auki/kiinni, vapaa/varattu, ja jos
  laatikossa on ovianturit: onko tavara sisällä).
- Webhook tai muu takaisinkutsu, joka ilmoittaa kun lokero avataan tai
  suljetaan — näin Bivo siirtää varauksen tilan automaattisesti.
- Tieto: montako avauskoodia yhdelle varaukselle voi luoda (Bivo käyttää
  neljää: nouto ja jättö molempiin suuntiin) ja kuinka pitkään koodi on
  voimassa (Bivossa nyt 48 h).
- Rate-limitit, SLA ja virhetilanteiden käsittelytapa.

### 4.2 Fyysiset handoffer-kortit

- Kortin toimintaperiaate: onko kortti käyttäjä-, lokero- vai
  varauskohtainen?
- Voiko kortin sitoa kertakäyttöisesti yhteen varaukseen rajapinnan kautta?
- Toimiiko sama laatikko sekä PIN-koodilla että kortilla rinnakkain?
- Korttien määrä pilottiin sekä miten kortti aktivoidaan, deaktivoidaan ja
  kierrätetään seuraavalle käyttäjälle.
- Miten kortti toimitetaan käyttäjälle pilottialueella.

### 4.3 Fyysinen laatikko ja sijainti

- Yksi isompi älylaatikko pilottiin: ulko- ja **sisämitat** sekä lokeroiden
  lukumäärä (montako rinnakkaista lainaa laatikko mahdollistaa).
- Lokeroiden kokoluokat (Bivon koodi tukee kokoja S / M / L / XL).
- Sijoituspaikan vaatimukset: sähkö, verkkoyhteys (4G vai wifi), sisä- vai
  ulkotila.
- Ehdotus sijoituspaikasta pilotin kohderyhmän lähellä (Kallio).
- Asennus, huolto ja vikatilanteet: kuka vastaa ja millä vasteajalla.
- Pääsy laatikolle: ympärivuorokautinen vai rajattu.

### 4.4 Integraatiotiedot per lokero

- Gardin yksilöivä lokero-tunniste jokaiselle lokerolle.
- Tarkka osoite sekä koordinaatit (leveys-/pituusaste) karttaa ja "lähin
  lokero" -valintaa varten.
- Kunkin lokeron kokoluokka.

### 4.5 Pilotin pelisäännöt

- Pilotin kesto, laajuus (varausten ja käyttäjien määrä) sekä onnistumisen
  mittarit.
- Kustannukset pilotin aikana ja tuotannon hinnoittelumalli.
- Vastuukysymykset: vahingot, katoaminen ja vakuutus — kenen vastuulla
  tavara on laatikossa.
- Tietosuoja: DPA-sopimus ja erittely siitä, mitä käyttäjädataa Gardi
  käsittelee (avaustapahtumat, koodit).
- Nimetty yhteyshenkilö ja tukikanava pilotin ajaksi.
- Brändäys: saako laatikossa näkyä Bivon ilme.

### 4.6 Toimintamallin yhteensovitus

- Vahvistetaan yhdessä, että Bivon lainausvirta sopii Gardin laatikkoon:
  lainanantaja jättää tavaran lokeroon → lainaaja noutaa → lainaaja
  palauttaa lokeroon → lainanantaja noutaa.
- Myöhästyneet palautukset: mitä tapahtuu, jos tavara jää lokeroon yli
  sovitun ajan (Bivossa on tätä varten oma käsittely).
- Varamenettely tilanteeseen, jossa koodi tai kortti ei toimi paikan päällä.

---

## 5. Avoimet kysymykset ja seuraavat askeleet

Bivon päässä, kun Gardilta on saatu rajapintatiedot:

- Toteutetaan slice 4: vaihdetaan "mock"-lokerotarjoaja Gardin oikeaan
  rajapintaan (avauskoodien luonti reititetään Gardin REST-API:in).
- Lisätään webhook-vastaanotto Gardin avaus-/sulkemistapahtumille, jotta
  varauksen tila päivittyy automaattisesti.
- Korvataan demon esimerkkilokerot Gardin oikeilla lokerotiedoilla.
- Päätetään, ajetaanko pilotti maksuilla vai ilman.

Avoimia päätöksiä, jotka kannattaa sopia CEO-tapaamisessa:

- Pilotin laajuus ja aikataulu.
- Laatikon sijainti.
- Vastuu- ja vakuutuskysymykset.
- Kustannusmalli pilotissa ja sen jälkeen.

---

## 6. Sanasto

- **Lokero / älylaatikko** — Gardin fyysinen säilytyslokero, johon tavara
  jätetään ja josta se noudetaan.
- **Handoffer-kortti** — Gardin fyysinen kortti laatikon avaamiseen.
- **PIN / avauskoodi** — numerokoodi laatikon avaamiseen.
- **pickup / dropoff** — nouto / jättö. Lainassa tarvitaan molemmat
  molempiin suuntiin (lainanantaja jättää, lainaaja noutaa; lainaaja
  jättää takaisin, lainanantaja noutaa).
- **Slice** — lainaustoiminnon kehitysvaihe Bivon koodissa.
- **Mock-tila** — väliaikainen toteutus, jossa Bivo simuloi lokeroita
  itse ennen Gardin oikeaa rajapintaa.
