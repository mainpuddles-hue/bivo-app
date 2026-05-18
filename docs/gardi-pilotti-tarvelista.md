# Bivo × Gardi — pilotin tarvelista (lainaus)

Lista asioista, joita Bivo tarvitsee Gardilta lainaustoiminnon pilotointiin
Gardin älylaatikolla. Koottu Bivon koodikannan nykytilan pohjalta.

## Taustaa lyhyesti

- Bivo on hyperlokaali naapurustosovellus (ent. TackBird), `com.bivo.app`,
  tekijänä Puddles Oy.
- Tavaroiden lainaaminen naapurien kesken on yksi sovelluksen
  ydintoiminnoista.
- Pilotin kohderyhmä: Kallion kerrostaloasujat.
- Pilotin tavoite: korvata lainaajan ja lainanantajan kasvokkain-tapaaminen
  Gardin älylaatikolla — noudot ja palautukset onnistuvat ilman aikataulujen
  yhteensovittamista.

## Mitä Bivossa on jo valmiina

Bivon koodi on rakennettu Gardi-integraatiota varten valmiiksi. Tällä
hetkellä se toimii "mock"-tilassa: koko lainauslogiikka pyörii, mutta
avauskoodit luodaan vielä Bivon omassa palvelimessa. Pilottia varten "mock"
vaihdetaan oikeaan Gardin rajapintaan — muuta ei tarvita Bivon päässä.

Valmiina jo nyt:

- Lainan koko elinkaari: pyyntö → maksu → vahvistus → käytössä → palautus →
  arvio.
- Noutotavan valinta: osoite / nouto­piste / **Gardi-lokero**.
- Lokerorekisteri ja varauskohtainen lokerotieto.
- Avauskoodien (PIN) luonti, salattu tallennus ja audit-loki.
- Fyysinen luovutus seurattuna neljässä vaiheessa: lainanantaja jättää
  tavaran → lainaaja noutaa → lainaaja palauttaa → lainanantaja noutaa.
- Koodi- ja QR-pohjainen luovutuksen vahvistus.
- Lokeronvalintanäkymä sovelluksessa.

→ Ainoa puuttuva pala on Gardin oikea rajapinta. Sen vuoksi tarvitsemme alla
olevat tiedot ja resurssit.

## Mitä tarvitsemme Gardilta

### 1. Tekninen rajapinta (API)

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

### 2. Fyysiset handoffer-kortit

- Kortin toimintaperiaate: onko kortti käyttäjä-, lokero- vai
  varauskohtainen?
- Voiko kortin sitoa kertakäyttöisesti yhteen varaukseen rajapinnan kautta?
- Toimiiko sama laatikko sekä PIN-koodilla että kortilla rinnakkain?
- Korttien määrä pilottiin sekä miten kortti aktivoidaan, deaktivoidaan ja
  kierrätetään seuraavalle käyttäjälle.
- Miten kortti toimitetaan käyttäjälle pilottialueella.

### 3. Fyysinen laatikko ja sijainti

- Yksi isompi älylaatikko pilottiin: ulko- ja **sisämitat** sekä lokeroiden
  lukumäärä (montako rinnakkaista lainaa laatikko mahdollistaa).
- Lokeroiden kokoluokat (Bivon koodi tukee kokoja S / M / L / XL).
- Sijoituspaikan vaatimukset: sähkö, verkkoyhteys (4G vai wifi), sisä- vai
  ulkotila.
- Ehdotus sijoituspaikasta pilotin kohderyhmän lähellä (Kallio).
- Asennus, huolto ja vikatilanteet: kuka vastaa ja millä vasteajalla.
- Pääsy laatikolle: ympärivuorokautinen vai rajattu.

### 4. Integraatiotiedot per lokero

- Gardin yksilöivä lokero-tunniste jokaiselle lokerolle.
- Tarkka osoite sekä koordinaatit (leveys-/pituusaste) karttaa ja "lähin
  lokero" -valintaa varten.
- Kunkin lokeron kokoluokka.

### 5. Pilotin pelisäännöt

- Pilotin kesto, laajuus (varausten ja käyttäjien määrä) sekä onnistumisen
  mittarit.
- Kustannukset pilotin aikana ja tuotannon hinnoittelumalli.
- Vastuukysymykset: vahingot, katoaminen ja vakuutus — kenen vastuulla
  tavara on laatikossa.
- Tietosuoja: DPA-sopimus ja erittely siitä, mitä käyttäjädataa Gardi
  käsittelee (avaustapahtumat, koodit).
- Nimetty yhteyshenkilö ja tukikanava pilotin ajaksi.
- Brändäys: saako laatikossa näkyä Bivon ilme.

### 6. Toimintamallin yhteensovitus

- Vahvistetaan yhdessä, että Bivon lainausvirta sopii Gardin laatikkoon:
  lainanantaja jättää tavaran lokeroon → lainaaja noutaa → lainaaja
  palauttaa lokeroon → lainanantaja noutaa.
- Myöhästyneet palautukset: mitä tapahtuu, jos tavara jää lokeroon yli
  sovitun ajan (Bivossa on tätä varten oma käsittely).
- Varamenettely tilanteeseen, jossa koodi tai kortti ei toimi paikan päällä.
