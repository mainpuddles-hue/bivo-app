/* global React, FloatingNav, Pressable, Avatar, CATEGORY,
   IconArrowLeft, IconHeart, IconHeartFill, IconBookmark, IconBookmarkFill,
   IconShareSquare, IconChevronRight, IconStar, IconShieldCheck, IconMapPin,
   IconClock, IconMessage, IconMore */

const { useState: useState_PD } = React;

// Post Detail v2 — Helsinki Monochrome
//
// vs current `app/post/[id].tsx`:
// - Single hero image (16:9), category pill overlaid
// - Trust signals tied to author row (verified shield + 4.8★ inline)
// - Description below, no "Read more" chevrons — assume full text visible by default
// - Sticky bottom action bar: like + save + "Lähetä viesti" (was scattered icons)
// - Removed page-level "boosted" pill — that's a feed-only signal

const dStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 100 },
  hero: { position: "relative", width: "100%", aspectRatio: "16/10", background: "var(--muted)" },
  heroImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  topRow: {
    position: "absolute", top: 12, left: 16, right: 16,
    display: "flex", justifyContent: "space-between",
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    background: "rgba(255,255,255,0.92)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#1A1D1F", backdropFilter: "blur(8px)",
  },
  catPill: {
    position: "absolute", left: 16, bottom: 16,
    padding: "6px 12px", borderRadius: 999,
    background: "rgba(255,255,255,0.92)",
    color: "#1A1D1F", fontSize: 11, fontWeight: 600,
    letterSpacing: 0.4, textTransform: "uppercase",
  },
  body: { padding: "20px" },
  title: {
    fontSize: 26, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.15,
    color: "var(--foreground)", fontFamily: "var(--font-heading)", margin: 0,
  },
  metaRow: {
    display: "flex", alignItems: "center", gap: 10,
    marginTop: 10, fontSize: 13, color: "var(--muted-foreground)",
  },
  pricePill: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "6px 12px", marginTop: 14, borderRadius: 999,
    background: "var(--surface-tinted)", color: "var(--foreground)",
    fontSize: 14, fontWeight: 700,
  },
  desc: {
    marginTop: 18, fontSize: 15, lineHeight: 1.55,
    color: "var(--foreground)",
  },

  authorCard: {
    margin: "20px", padding: 16, borderRadius: 20,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 12,
  },
  authorMeta: { flex: 1, minWidth: 0 },
  authorName: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 15, fontWeight: 600, color: "var(--foreground)",
  },
  authorSub: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: 12, color: "var(--muted-foreground)", marginTop: 2,
  },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "12px 16px",
    paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0))",
    background: "var(--card)", borderTop: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 10,
  },
  actionBtn: {
    width: 44, height: 44, borderRadius: 22,
    background: "var(--background)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)", flexShrink: 0,
  },
  primaryBtn: {
    flex: 1, height: 48, borderRadius: 999,
    background: "var(--foreground)", color: "var(--primary-foreground)",
    fontSize: 15, fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  },
};

const PostDetailV2 = ({ onBack = () => {} }) => {
  const [liked, setLiked] = useState_PD(false);
  const [saved, setSaved] = useState_PD(true);
  return (
    <div style={dStyles.page}>
      <div style={dStyles.scroll}>
        <div style={dStyles.hero}>
          <img style={dStyles.heroImg} src="https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=900&q=85" alt=""/>
          <div style={dStyles.topRow}>
            <Pressable style={dStyles.iconBtn} onPress={onBack}>
              <IconArrowLeft size={18} color="#1A1D1F"/>
            </Pressable>
            <Pressable style={dStyles.iconBtn}>
              <IconMore size={18} color="#1A1D1F"/>
            </Pressable>
          </div>
          <span style={dStyles.catPill}>Lainaa</span>
        </div>

        <div style={dStyles.body}>
          <h1 style={dStyles.title}>Bosch porakone — toimii kuin uusi</h1>
          <div style={dStyles.metaRow}>
            <span style={{display: "flex", alignItems: "center", gap: 4}}>
              <IconMapPin size={13} color="var(--muted-foreground)"/> Vallila
            </span>
            <span>·</span>
            <span style={{display: "flex", alignItems: "center", gap: 4}}>
              <IconClock size={13} color="var(--muted-foreground)"/> 1 päivä sitten
            </span>
          </div>
          <span style={dStyles.pricePill}>5 € / päivä · 30 € vakuus</span>
          <p style={dStyles.desc}>
            18V akkuporakone, hyvässä kunnossa. Mukana 2 akkua + laturi + kärkien kasetti
            (puu, metalli, betoni). Nouto Vallilasta arkisin klo 17–20, viikonloput
            sopimuksen mukaan. Ilmoita reilusti, jos tarvitset useammaksi päiväksi.
          </p>
        </div>

        <div style={dStyles.authorCard}>
          <Avatar src="https://i.pravatar.cc/100?img=33" name="Tuomas L." size={48}/>
          <div style={dStyles.authorMeta}>
            <div style={dStyles.authorName}>
              Tuomas L. <IconShieldCheck size={14} color="var(--success)"/>
            </div>
            <div style={dStyles.authorSub}>
              <IconStar size={12} color="var(--foreground)"/>
              <span style={{color: "var(--foreground)", fontWeight: 600}}>4.8</span>
              <span>· 23 arviota · vastaa min</span>
            </div>
          </div>
          <IconChevronRight size={18} color="var(--muted-foreground)"/>
        </div>
      </div>

      <div style={dStyles.bottomBar}>
        <Pressable style={dStyles.actionBtn} onPress={() => setLiked(!liked)}>
          {liked
            ? <IconHeartFill size={18} color="var(--destructive)"/>
            : <IconHeart size={18} color="var(--foreground)"/>}
        </Pressable>
        <Pressable style={dStyles.actionBtn} onPress={() => setSaved(!saved)}>
          {saved
            ? <IconBookmarkFill size={18} color="var(--foreground)"/>
            : <IconBookmark size={18} color="var(--foreground)"/>}
        </Pressable>
        <Pressable style={dStyles.primaryBtn}>
          <IconMessage size={16} color="var(--primary-foreground)"/>
          Lähetä viesti
        </Pressable>
      </div>
    </div>
  );
};

Object.assign(window, { PostDetailV2 });
