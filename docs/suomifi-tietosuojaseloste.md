# Tietosuojaseloste — Suomi.fi-tunnistautuminen TackBird-palvelussa

**Versio:** 1.0
**Päivämäärä:** 24.3.2026
**Rekisterinpitäjä:** Puddles Oy

---

## 1. Rekisterinpitäjä

**Puddles Oy**
Sähköposti: main.puddles@gmail.com
Tietosuojavastaava: main.puddles@gmail.com

## 2. Käsittelyn tarkoitus

Suomi.fi-tunnistautumista käytetään TackBird-palvelussa **kertaluonteisena henkilöllisyyden vahvistuksena**. Vahvistuksen tarkoituksena on:

- Varmistaa käyttäjän todellinen henkilöllisyys ennen rahallisten transaktioiden sallimista
- Mahdollistaa tavaroiden lainaaminen ja vuokraaminen naapureiden kesken
- Mahdollistaa maksullisten palveluiden (siivous, korjaus ym.) ostaminen ja myyminen
- Ehkäistä väärinkäytöksiä ja huijauksia palvelumarkkinapaikalla
- Rakentaa luottamusta käyttäjien välille

## 3. Käsittelyn oikeusperuste

**Sopimus** (EU:n yleinen tietosuoja-asetus, Art. 6(1)(b))

Tunnistautuminen on välttämätöntä palvelun maksullisten ominaisuuksien tarjoamiseksi käyttäjälle. Käyttäjä päättää itse tunnistautumisesta — se on vapaaehtoista ja tarvitaan vain lainaus-, vuokraus- ja palvelumaksuominaisuuksien käyttöön.

## 4. Käsiteltävät henkilötiedot

### 4.1 Suomi.fi-tunnistautumisesta saatavat tiedot

| Tieto | Tallennetaanko | Tarkoitus |
|-------|---------------|-----------|
| ID-token (validiteetti) | Ei | Vain validoidaan reaaliajassa |
| Henkilötunnus (hetu) | **Ei** | Ei lueta eikä tallenneta |
| Nimi (Suomi.fi:sta) | **Ei** | Ei tallenneta (käytetään käyttäjän itse antamaa nimeä) |
| Pankkitiedot | **Ei** | Ei koskaan TackBirdin hallussa |

### 4.2 Tunnistautumisen yhteydessä tallennettavat tiedot

| Tieto | Tyyppi | Säilytysaika |
|-------|--------|-------------|
| `verified`-merkintä (badge) | Boolean | Tilin elinkaari |
| `identity_verified_at` | Aikaleima (ISO 8601) | Tilin elinkaari |

**Yhteenveto:** TackBird tallentaa ainoastaan tiedon siitä, **että** henkilöllisyys on vahvistettu ja **milloin** se tapahtui. Mitään Suomi.fi:n kautta saatavia henkilötietoja ei tallenneta.

## 5. Tietojen sijainti ja suojaus

| Komponentti | Sijainti | Suojaus |
|-------------|----------|---------|
| Sovellus (frontend) | Käyttäjän laite (iOS/Android) | Expo SecureStore, AsyncStorage |
| Backend (API) | Vercel EU | TLS 1.3, ympäristömuuttujat |
| Tietokanta | Supabase (AWS eu-central-1, Frankfurt) | Salattu levossa + liikenteessä, RLS |
| Suomi.fi OIDC | DVV:n infrastruktuuri | DVV:n hallinnoimat turvatoimet |

### Tietoturvatoimenpiteet:
- HTTPS/TLS 1.3 kaikessa tietoliikenteessä
- PKCE (Proof Key for Code Exchange) OIDC-virrassa
- State- ja nonce-parametrit CSRF-suojaukseen
- Client secret ympäristömuuttujissa (ei lähdekoodissa)
- Supabase Row Level Security (RLS) — käyttäjä näkee vain omat tietonsa
- Tietokannan automaattinen varmuuskopiointi (Supabase)

## 6. Tietojen luovutus ja siirrot

Tunnistautumistietoja **ei luovuteta kolmansille osapuolille**.

Tunnistautumisen aikana tietoja käsittelevät:
- **Suomi.fi / DVV** — tunnistautuminen (OIDC-protokolla)
- **TackBird backend (Vercel)** — token-vaihto ja validointi (ei tallennusta)
- **Supabase** — badge-merkinnän ja aikaleiman tallennus

Tietoja ei siirretä EU/ETA-alueen ulkopuolelle.

## 7. Rekisteröidyn oikeudet

Käyttäjällä on seuraavat oikeudet, jotka on toteutettu suoraan sovelluksessa:

| Oikeus | Toteutus |
|--------|----------|
| **Oikeus saada pääsy tietoihin** | Asetukset → Lataa omat tiedot (GDPR) |
| **Oikeus tietojen oikaisemiseen** | Profiilin muokkaus |
| **Oikeus tietojen poistamiseen** | Asetukset → Poista tili (poistaa myös verified-merkin) |
| **Oikeus siirtää tiedot** | JSON-vienti (sisältää badge-tiedot) |
| **Oikeus vastustaa käsittelyä** | Yhteys: main.puddles@gmail.com |
| **Oikeus rajoittaa käsittelyä** | Yhteys: main.puddles@gmail.com |

## 8. Tietojen säilytys ja poistaminen

- **Verified-merkintä** säilytetään tilin elinkaaren ajan
- **Tilin poiston yhteydessä** kaikki tiedot (mukaan lukien verified-merkintä ja aikaleima) poistetaan **30 päivän kuluessa**
- Käyttäjä voi pyytää tietojen poistoa milloin tahansa (Asetukset → Poista tili)

## 9. Automaattinen päätöksenteko

Suomi.fi-tunnistautumiseen **ei liity automaattista päätöksentekoa** eikä profilointia. Tunnistautuminen on binäärinen (onnistui/epäonnistui), ja verified-merkintä myönnetään automaattisesti onnistuneen tunnistautumisen jälkeen.

## 10. Evästeet

Suomi.fi-tunnistautumisen yhteydessä käytetään **vain teknisesti välttämättömiä evästeitä** (istunnonhallinta, OIDC state-parametri). Evästeet ovat väliaikaisia ja poistuvat tunnistautumisen jälkeen.

## 11. Tietosuojaselosteen muutokset

Tätä tietosuojaselostetta päivitetään tarvittaessa palvelun kehittyessä. Olennaisista muutoksista ilmoitetaan käyttäjille sovelluksessa tai sähköpostitse.

## 12. Valvontaviranomainen

Käyttäjällä on oikeus tehdä valitus tietosuojavaltuutetun toimistoon:

**Tietosuojavaltuutetun toimisto**
Käyntiosoite: Lintulahdenkuja 4, 00530 Helsinki
Postiosoite: PL 800, 00531 Helsinki
Puhelin: 029 566 6700
Sähköposti: tietosuoja@om.fi
Verkkosivu: https://tietosuoja.fi

## 13. Yhteystiedot

**Puddles Oy**
Sähköposti: main.puddles@gmail.com

---

*Päivitetty viimeksi: 24.3.2026*
