# Huoltokirja (Maintenance Book) — Design Spec

## Yhteenveto

Lakisääteinen kiinteistön huoltokirja TackBird-alustalle. Isännöitsijä hallinnoi huolto-ohjelmaa webissä (operator.tackbird.com), huoltomies toteuttaa tehtäviä mobiilissa (TackBird-sovellus). Molemmat voivat luoda ja kuitata tehtäviä.

## Konteksti

- **Laki:** Maankäyttö- ja rakennuslaki (MRL 4:2 §) vaatii huoltokirjaa
- **Kilpailija:** Tampuurin huoltokirja on vanhanaikainen ja kankea
- **TackBirdin etu:** Moderni UX, mobiili-ensin, huoltomies kuittaa kentällä kuvilla
- **Vaihe:** Tiekartan Vaihe 2 "Operaattorin arki helpommaksi" — ensimmäinen ominaisuus

## Käyttäjäroolit

| Rooli | Kuka | Missä | Oikeudet |
|-------|------|-------|----------|
| **owner** | Isännöitsijätoimiston omistaja | Web | Kaikki oikeudet + käyttäjähallinta |
| **admin** | Pääisännöitsijä | Web | Kaikki oikeudet |
| **manager** | Isännöitsijä (kiinteistökohtainen) | Web | Luo/muokkaa/poista tehtäviä, osoita vastuuhenkilöt, raportit |
| **technician** | Huoltomies | Mobiili + Web | Näkee osoitetut tehtävät, kuittaa, luo kentältä, lisää kuvat. Ei voi poistaa tai muokata muiden tehtäviä. |

Roolit käyttävät olemassa olevaa `operator_admins`-taulua (jossa on jo `role`-kenttä). Uudet roolit `manager` ja `technician` lisätään olemassa olevien `owner` ja `admin` rinnalle.

## Tietomalli

### Uusi taulu: `maintenance_tasks`

| Kenttä | Tyyppi | Kuvaus |
|--------|--------|--------|
| id | uuid PK | |
| operator_id | uuid FK → operators | Minkä operaattorin tehtävä |
| property_id | uuid FK → properties | Mihin kiinteistöön liittyy |
| title | text NOT NULL | "IV-koneen suodattimen vaihto" |
| description | text | Vapaamuotoinen selitys |
| category | text NOT NULL | LVI, sähkö, piha, rakenne, paloturvallisuus, siivous, muu |
| priority | text NOT NULL DEFAULT 'normal' | low / normal / urgent |
| status | text NOT NULL DEFAULT 'open' | open → in_progress → done |
| created_by | uuid FK → auth.users | Kuka loi tehtävän |
| assigned_to | uuid FK → auth.users | Kenelle osoitettu (huoltomies) |
| estimated_cost_cents | integer | Arvioitu kulu sentteinä |
| actual_cost_cents | integer | Toteutunut kulu sentteinä |
| completed_at | timestamptz | Milloin kuitattu tehdyksi |
| completed_by | uuid FK → auth.users | Kuka kuittasi |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

**Kategoriat (enum-arvot):**
- `hvac` — LVI (lämpö, vesi, ilmanvaihto)
- `electrical` — Sähkö
- `yard` — Piha ja ulkoalueet
- `structural` — Rakenne
- `fire_safety` — Paloturvallisuus
- `cleaning` — Siivous
- `other` — Muu

### Uusi taulu: `maintenance_task_attachments`

| Kenttä | Tyyppi | Kuvaus |
|--------|--------|--------|
| id | uuid PK | |
| task_id | uuid FK → maintenance_tasks | |
| file_url | text NOT NULL | Supabase Storage URL |
| file_name | text | Alkuperäinen tiedostonimi |
| file_type | text | image/jpeg, application/pdf jne. |
| uploaded_by | uuid FK → auth.users | |
| created_at | timestamptz DEFAULT now() | |

Kuvat ja PDF-liitteet tallennetaan Supabase Storageen bucketiin `maintenance-attachments`.

### Uusi taulu: `maintenance_task_comments`

| Kenttä | Tyyppi | Kuvaus |
|--------|--------|--------|
| id | uuid PK | |
| task_id | uuid FK → maintenance_tasks | |
| author_id | uuid FK → auth.users | |
| body | text NOT NULL | Kommenttiteksti |
| created_at | timestamptz DEFAULT now() | |

### Uusi taulu: `maintenance_task_history`

| Kenttä | Tyyppi | Kuvaus |
|--------|--------|--------|
| id | uuid PK | |
| task_id | uuid FK → maintenance_tasks | |
| changed_by | uuid FK → auth.users | |
| field | text NOT NULL | Mikä kenttä muuttui (status, assigned_to, priority jne.) |
| old_value | text | Vanha arvo |
| new_value | text | Uusi arvo |
| created_at | timestamptz DEFAULT now() | |

Statushistoria mahdollistaa audit-lokin: kuka muutti mitä ja milloin.

### RLS-politiikat

- `maintenance_tasks` SELECT: `operator_admins`-taulun kautta — käyttäjä näkee vain oman operaattorinsa tehtävät
- `maintenance_tasks` INSERT: owner/admin/manager/technician
- `maintenance_tasks` UPDATE: owner/admin/manager voivat muokata kaikkia; technician voi muokata vain omia tai itselleen osoitettuja (status, kuvat, kustannus)
- `maintenance_tasks` DELETE: vain owner/admin
- Liitteet ja kommentit: sama operator-rajaus kuin tehtävät

## Näkymät

### Operator Admin (Web) — operator.tackbird.com

#### 1. Huoltokirja-sivu (uusi sivu sivupalkissa)

**Sijainti:** Sivupalkissa "Vikailmoitukset"-kohdan jälkeen, nimi "Huoltokirja"

**Listanäkymä:**
- Taulukko tehtävistä: otsikko, kiinteistö, kategoria, prioriteetti, status, vastuuhenkilö, päivämäärä
- Filtterit: kiinteistö, kategoria, status, prioriteetti, ajanjakso
- Haku otsikosta ja kuvauksesta
- "Luo tehtävä" -painike
- Värikoodatut prioriteetit ja statukset

**Tehtävän luontilomake:**
- Kaikki kentät tietomallista
- Kiinteistö-dropdown (operaattorin kiinteistöt)
- Vastuuhenkilö-dropdown (operaattorin technician-roolissa olevat käyttäjät)
- Kuva/liite-upload

**Tehtävän detaljisivu:**
- Kaikki tiedot
- Kuva-galleria (ennen/jälkeen)
- Kommenttiketju
- Statushistoria (aikajana)
- Muokkaus (roolin mukaan)

#### 2. Raporttinäkymä

**Sijainti:** Huoltokirja-sivulla välilehtinä tai erillinen "Raportit"-alisivuna

- Kiinteistökohtainen yhteenveto: tehtävät yhteensä, avoimet, tehdyt, kustannukset
- Kategoriajakauma (pylväsdiagrammi)
- Aikajana: tehtävät kuukausittain
- Vienti: CSV-export raporttidatasta

#### 3. Käyttäjähallinta (laajennus)

Olemassa olevaan käyttäjähallintaan lisätään `manager` ja `technician` roolivaihtoehdot. Ei erillistä uutta sivua.

### TackBird Mobile — Asukassovellus

#### Huoltomiehen näkymä

**Näkyvyys:** Näkyy vain käyttäjille joilla on `technician` (tai `manager`/`admin`/`owner`) rooli `operator_admins`-taulussa.

**Sijainti sovelluksessa:**
- Profiili-sivulle uusi osio: "Huoltotehtävät" -kortti joka ohjaa tehtävälistaan
- Tai jos tehtäviä on aktiivisia: badge profiili-tabissa

**Tehtävälista:**
- Omat ja osoitetut tehtävät
- Filtteri: status (avoimet / käynnissä / tehdyt)
- Kiinteistöfiltteri jos useampi kohde

**Tehtävän detaljinäkymä:**
- Otsikko, kuvaus, kiinteistö, kategoria, prioriteetti
- "Aloita työ" -painike (open → in_progress)
- "Kuittaa tehdyksi" -painike (in_progress → done)
- Kameranäppäin: ota kuva suoraan (ennen/jälkeen)
- Toteutunut kustannus -kenttä
- Kommentti

**Uuden tehtävän luonti kentältä:**
- Nopea lomake: otsikko, kuvaus, kiinteistö (valinta), kategoria, kuva
- Tarkoitettu havaintojen kirjaamiseen: "parkkihallin valo palanut", kuva mukaan

## Ei toteuteta nyt

- Automaattinen tehtävien generointi / toistuva aikataulu (huolto-ohjelma)
- Laiterekisteri (IV-koneet, hissit jne. yksilöitynä)
- Push-notifikaatiot uusista tehtävistä (voidaan lisätä myöhemmin)
- Asukasnäkyvyys huoltokirjaan (asukas ei näe huoltotehtäviä)

## Tekninen toteutus

### Mihin koodiin muutokset tulevat

**tackbird-operator-admin (Next.js 15):**
- Uusi sivu: `src/app/(dashboard)/maintenance-book/page.tsx`
- Uusi sivu: `src/app/(dashboard)/maintenance-book/[id]/page.tsx`
- Uusi sivu: `src/app/(dashboard)/maintenance-book/new/page.tsx`
- Server actions: `src/actions/maintenance-tasks.ts`
- Sivupalkkiin uusi linkki

**tackbird-mobile (Expo):**
- Uusi näkymä: `app/maintenance-tasks.tsx` (tehtävälista)
- Uusi näkymä: `app/maintenance-task/[id].tsx` (detaljisivu)
- Uusi näkymä: `app/maintenance-task-create.tsx` (nopea luonti)
- Profiili-sivulle "Huoltotehtävät"-osio (ehdollinen)
- Hook: `src/hooks/useMaintenanceTasks.ts`

**Supabase (jaettu):**
- 4 uutta taulua + RLS-politiikat
- Storage bucket: `maintenance-attachments`
- `operator_admins.role` enum laajennetaan: owner, admin, manager, technician

### Olemassa olevan koodin suhde

- `maintenance_requests` = **vikailmoitukset** (asukkaat ilmoittavat ongelmia) — EI muuteta
- `maintenance_tasks` = **huoltokirja** (operaattori hallinnoi huoltoa) — UUSI
- Nämä ovat eri konsepteja: vikailmoitus voi johtaa huoltotehtävään, mutta niitä ei linkitetä vielä toisiinsa
