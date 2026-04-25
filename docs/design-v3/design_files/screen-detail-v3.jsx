/* global React, Pressable, POSTS_V3, Avatar,
   IconArrowLeft, IconHeart, IconHeartFill, IconBookmark, IconBookmarkFill,
   IconChevronRight, IconStar, IconShieldCheck, IconMapPin, IconClock,
   IconMessage, IconMore, IconUsers */

const { useState: uS_PD3 } = React;

// Post Detail v3 — Bosch porakone (post p3 from seed)
//
// Layout rhythm:
//   1. Hero image (1:1) with gradient + back/save/more controls floating on top
//   2. Title block (Bricolage Grotesque, 28px) + price as a tabular pill
//   3. Description (4-5 lines, generous line-height)
//   4. Quick facts row (3 columns: distance, deposit, response time)
//   5. Author block — separated card with rating breakdown
//   6. Sticky CTA bar (Like + Save + "Lähetä viesti")

const pd3 = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 100 },

  // Hero
  hero: { position: "relative", width: "100%", aspectRatio: "1 / 1", background: "var(--muted)" },
  heroImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  heroOverlay: {
    position: "absolute", inset: 0,
    background: "linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0) 30%)",
    pointerEvents: "none",
  },
  topBar: {
    position: "absolute", top: 59 + 8, left: 16, right: 16,
    display: "flex", justifyContent: "space-between",
  },
  iconBtnGlass: {
    width: 40, height: 40, borderRadius: 20,
    background: "rgba(255,255,255,0.92)",
    color: "#1A1D1F",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  iconBtnGroup: { display: "flex", gap: 8 },
  pageDots: {
    position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
    display: "flex", gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.5)" },
  dotActive: { width: 16, background: "white" },
  catChipHero: {
    position: "absolute", top: 59 + 8 + 48, left: 16,
    padding: "5px 10px", borderRadius: 999,
    background: "rgba(255,255,255,0.92)", color: "#1A1D1F",
    fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
    backdropFilter: "blur(12px)",
  },

  // Body
  body: { padding: "20px 20px 0" },
  titleRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  title: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 28, fontWeight: 500, letterSpacing: -0.7, lineHeight: 1.1,
    color: "var(--foreground)", margin: 0, flex: 1,
  },
  pricePill: {
    flexShrink: 0,
    padding: "8px 14px", borderRadius: 12,
    background: "var(--foreground)", color: "var(--background)",
    fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
    fontFeatureSettings: '"tnum" on, "lnum" on',
    whiteSpace: "nowrap",
  },
  metaRow: {
    display: "flex", alignItems: "center", gap: 10,
    fontSize: 13, color: "var(--muted-foreground)",
    marginTop: 12, fontFeatureSettings: '"tnum" on',
  },
  metaItem: { display: "flex", alignItems: "center", gap: 5 },

  desc: {
    marginTop: 18, fontSize: 15, lineHeight: 1.6,
    color: "var(--foreground)",
  },

  // Quick facts grid
  factsGrid: {
    margin: "20px 0 0", padding: "16px 0",
    borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
  },
  fact: { display: "flex", flexDirection: "column", gap: 3, padding: "0 12px", textAlign: "left", borderRight: "1px solid var(--border)" },
  factLast: { borderRight: "none" },
  factLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
    color: "var(--tertiary-foreground)",
  },
  factValue: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 17, fontWeight: 500, letterSpacing: -0.3,
    color: "var(--foreground)",
    fontFeatureSettings: '"tnum" on, "lnum" on',
  },

  // Author
  authorCard: {
    margin: "20px 20px", padding: 16, borderRadius: 20,
    background: "var(--card)", border: "1px solid var(--border)",
  },
  authorHead: { display: "flex", alignItems: "center", gap: 12 },
  authorMeta: { flex: 1, minWidth: 0 },
  authorName: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 17, fontWeight: 500, letterSpacing: -0.3,
    color: "var(--foreground)", lineHeight: 1.2,
    display: "flex", alignItems: "center", gap: 6,
  },
  authorSub: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 12, color: "var(--muted-foreground)", marginTop: 3,
  },
  authorStars: {
    display: "flex", alignItems: "center", gap: 3,
    color: "var(--foreground)", fontWeight: 600,
  },
  authorMore: {
    width: 36, height: 36, borderRadius: 18,
    background: "var(--surface-tinted)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)",
  },
  ratingBars: {
    marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)",
    display: "flex", flexDirection: "column", gap: 6,
  },
  ratingRow: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 11, color: "var(--muted-foreground)",
  },
  ratingLabel: { width: 12, color: "var(--foreground)", fontWeight: 600, textAlign: "right" },
  barTrack: { flex: 1, height: 4, borderRadius: 2, background: "var(--surface-tinted)", overflow: "hidden" },
  barFill: { height: "100%", background: "var(--foreground)", borderRadius: 2 },
  ratingCount: { width: 22, color: "var(--tertiary-foreground)", textAlign: "right" },

  // Location card
  locCard: {
    margin: "0 20px 20px", padding: 0, borderRadius: 20,
    background: "var(--card)", border: "1px solid var(--border)",
    overflow: "hidden",
  },
  locMap: {
    height: 130, position: "relative",
    background: "linear-gradient(135deg, #E8EAEC 0%, #DDE1E5 100%)",
    overflow: "hidden",
  },
  locGrid: {
    position: "absolute", inset: 0,
    backgroundImage:
      "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), " +
      "linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
    backgroundSize: "32px 32px",
  },
  locStreet1: {
    position: "absolute", top: "55%", left: 0, right: 0, height: 8,
    background: "rgba(255,255,255,0.85)", transform: "rotate(-8deg)",
  },
  locStreet2: {
    position: "absolute", top: 0, bottom: 0, left: "62%", width: 6,
    background: "rgba(255,255,255,0.85)",
  },
  locPin: {
    position: "absolute", top: "calc(50% - 12px)", left: "calc(62% - 12px)",
    width: 24, height: 24, borderRadius: 12,
    background: "var(--foreground)", color: "var(--background)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 0 0 6px rgba(26,29,31,0.15), 0 2px 6px rgba(0,0,0,0.2)",
  },
  locText: { padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  locName: {
    fontSize: 14, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3,
  },
  locDistance: { fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 },

  // CTA bar
  ctaBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "10px 14px",
    paddingBottom: "calc(10px + 24px)", // home indicator
    background: "var(--card)",
    borderTop: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 8,
    boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
  },
  ctaIcon: {
    width: 48, height: 48, borderRadius: 24, flexShrink: 0,
    background: "var(--background)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)",
    transition: "all 140ms ease",
  },
  ctaPrimary: {
    flex: 1, height: 52, borderRadius: 26,
    background: "var(--foreground)", color: "var(--background)",
    fontSize: 15, fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontFamily: "'Instrument Sans', sans-serif",
    letterSpacing: -0.1,
  },
};

const PostDetailV3 = ({ onBack = () => {}, post }) => {
  const p = post || POSTS_V3.find(x => x.id === "p3");
  const [liked, setLiked] = uS_PD3(false);
  const [saved, setSaved] = uS_PD3(true);

  return (
    <div style={pd3.page}>
      <div style={pd3.scroll} className="tb-no-scroll">

        {/* Hero */}
        <div style={pd3.hero}>
          <img style={pd3.heroImg} src={p.image} alt=""/>
          <div style={pd3.heroOverlay}/>

          <div style={pd3.topBar}>
            <div className="tb-press" style={pd3.iconBtnGlass} onClick={onBack}>
              <IconArrowLeft size={18} color="#1A1D1F" stroke={2}/>
            </div>
            <div style={pd3.iconBtnGroup}>
              <div className="tb-press" style={pd3.iconBtnGlass}>
                {saved
                  ? <IconBookmarkFill size={16} color="#1A1D1F"/>
                  : <IconBookmark size={16} color="#1A1D1F" stroke={2}/>}
              </div>
              <div className="tb-press" style={pd3.iconBtnGlass}>
                <IconMore size={18} color="#1A1D1F"/>
              </div>
            </div>
          </div>

          <span style={pd3.catChipHero}>{p.type === "lainaa" ? "Lainaa" : "Tarjoan"}</span>

          <div style={pd3.pageDots}>
            <span style={{...pd3.dot, ...pd3.dotActive}}/>
            <span style={pd3.dot}/>
            <span style={pd3.dot}/>
          </div>
        </div>

        {/* Body */}
        <div style={pd3.body}>
          <div style={pd3.titleRow}>
            <h1 style={pd3.title}>{p.title}</h1>
            <span style={pd3.pricePill}>{p.price}</span>
          </div>
          <div style={pd3.metaRow}>
            <span style={pd3.metaItem}>
              <IconMapPin size={13} color="var(--muted-foreground)" stroke={1.8}/> {p.address}, {p.neighborhood}
            </span>
            <span style={{color: "var(--tertiary-foreground)"}}>·</span>
            <span style={pd3.metaItem}>
              <IconClock size={13} color="var(--muted-foreground)" stroke={1.8}/> {p.time}
            </span>
          </div>
          <p style={pd3.desc}>{p.body}</p>

          {/* Quick facts */}
          <div style={pd3.factsGrid}>
            <div style={pd3.fact}>
              <span style={pd3.factLabel}>Etäisyys</span>
              <span style={pd3.factValue}>{p.distance}</span>
            </div>
            <div style={pd3.fact}>
              <span style={pd3.factLabel}>Vakuus</span>
              <span style={pd3.factValue}>{p.deposit?.split(" ")[0] ?? "—"} €</span>
            </div>
            <div style={{...pd3.fact, ...pd3.factLast}}>
              <span style={pd3.factLabel}>Vastausaika</span>
              <span style={pd3.factValue}>{p.responseTime || "~min"}</span>
            </div>
          </div>
        </div>

        {/* Author */}
        <div style={pd3.authorCard}>
          <div style={pd3.authorHead}>
            <Avatar src={p.avatar} name={p.author} size={52}/>
            <div style={pd3.authorMeta}>
              <div style={pd3.authorName}>
                {p.authorFull}
                {p.verified && <IconShieldCheck size={14} color="var(--success)" stroke={2.4}/>}
              </div>
              <div style={pd3.authorSub}>
                <span style={pd3.authorStars}>
                  <IconStar size={11} color="var(--foreground)"/>
                  {p.rating?.toFixed(1) ?? "—"}
                </span>
                <span style={{color: "var(--tertiary-foreground)"}}>·</span>
                <span>{p.reviews ?? 0} arviota</span>
                <span style={{color: "var(--tertiary-foreground)"}}>·</span>
                <span>Vallila</span>
              </div>
            </div>
            <div className="tb-press" style={pd3.authorMore}>
              <IconChevronRight size={16} color="var(--foreground)"/>
            </div>
          </div>

          <div style={pd3.ratingBars}>
            {[
              { stars: 5, count: 21, pct: 0.92 },
              { stars: 4, count: 5, pct: 0.18 },
              { stars: 3, count: 2, pct: 0.07 },
            ].map(r => (
              <div key={r.stars} style={pd3.ratingRow}>
                <span style={pd3.ratingLabel}>{r.stars}</span>
                <IconStar size={9} color="var(--foreground)"/>
                <div style={pd3.barTrack}>
                  <div style={{...pd3.barFill, width: `${r.pct * 100}%`}}/>
                </div>
                <span style={pd3.ratingCount}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Location */}
        <div style={pd3.locCard}>
          <div style={pd3.locMap}>
            <div style={pd3.locGrid}/>
            <div style={pd3.locStreet1}/>
            <div style={pd3.locStreet2}/>
            <div style={pd3.locPin}>
              <IconMapPin size={12} color="var(--background)" stroke={2.4}/>
            </div>
          </div>
          <div style={pd3.locText}>
            <div>
              <div style={pd3.locName}>{p.address}</div>
              <div style={pd3.locDistance}>{p.distance} sinusta · noudettavissa arkisin klo 17–20</div>
            </div>
            <IconChevronRight size={18} color="var(--muted-foreground)"/>
          </div>
        </div>
      </div>

      {/* CTA bar */}
      <div style={pd3.ctaBar}>
        <div className="tb-press" style={pd3.ctaIcon} onClick={() => setLiked(!liked)}>
          {liked
            ? <IconHeartFill size={18} color="var(--destructive)"/>
            : <IconHeart size={18} color="var(--foreground)" stroke={2}/>}
        </div>
        <div className="tb-press" style={pd3.ctaPrimary}>
          <IconMessage size={16} color="var(--background)" stroke={2}/>
          Lähetä viesti
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PostDetailV3 });
