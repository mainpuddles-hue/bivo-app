/* global React */
// TackBird v2 — Shared primitives + icons
// Style objects use unique names per component to avoid collisions across babel scripts.

const { useState, useEffect, useRef, useCallback } = React;

// ── Icons (stroke-only Lucide-style, sizes as React Native) ──────────────
const Icon = ({ d, size = 20, color = "currentColor", stroke = 2, fill = "none", children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {children ?? <path d={d}/>}
  </svg>
);
const IconNewspaper = (p) => <Icon {...p}><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></Icon>;
const IconCompass = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></Icon>;
const IconPlus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const IconMessage = (p) => <Icon {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Icon>;
const IconUser = (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>;
const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></Icon>;
const IconHeart = (p) => <Icon {...p}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></Icon>;
const IconHeartFill = (p) => <Icon {...p} fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></Icon>;
const IconBookmark = (p) => <Icon {...p}><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></Icon>;
const IconBookmarkFill = (p) => <Icon {...p} fill="currentColor"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></Icon>;
const IconSettings = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>;
const IconBell = (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></Icon>;
const IconClose = (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>;
const IconArrowLeft = (p) => <Icon {...p}><path d="m12 19-7-7 7-7M19 12H5"/></Icon>;
const IconChevronRight = (p) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>;
const IconMap = (p) => <Icon {...p}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><path d="M9 3v15M15 6v15"/></Icon>;
const IconClock = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Icon>;
const IconMapPin = (p) => <Icon {...p}><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></Icon>;
const IconCalendar = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Icon>;
const IconCamera = (p) => <Icon {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></Icon>;
const IconShield = (p) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></Icon>;
const IconShieldCheck = (p) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></Icon>;
const IconStar = (p) => <Icon {...p} fill="currentColor"><polygon points="12 2 15 8.6 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.6 12 2"/></Icon>;
const IconCheck = (p) => <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>;
const IconSparkles = (p) => <Icon {...p}><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 14l.95 2.3L22 17.5l-2.05.9L19 21l-.95-2.6L16 17.5l2.05-.9zM5 4l.95 2.3L8 7.5l-2.05.9L5 11l-.95-2.6L2 7.5l2.05-.9z"/></Icon>;
const IconFilter = (p) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></Icon>;
const IconImage = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></Icon>;
const IconSend = (p) => <Icon {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></Icon>;
const IconMic = (p) => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 19v3"/></Icon>;
const IconHash = (p) => <Icon {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></Icon>;
const IconHome = (p) => <Icon {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></Icon>;
const IconArrowUpRight = (p) => <Icon {...p}><path d="M7 17 17 7M7 7h10v10"/></Icon>;
const IconMore = (p) => <Icon {...p}><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/><circle cx="5" cy="12" r="1.4" fill="currentColor"/></Icon>;
const IconRefresh = (p) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></Icon>;
const IconWifiOff = (p) => <Icon {...p}><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.55a11 11 0 0 1 5.17-2.39M19 12.55a11 11 0 0 0-3.55-2.18M2 8.82A15 15 0 0 1 6.18 6.4M22 8.82a15 15 0 0 0-12.5-3.7"/><circle cx="12" cy="20" r="0.5" fill="currentColor"/></Icon>;
const IconUsers = (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/></Icon>;
const IconGift = (p) => <Icon {...p}><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></Icon>;
const IconHandHelping = (p) => <Icon {...p}><path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14M3 14l4 4M3 14l-3 3M14 7l5 5M19 12l-3 3M19 12l3-3"/></Icon>;
const IconBookOpen = (p) => <Icon {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></Icon>;
const IconCreditCard = (p) => <Icon {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></Icon>;

// ── Press feedback (CSS transform, lightweight) ─────────────────────────
const Pressable = ({ children, onPress, style, className = "", ...rest }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onPress}
      className={className}
      style={{
        cursor: "pointer",
        userSelect: "none",
        transform: pressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 120ms cubic-bezier(.2,.8,.2,1)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

// ── Status bar (iOS) — already provided by ios-frame.jsx, but used as ref ─

// ── Floating pill nav ────────────────────────────────────────────────────
const navStyles = {
  outer: { position: "absolute", left: 16, right: 16, bottom: 22, zIndex: 40 },
  bar: {
    display: "flex", alignItems: "center", gap: 4, padding: 6,
    background: "var(--card)", borderRadius: 999,
    border: "1px solid var(--border)",
    boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
  },
  item: {
    flex: 1, height: 44, borderRadius: 999,
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute", top: 4, right: 8, minWidth: 16, height: 16,
    borderRadius: 8, padding: "0 4px", display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "var(--destructive)", color: "var(--primary-foreground)",
    fontSize: 11, fontWeight: 700, lineHeight: 1,
  },
};
const FloatingNav = ({ active = "feed", onChange = () => {}, badges = {} }) => {
  const items = [
    { key: "feed",     Icon: IconNewspaper },
    { key: "explore",  Icon: IconCompass },
    { key: "create",   Icon: IconPlus },
    { key: "messages", Icon: IconMessage },
    { key: "profile",  Icon: IconUser },
  ];
  return (
    <div style={navStyles.outer}>
      <div style={navStyles.bar}>
        {items.map(({ key, Icon: I }) => {
          const focused = active === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              style={{
                ...navStyles.item,
                background: focused ? "var(--foreground)" : "transparent",
              }}
            >
              <I size={20} stroke={focused ? 2 : 1.6}
                 color={focused ? "var(--primary-foreground)" : "var(--foreground)"} />
              {badges[key] > 0 && (
                <span style={navStyles.badge}>
                  {badges[key] > 99 ? "99+" : badges[key]}
                </span>
              )}
            </Pressable>
          );
        })}
      </div>
    </div>
  );
};

// ── Avatar (shared) ──────────────────────────────────────────────────────
const Avatar = ({ src, name, size = 18 }) => {
  const [errored, setErrored] = useState(false);
  const style = {
    width: size, height: size, borderRadius: size / 2,
    objectFit: "cover", flexShrink: 0,
    background: "var(--surface-tinted)",
    color: "var(--foreground)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: Math.max(9, Math.round(size * 0.4)),
    fontWeight: 600, letterSpacing: 0,
  };
  if (src && !errored) {
    return <img src={src} alt={name || ""} style={style} onError={() => setErrored(true)}/>;
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return <span style={style}>{initial}</span>;
};

// ── Category meta (mirror of constants.ts CATEGORIES) ────────────────────
const CATEGORY = {
  ilmaista:  { label: "Ilmaista",  Icon: IconHeart,        color: "var(--cat-ilmaista)" },
  tarvitsen: { label: "Tarvitsen", Icon: IconHandHelping,  color: "var(--cat-tarvitsen)" },
  tarjoan:   { label: "Tarjoan",   Icon: IconGift,         color: "var(--cat-tarjoan)" },
  tapahtuma: { label: "Tapahtuma", Icon: IconCalendar,     color: "var(--cat-tapahtuma)" },
  lainaa:    { label: "Lainaa",    Icon: IconBookOpen,     color: "var(--cat-lainaa)" },
};

// Export everything to window so other Babel files can use them
Object.assign(window, {
  Pressable, Icon,
  IconNewspaper, IconCompass, IconPlus, IconMessage, IconUser, IconSearch,
  IconHeart, IconHeartFill, IconBookmark, IconBookmarkFill, IconSettings,
  IconBell, IconClose, IconArrowLeft, IconChevronRight, IconMap, IconClock,
  IconMapPin, IconCalendar, IconCamera, IconShield, IconShieldCheck,
  IconStar, IconCheck, IconSparkles, IconFilter, IconImage, IconSend,
  IconMic, IconHash, IconHome, IconArrowUpRight, IconMore, IconRefresh, IconWifiOff,
  IconUsers, IconGift, IconHandHelping, IconBookOpen, IconCreditCard,
  FloatingNav, CATEGORY, Avatar,
});
