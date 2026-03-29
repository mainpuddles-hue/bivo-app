# TackBird — Palvelukuvaus Suomi.fi-tunnistusta varten

**Versio:** 1.0
**Päivämäärä:** 24.3.2026
**Palveluntarjoaja:** Puddles Oy
**Yhteyshenkilö:** main.puddles@gmail.com

---

## 1. Palvelun nimi

**TackBird** — Naapuruston ilmoitustaulu

## 2. Palvelun kuvaus

TackBird on mobiilisovellus (iOS/Android) ja verkkopalvelu, joka yhdistää Helsingin naapurustojen asukkaat. Palvelu mahdollistaa:

- **Avunpyyntöjen ja -tarjousten** julkaisemisen naapurustossa
- **Tavaroiden lainaamisen ja vuokraamisen** naapureiden kesken
- **Maksullisten palveluiden** ostamisen ja myymisen (siivous, korjaus, koiranulkoilutus ym.)
- **Ilmaisten tavaroiden** jakamisen
- **Paikallisten tapahtumien** löytämisen ja järjestämisen
- **Viestinnän** käyttäjien välillä

Palvelu toimii Helsingin alueella ja on saatavilla suomeksi, englanniksi ja ruotsiksi.

## 3. Miksi Suomi.fi-tunnistus tarvitaan

TackBird käyttää **kolmiportaista luottamusjärjestelmää**, joka suojaa käyttäjiä palvelumarkkinapaikalla:

| Taso | Nimi | Vaatimus | Oikeudet |
|------|------|----------|----------|
| 1 | Peruskäyttäjä | Sähköpostirekisteröityminen | Ilmoitukset, viestit, tapahtumat |
| 2 | Vahvistettu | **Suomi.fi-tunnistautuminen** | Lainaus/vuokraus (max 50€/pv), maksulliset palvelut (max 200€) |
| 3 | Luotettu kumppani | Taso 2 + 3 arvostelua (ka 4.0+) + 90% vastausprosentti | Rajaton hinnoittelu, prioriteetti |

**Suomi.fi-tunnistus on pakollinen Tason 2 saavuttamiseksi**, koska:
- Rahallisia transaktioita suoritetaan käyttäjien välillä (Stripe-maksujen kautta)
- Lainattavien tavaroiden arvo voi olla merkittävä
- Vahva tunnistus ehkäisee väärinkäytöksiä ja huijauksia
- Suomalainen luottamusstandardi ylittää pelkän sähköpostivahvistuksen

## 4. Tunnistuksen käyttötarkoitus

Suomi.fi-tunnistusta käytetään **kertaluonteisena henkilöllisyyden vahvistuksena**:

- Käyttäjä tunnistautuu **kerran** saadakseen vahvistetun tilin
- Tunnistautumista **ei käytetä** kirjautumiseen (kirjautuminen tapahtuu sähköpostilla/salasanalla)
- Tunnistautumisen jälkeen sovellus tallentaa **vain**:
  - `verified`-merkinnän (badge)
  - Vahvistuksen ajankohdan (`identity_verified_at`)
- **Henkilötunnusta (hetu) ei tallenneta**
- **Pankkitietoja ei tallenneta**

## 5. Tietovirtakuvaus

```
1. Käyttäjä painaa "Vahvista henkilöllisyys" sovelluksessa
2. Sovellus avaa Suomi.fi-tunnistautumisen (OIDC)
3. Käyttäjä tunnistautuu pankkitunnuksilla tai mobiilivarmenteella
4. Suomi.fi palauttaa authorization code → TackBird backend
5. Backend vaihtaa koodin ID-tokeniin
6. Backend validoi tokenin ja tarkistaa nonce/state
7. Backend tallentaa Supabase-tietokantaan:
   - user_badges: { user_id, badge_type: 'verified' }
   - profiles: { identity_verified_at: timestamp }
8. Backend EI tallenna: hetu, nimi (Suomi.fi:sta), pankkitietoja
9. Käyttäjä ohjataan takaisin sovellukseen → Taso 2 aktiivinen
```

## 6. Tekniset tiedot

| Ominaisuus | Arvo |
|------------|------|
| Protokolla | OpenID Connect (OIDC) |
| Asiakastyyppi | Confidential client |
| Redirect URI | `https://tackbird.fi/api/auth/suomifi-callback` |
| Vaaditut scopet | `openid` |
| Vaaditut claimit | Ei mitään (vain tokenin validiteetti) |
| ID-tokenin käyttö | Vain vahvistus, ei tietojen tallennus |
| Backend | Next.js (Vercel) |
| Tietokanta | Supabase (PostgreSQL, EU/EEA) |
| Sovellus | React Native / Expo (iOS + Android) |

## 7. Tietoturva

- **TLS 1.3** kaikessa liikenteessä
- **PKCE** OIDC-virtojen suojaukseen
- **State + nonce** CSRF-suojaukseen
- **Client secret** tallennettu ympäristömuuttujiin (ei lähdekoodiin)
- **Supabase RLS** (Row Level Security) tietokantatasolla
- **Stripe PCI DSS** maksujen käsittelyyn
- Säännölliset tietoturva-auditoinnit

## 8. Tietosuoja

Täydellinen tietosuojaseloste: [tackbird.fi/privacy](https://tackbird.fi/privacy)

Keskeiset kohdat:
- Rekisterinpitäjä: TackBird Oy
- Tietojen sijainti: EU/EEA (Supabase Germany/Ireland, Vercel EU)
- Henkilötietojen käsittelyn peruste: Sopimus (GDPR Art. 6(1)(b))
- Käyttäjän oikeudet: Tietojen lataus, muokkaus, poisto, siirto (toteutettu sovelluksessa)
- Valitukset: Tietosuojavaltuutettu (tietosuoja.fi)

## 9. Palvelun saatavuus

| Kanava | URL / Saatavuus |
|--------|----------------|
| iOS-sovellus | App Store (Expo/EAS Build) |
| Android-sovellus | Google Play (Expo/EAS Build) |
| Verkkopalvelu | https://tackbird.fi |
| Tukisähköposti | support@tackbird.fi |

## 10. Yhteystiedot

**Puddles Oy**
Sähköposti: main.puddles@gmail.com
Verkkosivut: https://tackbird.fi

---

*Tämä palvelukuvaus päivitetään tarvittaessa palvelun kehittyessä. Muutoksista ilmoitetaan DVV:lle.*
