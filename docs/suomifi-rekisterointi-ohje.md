# Suomi.fi-tunnistuksen rekisteröintiohje

## Vaihe 1: Palveluhallinta

1. Mene osoitteeseen **https://palveluhallinta.suomi.fi**
2. Kirjaudu sisään organisaation valtuutetulla henkilöllä (Suomi.fi-valtuudet)
3. Valitse **"Liitä palvelu Suomi.fi-tunnistukseen"**

## Vaihe 2: Täytä lomake

Käytä näitä tietoja:

### Organisaation tiedot
- **Organisaation nimi:** Puddles Oy
- **Y-tunnus:** [täytä]
- **Yhteyshenkilö:** main.puddles@gmail.com
- **Sähköposti:** main.puddles@gmail.com

### Palvelun tiedot
- **Palvelun nimi:** TackBird — Naapuruston ilmoitustaulu
- **Palvelun kuvaus:** (käytä `suomifi-palvelukuvaus.md` sisältöä)
- **Palvelun osoite:** https://tackbird-v2.vercel.app
- **Mobiilisovellus:** Kyllä (iOS + Android)

### Tunnistuksen tiedot
- **Tunnistuksen tarkoitus:** Kertaluonteinen henkilöllisyyden vahvistus maksullisten ominaisuuksien käyttöön
- **Vaadittu tunnistusvahvuus:** Korotettu (pankkitunnukset, mobiilivarmenne)
- **Käyttötiheys:** Kerran per käyttäjä (ei kirjautumiseen)

### Tekniset tiedot
- **Protokolla:** OpenID Connect
- **Redirect URI (testi):** `https://tackbird-v2-staging.vercel.app/api/auth/suomifi-callback`
- **Redirect URI (tuotanto):** `https://tackbird-v2.vercel.app/api/auth/suomifi-callback`
- **Scopet:** `openid`
- **Client type:** Confidential

### Liitteet
1. `suomifi-palvelukuvaus.md` → PDF
2. `suomifi-tietosuojaseloste.md` → PDF
3. Sovelluksen kuvakaappaukset (profiilinäkymä, vahvistusmodaali)

## Vaihe 3: Testiympäristö

DVV antaa ensin testiympäristön tunnukset:
- **Issuer:** `https://tunnistus.testi.suomi.fi`
- **Client ID:** (DVV antaa)
- **Client secret:** (DVV antaa)

Tallenna nämä web-backendin ympäristömuuttujiin:
```env
SUOMIFI_CLIENT_ID=xxx
SUOMIFI_CLIENT_SECRET=xxx
SUOMIFI_ISSUER=https://tunnistus.testi.suomi.fi
SUOMIFI_REDIRECT_URI=https://tackbird-v2-staging.vercel.app/api/auth/suomifi-callback
```

## Vaihe 4: Testaus

1. Testaa testiympäristössä DVV:n testitunnuksilla
2. Varmista OIDC-virtaus: authorize → callback → token exchange → badge
3. Testaa virhetilanteet: käyttäjä peruuttaa, token vanhenee, väärä state
4. Dokumentoi testitulokset

## Vaihe 5: Tuotantoon siirto

1. Ilmoita DVV:lle testauksen onnistumisesta
2. DVV antaa tuotantotunnukset:
   - **Issuer:** `https://tunnistus.suomi.fi`
   - **Client ID + secret:** (tuotanto)
3. Päivitä ympäristömuuttujat
4. Vaihda `useIdentityVerification.ts`:n `confirmVerification()` aidoksi OIDC-virraksi

## Aikataulu

| Vaihe | Arvioitu kesto |
|-------|---------------|
| Rekisteröinti palveluhallinnassa | 1 päivä |
| DVV:n käsittely + testiympäristö | 2–4 viikkoa |
| Testaus | 1 viikko |
| Tuotantohyväksyntä | 1–2 viikkoa |
| **Yhteensä** | **4–7 viikkoa** |

## Muutokset myöhemmin

- **Palvelukuvausta ja tietosuojaselostetta voi päivittää** milloin tahansa palveluhallinnassa
- Uusista ominaisuuksista ilmoitetaan DVV:lle vain jos ne vaikuttavat tunnistuksen käyttötarkoitukseen
- Esim. uusi kategoria tai korkeampi hintaraja → päivitä palvelukuvaus
- Redirect URI:n muutos → ilmoita DVV:lle
