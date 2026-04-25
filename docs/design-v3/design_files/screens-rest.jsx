/* global React, FloatingNav, Pressable, Avatar, CATEGORY,
   IconArrowLeft, IconImage, IconCamera, IconHash, IconMapPin, IconChevronRight,
   IconClose, IconCheck, IconSend, IconMic, IconBell, IconSettings, IconStar,
   IconShieldCheck, IconHeart, IconBookmark, IconUsers, IconHome, IconCreditCard,
   IconSparkles, IconHandHelping, IconGift, IconBookOpen, IconPlus */

const { useState: useState_X } = React;

// ── CREATE v2 ────────────────────────────────────────────────────────────
//
// vs current `app/(tabs)/create.tsx`:
// - Step indicator removed at the top (was 1/2). Single screen with vertical flow.
// - Category picker becomes the FIRST visible block (was buried under header)
// - Photo grid is centerpiece — 1 large + 3 small (was: 4 equal placeholders)
// - "Hinta" + "Vakuus" inputs only appear when relevant category chosen (lainaa/tarjoan)
// - Sticky bottom "Julkaise" CTA always visible

const cStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  topBar: {
    padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "var(--background)",
  },
  topTitle: { fontSize: 17, fontWeight: 600, color: "var(--foreground)" },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, background: "var(--card)",
    border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
  },
  scroll: { flex: 1, overflowY: "auto", padding: "0 20px", paddingBottom: 120 },
  groupTitle: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase",
    color: "var(--muted-foreground)", margin: "12px 0 12px",
  },
  catGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 },
  catCard: {
    padding: 14, borderRadius: 14, background: "var(--card)",
    border: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 10,
    fontSize: 14, fontWeight: 600, color: "var(--foreground)",
  },
  catCardActive: {
    background: "var(--foreground)", color: "var(--primary-foreground)",
    border: "1px solid var(--foreground)",
  },
  photoBlock: { display: "grid", gridTemplateColumns: "2fr 1fr", gridTemplateRows: "auto auto", gap: 8, marginTop: 4 },
  photoBig: {
    gridRow: "span 2", aspectRatio: "1/1.2", borderRadius: 14,
    background: "var(--muted)", border: "2px dashed var(--border-strong)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    color: "var(--muted-foreground)", gap: 6,
  },
  photoSmall: {
    aspectRatio: "1", borderRadius: 14,
    background: "var(--muted)", border: "1px dashed var(--border-strong)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--muted-foreground)",
  },
  field: { marginTop: 18 },
  label: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
    color: "var(--muted-foreground)", marginBottom: 8,
  },
  input: {
    width: "100%", padding: "14px 16px", borderRadius: 14,
    background: "var(--card)", border: "1px solid var(--border)",
    color: "var(--foreground)", fontSize: 15,
  },
  textarea: { minHeight: 80, lineHeight: 1.5 },
  rowField: {
    padding: "14px 16px", borderRadius: 14,
    background: "var(--card)", border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    color: "var(--foreground)", fontSize: 15,
  },
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "12px 16px",
    paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0))",
    background: "var(--card)", borderTop: "1px solid var(--border)",
  },
  primaryBtn: {
    height: 52, borderRadius: 999,
    background: "var(--foreground)", color: "var(--primary-foreground)",
    fontSize: 15, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  },
};

const CreateV2 = ({ onClose = () => {} }) => {
  const [cat, setCat] = useState_X("tarjoan");
  const cats = [
    { key: "tarjoan",   label: "Tarjoan",   I: IconGift },
    { key: "tarvitsen", label: "Tarvitsen", I: IconHandHelping },
    { key: "ilmaista",  label: "Ilmaista",  I: IconHeart },
    { key: "lainaa",    label: "Lainaa",    I: IconBookOpen },
  ];

  return (
    <div style={cStyles.page}>
      <div style={cStyles.topBar}>
        <Pressable style={cStyles.closeBtn} onPress={onClose}>
          <IconClose size={18} color="var(--foreground)"/>
        </Pressable>
        <span style={cStyles.topTitle}>Uusi ilmoitus</span>
        <span style={{width: 40}}/>
      </div>
      <div style={cStyles.scroll}>
        <div style={cStyles.groupTitle}>Mitä julkaiset?</div>
        <div style={cStyles.catGrid}>
          {cats.map(c => {
            const isA = cat === c.key;
            return (
              <Pressable key={c.key} onPress={() => setCat(c.key)}
                style={{...cStyles.catCard, ...(isA ? cStyles.catCardActive : {})}}>
                <c.I size={16} color={isA ? "var(--primary-foreground)" : "var(--foreground)"}/>
                {c.label}
              </Pressable>
            );
          })}
        </div>

        <div style={cStyles.groupTitle}>Kuvat (max 6)</div>
        <div style={cStyles.photoBlock}>
          <div style={cStyles.photoBig}>
            <IconCamera size={28} color="var(--muted-foreground)"/>
            <span style={{fontSize: 13, fontWeight: 600}}>Lisää pääkuva</span>
          </div>
          <div style={cStyles.photoSmall}><IconImage size={20} color="var(--muted-foreground)"/></div>
          <div style={cStyles.photoSmall}><IconImage size={20} color="var(--muted-foreground)"/></div>
        </div>

        <div style={cStyles.field}>
          <div style={cStyles.label}>Otsikko</div>
          <div style={cStyles.input}>Bosch porakone — lainattavissa</div>
        </div>
        <div style={cStyles.field}>
          <div style={cStyles.label}>Kuvaus</div>
          <div style={{...cStyles.input, ...cStyles.textarea, color: "var(--muted-foreground)"}}>
            Kerro mitä, missä kunnossa, mitä mukana, miten nouto…
          </div>
        </div>
        {(cat === "lainaa" || cat === "tarjoan") && (
          <div style={cStyles.field}>
            <div style={cStyles.label}>Hinta</div>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8}}>
              <div style={cStyles.input}>5 € / päivä</div>
              <div style={cStyles.input}>30 € vakuus</div>
            </div>
          </div>
        )}
        <div style={cStyles.field}>
          <div style={cStyles.label}>Sijainti</div>
          <div style={cStyles.rowField}>
            <span style={{display: "flex", alignItems: "center", gap: 8}}>
              <IconMapPin size={16} color="var(--foreground)"/>
              Vallila
            </span>
            <IconChevronRight size={16} color="var(--muted-foreground)"/>
          </div>
        </div>
        <div style={{height: 40}}/>
      </div>
      <div style={cStyles.bottomBar}>
        <Pressable style={cStyles.primaryBtn}>Julkaise ilmoitus</Pressable>
      </div>
    </div>
  );
};


// ── MESSAGES THREAD v2 ───────────────────────────────────────────────────
//
// vs current `app/messages/[id].tsx`:
// - Header shows author + post context (mini thumbnail + title) — was just author name
// - Composer always visible at bottom with Mic + Image attachments
// - Read receipts as small ink check, not separate row
// - Date separators are pill-style ("Tänään"), centered

const mStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  topBar: {
    padding: "12px 16px",
    display: "flex", alignItems: "center", gap: 12,
    background: "var(--card)", borderBottom: "1px solid var(--border)",
  },
  threadCtx: { flex: 1, minWidth: 0 },
  threadName: { fontSize: 15, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.2 },
  threadPost: {
    fontSize: 12, color: "var(--muted-foreground)", marginTop: 2,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  scroll: { flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 },
  dayPill: {
    alignSelf: "center", padding: "4px 12px", borderRadius: 999,
    background: "var(--surface-tinted)", color: "var(--muted-foreground)",
    fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
  },
  msg: { maxWidth: "78%", padding: "10px 14px", borderRadius: 18, fontSize: 14, lineHeight: 1.4 },
  msgIn: { alignSelf: "flex-start", background: "var(--card)", color: "var(--foreground)", borderBottomLeftRadius: 6 },
  msgOut: { alignSelf: "flex-end", background: "var(--foreground)", color: "var(--primary-foreground)", borderBottomRightRadius: 6 },
  msgMeta: { fontSize: 10, color: "var(--muted-foreground)", marginTop: 2, alignSelf: "flex-end", display: "flex", gap: 4, alignItems: "center" },
  composer: {
    padding: "10px 12px",
    paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0))",
    background: "var(--card)", borderTop: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 8,
  },
  cIcon: {
    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--foreground)",
  },
  cInput: {
    flex: 1, padding: "10px 16px", borderRadius: 999,
    background: "var(--background)", border: "1px solid var(--border)",
    color: "var(--muted-foreground)", fontSize: 14,
  },
  cSend: {
    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
    background: "var(--foreground)", color: "var(--primary-foreground)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
};
const MessagesThreadV2 = ({ onBack = () => {} }) => (
  <div style={mStyles.page}>
    <div style={mStyles.topBar}>
      <Pressable onPress={onBack} style={{...cStyles.closeBtn, background: "var(--background)"}}>
        <IconArrowLeft size={18} color="var(--foreground)"/>
      </Pressable>
      <Avatar src="https://i.pravatar.cc/100?img=33" name="Tuomas L." size={36}/>
      <div style={mStyles.threadCtx}>
        <div style={mStyles.threadName}>Tuomas L. <span style={{color: "var(--success)"}}>·</span></div>
        <div style={mStyles.threadPost}>Bosch porakone — lainattavissa</div>
      </div>
      <Pressable style={{...cStyles.closeBtn, background: "var(--background)"}}>
        <IconStar size={18} color="var(--foreground)"/>
      </Pressable>
    </div>
    <div style={mStyles.scroll}>
      <span style={mStyles.dayPill}>Tänään</span>
      <div style={{...mStyles.msg, ...mStyles.msgIn}}>Hei! Vapaa viikonloppuna 4.–5.5.?</div>
      <div style={{...mStyles.msg, ...mStyles.msgOut}}>Joo, voit hakea perjantai-iltana</div>
      <div style={{...mStyles.msgMeta, color: "rgba(245,246,247,0.6)"}}>15:42 <IconCheck size={10} color="var(--muted-foreground)"/></div>
      <div style={{...mStyles.msg, ...mStyles.msgIn}}>Hyvä — voinko tulla klo 18?</div>
      <div style={{...mStyles.msg, ...mStyles.msgOut}}>Sopii. Soita ovea, asun 3. kerros.</div>
    </div>
    <div style={mStyles.composer}>
      <Pressable style={mStyles.cIcon}><IconImage size={20} color="var(--foreground)"/></Pressable>
      <div style={mStyles.cInput}>Kirjoita viesti…</div>
      <Pressable style={mStyles.cSend}><IconSend size={16} color="var(--primary-foreground)"/></Pressable>
    </div>
  </div>
);


// ── PROFILE v2 ───────────────────────────────────────────────────────────
//
// vs current `app/(tabs)/profile.tsx`:
// - Hero block: large avatar, name, neighborhood, trust tier badge in one column
// - Stats row (3): "Ilmoituksia · Arvioita · Vastausnopeus" — same data, denser
// - Tabs: Ilmoitukset / Arviot / Tallennetut — segmented control, ink fill
// - Settings + notification icons in top-right (was scattered at bottom of header)

const pStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 120 },
  topRow: {
    padding: "16px 20px 0",
    display: "flex", justifyContent: "flex-end", gap: 8,
  },
  hero: { padding: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  name: {
    fontSize: 24, fontWeight: 700, letterSpacing: -0.4,
    color: "var(--foreground)", fontFamily: "var(--font-heading)",
  },
  trustRow: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 12, color: "var(--muted-foreground)",
  },
  statsRow: {
    margin: "16px 20px 0", padding: "16px",
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20,
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", textAlign: "center",
  },
  statVal: {
    fontSize: 22, fontWeight: 700, color: "var(--foreground)",
    fontFamily: "var(--font-heading)", letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
    textTransform: "uppercase", color: "var(--muted-foreground)", marginTop: 2,
  },
  statDivider: { width: 1, background: "var(--border)" },
  segmented: {
    margin: "20px 20px 12px", padding: 4, borderRadius: 999,
    background: "var(--surface-tinted)", display: "flex", gap: 4,
  },
  segItem: {
    flex: 1, height: 36, borderRadius: 999,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)",
  },
  segItemActive: {
    background: "var(--card)", color: "var(--foreground)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  grid: { padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
};
const ProfileV2 = ({ onTabChange = () => {} }) => {
  const [tab, setTab] = useState_X("ilmoitukset");
  return (
    <div style={pStyles.page}>
      <div style={pStyles.scroll}>
        <div style={pStyles.topRow}>
          <Pressable style={cStyles.closeBtn}>
            <IconBell size={18} color="var(--foreground)"/>
          </Pressable>
          <Pressable style={cStyles.closeBtn}>
            <IconSettings size={18} color="var(--foreground)"/>
          </Pressable>
        </div>
        <div style={pStyles.hero}>
          <Avatar src="https://i.pravatar.cc/100?img=49" name="Anni K." size={88}/>
          <div style={pStyles.name}>Anni Korhonen</div>
          <div style={pStyles.trustRow}>
            <IconShieldCheck size={14} color="var(--success)"/>
            Vahvistettu · Kallio
          </div>
        </div>
        <div style={pStyles.statsRow}>
          <div>
            <div style={pStyles.statVal}>14</div>
            <div style={pStyles.statLabel}>Ilmoitusta</div>
          </div>
          <div style={pStyles.statDivider}/>
          <div>
            <div style={pStyles.statVal}>4.9</div>
            <div style={pStyles.statLabel}>★ 23 arviota</div>
          </div>
          <div style={pStyles.statDivider}/>
          <div>
            <div style={pStyles.statVal}>~12m</div>
            <div style={pStyles.statLabel}>Vastausaika</div>
          </div>
        </div>
        <div style={pStyles.segmented}>
          {[
            { key: "ilmoitukset", label: "Ilmoitukset" },
            { key: "arviot",      label: "Arviot" },
            { key: "tallennetut", label: "Tallennetut" },
          ].map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)}
              style={{...pStyles.segItem, ...(tab === t.key ? pStyles.segItemActive : {})}}>
              {t.label}
            </Pressable>
          ))}
        </div>
        {tab === "ilmoitukset" && (
          <div style={pStyles.grid}>
            {POSTS.slice(0, 4).map(p => <PostCardV2 key={p.id} post={p}/>)}
          </div>
        )}
        {tab === "arviot" && (
          <div style={{padding: "0 20px"}}>
            {[
              { who: "Mikko V.", stars: 5, text: "Reilu naapuri, kahvi oli vielä lämmin kun hain :)" },
              { who: "Liisa M.", stars: 5, text: "Asiallista, sai kuten luvattu, kommunikointi sujui." },
              { who: "Tuomas L.", stars: 4, text: "Hyvä kuvaus, vain yksi kärki puuttui mitä ei mainittu." },
            ].map((r, i) => (
              <div key={i} style={{padding: "16px 0", borderBottom: "1px solid var(--border)"}}>
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                  <Avatar name={r.who} size={28}/>
                  <span style={{fontWeight: 600, color: "var(--foreground)", fontSize: 14}}>{r.who}</span>
                  <span style={{flex: 1}}/>
                  <span style={{fontSize: 12, color: "var(--foreground)"}}>{"★".repeat(r.stars)}</span>
                </div>
                <div style={{fontSize: 14, color: "var(--foreground)", marginTop: 6, lineHeight: 1.4}}>{r.text}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "tallennetut" && (
          <div style={pStyles.grid}>
            {POSTS.slice(4, 6).map(p => <PostCardV2 key={p.id} post={p}/>)}
          </div>
        )}
      </div>
      <FloatingNav active="profile" onChange={onTabChange}/>
    </div>
  );
};


// ── NOTIFICATIONS v2 ─────────────────────────────────────────────────────
//
// vs current `app/notifications.tsx`:
// - Single inline tab bar (Kaikki / Lukemattomat) at top — no filter modal
// - Time groups as inline section labels ("Tänään", "Aiemmin tällä viikolla")
// - Each row: avatar + 2-line text (bold action verb + context) + meta time
// - Unread = ink dot left, no full-row tint

const nStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" },
  topBar: {
    padding: "16px 20px 8px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: 28, fontWeight: 700, letterSpacing: -0.6,
    color: "var(--foreground)", fontFamily: "var(--font-heading)",
  },
  segmented: {
    margin: "8px 20px 8px", padding: 4, borderRadius: 999,
    background: "var(--surface-tinted)", display: "flex", gap: 4,
  },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 120 },
  groupLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase",
    color: "var(--muted-foreground)", padding: "16px 20px 8px",
  },
  row: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "12px 20px", position: "relative",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowAction: { fontSize: 14, color: "var(--foreground)", lineHeight: 1.4 },
  rowMeta: { fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    background: "var(--foreground)",
    position: "absolute", left: 8, top: 22,
  },
};
const NotificationsV2 = ({ onTabChange = () => {} }) => {
  const [tab, setTab] = useState_X("kaikki");
  const groups = [
    { label: "Tänään", items: [
      { who: "Tuomas L.", action: "lähetti viestin", ctx: "Bosch porakone", time: "12 min", unread: true, avatar: "https://i.pravatar.cc/100?img=33" },
      { who: "Sanna R.", action: "tykkäsi ilmoituksestasi", ctx: "Lasten talvitakki", time: "1 t", unread: true, avatar: "https://i.pravatar.cc/100?img=47" },
      { who: "Anni K.", action: "varasi", ctx: "Vaahtopesuri · 3 päivää", time: "3 t", unread: false, avatar: "https://i.pravatar.cc/100?img=49" },
    ]},
    { label: "Aiemmin tällä viikolla", items: [
      { who: "Liisa M.", action: "antoi sinulle ★5", ctx: "Erinomainen naapuri!", time: "2 pv", unread: false, avatar: "https://i.pravatar.cc/100?img=44" },
      { who: "Pekka R.", action: "alkoi seurata sinua", ctx: "", time: "3 pv", unread: false, avatar: "https://i.pravatar.cc/100?img=64" },
    ]},
  ];
  return (
    <div style={nStyles.page}>
      <div style={nStyles.topBar}>
        <span style={nStyles.pageTitle}>Ilmoitukset</span>
        <Pressable style={cStyles.closeBtn}>
          <IconCheck size={18} color="var(--foreground)"/>
        </Pressable>
      </div>
      <div style={nStyles.segmented}>
        {[{ k: "kaikki", l: "Kaikki" }, { k: "lukemattomat", l: "Lukemattomat · 2" }].map(t => (
          <Pressable key={t.k} onPress={() => setTab(t.k)}
            style={{...pStyles.segItem, ...(tab === t.k ? pStyles.segItemActive : {})}}>
            {t.l}
          </Pressable>
        ))}
      </div>
      <div style={nStyles.scroll}>
        {groups.map(g => (
          <div key={g.label}>
            <div style={nStyles.groupLabel}>{g.label}</div>
            {g.items.map((it, i) => (
              <Pressable key={i} style={nStyles.row}>
                {it.unread && <span style={nStyles.unreadDot}/>}
                <Avatar src={it.avatar} name={it.who} size={40}/>
                <div style={nStyles.rowText}>
                  <div style={nStyles.rowAction}>
                    <span style={{fontWeight: 600}}>{it.who}</span> {it.action}
                    {it.ctx && <span style={{color: "var(--muted-foreground)"}}> · {it.ctx}</span>}
                  </div>
                  <div style={nStyles.rowMeta}>{it.time}</div>
                </div>
              </Pressable>
            ))}
          </div>
        ))}
      </div>
      <FloatingNav active="profile" onChange={onTabChange}/>
    </div>
  );
};


// ── ONBOARDING v2 ─────────────────────────────────────────────────────────
//
// vs current `app/onboarding.tsx`:
// - 3 steps shown as small dots (was 4-step progress bar)
// - Each step: hero illustration block (placeholder), one line title, one line sub
// - "Skip" only on first step (was on every step)
// - Always-visible primary CTA, never grey

const oStyles = {
  page: { display: "flex", flexDirection: "column", height: "100%", background: "var(--background)", padding: 24 },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  dots: { display: "flex", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, background: "var(--border-strong)" },
  dotActive: { background: "var(--foreground)" },
  skip: { fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500 },
  hero: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    flexDirection: "column", gap: 28, padding: "20px 0",
  },
  heroBox: {
    width: "100%", maxWidth: 280, aspectRatio: "1",
    background: "var(--warm-tint)", borderRadius: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  heroMark: {
    width: 88, height: 88, borderRadius: 44,
    background: "var(--foreground)", color: "var(--primary-foreground)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 40, letterSpacing: -1,
  },
  textBlock: { textAlign: "center", display: "flex", flexDirection: "column", gap: 8, padding: "0 16px" },
  title: {
    fontSize: 28, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.15,
    color: "var(--foreground)", fontFamily: "var(--font-heading)", margin: 0,
  },
  sub: { fontSize: 15, color: "var(--muted-foreground)", lineHeight: 1.5 },
  primaryBtn: {
    height: 52, borderRadius: 999, background: "var(--foreground)",
    color: "var(--primary-foreground)", fontSize: 15, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  },
};
const OnboardingV2 = () => (
  <div style={oStyles.page}>
    <div style={oStyles.topRow}>
      <div style={oStyles.dots}>
        <span style={{...oStyles.dot, ...oStyles.dotActive}}/>
        <span style={oStyles.dot}/>
        <span style={oStyles.dot}/>
      </div>
      <Pressable style={oStyles.skip}>Ohita</Pressable>
    </div>
    <div style={oStyles.hero}>
      <div style={oStyles.heroBox}>
        <div style={oStyles.heroMark}>T</div>
      </div>
      <div style={oStyles.textBlock}>
        <h1 style={oStyles.title}>Naapurusto, jonka tunnet.</h1>
        <p style={oStyles.sub}>
          TackBird on hiljainen ilmoitustaulu omalle korttelillesi —
          tarjoa, pyydä, lainaa, järjestä.
        </p>
      </div>
    </div>
    <Pressable style={oStyles.primaryBtn}>Aloita</Pressable>
  </div>
);


Object.assign(window, { CreateV2, MessagesThreadV2, ProfileV2, NotificationsV2, OnboardingV2 });
