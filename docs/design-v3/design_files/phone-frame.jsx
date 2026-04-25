/* global React */
// iPhone 15 Pro frame — 393×852 logical, Dynamic Island, real safe-areas
//
// Logical CSS pixels per Apple HIG: 393 × 852 (iPhone 15/16 Pro).
// Top safe-area: 59px (Dynamic Island sits 11px from top, 37px tall, centered).
// Bottom safe-area: 34px (home indicator).
// Bezel: 11px on all sides, with 55px corner radius.

const PHONE_W = 393;
const PHONE_H = 852;
const TOP_INSET = 59;
const BOTTOM_INSET = 34;
const BEZEL = 11;

// Dynamic Island geometry
const DI_W = 126;
const DI_H = 37;
const DI_TOP = 11;

const phoneStyles = {
  device: {
    position: "relative",
    width: PHONE_W + BEZEL * 2,
    height: PHONE_H + BEZEL * 2,
    background: "#0A0A0B",
    borderRadius: 55,
    padding: BEZEL,
    boxShadow:
      "inset 0 0 0 1.5px #2C2C2E, " +
      "inset 0 0 0 3px #0A0A0B, " +
      "inset 0 0 0 4px #1F1F22, " +
      "0 30px 60px -20px rgba(0,0,0,0.45), " +
      "0 12px 28px -8px rgba(0,0,0,0.35)",
    flexShrink: 0,
  },
  screen: {
    position: "relative",
    width: PHONE_W,
    height: PHONE_H,
    borderRadius: 44,
    overflow: "hidden",
    background: "#000",
    isolation: "isolate",
  },
  screenContent: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
  },
  // Dynamic Island
  island: {
    position: "absolute",
    top: DI_TOP,
    left: "50%",
    transform: "translateX(-50%)",
    width: DI_W,
    height: DI_H,
    background: "#000",
    borderRadius: 999,
    zIndex: 1000,
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
  },
  // Status bar — clock left of island, indicators right of island
  statusBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TOP_INSET,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    paddingTop: 17,
    pointerEvents: "none",
    zIndex: 1001,
  },
  clock: {
    fontFamily: "'SF Pro Display', 'Inter', system-ui, sans-serif",
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.4,
    width: 60,
    textAlign: "center",
  },
  indicators: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    width: 80,
    justifyContent: "flex-end",
  },
  // Home indicator
  homeBar: {
    position: "absolute",
    bottom: 8,
    left: "50%",
    transform: "translateX(-50%)",
    width: 134,
    height: 5,
    borderRadius: 3,
    background: "rgba(0,0,0,0.35)",
    zIndex: 1001,
    pointerEvents: "none",
  },
  homeBarLight: {
    background: "rgba(255,255,255,0.5)",
  },
};

// SVG status indicators — accurate iOS shapes
const Signal = ({ color }) => (
  <svg width="18" height="11" viewBox="0 0 18 11" fill={color}>
    <rect x="0" y="7" width="3" height="4" rx="0.5"/>
    <rect x="5" y="5" width="3" height="6" rx="0.5"/>
    <rect x="10" y="3" width="3" height="8" rx="0.5"/>
    <rect x="15" y="0" width="3" height="11" rx="0.5"/>
  </svg>
);
const Wifi = ({ color }) => (
  <svg width="17" height="12" viewBox="0 0 17 12" fill={color}>
    <path d="M8.5 0C5.4 0 2.5 1.2.3 3.3c-.4.4-.4 1 0 1.4l.7.7c.4.4 1 .4 1.4 0C4 3.7 6.2 2.8 8.5 2.8s4.5.9 6.1 2.6c.4.4 1 .4 1.4 0l.7-.7c.4-.4.4-1 0-1.4C14.5 1.2 11.6 0 8.5 0z"/>
    <path d="M8.5 4.5c-1.9 0-3.7.7-5 2-.4.4-.4 1 0 1.4l.7.7c.4.4 1 .4 1.4 0 .8-.8 1.8-1.3 2.9-1.3s2.1.5 2.9 1.3c.4.4 1 .4 1.4 0l.7-.7c.4-.4.4-1 0-1.4-1.3-1.3-3.1-2-5-2z"/>
    <circle cx="8.5" cy="10.5" r="1.5"/>
  </svg>
);
const Battery = ({ color }) => (
  <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
    <rect x="0.5" y="0.5" width="22" height="12" rx="3" stroke={color} strokeOpacity="0.4" fill="none"/>
    <rect x="2" y="2" width="19" height="9" rx="1.5" fill={color}/>
    <rect x="24" y="4" width="2" height="5" rx="1" fill={color} opacity="0.4"/>
  </svg>
);

// Phone frame component — pass `dark` to flip status bar text color
const PhoneFrame = ({ children, dark = false, time = "9:41", showStatusBar = true, screenBackground = "#F5F6F7" }) => {
  const ink = dark ? "#FFFFFF" : "#1A1D1F";
  return (
    <div style={phoneStyles.device}>
      <div style={{...phoneStyles.screen, background: screenBackground}}>
        <div style={phoneStyles.screenContent}>
          {children}
        </div>

        {showStatusBar && (
          <div style={phoneStyles.statusBar}>
            <div style={{...phoneStyles.clock, color: ink}}>{time}</div>
            <div style={phoneStyles.indicators}>
              <Signal color={ink}/>
              <Wifi color={ink}/>
              <Battery color={ink}/>
            </div>
          </div>
        )}

        <div style={phoneStyles.island}/>
        <div style={{
          ...phoneStyles.homeBar,
          ...(dark ? phoneStyles.homeBarLight : {})
        }}/>
      </div>
    </div>
  );
};

Object.assign(window, { PhoneFrame, PHONE_W, PHONE_H, TOP_INSET, BOTTOM_INSET });
