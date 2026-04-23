# TackBird — UX Writing Audit

> Framework: wondelai/ux-writing
> Date: 2026-04-23 | Scope: Finnish UI copy (fi.json) — primary language
> Also covers: empty states, error messages, CTAs, microcopy

---

## Voice & Tone Assessment

### Current Voice: B+ (Good, with gaps)

**Strengths:**
- Warm and encouraging empty states ("Täällä on vielä hiljaista" — "It's still quiet here")
- Action-oriented hints ("Kokeile eri suodatinta tai luo ensimmäinen ilmoitus naapurustollesi!")
- Natural Finnish ("naapuri", "naapurusto" — not corporate-speak)
- Good use of relative time ("juuri nyt", "3 min sitten")
- Safety tip in post detail is excellent ("Tapaa julkisella paikalla. Älä jaa henkilökohtaisia tietoja ennen tapaamista.")

**Weaknesses:**
- Some error messages are too generic ("Virhe", "Epäonnistui")
- Inconsistent tone between screens (some formal, some casual)
- Some English leaks in code-facing strings
- Missing microcopy for complex features (trust system, lending flow)

---

## Voice Guidelines for TackBird

### Voice (Consistent)

| Attribute | TackBird IS | TackBird IS NOT |
|-----------|------------|-----------------|
| **Tone** | Warm neighbor | Corporate service desk |
| **Register** | Sinä-muoto (informal) | Te-muoto (formal) |
| **Attitude** | Encouraging, helpful | Commanding, patronizing |
| **Language** | Everyday Finnish | Bureaucratic or technical |
| **Humor** | Light, friendly | Sarcastic or forced |
| **Emoji** | Sparingly in celebrations | Everywhere |

### Tone (Varies by Context)

| Context | Tone | Example |
|---------|------|---------|
| **Success** | Celebratory, brief | "Varaus vahvistettu! Hyvä homma." |
| **Error** | Empathetic, solution-focused | "Jokin meni pieleen. Kokeile uudelleen hetken kuluttua." |
| **Empty state** | Encouraging, guiding | "Täällä on vielä hiljaista. Luo ensimmäinen ilmoitus!" |
| **Warning** | Calm, informative | "Varoitus: tämä poistaa kaikki tietosi." |
| **Onboarding** | Welcoming, simple | "Tervetuloa naapurustoon! Aloitetaan." |
| **Payment** | Clear, reassuring | "Maksu onnistui. Vakuusmaksu palautetaan palautuksen jälkeen." |

---

## Audit: Empty States

### Current (Good)

| Screen | Current Copy | Assessment |
|--------|-------------|------------|
| Feed | "Täällä on vielä hiljaista" + "Kokeile eri suodatinta tai luo ensimmäinen ilmoitus naapurustollesi!" | Excellent — warm, actionable |
| Messages | "Ei viestejä vielä" + "Aloita keskustelu naapurisi kanssa klikkaamalla kiinnostavaa ilmoitusta." | Good — guides to action |
| Events | "Ei tapahtumia juuri nyt. Luo oma tai tarkista myöhemmin!" | Good — two options |
| Saved | "Ei vielä tallennettuja ilmoituksia" + "Tallenna kiinnostavia ilmoituksia kirjanmerkillä, niin löydät ne helposti myöhemmin." | Good — explains feature |
| Notifications | "Ei vielä ilmoituksia" + "Kun naapurustossasi tapahtuu jotain, saat tiedon tänne." | Good — sets expectation |

### Improvements Needed

| Screen | Issue | Recommended |
|--------|-------|------------|
| Search no results | "Ei tuloksia haulle" — no suggestion to broaden | "Ei tuloksia haulle \"{query}\". Kokeile lyhyempää hakusanaa tai selaa kategorioita." |
| Profile no posts | "Ei vielä ilmoituksia. Julkaise ensimmäinen!" — bland | "Ensimmäinen ilmoituksesi odottaa! Kerro naapureillesi mitä tarjoat tai tarvitset." |
| Bookings empty | "Ei varauksia vielä" — no context | "Ei varauksia vielä. Kun lainaat tai lainaat tavaroita, ne näkyvät täällä." |
| Map no results | "Ei tuloksia kartalla" — no guidance | "Kartalla ei vielä kohteita alueellasi. Zoomaa laajemmalle tai kokeile eri suodattimia." |

---

## Audit: Error Messages

### Current Problems

| Current | Problem | Recommended |
|---------|---------|------------|
| "Virhe" | Says nothing | Remove — never use alone |
| "Epäonnistui" | Too vague | Always add what failed: "Viestin lähetys epäonnistui" |
| "Lataus epäonnistui. Yritä uudelleen." | Generic but acceptable | Keep for general network errors |
| "Ilmianto epäonnistui" | No recovery path | "Ilmianto epäonnistui. Tarkista verkkoyhteys ja yritä uudelleen." |
| "Ilmoituksen poisto epäonnistui" | No context | "Poisto epäonnistui — ilmoitus on edelleen näkyvissä. Yritä uudelleen." |

### Error Message Template

```
[Mitä tapahtui]: [Selitys tarvittaessa]. [Toiminto.]

Esimerkkejä:
- "Viesti ei lähtenyt. Tarkista verkkoyhteys ja yritä uudelleen."
- "Maksu hylättiin. Tarkista korttitietosi tai kokeile toista korttia."
- "Kuva ei latautunut. Tiedosto voi olla liian suuri (max 10 MB)."
- "Kirjautuminen epäonnistui. Tarkista sähköposti ja salasana."
```

### Error Message Glossary

| Supabase/Stripe Error | Finnish Translation |
|----------------------|---------------------|
| `Invalid login credentials` | "Virheellinen sähköposti tai salasana. Tarkista tiedot." |
| `User already registered` | "Tällä sähköpostilla on jo tili. Kirjaudu sisään tai palauta salasana." |
| `Email not confirmed` | "Sähköpostia ei ole vahvistettu. Tarkista postilaatikkosi." |
| `Rate limit exceeded` | "Liian monta yritystä. Odota {minutes} minuuttia." |
| `card_declined` | "Korttisi hylättiin. Kokeile toista korttia." |
| `insufficient_funds` | "Kortilla ei ole riittävästi katetta." |
| `expired_card` | "Korttisi on vanhentunut. Päivitä korttitiedot." |
| `network_error` | "Ei verkkoyhteyttä. Tarkista Wi-Fi tai mobiilidata." |
| `timeout` | "Yhteys aikakatkaistiin. Yritä uudelleen." |
| `PGRST116` (not found) | "Tietoa ei löytynyt. Se on voitu poistaa." |

---

## Audit: CTAs (Calls to Action)

### Current (Good)

| CTA | Assessment |
|-----|-----------|
| "Luo ilmoitus" | Good — clear action |
| "Lähetä viesti" | Good — specific |
| "Lähetä varaus" | Good — indicates commitment |
| "Kutsu naapuri →" | Great — action + arrow hint |
| "Tallenna muutokset" | Good — confirms what happens |

### Improvements Needed

| Current | Problem | Recommended |
|---------|---------|------------|
| "Vahvista" (generic confirm) | Too vague in lending context | "Vahvista varaus (15€/pv)" — include price |
| "Hyväksy" (accept) | Vague for event requests | "Hyväksy osallistuja" |
| "Jatka" (continue) | Doesn't say where | "Jatka maksuun" / "Jatka profiiliin" |
| "OK" | Uninformative | Replace with specific action: "Selvä" / "Ymmärrän" |
| "Tallenna" on multiple contexts | Same word for saving post draft vs saving to favorites | "Tallenna luonnos" vs "Lisää suosikkeihin" |

---

## Audit: Microcopy

### Missing Microcopy (Needs Adding)

| Location | Missing Copy | Recommended |
|----------|-------------|------------|
| Trust badge | No explanation | Tooltip: "Taso 3: Luotettu naapuri — vahvistettu henkilöllisyys ja hyvät arvostelut" |
| Deposit field | No explanation | Helper: "Vakuusmaksu palautetaan kun tavara palautetaan kunnossa" |
| Service fee | Not visible to buyer | Inline: "Palvelumaksu (10%): {amount}€" |
| Response rate | No context | "Vastaa yleensä tunnissa" / "Vastaa yleensä päivässä" |
| Pro badge | Not explained | "Pro-yrittäjä — vahvistettu paikallinen yritys" |
| Boost purchase | No ROI indication | "Näkyy syötteen kärjessä 24h — tavoittaa arviolta {reach} naapuria" |
| Image upload limit | Not shown | "Max 5 kuvaa, enintään 10 MB/kuva" |
| Event max participants | Not visible until full | "Paikkoja jäljellä: {remaining}/{max}" |

### Placeholder Text Audit

| Field | Current | Problem | Recommended |
|-------|---------|---------|------------|
| Search | "Hae ilmoituksia..." | Good | Keep |
| Message input | "Kirjoita viesti..." | Good | Keep |
| Comment | "Lisää kommentti..." | Good | Keep |
| Post title | (none visible) | Missing example | "esim. Akkuporakone lainaan, Kallio" |
| Post description | (none visible) | Missing guidance | "Kerro tarkemmin: kunto, sijainti, milloin saatavilla..." |

---

## Audit: Onboarding Copy

### Current: Missing entirely

There is no onboarding flow. New users land directly on the feed.

### Recommended 3-Step Onboarding

**Step 1: Welcome**
> "Tervetuloa naapurustoon!"
> "TackBird on naapurustosi oma ilmoitustaulu — lainaa, lahjoita, tapahdu."
> [CTA: "Aloitetaan →"]

**Step 2: Your Neighborhood**
> "Missä naapurustossa asut?"
> [Neighborhood picker with location suggestion]
> "Tämä auttaa meitä näyttämään sinulle lähellä olevia ilmoituksia ja tapahtumia."
> [CTA: "Tallenna naapurusto"]

**Step 3: What interests you?**
> "Mitä haluat tehdä TackBirdissä?"
> [Checkbox chips: "Lainata tavaroita" / "Antaa pois" / "Löytää tapahtumia" / "Tarjota palveluita"]
> "Voit muuttaa nämä milloin vain asetuksissa."
> [CTA: "Tutustu naapurustoon →"]

---

## Terminology Dictionary

Standard terms to use consistently across the app:

| Finnish Term | Context | NEVER Use |
|-------------|---------|-----------|
| **ilmoitus** | A post/listing | "julkaisu", "postaus" |
| **naapuri** | A fellow user | "käyttäjä" (too corporate) |
| **naapurusto** | Neighborhood | "alue" (too generic) |
| **lainaa** | Lending/borrowing | "vuokraa" (sounds commercial) |
| **vakuusmaksu** | Deposit for lending | "talletus" (banking term) |
| **arvostelu** | Review | "palaute" (too formal) |
| **luottamustaso** | Trust tier | "taso" alone (too abstract) |
| **tapahtuma** | Event | "tilaisuus" (too formal) |
| **ilmaista** | Free items | "lahjoitus" (too formal) |
| **pikaviesti** | Quick message template | "automaattiviesti" (sounds bot-like) |
