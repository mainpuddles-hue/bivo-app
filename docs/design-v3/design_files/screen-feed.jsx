/* global React, POSTS, CATEGORY_PILLS, CATEGORY, PostCardV2, FloatingNav, Pressable,
   IconSearch, IconFilter, IconMap, IconChevronRight, IconSparkles, IconClose,
   IconRefresh, IconUsers, IconHome */

const { useState: useState_F } = React;

// Feed v2 — Helsinki Monochrome
//
// vs current `app/(tabs)/index.tsx`:
//
// 1. HEADER PELKISTETTY
//    - Removed: "X paikalla" inline-merge, weeklyActiveCount line, three circle buttons.
//    - One ink h1 ("Kallio"), one greyed sub ("12 naapuria juuri nyt"), no other chrome.
//    - Map toggle moved into a small icon-button row aligned right of search.
//
// 2. SEARCH NÄKYVÄNÄ INPUT-KENTTÄNÄ
//    - Was: 44px circle button. Now: full-width search input pill.
//    - Reduces taps to start a search from 2 (icon → modal) to 1 (tap input → enters search).
//
// 3. SORT MUUTTUI ICON-MUNA → TEKSTIRIVI "Suositus" + chevron
//    - Sort menu lives below the pills, aligned right. Less visual weight.
//    - Active sort no longer needs a separate "active sort indicator" row.
//
// 4. KATEGORIA-PILLIT — väriton ink
//    - Active = ink fill, white text. Inactive = card with hairline border.
//    - Removes per-category color-tint on chips; the category color now appears only
//      on the post card itself (via warm-tint / ink event card / image badge),
//      which is where it actually helps users filter content visually.
//
// 5. BANNER-PRIORITEETTI
//    - Stack: error → newPosts → missedPosts → buildingCard → polls. Max ONE visible at top.
//    - Building/community card moved DOWN into a "Lähelläsi" sub-section, not above feed.
//
// 6. SECTION HEADER — vasemmalla iso otsikko, oikealla "Näytä kaikki →" pieni
//    - Section title now 22 (was 20), with built-in counter "Tarjoan · 14 lähellä"
//
// 7. FAB POISTETTU
//    - Floating pill nav already has center "Plus" tab. Two CTAs for the same action
//      created visual noise at bottom-right. Trust the nav.

const fStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 120 },
  header: { padding: "20px 20px 12px" },
  hLocation: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase",
    color: "var(--muted-foreground)", marginBottom: 4,
  },
  hTitleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  hTitle: {
    fontSize: 32, fontWeight: 700, letterSpacing: -1, lineHeight: 1,
    color: "var(--foreground)", fontFamily: "var(--font-heading)", margin: 0,
  },
  hPulse: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 13, color: "var(--muted-foreground)", marginTop: 8,
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3, background: "var(--success)" },

  // Search bar
  searchWrap: {
    margin: "16px 20px 0",
    display: "flex", alignItems: "center", gap: 8,
  },
  searchInput: {
    flex: 1,
    display: "flex", alignItems: "center", gap: 8,
    height: 44, padding: "0 14px", borderRadius: 999,
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--muted-foreground)", fontSize: 14,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 999, flexShrink: 0,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)",
  },

  // Pills
  pillRow: {
    display: "flex", gap: 8, padding: "16px 20px 4px",
    overflowX: "auto", scrollbarWidth: "none",
  },
  pill: {
    height: 36, padding: "0 14px", borderRadius: 999,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    border: "1px solid var(--border)", background: "var(--card)",
    color: "var(--foreground)", fontSize: 13, fontWeight: 600,
    whiteSpace: "nowrap", flexShrink: 0,
  },
  pillActive: {
    background: "var(--foreground)", color: "var(--primary-foreground)",
    border: "1px solid var(--foreground)",
  },

  // Sort row
  sortRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 20px 4px",
  },
  sortBtn: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
    color: "var(--muted-foreground)",
  },

  // Banner
  banner: {
    margin: "8px 20px 0",
    padding: "12px 16px", borderRadius: 999,
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    background: "var(--surface-tinted)", border: "1px solid var(--border)",
    fontSize: 13, fontWeight: 600, color: "var(--foreground)",
  },

  // Section
  section: { marginTop: 12 },
  sectionHead: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    padding: "16px 20px 10px",
  },
  sectionTitle: {
    fontSize: 22, fontWeight: 700, letterSpacing: -0.4,
    color: "var(--foreground)", fontFamily: "var(--font-heading)", margin: 0,
  },
  sectionCount: {
    fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500,
  },
  seeAll: {
    display: "flex", alignItems: "center", gap: 2,
    fontSize: 13, fontWeight: 600, color: "var(--foreground)",
  },
  hScroll: {
    display: "flex", gap: 12, padding: "0 20px",
    overflowX: "auto", scrollbarWidth: "none",
  },

  // 2-col grid (filtered view)
  gridWrap: { padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },

  // Building card
  bldCard: {
    margin: "16px 20px 0", padding: "14px 16px",
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: 20,
    display: "flex", alignItems: "center", gap: 12,
  },
  bldIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    background: "var(--surface-tinted)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)", flexShrink: 0,
  },
  bldText: { flex: 1, minWidth: 0 },
  bldTitle: { fontSize: 14, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 },
  bldSub: { fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 },
};

const FeedV2 = ({ active = "feed", onTabChange = () => {}, neighborhood = "Kallio", onlineCount = 12 }) => {
  const [filter, setFilter] = useState_F(null);
  const [showNew, setShowNew] = useState_F(true);

  // Group posts by category
  const grouped = {};
  for (const p of POSTS) {
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type].push(p);
  }
  const order = ["tarjoan", "tarvitsen", "ilmaista", "tapahtuma", "lainaa"];
  const sections = order.filter(k => grouped[k]?.length);

  const filteredPosts = filter ? POSTS.filter(p => p.type === filter) : POSTS;

  return (
    <div style={fStyles.page}>
      <div style={fStyles.scroll}>

        {/* Header */}
        <div style={fStyles.header}>
          <div style={fStyles.hLocation}>Naapurusto</div>
          <div style={fStyles.hTitleRow}>
            <h1 style={fStyles.hTitle}>{neighborhood}</h1>
            <Pressable style={fStyles.iconBtn} onPress={() => {}}>
              <IconMap size={18} color="var(--foreground)"/>
            </Pressable>
          </div>
          <div style={fStyles.hPulse}>
            <span style={fStyles.pulseDot}/>
            <span>{onlineCount} naapuria juuri nyt · 84 ilmoitusta tällä viikolla</span>
          </div>
        </div>

        {/* Search */}
        <div style={fStyles.searchWrap}>
          <Pressable style={fStyles.searchInput} onPress={() => {}}>
            <IconSearch size={16} color="var(--muted-foreground)"/>
            <span>Etsi naapurustosta…</span>
          </Pressable>
          <Pressable style={fStyles.iconBtn} onPress={() => {}}>
            <IconFilter size={18} color="var(--foreground)"/>
          </Pressable>
        </div>

        {/* Pills */}
        <div style={fStyles.pillRow}>
          {CATEGORY_PILLS.map(p => {
            const isActive = filter === p.key;
            return (
              <Pressable key={p.label} onPress={() => setFilter(p.key)}
                style={{...fStyles.pill, ...(isActive ? fStyles.pillActive : {})}}>
                {p.label}
              </Pressable>
            );
          })}
        </div>

        {/* Sort row */}
        <div style={fStyles.sortRow}>
          <span style={fStyles.sortBtn}>{filter ? CATEGORY[filter].label : "Kaikki"} · {filteredPosts.length}</span>
          <Pressable style={fStyles.sortBtn} onPress={() => {}}>
            Suositus <IconChevronRight size={12} color="var(--muted-foreground)"/>
          </Pressable>
        </div>

        {/* New posts banner (one slot, max one banner visible) */}
        {showNew && !filter && (
          <Pressable style={fStyles.banner} onPress={() => setShowNew(false)}>
            <span style={{display: "flex", alignItems: "center", gap: 8}}>
              <IconSparkles size={14} color="var(--foreground)"/>
              4 uutta ilmoitusta
            </span>
            <IconRefresh size={14} color="var(--muted-foreground)"/>
          </Pressable>
        )}

        {/* Building card — moved to its own slot, not stacked on banners */}
        {!filter && (
          <div style={fStyles.bldCard}>
            <div style={fStyles.bldIconWrap}>
              <IconHome size={18} color="var(--foreground)"/>
            </div>
            <div style={fStyles.bldText}>
              <div style={fStyles.bldTitle}>Vaasankatu 14</div>
              <div style={fStyles.bldSub}>7 naapuria taloyhtiössäsi</div>
            </div>
            <Pressable style={{...fStyles.iconBtn, width: 36, height: 36, background: "var(--foreground)", color: "var(--primary-foreground)", border: "none"}}>
              <IconChevronRight size={16} color="var(--primary-foreground)"/>
            </Pressable>
          </div>
        )}

        {/* Sections (unfiltered) or grid (filtered) */}
        {filter ? (
          <div style={{paddingTop: 16}}>
            <div style={fStyles.gridWrap}>
              {filteredPosts.map(p => <PostCardV2 key={p.id} post={p}/>)}
            </div>
          </div>
        ) : sections.map(type => {
          const cat = CATEGORY[type];
          const items = grouped[type];
          return (
            <div key={type} style={fStyles.section}>
              <div style={fStyles.sectionHead}>
                <div>
                  <h2 style={fStyles.sectionTitle}>{cat.label}</h2>
                  <div style={{...fStyles.sectionCount, marginTop: 2}}>{items.length} lähellä</div>
                </div>
                <Pressable style={fStyles.seeAll} onPress={() => setFilter(type)}>
                  Näytä kaikki <IconChevronRight size={14} color="var(--foreground)"/>
                </Pressable>
              </div>
              <div style={fStyles.hScroll}>
                {items.map(p => (
                  <div key={p.id} style={{width: 220, flexShrink: 0}}>
                    <PostCardV2 post={p}/>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{height: 40}}/>
      </div>

      {/* Floating nav */}
      <FloatingNav active={active} onChange={onTabChange} badges={{messages: 3}}/>
    </div>
  );
};

Object.assign(window, { FeedV2 });
