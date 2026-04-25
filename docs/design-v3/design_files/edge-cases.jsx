/* global React, FloatingNav, IconRefresh, IconSearch, IconMap, IconPlus,
   IconWifiOff, IconImage, NEIGHBORHOOD */

// Edge cases — Helsinki Monochrome
//
// 1. SkeletonFeed — initial load with shimmer placeholders
// 2. NoNetwork    — connection error with retry CTA
// 3. EmptyFeed    — filtered to a category with zero results
// 4. NoImage      — post card variant with broken image / no image

const ec = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  scroll: { flex: 1, overflowY: "auto", paddingTop: 59 },
  header: { padding: "12px 20px 8px" },
  hLoc: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)",
  },
  hLocPin: {
    width: 14, height: 14, borderRadius: 7,
    background: "var(--success)", flexShrink: 0,
    boxShadow: "0 0 0 3px rgba(45,122,79,0.18)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  hPinDot: { width: 5, height: 5, borderRadius: 3, background: "white" },
  hTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 38, fontWeight: 600, letterSpacing: -1.4, lineHeight: 0.95,
    color: "var(--foreground)", margin: "4px 0 0",
  },
  searchRow: { padding: "16px 20px 0", display: "flex", gap: 8 },
  searchInput: {
    flex: 1, height: 48, borderRadius: 999,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 10, padding: "0 18px",
    color: "var(--muted-foreground)", fontSize: 15, fontWeight: 500,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24, flexShrink: 0,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)",
  },

  // Skeleton
  pillSk: {
    height: 36, width: 88, borderRadius: 999, flexShrink: 0,
  },
  pillRow: { display: "flex", gap: 6, padding: "20px 20px 0" },
  cardGrid: { padding: "24px 20px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  cardSk: {
    height: 270, borderRadius: 20, display: "flex", flexDirection: "column",
    overflow: "hidden", background: "var(--card)", border: "1px solid var(--border)",
  },
  cardSkImg: { height: 170 },
  cardSkBody: { padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  cardSkLine1: { height: 14, borderRadius: 4, width: "85%" },
  cardSkLine2: { height: 14, borderRadius: 4, width: "60%" },
  cardSkMeta: { height: 10, borderRadius: 4, width: "40%", marginTop: 6 },

  // Empty / Error blocks
  blockCenter: {
    flex: 1, padding: "60px 32px",
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", textAlign: "center", gap: 14,
  },
  blockIcon: {
    width: 72, height: 72, borderRadius: 36,
    background: "var(--surface-tinted)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  blockTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 24, fontWeight: 500, letterSpacing: -0.6, lineHeight: 1.15,
    color: "var(--foreground)", marginTop: 4, maxWidth: 280, textWrap: "balance",
  },
  blockBody: {
    fontSize: 14, lineHeight: 1.55, color: "var(--muted-foreground)",
    maxWidth: 280, textWrap: "pretty",
  },
  blockBtn: {
    marginTop: 8, padding: "12px 22px", borderRadius: 999,
    background: "var(--foreground)", color: "var(--background)",
    fontSize: 14, fontWeight: 600, letterSpacing: -0.1,
    display: "flex", alignItems: "center", gap: 8,
  },
  blockBtnGhost: {
    background: "transparent", color: "var(--muted-foreground)",
    fontSize: 13, fontWeight: 500, padding: "8px 16px",
  },
};

// 1. SKELETON FEED ─────────────────────────────────────────────────────────
const SkeletonFeed = () => (
  <div style={ec.page}>
    <div className="tb-no-scroll" style={ec.scroll}>
      <div style={ec.header}>
        <div style={ec.hLoc}>
          <span style={ec.hLocPin}><span style={ec.hPinDot}/></span>
          Naapurustosi
        </div>
        <h1 style={ec.hTitle}>{NEIGHBORHOOD.name}</h1>
        <div style={{
          fontSize: 12, color: "var(--tertiary-foreground)", marginTop: 8,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span className="tb-skeleton" style={{height: 10, width: 180, borderRadius: 4}}/>
        </div>
      </div>
      <div style={ec.searchRow}>
        <div style={ec.searchInput}>
          <IconSearch size={18} color="var(--muted-foreground)" stroke={2}/>
          <span>Etsi naapurustosta…</span>
        </div>
        <div style={ec.iconBtn}>
          <IconMap size={20} color="var(--foreground)" stroke={1.8}/>
        </div>
      </div>
      <div style={ec.pillRow}>
        {[1,2,3,4].map(i => <div key={i} className="tb-skeleton" style={ec.pillSk}/>)}
      </div>
      <div style={ec.cardGrid}>
        {[1,2,3,4].map(i => (
          <div key={i} style={ec.cardSk}>
            <div className="tb-skeleton" style={ec.cardSkImg}/>
            <div style={ec.cardSkBody}>
              <div className="tb-skeleton" style={ec.cardSkLine1}/>
              <div className="tb-skeleton" style={ec.cardSkLine2}/>
              <div className="tb-skeleton" style={ec.cardSkMeta}/>
            </div>
          </div>
        ))}
      </div>
    </div>
    <FloatingNav active="feed"/>
  </div>
);

// 2. NO NETWORK ────────────────────────────────────────────────────────────
const NoNetworkFeed = () => (
  <div style={ec.page}>
    <div style={ec.scroll}>
      <div style={ec.header}>
        <div style={ec.hLoc}>
          <span style={{...ec.hLocPin, background: "var(--tertiary-foreground)", boxShadow: "0 0 0 3px rgba(132,139,147,0.18)"}}>
            <span style={ec.hPinDot}/>
          </span>
          Ei yhteyttä
        </div>
        <h1 style={ec.hTitle}>{NEIGHBORHOOD.name}</h1>
      </div>
      <div style={ec.blockCenter}>
        <div style={{
          ...ec.blockIcon,
          background: "var(--warm-tint)",
          border: "1px solid var(--border)",
        }}>
          <IconWifiOff size={32} color="var(--foreground)" stroke={1.6}/>
        </div>
        <div style={ec.blockTitle}>Naapurusto on hetken pimeänä</div>
        <div style={ec.blockBody}>
          Verkkoyhteys katkesi kesken latauksen. Tarkistamme yhteyden ja
          jatkamme kun se palaa — voit myös päivittää itse.
        </div>
        <div className="tb-press" style={ec.blockBtn}>
          <IconRefresh size={14} color="var(--background)" stroke={2}/>
          Yritä uudelleen
        </div>
        <div className="tb-press" style={ec.blockBtnGhost}>
          Selaa offline-luettuja
        </div>
      </div>
    </div>
    <FloatingNav active="feed"/>
  </div>
);

// 3. EMPTY FEED (filtered to "Tapahtuma" with no results in radius) ────────
const EmptyFeed = () => (
  <div style={ec.page}>
    <div style={ec.scroll}>
      <div style={ec.header}>
        <div style={ec.hLoc}>
          <span style={ec.hLocPin}><span style={ec.hPinDot}/></span>
          Naapurustosi
        </div>
        <h1 style={ec.hTitle}>{NEIGHBORHOOD.name}</h1>
      </div>
      <div style={ec.searchRow}>
        <div style={ec.searchInput}>
          <IconSearch size={18} color="var(--muted-foreground)" stroke={2}/>
          <span>Etsi naapurustosta…</span>
        </div>
        <div style={ec.iconBtn}>
          <IconMap size={20} color="var(--foreground)" stroke={1.8}/>
        </div>
      </div>
      <div style={ec.pillRow}>
        <div style={{
          height: 36, padding: "0 14px", borderRadius: 999,
          background: "var(--foreground)", color: "var(--background)",
          fontSize: 13, fontWeight: 600, display: "flex",
          alignItems: "center", gap: 6,
        }}>
          Tapahtuma <span style={{color: "rgba(255,255,255,0.55)", fontSize: 11}}>0</span>
        </div>
      </div>

      <div style={ec.blockCenter}>
        <div style={ec.blockIcon}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="6" y="9" width="24" height="22" rx="3" stroke="var(--foreground)" strokeWidth="1.6"/>
            <path d="M6 14h24" stroke="var(--foreground)" strokeWidth="1.6"/>
            <rect x="11" y="5" width="2" height="6" rx="1" fill="var(--foreground)"/>
            <rect x="23" y="5" width="2" height="6" rx="1" fill="var(--foreground)"/>
          </svg>
        </div>
        <div style={ec.blockTitle}>Ei tapahtumia juuri nyt</div>
        <div style={ec.blockBody}>
          Kalliossa ei ole avoimia tapahtumia 1.5 km säteellä. Voit luoda oman
          tai laajentaa hakua naapuruston rajojen ulkopuolelle.
        </div>
        <div className="tb-press" style={ec.blockBtn}>
          <IconPlus size={14} color="var(--background)" stroke={2}/>
          Luo tapahtuma
        </div>
        <div className="tb-press" style={ec.blockBtnGhost}>
          Laajenna 3 km säteelle →
        </div>
      </div>
    </div>
    <FloatingNav active="feed"/>
  </div>
);

// 4. NO IMAGE — post card with placeholder when image fails to load ───────
const NoImageCard = () => (
  <div style={{
    width: 220, borderRadius: 20, border: "1px solid var(--border)",
    background: "var(--card)", overflow: "hidden",
    fontFamily: "'Instrument Sans', sans-serif",
  }}>
    <div style={{
      aspectRatio: "4 / 5", background: "var(--surface-tinted)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 6, position: "relative", overflow: "hidden",
    }}>
      {/* faint decorative shapes */}
      <div style={{
        position: "absolute", top: -10, right: -10, width: 70, height: 70,
        borderRadius: 35, background: "var(--warm-tint)", opacity: 0.6,
      }}/>
      <div style={{
        position: "absolute", bottom: -20, left: -20, width: 60, height: 60,
        borderRadius: 30, background: "var(--card)", opacity: 0.7,
      }}/>
      <IconImage size={28} color="var(--tertiary-foreground)" stroke={1.6}/>
      <div style={{fontSize: 11, color: "var(--tertiary-foreground)", fontWeight: 500, position: "relative"}}>
        Ei kuvaa
      </div>
    </div>
    <div style={{padding: 14, display: "flex", flexDirection: "column", gap: 8}}>
      <div style={{
        position: "absolute",
      }}/>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
        color: "var(--muted-foreground)",
      }}>Tarvitsen</div>
      <div style={{
        fontFamily: "'Bricolage Grotesque', serif",
        fontSize: 15, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.2,
        color: "var(--foreground)",
      }}>
        Kuka olisi valmis vaihtamaan parkkipaikkaa?
      </div>
      <div style={{fontSize: 11, color: "var(--muted-foreground)", marginTop: 2}}>
        Aki H. · 470 m · 11 t
      </div>
    </div>
  </div>
);

Object.assign(window, { SkeletonFeed, NoNetworkFeed, EmptyFeed, NoImageCard });
