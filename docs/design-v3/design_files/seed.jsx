/* global */
// Seed data for v2 mockups — uses Unsplash for placeholder photos.
// Authors are fictional; mirrors the mix you'd see in a Helsinki neighborhood.

const POSTS = [
  {
    id: "p1", type: "tarjoan", title: "Kahvinkeitin ilmaiseksi — toimii edelleen",
    author: "Anni K.", location: "Kallio", time: "2 t",
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80",
    avatar: "https://i.pravatar.cc/100?img=49",
    likes: 12,
  },
  {
    id: "p2", type: "tarvitsen", title: "Kuka voisi auttaa muuttoa lauantaina?",
    author: "Mikko V.", location: "Hermanni", time: "5 t",
    avatar: "https://i.pravatar.cc/100?img=12",
    urgent: true,
  },
  {
    id: "p3", type: "lainaa", title: "Porakone (Bosch)",
    author: "Tuomas L.", location: "Vallila", time: "1 pv",
    image: "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&q=80",
    avatar: "https://i.pravatar.cc/100?img=33",
    price: "5 €/pv",
    likes: 3,
  },
  {
    id: "p4", type: "tapahtuma", title: "Kallion siivoustalkoot ja brunssi",
    author: "Kallio-seura", location: "Brahenkenttä",
    eventDate: "LA 4.5 · 11:00",
    attending: 24,
  },
  {
    id: "p5", type: "ilmaista", title: "Lasten talvitakki kokoa 110, hyväkuntoinen",
    author: "Sanna R.", location: "Sörnäinen", time: "3 t",
    image: "https://images.unsplash.com/photo-1551803091-e20673f15770?w=600&q=80",
    avatar: "https://i.pravatar.cc/100?img=47",
    likes: 7,
  },
  {
    id: "p6", type: "tarjoan", title: "Vien koirasi lenkille kun olet töissä — 10€/h",
    author: "Liisa M.", location: "Hakaniemi", time: "6 t",
    avatar: "https://i.pravatar.cc/100?img=44",
    price: "10 €/h",
  },
  {
    id: "p7", type: "tarjoan", title: "IKEA Malm, kerrossänky, nouto Kalliosta",
    author: "Pekka R.", location: "Kallio", time: "1 t",
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&q=80",
    avatar: "https://i.pravatar.cc/100?img=64",
    price: "60 €",
    likes: 5,
  },
  {
    id: "p8", type: "tapahtuma", title: "Yhteislaulutilaisuus Sörkän kirjastolla",
    author: "Sörkän kirjasto", location: "Sörkkä",
    eventDate: "TI 7.5 · 18:30",
    attending: 8,
  },
  {
    id: "p9", type: "tarvitsen", title: "Etsin auton paikkaa lauantaisin (Kallio/Sörkkä)",
    author: "Aki H.", location: "Kallio", time: "8 t",
    avatar: "https://i.pravatar.cc/100?img=68",
  },
  {
    id: "p10", type: "lainaa", title: "Vaahtopesuri — ennakkoon viikoksi",
    author: "Jari P.", location: "Vallila", time: "2 pv",
    image: "https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=600&q=80",
    avatar: "https://i.pravatar.cc/100?img=11",
    price: "8 €/pv",
    likes: 9,
  },
];

const CATEGORY_PILLS = [
  { key: null,         label: "Kaikki" },
  { key: "tarvitsen",  label: "Tarvitsen" },
  { key: "tarjoan",    label: "Tarjoan" },
  { key: "ilmaista",   label: "Ilmaista" },
  { key: "lainaa",     label: "Lainaa" },
  { key: "tapahtuma",  label: "Tapahtuma" },
];

Object.assign(window, { POSTS, CATEGORY_PILLS });
