/* global React, Pressable, Avatar,
   IconClose, IconCamera, IconImage, IconChevronRight, IconMapPin,
   IconGift, IconHandHelping, IconHeart, IconBookOpen, IconCalendar, IconPlus,
   IconCheck, IconSparkles, IconArrowLeft, IconMore */

const { useState: uS_C3 } = React;

// Create v3 — single-screen, category-aware, finished detail
//
// Layout rhythm:
//   1. Top bar: Close · "Uusi ilmoitus" · Esikatsele
//   2. Title input (large, Bricolage, autoFocus visual cue)
//   3. Category picker — segmented "chip" cards with icon + label
//   4. Photo block (1 large + 3 small, drag-to-add affordance)
//   5. Description textarea
//   6. Conditional fields: hinta + vakuus (lainaa/tarjoan), eventDate (tapahtuma)
//   7. Location row + nouto-row
//   8. Sticky bottom: Tallenna luonnos · Julkaise

const c3 = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },

  // Top bar
  topBar: {
    paddingTop: 59 + 4, paddingBottom: 12, paddingLeft: 16, paddingRight: 16,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "var(--background)",
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  topTitle: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 17, fontWeight: 500, letterSpacing: -0.3, color: "var(--foreground)",
  },
  topAction: {
    fontSize: 14, fontWeight: 600, color: "var(--foreground)",
    letterSpacing: -0.1,
  },

  scroll: { flex: 1, overflowY: "auto", paddingBottom: 130 },

  // Title input — looks like a real text field but big
  titleBlock: { padding: "8px 20px 4px" },
  titleInput: {
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 30, fontWeight: 500, letterSpacing: -0.9, lineHeight: 1.1,
    color: "var(--foreground)", outline: "none", border: "none",
    background: "transparent", padding: 0, margin: 0,
    minHeight: 70,
    display: "flex", alignItems: "flex-start",
  },
  titleEmpty: { color: "var(--tertiary-foreground)" },
  titleCaret: {
    width: 2, height: 32, background: "var(--foreground)",
    display: "inline-block", verticalAlign: "middle",
    marginLeft: 2,
    animation: "tb-caret 1.1s steps(2) infinite",
  },

  // Group label
  groupLabel: {
    padding: "0 20px",
    fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase",
    color: "var(--tertiary-foreground)",
    margin: "20px 0 12px",
  },

  // Category — full-width row of icon-cards
  catGrid: {
    padding: "0 20px",
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  catCard: {
    padding: "14px 8px",
    borderRadius: 16, background: "var(--card)",
    border: "1px solid var(--border)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    fontSize: 13, fontWeight: 500, color: "var(--foreground)",
    transition: "all 160ms cubic-bezier(.2,.8,.2,1)",
  },
  catIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    background: "var(--surface-tinted)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 160ms ease",
  },
  catCardActive: {
    background: "var(--foreground)", color: "var(--background)",
    border: "1px solid var(--foreground)",
    transform: "translateY(-1px)",
    boxShadow: "0 4px 12px rgba(26,29,31,0.12)",
  },
  catIconWrapActive: {
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  catLabelStrong: { fontWeight: 600 },

  // Photos — 1 big + 3 small grid (4 wide × 2 tall on the small side)
  photosWrap: { padding: "0 20px" },
  photosGrid: {
    display: "grid",
    gridTemplateColumns: "1.6fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    gap: 8,
    height: 220,
  },
  photoBig: {
    gridRow: "1 / 3", gridColumn: "1 / 2",
    borderRadius: 18,
    background: "var(--surface-tinted)",
    border: "2px dashed var(--border-strong)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 8, color: "var(--muted-foreground)",
    position: "relative", overflow: "hidden",
    transition: "all 160ms ease",
  },
  photoBigDot1: {
    position: "absolute", width: 80, height: 80, borderRadius: 40,
    background: "var(--warm-tint)", top: -20, right: -20, opacity: 0.6,
  },
  photoBigDot2: {
    position: "absolute", width: 50, height: 50, borderRadius: 25,
    background: "var(--card)", bottom: -10, left: -10, opacity: 0.6,
  },
  photoBigInner: {
    position: "relative", display: "flex", flexDirection: "column",
    alignItems: "center", gap: 6,
  },
  photoSmall: {
    borderRadius: 12,
    background: "var(--surface-tinted)",
    border: "1px dashed var(--border-strong)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--muted-foreground)",
  },
  photoLabel: {
    fontSize: 12, fontWeight: 600, color: "var(--foreground)",
  },
  photoHint: {
    fontSize: 10, color: "var(--muted-foreground)",
    marginTop: 0,
  },
  photoCount: {
    fontSize: 11, color: "var(--muted-foreground)",
    padding: "10px 0 0",
    display: "flex", alignItems: "center", gap: 6,
  },

  // Description
  descBlock: { padding: "0 20px" },
  descArea: {
    width: "100%", boxSizing: "border-box",
    padding: "14px 16px", borderRadius: 16,
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontSize: 14, lineHeight: 1.55,
    fontFamily: "'Instrument Sans', sans-serif",
    minHeight: 110,
    transition: "border-color 160ms ease",
  },
  descPlaceholder: { color: "var(--tertiary-foreground)" },
  descMeta: {
    display: "flex", justifyContent: "space-between", padding: "6px 4px 0",
    fontSize: 11, color: "var(--tertiary-foreground)",
    fontFeatureSettings: '"tnum" on',
  },

  // Price block
  priceRow: { padding: "0 20px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 },
  priceField: {
    padding: "14px 16px", borderRadius: 16,
    background: "var(--card)", border: "1px solid var(--border)",
  },
  priceLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
    color: "var(--tertiary-foreground)",
  },
  priceValue: {
    marginTop: 4, display: "flex", alignItems: "baseline", gap: 4,
    fontFamily: "'Bricolage Grotesque', serif",
    fontSize: 22, fontWeight: 500, letterSpacing: -0.5,
    color: "var(--foreground)",
    fontFeatureSettings: '"tnum" on',
  },
  priceUnit: {
    fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500,
    fontFamily: "'Instrument Sans', sans-serif", letterSpacing: 0,
  },

  // Row field (location, nouto)
  rowField: {
    margin: "0 20px", padding: "14px 16px", borderRadius: 16,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 12,
  },
  rowFieldIcon: {
    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
    background: "var(--surface-tinted)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  rowFieldBody: { flex: 1, minWidth: 0 },
  rowFieldLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
    color: "var(--tertiary-foreground)",
  },
  rowFieldValue: {
    fontSize: 14, fontWeight: 600, color: "var(--foreground)",
    marginTop: 2, lineHeight: 1.3,
  },
  rowFieldSub: {
    fontSize: 12, color: "var(--muted-foreground)", marginTop: 2,
  },

  // Bottom CTA
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "10px 14px",
    paddingBottom: "calc(10px + 24px)",
    background: "var(--card)", borderTop: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 8,
  },
  bottomDraft: {
    height: 52, padding: "0 20px", borderRadius: 26,
    background: "var(--background)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontSize: 14, fontWeight: 500,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bottomPublish: {
    flex: 1, height: 52, borderRadius: 26,
    background: "var(--foreground)", color: "var(--background)",
    fontSize: 15, fontWeight: 600, letterSpacing: -0.1,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  },

  caretAnim: `@keyframes tb-caret { 50% { opacity: 0; } }`,
};

const CATS_C3 = [
  { key: "tarjoan",   label: "Tarjoan",   I: IconGift },
  { key: "tarvitsen", label: "Tarvitsen", I: IconHandHelping },
  { key: "lainaa",    label: "Lainaa",    I: IconBookOpen },
  { key: "ilmaista",  label: "Ilmaista",  I: IconHeart },
  { key: "tapahtuma", label: "Tapahtuma", I: IconCalendar },
];

const CreateV3 = ({ onClose = () => {} }) => {
  const [cat, setCat] = uS_C3("lainaa");
  const [title, setTitle] = uS_C3("Bosch Professional 18V akkuporakone");
  const [desc] = uS_C3("Mukana 2 akkua + laturi + kärkikasetti. Käytetty kotiremonttiin viime kesänä, hyvässä kunnossa. Nouto Sturenkadulta arkisin klo 17 jälkeen.");

  const showPrice = cat === "lainaa" || cat === "tarjoan";
  const showEvent = cat === "tapahtuma";

  return (
    <div style={c3.page}>
      <style>{c3.caretAnim}</style>

      <div style={c3.topBar}>
        <div className="tb-press" style={c3.closeBtn} onClick={onClose}>
          <IconClose size={16} color="var(--foreground)" stroke={2}/>
        </div>
        <span style={c3.topTitle}>Uusi ilmoitus</span>
        <span style={c3.topAction}>Esikatsele</span>
      </div>

      <div style={c3.scroll} className="tb-no-scroll">

        {/* Title */}
        <div style={c3.titleBlock}>
          <div style={c3.titleInput}>
            <span>{title}</span>
            <span style={c3.titleCaret}/>
          </div>
        </div>

        {/* Category */}
        <div style={c3.groupLabel}>Mitä julkaiset?</div>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          gap: 6, padding: "0 20px",
        }}>
          {CATS_C3.map(c => {
            const isA = cat === c.key;
            return (
              <div key={c.key} className="tb-press"
                   onClick={() => setCat(c.key)}
                   style={{
                     ...c3.catCard,
                     padding: "12px 4px",
                     ...(isA ? c3.catCardActive : {}),
                   }}>
                <div style={{
                  ...c3.catIconWrap,
                  width: 32, height: 32, borderRadius: 10,
                  ...(isA ? c3.catIconWrapActive : {})
                }}>
                  <c.I size={16}
                    color={isA ? "var(--background)" : "var(--foreground)"}
                    stroke={1.8}/>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: isA ? 600 : 500,
                  letterSpacing: -0.1,
                }}>{c.label}</span>
              </div>
            );
          })}
        </div>

        {/* Photos */}
        <div style={c3.groupLabel}>
          Kuvat
          <span style={{
            fontSize: 10, color: "var(--tertiary-foreground)",
            fontWeight: 500, letterSpacing: 0.4, marginLeft: 8,
            textTransform: "none",
          }}>
            min 1, max 6
          </span>
        </div>
        <div style={c3.photosWrap}>
          <div style={c3.photosGrid}>
            <div className="tb-press" style={c3.photoBig}>
              <div style={c3.photoBigDot1}/>
              <div style={c3.photoBigDot2}/>
              <div style={c3.photoBigInner}>
                <IconCamera size={28} color="var(--foreground)" stroke={1.6}/>
                <div style={c3.photoLabel}>Lisää pääkuva</div>
                <div style={c3.photoHint}>Kuvaa hyvässä valossa</div>
              </div>
            </div>
            <div className="tb-press" style={c3.photoSmall}>
              <IconImage size={20} color="var(--muted-foreground)" stroke={1.8}/>
            </div>
            <div className="tb-press" style={c3.photoSmall}>
              <IconImage size={20} color="var(--muted-foreground)" stroke={1.8}/>
            </div>
            <div className="tb-press" style={c3.photoSmall}>
              <IconPlus size={20} color="var(--muted-foreground)" stroke={1.8}/>
            </div>
            <div className="tb-press" style={c3.photoSmall}>
              <IconPlus size={20} color="var(--muted-foreground)" stroke={1.8}/>
            </div>
          </div>
          <div style={c3.photoCount}>
            <IconSparkles size={11} color="var(--success)" stroke={2}/>
            Vähintään yksi kuva nostaa kiinnostuksen 3×.
          </div>
        </div>

        {/* Description */}
        <div style={c3.groupLabel}>Kuvaus</div>
        <div style={c3.descBlock}>
          <div style={c3.descArea}>{desc}</div>
          <div style={c3.descMeta}>
            <span>Ainakin 30 merkkiä</span>
            <span>{desc.length}/600</span>
          </div>
        </div>

        {/* Price (conditional) */}
        {showPrice && (
          <>
            <div style={c3.groupLabel}>Hinta</div>
            <div style={c3.priceRow}>
              <div style={c3.priceField}>
                <div style={c3.priceLabel}>Hinta</div>
                <div style={c3.priceValue}>
                  5 <span style={c3.priceUnit}>€ / päivä</span>
                </div>
              </div>
              <div style={c3.priceField}>
                <div style={c3.priceLabel}>Vakuus</div>
                <div style={c3.priceValue}>
                  30 <span style={c3.priceUnit}>€</span>
                </div>
              </div>
            </div>
          </>
        )}

        {showEvent && (
          <>
            <div style={c3.groupLabel}>Tapahtuma</div>
            <div style={{...c3.rowField, marginTop: 0}}>
              <div style={c3.rowFieldIcon}>
                <IconCalendar size={16} color="var(--foreground)" stroke={1.8}/>
              </div>
              <div style={c3.rowFieldBody}>
                <div style={c3.rowFieldLabel}>Päivä &amp; aika</div>
                <div style={c3.rowFieldValue}>LA 4.5. · 11:00 – 14:00</div>
              </div>
              <IconChevronRight size={16} color="var(--muted-foreground)"/>
            </div>
          </>
        )}

        {/* Location */}
        <div style={c3.groupLabel}>Sijainti &amp; nouto</div>
        <div style={c3.rowField}>
          <div style={c3.rowFieldIcon}>
            <IconMapPin size={16} color="var(--foreground)" stroke={1.8}/>
          </div>
          <div style={c3.rowFieldBody}>
            <div style={c3.rowFieldLabel}>Osoite</div>
            <div style={c3.rowFieldValue}>Sturenkatu 21, Vallila</div>
            <div style={c3.rowFieldSub}>Näkyy kartalla 100m tarkkuudella</div>
          </div>
          <IconChevronRight size={16} color="var(--muted-foreground)"/>
        </div>
        <div style={{height: 8}}/>
        <div style={c3.rowField}>
          <div style={c3.rowFieldIcon}>
            <IconCalendar size={16} color="var(--foreground)" stroke={1.8}/>
          </div>
          <div style={c3.rowFieldBody}>
            <div style={c3.rowFieldLabel}>Saatavilla</div>
            <div style={c3.rowFieldValue}>Arkisin klo 17–20</div>
            <div style={c3.rowFieldSub}>Voi vaihtaa myöhemmin</div>
          </div>
          <IconChevronRight size={16} color="var(--muted-foreground)"/>
        </div>

        <div style={{height: 30}}/>
      </div>

      {/* Bottom CTA */}
      <div style={c3.bottomBar}>
        <div className="tb-press" style={c3.bottomDraft}>Luonnos</div>
        <div className="tb-press" style={c3.bottomPublish}>
          Julkaise ilmoitus
          <IconChevronRight size={14} color="var(--background)" stroke={2}/>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { CreateV3 });
