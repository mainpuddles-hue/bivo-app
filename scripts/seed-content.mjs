/**
 * TackBird seed content script
 *
 * Creates 60 realistic Finnish neighborhood posts across 6 categories
 * spread across Helsinki neighborhoods over the last 2 weeks.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-content.mjs
 *
 * Or place them in a .env file at the project root.
 *
 * Prerequisites:
 *   - At least one user profile must exist in the database.
 *     The script will use existing profiles. If none exist, it will exit
 *     with instructions to create seed users first.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// ENV
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))

// Try to load .env from project root
try {
  const envPath = resolve(__dirname, '..', '.env')
  const envFile = readFileSync(envPath, 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch {
  // .env not found — rely on env vars
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing env vars. Provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Example:\n' +
      '  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-content.mjs'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NEIGHBORHOODS = [
  'Kallio',
  'Sörnäinen',
  'Töölö',
  'Kamppi',
  'Kruununhaka',
  'Katajanokka',
]

/** Returns a random element from the array */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Returns a Date within the last `days` days */
function randomDateWithinDays(days) {
  const now = Date.now()
  const offset = Math.random() * days * 24 * 60 * 60 * 1000
  return new Date(now - offset)
}

/** Shuffle array in-place (Fisher-Yates) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------------------------------------------------------------------------
// Seed data — 60 posts
// ---------------------------------------------------------------------------

/** @type {Array<{type: string, title: string, description: string}>} */
const POSTS = [
  // -------------------------------------------------------------------------
  // TARVITSEN (15)
  // -------------------------------------------------------------------------
  {
    type: 'tarvitsen',
    title: 'Tarvitsen apua muutossa lauantaina',
    description:
      'Muutan Kalliosta Sörnäisiin ensi lauantaina. Tarvitsisin pari ylimääräistä käsiparia kantamaan huonekaluja. Tarjoan pizza ja juomat kiitoksena! Arvio kesto noin 3 tuntia.',
  },
  {
    type: 'tarvitsen',
    title: 'Kuka voisi auttaa koiran ulkoilutuksessa?',
    description:
      'Olen flunssan kourissa enkä pääse ulos. Onko joku naapuri joka voisi ulkoiluttaa labradoriani tänään ja huomenna? Kiltti ja rauhallinen koira, käy mielellään Dallapénpuistossa.',
  },
  {
    type: 'tarvitsen',
    title: 'Etsin lastenvahtia perjantai-illaksi',
    description:
      'Tarvitsemme lastenvahtia kahdelle lapselle (4v ja 7v) ensi perjantaina klo 18-22. Lapset ovat helppoja ja nukkuvat yleensä yhdeksältä. Palkkio sovitaan.',
  },
  {
    type: 'tarvitsen',
    title: 'Porakone lainaan viikonlopuksi',
    description:
      'Tarvitsisin akkuporakoneen lauantaiksi. Pitäisi kiinnittää muutama hylly seinälle. Palautan puhtaana sunnuntaina!',
  },
  {
    type: 'tarvitsen',
    title: 'Apua IKEA-hyllyn kasaamisessa',
    description:
      'Tilasin ison KALLAX-hyllyn mutta en osaa kasata sitä yksin. Jos jollakin on kokemusta ja tunti aikaa, olisin todella kiitollinen. Kahvia ja pullaa tarjolla!',
  },
  {
    type: 'tarvitsen',
    title: 'Tarvitsen kyydin lentokentälle tiistaiaamuna',
    description:
      'Lento lähtee klo 7:30 ja julkiset eivät kulje tarpeeksi aikaisin. Olisiko joku lähdössä kohti lentokenttää tiistaina klo 5 aikaan? Maksan bensat.',
  },
  {
    type: 'tarvitsen',
    title: 'Pesukoneen liitäntäapu',
    description:
      'Uusi pesukone saapui mutta en osaa liittää vesijohtoja. Tarvitsen jonkun joka tietää mitä tekee. Kestää max 30 min. Palkkio sovitaan!',
  },
  {
    type: 'tarvitsen',
    title: 'Kukkaruukkujen talvisäilytys',
    description:
      'Onko kellään tilaa säilyttää 5 isoa kukkaruukkua talven yli? Muutan väliaikaisesti pienempään asuntoon eikä parveke riitä. Haen keväällä pois.',
  },
  {
    type: 'tarvitsen',
    title: 'Suomenkielen keskustelukaveri',
    description:
      'Olen muuttanut Suomeen puoli vuotta sitten ja haluaisin harjoitella suomea. Etsin juttukaveria kahvikupin ääreen kerran viikossa. Osaan jo perusteet!',
  },
  {
    type: 'tarvitsen',
    title: 'Tarvitsen ruohonleikkurin lainaksi',
    description:
      'Pihanurmikko kasvaa villisti. Onko naapurilla ruohonleikkuria jonka voisin lainata iltapäiväksi? Palautetaan siistinä ja tankattuna.',
  },
  {
    type: 'tarvitsen',
    title: 'Kissan hoitaja jouluksi',
    description:
      'Matkustan jouluksi Lappiin 20.–28.12. Tarvitsen kissalleni hoitajan joka käy ruokkimassa ja rapsuttamassa. Mirri on kiltti sisäkissa. Korvaus sovitaan.',
  },
  {
    type: 'tarvitsen',
    title: 'Auttaisiko joku ATK-ongelmissa?',
    description:
      'Tietokoneeni on hidas ja en osaa selvittää miksi. Jos joku naapuri ymmärtää tietokoneista, olisin kiitollinen avusta. Tarjoan kahvit ja korvapuustin!',
  },
  {
    type: 'tarvitsen',
    title: 'Lasten pyörän korjausapu',
    description:
      'Lapsen polkupyörän ketju on tippunut ja vaihteissa jotain vikaa. En osaa itse korjata. Onko naapurustossa pyöränikkarointia osaava henkilö?',
  },
  {
    type: 'tarvitsen',
    title: 'Juhlateltta lainaan juhannukseksi',
    description:
      'Järjestämme pienet juhannusjuhlat pihalla. Onko kellään juhlatelttaa lainaan pe–su? Pidämme hyvää huolta ja palautamme puhtaana.',
  },
  {
    type: 'tarvitsen',
    title: 'Tarvitsen apua suomen kielen läksyissä',
    description:
      'Opiskelen suomen kieltä ja tarvitsisin apua kieliopin kanssa. Erityisesti partitiivin käyttö on vaikeaa. Jos osaat selittää, ota yhteyttä!',
  },

  // -------------------------------------------------------------------------
  // TARJOAN (15)
  // -------------------------------------------------------------------------
  {
    type: 'tarjoan',
    title: 'Tarjoan siivousapua 25€/kerta',
    description:
      'Teen kotisiivouksia arkipäivisin. Perussiivous (imurointi, moppaus, kylppäri, keittiö) noin 2 tuntia. Oma siivousvälineistö mukana. Kallio-Sörnäinen-alue.',
  },
  {
    type: 'tarjoan',
    title: 'Koiranulkoilutusta arkipäivisin',
    description:
      'Olen eläkeläinen ja rakastan koiria. Voin ulkoiluttaa koiraasi arkipäivisin klo 10-14 välillä. Asun Töölössä. Ensimmäinen lenkki ilmainen tutustumista varten!',
  },
  {
    type: 'tarjoan',
    title: 'Matematiikan apua yläkoululaisille',
    description:
      'Olen matematiikan opiskelija ja tarjoan tukiopetusta 7-9 -luokkalaisille. Hinta 20€/tunti. Voin tulla kotiin tai tavata kirjastossa. Ensimmäinen tunti ilmainen.',
  },
  {
    type: 'tarjoan',
    title: 'Valokuvauspalvelua edullisesti',
    description:
      'Olen harrastelija valokuvaaja ja tarjoan muotokuvia, perhekuvia ja tapahtumakuvausta. Hinta alkaen 50€ / tunti sisältäen kuvankäsittelyn. Portfolio pyydettäessä.',
  },
  {
    type: 'tarjoan',
    title: 'Pienremontteja ja kodinkorjauksia',
    description:
      'Tarjoan pienremontti- ja kodinkorjauspalvelua: hyllyjen asennus, maalausta, tapetointia, kodin pieniä sähkötöitä. Hinnat alkaen 30€/tunti. Kallio-Kamppi-Sörnäinen.',
  },
  {
    type: 'tarjoan',
    title: 'Tarjoan pianonsoiton opetusta',
    description:
      'Musiikkipedagogi tarjoaa pianotunteja aloittelijoille ja edistyneille. 30 min oppitunti 25€, 60 min 40€. Voin tulla kotiisi jos sinulla on piano tai sähköpiano.',
  },
  {
    type: 'tarjoan',
    title: 'Kasvimaan suunnittelu ja istutus',
    description:
      'Puutarhaharrastaja auttaa kasvimaan perustamisessa parvekkeelle tai pihalle. Annan vinkkejä mitä istuttaa Suomen kesässä. Hinta 20€/tunti tai sopimuksen mukaan.',
  },
  {
    type: 'tarjoan',
    title: 'Käännöspalvelu suomi-englanti-suomi',
    description:
      'Kääntäjä tarjoaa käännöspalvelua suomi-englanti -kieliparilla. Sopii asiakirjoihin, kirjeisiin, hakemuksiin. Hinta 0,10€/sana. Nopea toimitus.',
  },
  {
    type: 'tarjoan',
    title: 'Ateria- ja ruoanlaittopalvelu',
    description:
      'Valmistan kotiruokaa tilauksesta. Viikon ateriat kerralla, soveltuu ikäihmisille tai kiireisille. Raaka-aineet erikseen, työ 15€/ateria. Allergia huomioidaan.',
  },
  {
    type: 'tarjoan',
    title: 'IT-tukea seniorille kotiin',
    description:
      'Tarjoan kärsivällistä IT-apua ikäihmisille: puhelimen käyttö, sähköposti, verkkopankki, videopuhelut. Käyn kotona, 20€/kerta (noin 1h). Kamppi-Töölö-Kallio.',
  },
  {
    type: 'tarjoan',
    title: 'Pyöränhuolto ja korjaus',
    description:
      'Korjaan polkupyöriä harrastuksena. Renkaanvaihto, jarrut, vaihteisto, yleishuolto. Hinnat edullisia — kysy tarjous! Paja Sörnäisissä.',
  },
  {
    type: 'tarjoan',
    title: 'Lastenhoitoapua iltaisin',
    description:
      'Luotettava lastenhoidon ammattilainen tarjoaa lastenhoitoapua arkiiltaisin klo 17-22. Kokemusta eri-ikäisten lasten hoidosta. 15€/tunti. Kallio-Sörnäinen alue.',
  },
  {
    type: 'tarjoan',
    title: 'Mökkitalkkari-palvelut',
    description:
      'Autan mökillä: nurmikon leikkuu, polttopuut, pienet korjaukset, laiturin huolto. Matkakulut + 25€/tunti. Uudenmaan alue.',
  },
  {
    type: 'tarjoan',
    title: 'Hierontaa kotona — koulutettu hieroja',
    description:
      'Koulutettu urheiluhieroja tulee kotiisi. Klassinen hieronta, urheiluhieronta, rentoutus. 60 min 55€, 90 min 75€. Varaa aika viestillä!',
  },
  {
    type: 'tarjoan',
    title: 'Joogaa pienryhmille puistossa',
    description:
      'Ohjaan joogaa Kaivopuistossa lauantaisin klo 10. Sopii aloittelijoille. Ota oma matto mukaan. 10€/kerta tai 35€/kuukausi. Peruuntuu sateella.',
  },

  // -------------------------------------------------------------------------
  // ILMAISTA (10)
  // -------------------------------------------------------------------------
  {
    type: 'ilmaista',
    title: 'Ilmainen sohva haettavissa',
    description:
      'Harmaa 3-istuttava sohva ilmaiseksi. Hyvässä kunnossa, pieniä käytön jälkiä. Pitää hakea itse, olen 4. kerroksessa ilman hissiä. Kallio, Fleminginkatu.',
  },
  {
    type: 'ilmaista',
    title: 'Lastenvaatteita 2-4v',
    description:
      'Kassi täynnä hyväkuntoisia lastenvaatteita 2-4 -vuotiaalle: housuja, paitoja, takkeja, haalareitä. Sekaisin poikien ja tyttöjen vaatteita. Nouda Kampista.',
  },
  {
    type: 'ilmaista',
    title: 'Vanhoja kirjoja — suomenkielinen romaanit',
    description:
      'Noin 30 suomenkielistä romaania ilmaiseksi: Arto Paasilinna, Ilkka Remes, Sofi Oksanen, yms. Haettavissa Kruununhaasta viikonloppuna.',
  },
  {
    type: 'ilmaista',
    title: 'Toimiva pesukone — pitää noutaa itse',
    description:
      'Boschin 7kg pesukone, toimii hyvin mutta ostimme uuden. Noin 5v vanha. Nouda Katajanokalta, mahtuu autoon kyljellään. Ilmainen!',
  },
  {
    type: 'ilmaista',
    title: 'Keittiön astioita — lautasia, mukeja, laseja',
    description:
      'Muutan pienempään ja näille ei ole tilaa: 12 lautasta, 8 mukia, 6 viinilasia, paistinpannu, kattila. Kaikki ehjää ja käyttökelpoista. Sörnäinen.',
  },
  {
    type: 'ilmaista',
    title: 'Opiskelumateriaaleja — AMK liiketalous',
    description:
      'Valmistuin ja näillä kirjoilla ei ole enää käyttöä: markkinointi, kirjanpito, yritysjohtaminen. Noin 15 kirjaa. Ilmaiseksi haettavissa Töölöstä.',
  },
  {
    type: 'ilmaista',
    title: 'Lasten leluja — Legoja, pelejä, nalleja',
    description:
      'Lapset kasvoivat ulos leluista. Iso laatikko Duplo-Legoja, lautapelejä (Afrikan tähti, Kimble), pehmoleluja. Ilmaiseksi hyvään kotiin!',
  },
  {
    type: 'ilmaista',
    title: 'Vanha polkupyörä — tarvitsee huoltoa',
    description:
      'Naisten polkupyörä, 3-vaihteinen. Renkaat tarvitsevat ilmaa ja jarrut säätöä, mutta muuten ok. Ilmainen, nouda Kalliosta.',
  },
  {
    type: 'ilmaista',
    title: 'Viherkasveja — liikaa kotona',
    description:
      'Kasvini ovat lisääntyneet hallitsemattomasti! Tarjolla: monstera-pistokkaita, kultaköynnöksiä, mehikasveja. Tule hakemaan Kampista, anna vain hyvä koti.',
  },
  {
    type: 'ilmaista',
    title: 'Verhot ja matot — käytetyt mutta siistit',
    description:
      'Valkoisia verhoja (3 paria, 140x250cm), pieni villamatto (120x170cm). Pestyt ja siistit. Ilmaiseksi haettavissa Töölöstä tällä viikolla.',
  },

  // -------------------------------------------------------------------------
  // NAPPAA (10)
  // -------------------------------------------------------------------------
  {
    type: 'nappaa',
    title: 'Tuoreet korvapuustit — nouda tänään!',
    description:
      'Leivoin liikaa korvapuusteja! 8 kappaletta odottaa noutajaa. Tuoreita ja kanelisia. Haettavissa tänään Kalliosta klo 18 mennessä.',
  },
  {
    type: 'nappaa',
    title: 'Muuttolaatikoita ilmaiseksi',
    description:
      'Muutto tehty ja 15 pahvilaatikkoa jäi yli. Eri kokoisia, hyväkuntoisia. Nouda Sörnäisistä tänään tai huomenna, menevät kierrätykseen pe.',
  },
  {
    type: 'nappaa',
    title: 'Ylijäämä ruokatarvikkeita — parhaat ennen meni',
    description:
      'Siivoin kaappeja: pastaa, riisiä, säilykemaissia, kookosmaito, currytahnaa. Kaikki syötävää, parasta ennen -päivä mennyt mutta ok. Haettavissa Kampista.',
  },
  {
    type: 'nappaa',
    title: 'Puutarhan satoa — tomaatteja ja kurkkuja',
    description:
      'Kasvimaalla ylituotantoa! Tarjolla: kotimaisia tomaatteja ja kurkkuja. Tule hakemaan tänään tai huomenna. Kruununhaka, ilmoita viestillä ensin.',
  },
  {
    type: 'nappaa',
    title: 'Kahvipaketteja — väärä laatu',
    description:
      'Tilasin vahingossa 5 pakettia kahvia jota en juo (tummapaahtoinen). Avaamattomat Juhla Mokka -paketit ilmaiseksi ensimmäiselle noutajalle. Töölö.',
  },
  {
    type: 'nappaa',
    title: 'Omenoita omasta puusta — nappaa ämpärillinen!',
    description:
      'Omenapuumme tuottaa enemmän kuin jaksamme syödä. Tule poimimaan oma ämpärillinen! Makeita ja rapeita. Katajanokka, pihaovi auki päivisin.',
  },
  {
    type: 'nappaa',
    title: 'Vappuherkkuja ylijäämänä',
    description:
      'Vappujuhlista jäi yli: simaa, munkkeja, tippaleipää. Kaikki tämän päivän tuoretta. Haettavissa Kalliosta klo 20 mennessä!',
  },
  {
    type: 'nappaa',
    title: 'Polttopuita ilmaiseksi — hae tänään',
    description:
      'Kaadettiin koivu pihalta ja puut pitäisi saada pois. Noin 2 kuutiota koivuklapeja. Tule hakemaan Kruununhaasta, tuovat autoa tarvitaan.',
  },
  {
    type: 'nappaa',
    title: 'Jäätelöä pakastimesta — muutan pois',
    description:
      'Muutan huomenna ja pakastin pitää tyhjentää. 6 eri makuista Ben & Jerrys + Magnum-puikkoja. Ensimmäiselle noutajalle! Kamppi.',
  },
  {
    type: 'nappaa',
    title: 'Toimistotarvikkeita — kyniä, paperia, mappeja',
    description:
      'Etätöiden jäljiltä ylimääräistä: tulostinpaperia (3 riisiä), kyniä, post-it -lappuja, kansiomappeja. Nouda Sörnäisistä, ilmaista!',
  },

  // -------------------------------------------------------------------------
  // TAPAHTUMA (10)
  // -------------------------------------------------------------------------
  {
    type: 'tapahtuma',
    title: 'Pihatalkoot lauantaina',
    description:
      'Taloyhtiön pihatalkoot lauantaina klo 10-14. Haravoidaan, istutetaan kukkia, siivotaan roskakatokset. Kahvi ja makkara tarjolla! Kaikki naapurit tervetulleita.',
  },
  {
    type: 'tapahtuma',
    title: 'Naapuruston grillibileet',
    description:
      'Kesäkauden avajaisgrilli perjantaina klo 17 alkaen taloyhtiön pihalla. Jokainen tuo jotain pientä: salaattia, juomia, grillattavaa. Grilli on valmiina! Tervetuloa!',
  },
  {
    type: 'tapahtuma',
    title: 'Kirpputori rappukäytävässä',
    description:
      'Järjestämme rappukäytäväkirppiksen sunnuntaina klo 11-15. Tuo omat tavarat myyntiin portaikkoon. Pöytiä lainattavissa. Kahvimyynti hyväntekeväisyyteen.',
  },
  {
    type: 'tapahtuma',
    title: 'Lautapeli-ilta — kaikki tervetulleita',
    description:
      'Lautapeli-ilta keskiviikkona klo 18 kerhohuoneella. Pelejä mukana: Catan, Ticket to Ride, Azul, Dixit. Omat pelit saa tuoda myös. Kahvia ja keksejä tarjolla.',
  },
  {
    type: 'tapahtuma',
    title: 'Aamujooga puistossa — ilmainen',
    description:
      'Ilmainen aamujooga Kaivopuistossa joka tiistai klo 7:30. Sopii kaikille tasoille. Ota matto mukaan. Peruuntuu rankkasateella. Ohjaan itse — olen joogaopettaja.',
  },
  {
    type: 'tapahtuma',
    title: 'Lasten askartelupäivä',
    description:
      'Askartelupäivä lapsille ja perheille lauantaina klo 13-16 kerhohuoneella. Teemana: kevään kukat. Materiaalit tarjolla. Maksuton, mutta ilmoittaudu viestillä!',
  },
  {
    type: 'tapahtuma',
    title: 'Naapuruston siivoustalkoot',
    description:
      'Pidetään oman korttelin kadut ja puistot siistinä! Siivoustalkoot sunnuntaina klo 10-12. Jätesäkit ja hanskat tarjolla. Kahvi ja pulla talkkarilta!',
  },
  {
    type: 'tapahtuma',
    title: 'Elokuva-ilta kattoterassilla',
    description:
      'Näytetään "Mies vailla menneisyyttä" kattoterassilla perjantaina klo 21. Popcornia tarjolla. Ota viltti mukaan! Sade siirtää seuraavaan perjantaihin.',
  },
  {
    type: 'tapahtuma',
    title: 'Vanhojentanssit aikuisille — tanssikurssi',
    description:
      'Tule oppimaan paritansseja! Aloituskurssi alkaa maanantaina klo 19 kerhohuoneella. 4 kertaa, 5€/kerta. Paria ei tarvita. Opetellaan valssia ja foxtrottia.',
  },
  {
    type: 'tapahtuma',
    title: 'Naapuruston aamukahvit',
    description:
      'Joka torstai klo 9-10 kerhohuoneella on avoimet aamukahvit. Tule juttelemaan naapurien kanssa rennossa tunnelmassa. Kahvi ja pulla 1€. Kaikki tervetulleita!',
  },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching existing user profiles...')

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, naapurusto')
    .limit(20)

  if (profileError) {
    console.error('Failed to fetch profiles:', profileError.message)
    process.exit(1)
  }

  if (!profiles || profiles.length === 0) {
    console.error(
      'No user profiles found in the database.\n' +
        'Please create at least one user account via the app before running this script.\n' +
        'Seed users are needed to assign as post authors.'
    )
    process.exit(1)
  }

  console.log(`Found ${profiles.length} user profile(s): ${profiles.map((p) => p.name).join(', ')}`)

  // Shuffle posts for variety
  const posts = shuffle([...POSTS])

  // Build insert rows
  const rows = posts.map((post, i) => {
    const profile = profiles[i % profiles.length]
    const neighborhood = pick(NEIGHBORHOODS)
    const createdAt = randomDateWithinDays(14).toISOString()

    const row = {
      user_id: profile.id,
      type: post.type,
      title: post.title,
      description: post.description,
      location: neighborhood,
      is_active: true,
      is_seed: true,
      tags: [],
      like_count: Math.floor(Math.random() * 12),
      comment_count: Math.floor(Math.random() * 5),
      created_at: createdAt,
      updated_at: createdAt,
    }

    // Add event_date for tapahtuma posts (next 2 weeks)
    if (post.type === 'tapahtuma') {
      const future = new Date(Date.now() + Math.random() * 14 * 24 * 60 * 60 * 1000)
      row.event_date = future.toISOString()
    }

    return row
  })

  console.log(`Inserting ${rows.length} seed posts...`)

  const { data: inserted, error: insertError } = await supabase
    .from('posts')
    .insert(rows)
    .select('id, type, title')

  if (insertError) {
    console.error('Insert failed:', insertError.message)
    process.exit(1)
  }

  console.log(`Successfully inserted ${inserted.length} posts!`)

  // Summary by type
  const summary = {}
  for (const p of inserted) {
    summary[p.type] = (summary[p.type] || 0) + 1
  }
  console.log('Summary:', summary)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
