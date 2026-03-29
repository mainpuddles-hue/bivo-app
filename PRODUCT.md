# TackBird — Tuotekuvaus kilpailija-analyysiin

## Mitä TackBird on

TackBird on naapuruston ilmoitustaulu -mobiilisovellus joka yhdistää lähiyhteisön asukkaat. Sovellus toimii Suomessa (Helsinki, Espoo, Vantaa, Tampere, Turku, Oulu) ja laajenee kansainvälisesti.

## Mitä käyttäjä voi tehdä TackBirdissä

### Naapuriapu
- Pyytää apua naapureilta ("Tarvitsen apua muutossa lauantaina")
- Tarjota apua ja palveluita ("Tarjoan siivousapua 30€/kerta")
- Kiireelliset pyynnöt: "Juuri nyt" -moodi jossa pyyntö katoaa 2-8h sisällä ja naapurit saavat push-ilmoituksen

### Tavaroiden lainaus ja vuokraus
- Lainata tavaroita naapureilta (porakone, painepesuri, polkupyörä)
- Päivähinta + kalenteri + varausprosessi
- Escrow-maksu: raha pidätetään kunnes tavara palautetaan

### Palveluiden ostaminen
- Ostaa palveluita naapureilta: siivous, korjaus, koiranulkoilutus, lastenhoito, muuttoapu
- Kiinteä hinta + Stripe-maksu + 10% komissio alustalle
- Hintasuositukset perustuen alueen toteutuneisiin hintoihin

### Ilmaisten tavaroiden jakaminen
- Lahjoittaa tavaroita: huonekalut, vaatteet, elektroniikka, kirjat

### Nappaa (grab it fast)
- Nopeat ilmoitukset joissa tavara pitää noutaa heti
- Countdown-ajastin

### Tapahtumat
- Yhteisön omat tapahtumat (grillibileet, kirpputori)
- Kaupungin tapahtumat (LinkedEvents API)
- Toistuvat aktiviteetit (jooga tiistaisin, koirakävely aamuisin)

### Viestintä
- Reaaliaikainen chat käyttäjien välillä
- Kuvaviestit
- Kirjoitusindikaattori + lukukuittaukset
- Linkki-esikatselut

### Ryhmät ja yhteisöt
- Naapurustoryhmät (Kallio koiranomistajat, Töölö lapsiperheet)
- Ryhmäpostaukset, tykkäykset, kommentit
- Admin-hallinta

### Foorumi
- Naapuruston keskustelualue
- Kategoriat: vinkit, kysymykset, tapahtumat, uutiset
- Upvote + threaded-vastaukset

### Kartta
- Näytä ilmoitukset, tapahtumat ja paikat kartalla
- Klusterointi zoomitasolla
- Naapurustorajat ja -suodatus

## Luottamus ja turvallisuus

### 3-portainen luottamusjärjestelmä
- **Taso 1 (Peruskäyttäjä):** Perusominaisuudet
- **Taso 2 (Vahvistettu):** Suomi.fi-tunnistautuminen → lainaus ja maksulliset palvelut auki
- **Taso 3 (Luotettu kumppani):** 3+ arvostelua, 90% vastausprosentti → rajaton hinnoittelu

### Jatkuva luottamuspisteys (0-100)
- Vastausnopeus, arvosanat, peruutukset, riitatilanteet, aktiivisuus, vahvistus
- Taso voi LASKEA jos käyttäjä saa negatiivista palautetta

### Sisällön moderointi
- Automaattinen: spam, huijaus, sopimaton sisältö (Edge Function)
- Manuaalinen: käyttäjät raportoivat + admin-paneeli
- Estä käyttäjä -toiminto

## Gamification

- **Pistejärjestelmä:** postaus 5p, vastaus 3p, kiitos 10p, arvostelu 10p, ensimmäinen postaus 20p
- **Päivittäinen streak:** 7pv = 2× kerroin, 30pv = 3× kerroin
- **Leaderboard:** top 10 naapurustossa kuukausittain
- **Speed badges:** salamanopea (<15min vastaus), nopea (<60min)
- **Kutsuohjelma:** 5 porrasta (1/3/5/10/25 kutsua) → badgeja + Pro-kokeiluja

## Monetisaatio

- **Pro-tilaus:** 4.99€/kk tai 39.99€/v — prioriteetti feedissä, analytiikka, alennettu komissio
- **Yritysmainokset:** 2.99€/pv feedissä + kartalla — kohdennettuna naapurustoon
- **Organisaatiotilit:** 29.99€/kk — PRH-validoitu, rajattomat mainokset, dashboard
- **Transaktiokomissio:** 10% kaikista palvelu- ja lainausmaksuista

## Tekninen älykkyys

- **Semanttinen haku:** "koiranhoitaja" löytää "koiranulkoilutus" (AI-embeddings + pgvector)
- **Smart Match:** yhdistää tarvitsen↔tarjoan automaattisesti merkityksen perusteella
- **Personoitu feed:** käyttäytymishistoria + collaborative filtering
- **Älykkäät push:** priorisointi, batching, hiljaiset tunnit, kiireellinen broadcast
- **Hintasuositukset:** "Siivous Kalliossa tyypillisesti 25-40€"
- **Dynaaminen luottamus:** jatkuva scoring joka voi nousta ja laskea

## Kilpailukenttä

### Suorat kilpailijat Suomessa
- **Tori.fi** — Ilmoitustauluja, ei naapurustokohdennusta, ei palveluita, ei luottamusjärjestelmää
- **Facebook Marketplace** — Kaupunkitaso, ei maksuintegraatiota, ei moderointia
- **Nextdoor** — Naapurusto mutta ei markkinapaikkaa, ei maksuja, ei Suomessa

### Kansainväliset vertailukohteet
- **TaskRabbit** — Palvelumarkkinapaikka (ei Suomessa)
- **Olio** — Ilmaisten tavaroiden jakaminen
- **Peerby** — Lainauspalvelu (ei Suomessa)
- **Nebenan.de** — Saksalainen naapurustopalvelu

### TackBirdin erottautumistekijät (mikä on parempi)
1. **Kiireellinen naapuriapu** — kukaan muu ei tee real-time "Juuri nyt" countdown + push
2. **Suomi.fi-vahvistus** — vahvin identiteettivarmistus markkinoilla
3. **Naapurustotaso** — ei kaupunki vaan Kallio, Sörnäinen, Töölö
4. **Palvelumaksut** — TaskRabbit-tyyppinen mutta naapuruston sisällä
5. **AI-matchaus** — semanttinen ymmärrys, ei pelkkä tagihaku
6. **Escrow-maksut** — raha turvassa kunnes palvelu/tavara toimitettu
7. **Jatkuva luottamuspisteys** — ei staattinen tähtiarvio vaan dynaaminen scoring

## Kohderyhmä
- 25-55-vuotiaat kaupunkilaiset Suomessa
- Arvostaa yhteisöllisyyttä ja paikallista taloutta
- Haluaa ostaa palveluita luotettavasti
- Haluaa auttaa ja saada apua naapureilta
