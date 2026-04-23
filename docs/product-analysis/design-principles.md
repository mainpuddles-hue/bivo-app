# TackBird — Design Principles & North Star Vision

> Frameworks: wondelai/design-principles + wondelai/north-star-vision
> Date: 2026-04-23

---

## North Star Vision

### Vision Statement

> TackBird makes every Helsinki neighborhood feel like a village — where borrowing a drill, joining a cleanup, or giving away a jacket is as easy and trusted as asking a friend next door.

### Time Horizons

| Horizon | Vision |
|---------|--------|
| **Near-term (1yr)** | 3 Helsinki neighborhoods with 200+ active users each, 50+ weekly exchanges, trust system working |
| **Mid-term (2-3yr)** | All Helsinki neighborhoods active, expanded to Tampere/Turku, lending is mainstream, city data integrated |
| **Long-term (5+yr)** | Finnish standard for neighborhood sharing, "TackBird it" becomes a verb like "Google it", expanding to Nordic capitals |

### Design Pillars

1. **Naapurusto First** — Everything is scoped to your neighborhood
2. **Trust by Design** — Safety and reputation built into every interaction
3. **Zero-Friction Sharing** — Giving, lending, and joining should feel effortless
4. **Community > Marketplace** — Connections matter more than transactions

---

## Design Principles (Ranked by Priority)

### 1. "Lähellä ensin" — Neighborhood First

**Statement:** Every interaction defaults to your immediate neighborhood. Distance is the most important filter, not an afterthought.

**Rationale:** TackBird exists because global marketplaces (Tori.fi, FB Marketplace) fail at hyperlocal. If we lose the neighborhood focus, we become another generic marketplace.

**Application:**
- Feed always shows neighborhood content first
- Distance shown on every card ("400m away")
- Map view centers on user's neighborhood
- Events default to "my neighborhood" tab

**Counter-example:** Showing city-wide results by default, hiding distance information.

**Trade-off:** Some searches may have fewer results. Accept this — density per neighborhood is the goal, not breadth.

### 2. "Luottamus näkyy" — Trust is Visible

**Statement:** Trust signals are always present, never hidden. Users should be able to evaluate trustworthiness in under 3 seconds.

**Rationale:** Peer-to-peer sharing with strangers requires trust. Without visible trust, users default to caution and inaction. Finland's cultural reserve makes this doubly important.

**Application:**
- Trust badge + tier visible on every profile mention (cards, messages, comments)
- Review stars shown alongside user name
- Verified badge prominently displayed
- Response time indicator on profiles
- Review count always visible, not hidden behind a tap

**Counter-example:** Hiding trust information to make the UI "cleaner." Burying reviews in a sub-screen.

**Trade-off:** More visual elements per card. Accept the density — trust information is not clutter, it's the product.

### 3. "Yksi napautus riittää" — One Tap is Enough

**Statement:** The most common actions require at most one tap from the current screen. Never make users dig.

**Rationale:** Mobile usage is brief and interrupted. Finnish users are efficiency-oriented — unnecessary steps cause abandonment.

**Application:**
- Quick-reply buttons on post detail ("Kiinnostaa!" one-tap message)
- One-tap save/unsave on every post
- One-tap event join
- Quick-message templates in conversations
- Post "claimed" one-tap status change

**Counter-example:** Requiring navigation to a settings page to change post status. Multi-step confirmation for routine actions.

**Trade-off:** Less confirmation means occasional accidental taps. Provide undo instead of "Are you sure?"

### 4. "Yhteisö, ei kauppa" — Community, Not Commerce

**Statement:** Design for connection and reciprocity first. Commerce features exist to enable sharing, not to extract value.

**Rationale:** TackBird's moat is community. If the app feels like a marketplace, users will compare it to Tori.fi (which has more inventory). If it feels like a neighborhood, it's irreplaceable.

**Application:**
- "Ilmaista" (free) category is always first and most prominent
- Events and forum are equal to marketplace in navigation hierarchy
- Business profiles feel like community members, not ads
- Boosts are subtle, not disrupting the feed
- Reviews emphasize the person, not the transaction

**Counter-example:** Prioritizing paid listings over free ones. Making the feed feel like a shopping catalog.

**Trade-off:** Revenue features are secondary to community features. Accept slower monetization for stronger community.

### 5. "Suomeksi luonnollisesti" — Naturally Finnish

**Statement:** The app speaks Finnish the way real Helsinkians speak — casual, warm, not corporate. English and Swedish are fully supported but Finnish sets the tone.

**Rationale:** Most Finnish apps feel translated from English. TackBird should feel like it was born in Helsinki. This cultural fit is a competitive moat that global competitors cannot replicate.

**Application:**
- UX copy uses conversational Finnish, not formal ("Hei naapuri!" not "Hyvä käyttäjä")
- Empty states are encouraging, not dry ("Täällä on vielä hiljaista" not "Ei tuloksia")
- Error messages are helpful and human ("Ei onnistunut — kokeile uudelleen" not "Virhe 500")
- Neighborhood names are real Helsinki neighborhoods (Kallio, Töölö, not "Area 1")
- Date/time follows Finnish conventions (klo 14:00, not 2:00 PM)

**Counter-example:** Corporate-sounding translations. Generic English-first UI patterns.

**Trade-off:** Finnish-first means more localization effort for en/sv. Accept this — Finnish users are the primary audience.

### 6. "Kaikille avoin" — Open to Everyone

**Statement:** The app works for everyone — retirees on iPads, international residents in English, visually impaired users with screen readers.

**Rationale:** Neighborhoods are diverse. If TackBird only works for tech-savvy 25-35 year olds, it fails at being a real neighborhood tool.

**Application:**
- Minimum 16px body text, support Dynamic Type
- All interactive elements ≥ 44pt touch targets
- Full VoiceOver/TalkBack support with meaningful labels
- Color is never the only indicator
- Works in English and Swedish without feeling like an afterthought
- Simple, predictable navigation patterns

**Counter-example:** Small text, gesture-only interactions, color-coded information without labels.

**Trade-off:** Accessibility can constrain visual creativity. Accept this — reach matters more than novelty.

---

## Principle Conflicts Resolution

When principles conflict, use this ranked order:

1. **Trust is Visible** — Safety never compromised
2. **Neighborhood First** — Hyperlocal focus never diluted
3. **One Tap is Enough** — Friction never added without good reason
4. **Open to Everyone** — Accessibility never sacrificed
5. **Community, Not Commerce** — Community features never deprioritized for revenue
6. **Naturally Finnish** — Cultural fit maintained

**Example conflict:** "One Tap is Enough" vs "Trust is Visible" for lending high-value items.
**Resolution:** Trust wins. For rentals > 100€, show trust summary + confirmation step. Friction is justified for safety.

---

## Vision Scenarios

### Scenario 1: "Saturday Morning in Kallio" (Near-term)

Liisa wakes up, opens TackBird over coffee. The feed shows 3 new "ilmaista" posts from her building, a neighborhood cleanup event tomorrow, and a "lainaa: akkuporakone" listing 200m away. She taps the drill listing, sees the lender has 12 reviews and a green trust badge. One tap: "Kiinnostaa!" A message is sent. By noon, she has the drill. She returns it Sunday, leaves a 5-star review. Both earn trust points.

### Scenario 2: "New to Helsinki" (Mid-term)

Alexei moves to Pasila from Moscow. His colleague sends a TackBird invite link. He opens the app in English, sets his neighborhood. The feed shows 8 free items within 1km, a "Pasila International Coffee Morning" event, and 3 "tarjoan" services. He picks up a free desk, attends the coffee morning, and posts "Tarjoan: coding help in exchange for Finnish conversation." Within a month, he knows 15 neighbors by name.

### Scenario 3: "The Neighborhood That Shares" (Long-term)

Töölö has 2,400 active TackBird users. The neighborhood collectively owns 89 lendable drills, 23 pressure washers, and 7 cargo bikes — all mapped. Monthly: 340 items shared, 45 events, €8,200 in lending transactions. The neighborhood's carbon savings are displayed: "Töölö saved 4.2 tons of CO2 this year by sharing instead of buying." The city of Helsinki partners with TackBird to push recycling reminders and construction alerts through the neighborhood feed.
