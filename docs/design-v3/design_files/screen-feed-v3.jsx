/* global React, Pressable, POSTS_V3, BUILDING, NEIGHBORHOOD, Avatar,
   IconSearch, IconMap, IconSparkles, IconRefresh, IconChevronRight, IconHome,
   IconHeartFill, IconClock, IconShieldCheck, IconCalendar, IconUsers, IconMapPin,
   IconBookmarkFill, IconArrowUpRight, FloatingNav */

const { useState: uS_F3, useEffect: uE_F3 } = React;

// ─────────────────────────────────────────────────────────────
// Feed v3 — pixel-finished, Helsinki Monochrome
//
// Vocabulary:
// • Heading family: Bricolage Grotesque (display) — used at h1/h2.
// • Body: Instrument Sans 400/500/600.
// • Cards have THREE variants with intentional rhythm:
//     IMAGE   → photography hero, 4:5 aspect, content below
//     INK     → solid foreground bg, used for events (anchors a column)
//     TINT    → warm-tint bg, used for text-only posts (organic feel)
// • Photography is left untreated (user request).
// ─────────────────────────────────────────────────────────────

const f3 = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  scroll: { flex: 1, overflowY: "auto", paddingTop: 59, paddingBottom: 130 },

  // ── Header ────────────────────────────────────────────────────────────
  header: { padding: "12px 20px 8px" },
  hLocLine: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)",
    letterSpacing: -0.1, marginBottom: 2,
  },
  hLocPin: {
    width: 14, height: 14, borderRadius: 7,
    background: "var(--success)", flexShrink: 0,
    boxShadow: "0 0 0 3px rgba(45,122,79,0.18)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  hLocPinDot: { width: 5, height: 5, borderRadius: 3, background: "white" },
  hTitleRow: {
    display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    gap: 10, marginTop: 4,
  },
  hTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 38, fontWeight: 600, letterSpacing: -1.4, lineHeight: 0.95,
    color: "var(--foreground)", margin: 0,
  },
  hSubArea: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 17, fontWeight: 500, color: "var(--muted-foreground)",
    letterSpacing: -0.4, paddingBottom: 4,
  },
  hPulse: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 13, color: "var(--foreground)", marginTop: 12,
    fontFeatureSettings: '"tnum" on, "lnum" on',
  },
  pulseGroup: { display: "flex", alignItems: "center", gap: 5 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, background: "var(--success)", flexShrink: 0 },
  pulseDotPulse: {
    width: 6, height: 6, borderRadius: 3, background: "var(--success)",
    flexShrink: 0, animation: "tb-pulse 2s ease-in-out infinite",
  },
  pulseDivider: { color: "var(--tertiary-foreground)", margin: "0 2px" },

  // ── Search row ────────────────────────────────────────────────────────
  searchRow: { padding: "16px 20px 0", display: "flex", gap: 8 },
  searchInput: {
    flex: 1, height: 48, borderRadius: 999,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 10, padding: "0 18px",
    color: "var(--muted-foreground)", fontSize: 15, fontWeight: 500,
    transition: "all 160ms ease",
  },
  searchInputHover: {
    background: "var(--card-elevated)", borderColor: "var(--border-strong)",
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24, flexShrink: 0,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)",
    transition: "all 160ms ease",
  },

  // ── Pills ─────────────────────────────────────────────────────────────
  pillRow: {
    display: "flex", gap: 6, padding: "20px 20px 0",
    overflowX: "auto", scrollbarWidth: "none",
    WebkitMaskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)",
    maskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)",
  },
  pill: {
    height: 36, padding: "0 14px", borderRadius: 999,
    display: "flex", alignItems: "center", gap: 6,
    background: "transparent", border: "1px solid var(--border)",
    color: "var(--foreground)", fontSize: 13, fontWeight: 500,
    whiteSpace: "nowrap", flexShrink: 0,
    transition: "all 140ms ease",
    fontFeatureSettings: '"tnum" on',
  },
  pillActive: {
    background: "var(--foreground)", color: "var(--primary-foreground)",
    border: "1px solid var(--foreground)", fontWeight: 600,
  },
  pillCount: {
    color: "var(--tertiary-foreground)",
    fontSize: 11, fontWeight: 500,
  },
  pillCountActive: { color: "rgba(255,255,255,0.55)" },

  // ── Section heads ─────────────────────────────────────────────────────
  section: { marginTop: 28 },
  sectionHead: {
    display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    padding: "0 20px 14px",
  },
  sectionTitleWrap: { display: "flex", flexDirection: "column", gap: 3 },
  sectionTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 24, fontWeight: 500, letterSpacing: -0.7, lineHeight: 1,
    color: "var(--foreground)", margin: 0,
  },
  sectionSub: {
    fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500,
    fontFeatureSettings: '"tnum" on',
  },
  seeAllBtn: {
    display: "flex", alignItems: "center", gap: 2,
    fontSize: 13, fontWeight: 500, color: "var(--foreground)",
    paddingBottom: 1,
  },

  // ── Building card ─────────────────────────────────────────────────────
  bldCard: {
    margin: "20px 20px 0", padding: 16, borderRadius: 20,
    background: "var(--foreground)", color: "var(--background)",
    display: "flex", alignItems: "center", gap: 14,
    position: "relative", overflow: "hidden",
  },
  bldDecor: {
    position: "absolute", right: -30, top: -40, width: 140, height: 140,
    borderRadius: 70, background: "var(--surface-tinted)", pointerEvents: "none",
  },
  bldIconWrap: {
    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
    background: "rgba(255,255,255,0.10)",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  bldText: { flex: 1, minWidth: 0, position: "relative" },
  bldLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase",
    color: "var(--on-ink-muted)",
  },
  bldName: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 18, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.1,
    color: "var(--background)", marginTop: 2,
  },
  bldStats: {
    fontSize: 12, color: "var(--on-ink-muted)", marginTop: 4,
    fontFeatureSettings: '"tnum" on',
  },
  bldStatsStrong: { color: "var(--background)", fontWeight: 600 },
  bldArrow: {
    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
    background: "var(--background)", color: "var(--foreground)",
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative",
  },

  // ── New posts banner ──────────────────────────────────────────────────
  newBanner: {
    margin: "16px 20px 0",
    padding: "10px 14px", borderRadius: 999,
    display: "flex", alignItems: "center", gap: 8,
    background: "var(--card)", border: "1px solid var(--border)",
    fontSize: 13, fontWeight: 500, color: "var(--foreground)",
  },
  newBannerDot: {
    width: 7, height: 7, borderRadius: 4, flexShrink: 0,
    background: "var(--info)",
    animation: "tb-pulse 2s ease-in-out infinite",
  },

  // ── Sort row ──────────────────────────────────────────────────────────
  sortRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 20px",
  },
  sortLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
    color: "var(--tertiary-foreground)",
    fontFeatureSettings: '"tnum" on',
  },
  sortBtn: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
    color: "var(--foreground)",
  },

  // Mosaic grid for "kaikki" view (mixed variants)
  mosaic: {
    padding: "0 20px",
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
    alignItems: "start",
  },
};

// Animations and pseudo selectors via inline <style>
const F3Styles = () => (
  <style>{`
    @keyframes tb-pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.85); }
    }
    @keyframes tb-shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .tb-press { transition: transform 140ms ease; }
    .tb-press:active { transform: scale(0.97); }
    .tb-card { transition: transform 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease; }
    .tb-card:active { transform: scale(0.985); }
    .tb-skeleton {
      background: linear-gradient(90deg,
        var(--muted) 0%,
        var(--surface-tinted) 50%,
        var(--muted) 100%);
      background-size: 800px 100%;
      animation: tb-shimmer 1.5s linear infinite;
    }
    .tb-pill-row::-webkit-scrollbar { display: none; }
    .tb-no-scroll::-webkit-scrollbar { display: none; }
  `}</style>
);

// ─────────────────────────────────────────────────────────────
// Cards — three variants with finished detail
// ─────────────────────────────────────────────────────────────
const cardV3 = {
  base: {
    borderRadius: 20, overflow: "hidden",
    border: "1px solid var(--border)",
    background: "var(--card)",
    display: "flex", flexDirection: "column",
    cursor: "pointer",
  },

  // IMAGE variant
  imageWrap: { position: "relative", width: "100%", aspectRatio: "4 / 5", background: "var(--muted)", overflow: "hidden" },
  image: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  imgGradient: {
    position: "absolute", inset: 0,
    background: "linear-gradient(to top, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 50%)",
    pointerEvents: "none",
  },
  imgTopRow: {
    position: "absolute", top: 10, left: 10, right: 10,
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
  },
  catChip: {
    padding: "5px 10px", borderRadius: 999,
    background: "rgba(255,255,255,0.94)", color: "#1A1D1F",
    fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  urgentChip: {
    display: "flex", alignItems: "center", gap: 4,
    padding: "5px 10px", borderRadius: 999,
    background: "var(--destructive)", color: "white",
    fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
  },
  countChip: {
    display: "flex", alignItems: "center", gap: 4,
    padding: "5px 9px", borderRadius: 999,
    background: "rgba(0,0,0,0.55)", color: "white",
    fontSize: 11, fontWeight: 600,
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  },
  imgBottomRow: {
    position: "absolute", left: 12, right: 12, bottom: 10,
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  pricePill: {
    padding: "5px 12px", borderRadius: 999,
    background: "rgba(255,255,255,0.94)", color: "#1A1D1F",
    fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    fontFeatureSettings: '"tnum" on',
  },
  imgContent: { padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  imgTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 15, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.2,
    color: "var(--foreground)",
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  metaRow: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, color: "var(--muted-foreground)",
    fontFeatureSettings: '"tnum" on',
  },

  // INK variant (events)
  inkCard: {
    background: "var(--foreground)", color: "var(--background)",
    border: "none", padding: 14, gap: 10, minHeight: 250, display: "flex", flexDirection: "column",
  },
  inkDate: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 32, fontWeight: 500, letterSpacing: -1, lineHeight: 0.95,
    color: "var(--background)", margin: 0,
  },
  inkDay: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
    color: "var(--on-ink-muted)", marginTop: 2,
  },
  inkTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 16, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.2,
    color: "var(--background)", flex: 1,
    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  inkBottom: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, color: "var(--on-ink-muted)",
    paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)",
  },

  // TINT variant (text-only / requests)
  tintCard: {
    background: "var(--warm-tint)", padding: 14, gap: 10,
    minHeight: 220, display: "flex", flexDirection: "column",
    border: "1px solid var(--border)",
  },
  tintCatLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
    color: "var(--muted-foreground)",
  },
  tintTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 17, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.2,
    color: "var(--foreground)",
    display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
    flex: 1,
  },
  urgentInline: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 8px", borderRadius: 999,
    background: "var(--foreground)", color: "var(--background)",
    fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
    alignSelf: "flex-start",
  },
};

const CAT_LABELS = {
  ilmaista:  "Ilmaista",
  tarvitsen: "Tarvitsen",
  tarjoan:   "Tarjoan",
  tapahtuma: "Tapahtuma",
  lainaa:    "Lainaa",
};

const PostCardV3 = ({ post, onPress }) => {
  const variant = post.type === "tapahtuma" ? "ink" : (post.image ? "image" : "tint");

  if (variant === "image") {
    return (
      <div className="tb-card" onClick={onPress} style={cardV3.base}>
        <div style={cardV3.imageWrap}>
          <img src={post.image} alt="" style={cardV3.image} loading="lazy"/>
          <div style={cardV3.imgGradient}/>
          <div style={cardV3.imgTopRow}>
            <span style={cardV3.catChip}>{CAT_LABELS[post.type]}</span>
            {post.likes >= 10 && (
              <span style={cardV3.countChip}>
                <IconHeartFill size={11} color="white"/> {post.likes}
              </span>
            )}
          </div>
          {post.price && (
            <div style={cardV3.imgBottomRow}>
              <span style={cardV3.pricePill}>{post.price}</span>
            </div>
          )}
        </div>
        <div style={cardV3.imgContent}>
          <div style={cardV3.imgTitle}>{post.title}</div>
          <div style={cardV3.metaRow}>
            <Avatar src={post.avatar} name={post.author} size={16}/>
            <span style={{
              flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--foreground)", fontWeight: 500
            }}>
              {post.author}
            </span>
            {post.verified && <IconShieldCheck size={11} color="var(--success)" stroke={2.4}/>}
            <span style={{color: "var(--tertiary-foreground)"}}>·</span>
            <span style={{whiteSpace: "nowrap"}}>{post.distance}</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "ink") {
    const [day, date] = post.eventDate ? post.eventDate.split(" ") : ["", ""];
    return (
      <div className="tb-card" onClick={onPress} style={{...cardV3.base, ...cardV3.inkCard}}>
        <div>
          <div style={cardV3.inkDay}>{day}</div>
          <div style={cardV3.inkDate}>{date}</div>
        </div>
        <div style={cardV3.inkTitle}>{post.title}</div>
        <div style={cardV3.inkBottom}>
          <IconUsers size={12} color="var(--on-ink-muted)" stroke={2}/>
          <span><span style={{color: "var(--background)", fontWeight: 600}}>{post.attending}</span> osallistuu</span>
          {post.eventTime && <>
            <span style={{margin: "0 2px", color: "rgba(255,255,255,0.18)"}}>·</span>
            <span>{post.eventTime.split(" – ")[0]}</span>
          </>}
        </div>
      </div>
    );
  }

  // TINT
  return (
    <div className="tb-card" onClick={onPress} style={{...cardV3.base, ...cardV3.tintCard}}>
      <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8}}>
        <span style={cardV3.tintCatLabel}>{CAT_LABELS[post.type]}</span>
        {post.urgent && <span style={cardV3.urgentInline}>Kiire</span>}
      </div>
      <div style={cardV3.tintTitle}>{post.title}</div>
      <div style={cardV3.metaRow}>
        <Avatar src={post.avatar} name={post.author} size={16}/>
        <span style={{
          flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: "var(--foreground)", fontWeight: 500
        }}>
          {post.author}
        </span>
        {post.verified && <IconShieldCheck size={11} color="var(--success)" stroke={2.4}/>}
        <span style={{color: "var(--tertiary-foreground)"}}>·</span>
        <span style={{whiteSpace: "nowrap"}}>{post.distance}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main FeedV3 component
// ─────────────────────────────────────────────────────────────
const FeedV3 = ({ active = "feed", onTabChange = () => {} }) => {
  const [filter, setFilter] = uS_F3(null);
  const [showNew, setShowNew] = uS_F3(true);

  // group posts by category
  const grouped = {};
  for (const p of POSTS_V3) {
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type].push(p);
  }
  // section order — show "tapahtuma" early so it shows the dark anchor card
  const order = ["tapahtuma", "tarjoan", "tarvitsen", "lainaa", "ilmaista"];

  const PILLS = [
    { key: null, label: "Kaikki", count: POSTS_V3.length },
    { key: "tarjoan", label: "Tarjoan", count: grouped.tarjoan?.length || 0 },
    { key: "tarvitsen", label: "Tarvitsen", count: grouped.tarvitsen?.length || 0 },
    { key: "lainaa", label: "Lainaa", count: grouped.lainaa?.length || 0 },
    { key: "ilmaista", label: "Ilmaista", count: grouped.ilmaista?.length || 0 },
    { key: "tapahtuma", label: "Tapahtuma", count: grouped.tapahtuma?.length || 0 },
  ];

  const visiblePosts = filter ? POSTS_V3.filter(p => p.type === filter) : POSTS_V3;

  return (
    <div style={f3.page}>
      <F3Styles/>
      <div className="tb-no-scroll" style={f3.scroll}>

        {/* Header */}
        <div style={f3.header}>
          <div style={f3.hLocLine}>
            <span style={f3.hLocPin}><span style={f3.hLocPinDot}/></span>
            Naapurustosi
          </div>
          <div style={f3.hTitleRow}>
            <h1 style={f3.hTitle}>{NEIGHBORHOOD.name}</h1>
            <div style={f3.hSubArea}>{NEIGHBORHOOD.area}</div>
          </div>
          <div style={f3.hPulse}>
            <div style={f3.pulseGroup}>
              <span style={f3.pulseDotPulse}/>
              <span><strong style={{fontWeight: 600}}>{NEIGHBORHOOD.online}</strong> naapuria juuri nyt</span>
            </div>
            <span style={f3.pulseDivider}>·</span>
            <span><strong style={{fontWeight: 600}}>{NEIGHBORHOOD.weeklyPosts}</strong> ilmoitusta tällä viikolla</span>
          </div>
        </div>

        {/* Search */}
        <div style={f3.searchRow}>
          <div className="tb-press" style={f3.searchInput}>
            <IconSearch size={18} color="var(--muted-foreground)" stroke={2}/>
            <span>Etsi naapurustosta…</span>
          </div>
          <div className="tb-press" style={f3.iconBtn}>
            <IconMap size={20} color="var(--foreground)" stroke={1.8}/>
          </div>
        </div>

        {/* Pills */}
        <div className="tb-pill-row" style={f3.pillRow}>
          {PILLS.map(p => {
            const isA = filter === p.key;
            return (
              <div key={p.label} className="tb-press" onClick={() => setFilter(p.key)}
                   style={{...f3.pill, ...(isA ? f3.pillActive : {})}}>
                <span>{p.label}</span>
                <span style={{...f3.pillCount, ...(isA ? f3.pillCountActive : {})}}>{p.count}</span>
              </div>
            );
          })}
        </div>

        {/* Building card (only on unfiltered view) */}
        {!filter && (
          <div className="tb-card" style={f3.bldCard}>
            <div style={f3.bldDecor}/>
            <div style={f3.bldIconWrap}>
              <IconHome size={20} color="var(--background)" stroke={1.8}/>
            </div>
            <div style={f3.bldText}>
              <div style={f3.bldLabel}>Taloyhtiösi</div>
              <div style={f3.bldName}>{BUILDING.shortName}</div>
              <div style={f3.bldStats}>
                <span style={f3.bldStatsStrong}>{BUILDING.neighbors}</span> naapuria ·
                {" "}<span style={f3.bldStatsStrong}>{BUILDING.newThisWeek}</span> uutta tällä viikolla
              </div>
            </div>
            <div style={f3.bldArrow}>
              <IconArrowUpRight size={16} color="var(--foreground)" stroke={2}/>
            </div>
          </div>
        )}

        {/* New posts banner */}
        {showNew && !filter && (
          <div className="tb-press" style={f3.newBanner} onClick={() => setShowNew(false)}>
            <span style={f3.newBannerDot}/>
            <span style={{flex: 1}}>4 uutta ilmoitusta lähistölläsi</span>
            <IconRefresh size={14} color="var(--muted-foreground)" stroke={1.8}/>
          </div>
        )}

        {/* Content */}
        {filter ? (
          <div style={{paddingTop: 24}}>
            <div style={{...f3.sortRow, marginBottom: 14}}>
              <span style={f3.sortLabel}>{visiblePosts.length} osumaa · 1.5 km säteellä</span>
              <span style={f3.sortBtn}>Suositus <IconChevronRight size={11} color="var(--foreground)"/></span>
            </div>
            <div style={f3.mosaic}>
              {visiblePosts.map(p => <PostCardV3 key={p.id} post={p}/>)}
            </div>
          </div>
        ) : (
          <>
            {order.filter(k => grouped[k]?.length).map((type, idx) => {
              const items = grouped[type];
              return (
                <div key={type} style={f3.section}>
                  <div style={f3.sectionHead}>
                    <div style={f3.sectionTitleWrap}>
                      <h2 style={f3.sectionTitle}>{CAT_LABELS[type]}</h2>
                      <span style={f3.sectionSub}>{items.length} lähellä · 1.5 km</span>
                    </div>
                    <span className="tb-press" style={f3.seeAllBtn} onClick={() => setFilter(type)}>
                      Näytä kaikki <IconChevronRight size={13} color="var(--foreground)"/>
                    </span>
                  </div>
                  <div className="tb-no-scroll" style={{
                    display: "flex", gap: 10, padding: "0 20px",
                    overflowX: "auto",
                  }}>
                    {items.map(p => (
                      <div key={p.id} style={{width: 230, flexShrink: 0}}>
                        <PostCardV3 post={p}/>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div style={{height: 40}}/>
      </div>

      <FloatingNav active={active} onChange={onTabChange} badges={{messages: 3}}/>
    </div>
  );
};

Object.assign(window, { FeedV3, PostCardV3 });
