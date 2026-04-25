/* global React, FloatingNav, Pressable, POSTS, CATEGORY,
   IconArrowLeft, IconSearch, IconClose, IconClock, IconMapPin, IconFilter, IconHash */

const { useState: useState_S } = React;

// Search v2 — instant input, recent + suggested chips, results ungrouped 2-col grid.
//
// vs current `app/search.tsx`:
// - Sticky search input at top (was scrolled away with content)
// - Removed "filter modal" trigger; filters are inline collapsible
// - Recent searches as chips (tappable) instead of list rows
// - Suggested categories as chips with counts ("Tarvitsen · 24")
// - Empty-state never shown — always have suggestions

const sStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  topBar: {
    padding: "16px 20px 12px", display: "flex", alignItems: "center", gap: 8,
    background: "var(--background)", position: "sticky", top: 0, zIndex: 5,
  },
  back: {
    width: 40, height: 40, borderRadius: 20,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--foreground)", flexShrink: 0,
  },
  input: {
    flex: 1, height: 44, padding: "0 14px", borderRadius: 999,
    background: "var(--card)", border: "1px solid var(--border-strong)",
    display: "flex", alignItems: "center", gap: 8,
    color: "var(--foreground)", fontSize: 14,
  },
  cursor: {
    width: 1, height: 18, background: "var(--foreground)",
    animation: "blink 1s step-end infinite",
  },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 120 },

  group: { padding: "16px 20px 4px" },
  groupTitle: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase",
    color: "var(--muted-foreground)", marginBottom: 12,
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 36, padding: "0 14px", borderRadius: 999,
    display: "flex", alignItems: "center", gap: 6,
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontSize: 13, fontWeight: 600,
  },
  chipMeta: { color: "var(--muted-foreground)", fontWeight: 500 },

  resultsHead: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    padding: "20px 20px 12px",
  },
  resultsTitle: {
    fontSize: 22, fontWeight: 700, letterSpacing: -0.4,
    color: "var(--foreground)", fontFamily: "var(--font-heading)",
  },
  resultsCount: { fontSize: 13, color: "var(--muted-foreground)" },
  grid: { padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
};

const SearchV2 = ({ onTabChange = () => {}, query = "porakone" }) => {
  const recent = ["porakone", "lainaa pyörää", "lapsille leluja", "muuttoapu"];
  const suggested = [
    { label: "Tarvitsen", count: 24, type: "tarvitsen" },
    { label: "Tarjoan", count: 31, type: "tarjoan" },
    { label: "Ilmaista", count: 12, type: "ilmaista" },
    { label: "Lainaa", count: 8, type: "lainaa" },
    { label: "Tapahtumat", count: 5, type: "tapahtuma" },
  ];
  const results = POSTS.slice(0, 6);

  return (
    <div style={sStyles.page}>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
      <div style={sStyles.topBar}>
        <Pressable style={sStyles.back} onPress={() => onTabChange("feed")}>
          <IconArrowLeft size={18} color="var(--foreground)"/>
        </Pressable>
        <div style={sStyles.input}>
          <IconSearch size={16} color="var(--muted-foreground)"/>
          <span>{query}</span>
          <span style={sStyles.cursor}/>
          <span style={{flex: 1}}/>
          <IconClose size={14} color="var(--muted-foreground)"/>
        </div>
      </div>

      <div style={sStyles.scroll}>
        <div style={sStyles.group}>
          <div style={sStyles.groupTitle}>Aiemmat haut</div>
          <div style={sStyles.chips}>
            {recent.map(q => (
              <Pressable key={q} style={sStyles.chip}>
                <IconClock size={12} color="var(--muted-foreground)"/> {q}
              </Pressable>
            ))}
          </div>
        </div>

        <div style={sStyles.group}>
          <div style={sStyles.groupTitle}>Selaa kategorioittain</div>
          <div style={sStyles.chips}>
            {suggested.map(s => (
              <Pressable key={s.label} style={sStyles.chip}>
                {s.label} <span style={sStyles.chipMeta}>· {s.count}</span>
              </Pressable>
            ))}
          </div>
        </div>

        <div style={sStyles.resultsHead}>
          <span style={sStyles.resultsTitle}>Tulokset</span>
          <span style={sStyles.resultsCount}>{results.length} osumaa</span>
        </div>
        <div style={sStyles.grid}>
          {results.map(p => <PostCardV2 key={p.id} post={p}/>)}
        </div>
        <div style={{height: 40}}/>
      </div>

      <FloatingNav active="feed" onChange={onTabChange}/>
    </div>
  );
};

Object.assign(window, { SearchV2 });
