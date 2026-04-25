/* global React, Pressable, CATEGORY, IconHeart, IconHeartFill, IconCalendar, IconClock, IconMapPin */
// PostCardGrid v2 — Helsinki Monochrome
//
// UX changes vs v1:
// - image-hero: title 13 → 15, line-height adjusted, added price prominence
// - text card: more breathing room around large title
// - event card: bigger date display (date as visual anchor), location moves below
// - all variants: subtle ink hover lift on press (existing scale 0.96)
// - meta footer: avatar + name on one row, location · time on second row (was crammed)

const cardStyles = {
  card: {
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid var(--border)",
    background: "var(--card)",
    display: "flex",
    flexDirection: "column",
  },
  // image-hero
  imageWrap: { position: "relative", width: "100%", aspectRatio: "1 / 1", background: "var(--muted)", overflow: "hidden" },
  image: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  catPill: {
    position: "absolute", top: 8, left: 8,
    padding: "4px 10px", borderRadius: 999,
    background: "rgba(255,255,255,0.92)",
    color: "#1A1D1F",
    fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  },
  urgentPill: {
    position: "absolute", top: 8, right: 8,
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 8px", borderRadius: 999,
    background: "var(--destructive)", color: "white",
    fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
  },
  likePill: {
    position: "absolute", top: 8, right: 8,
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 8px", borderRadius: 999,
    background: "rgba(0,0,0,0.55)", color: "white",
    fontSize: 11, fontWeight: 600,
  },
  imgContent: { padding: 12, display: "flex", flexDirection: "column", gap: 6 },
  title: {
    fontSize: 15, fontWeight: 600, letterSpacing: -0.2,
    lineHeight: 1.25, color: "var(--foreground)",
    fontFamily: "var(--font-heading)",
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  price: { fontSize: 13, fontWeight: 700, color: "var(--foreground)" },
  meta: {
    display: "flex", alignItems: "center", gap: 6, marginTop: 2,
    fontSize: 12, color: "var(--muted-foreground)",
  },
  miniAvatar: {
    width: 18, height: 18, borderRadius: 9,
    objectFit: "cover", flexShrink: 0,
  },
  miniAvatarFallback: {
    width: 18, height: 18, borderRadius: 9, flexShrink: 0,
    background: "var(--surface-tinted)", color: "var(--foreground)",
    fontSize: 10, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  metaText: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },

  // text variant (warm-tint)
  textCard: { background: "var(--warm-tint)", padding: 16, gap: 8, minHeight: 180 },
  textCatLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
    textTransform: "uppercase", color: "var(--muted-foreground)",
  },
  textTitle: {
    fontSize: 18, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2,
    color: "var(--foreground)", fontFamily: "var(--font-heading)",
    display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
    overflow: "hidden", flex: 1,
  },

  // event variant (ink bg)
  eventCard: { background: "var(--foreground)", border: "none", padding: 14, gap: 10, minHeight: 180, color: "var(--background)" },
  eventDate: {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
    color: "var(--on-ink-muted)",
    display: "flex", alignItems: "center", gap: 6,
  },
  eventTitle: {
    fontSize: 18, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2,
    color: "var(--background)",
    fontFamily: "var(--font-heading)", flex: 1,
    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  eventMeta: {
    fontSize: 12, color: "var(--on-ink-muted)",
    display: "flex", alignItems: "center", gap: 4,
  },
};

const PostCardV2 = ({ post, onPress }) => {
  const cat = CATEGORY[post.type];
  const variant = post.type === "tapahtuma" ? "event" : (post.image ? "image" : "text");

  if (variant === "image") {
    return (
      <Pressable onPress={onPress} style={cardStyles.card}>
        <div style={cardStyles.imageWrap}>
          <img src={post.image} alt="" style={cardStyles.image} loading="lazy"/>
          <span style={cardStyles.catPill}>{cat.label}</span>
          {post.urgent ? (
            <span style={cardStyles.urgentPill}>
              <IconClock size={11} color="white" stroke={2.5}/>
              KIIRE
            </span>
          ) : post.likes > 0 ? (
            <span style={cardStyles.likePill}>
              <IconHeartFill size={11} color="white"/> {post.likes}
            </span>
          ) : null}
        </div>
        <div style={cardStyles.imgContent}>
          <div style={cardStyles.title}>{post.title}</div>
          {post.price && <div style={cardStyles.price}>{post.price}</div>}
          <div style={cardStyles.meta}>
            <Avatar src={post.avatar} name={post.author}/>
            <span style={cardStyles.metaText}>
              {post.author} · {post.location}
            </span>
          </div>
        </div>
      </Pressable>
    );
  }

  if (variant === "event") {
    return (
      <Pressable onPress={onPress} style={{...cardStyles.card, ...cardStyles.eventCard}}>
        <div style={cardStyles.eventDate}>
          <IconCalendar size={11} color="var(--on-ink-muted)" stroke={2}/>
          {post.eventDate}
        </div>
        <div style={cardStyles.eventTitle}>{post.title}</div>
        <div style={cardStyles.eventMeta}>
          {post.attending != null && (
            <span style={{color: "var(--background)", fontWeight: 600}}>{post.attending} osallistuu</span>
          )}
          {post.attending != null && post.location && <span>·</span>}
          {post.location && <span>{post.location}</span>}
        </div>
      </Pressable>
    );
  }

  // text variant
  return (
    <Pressable onPress={onPress} style={{...cardStyles.card, ...cardStyles.textCard}}>
      <div style={cardStyles.textCatLabel}>{cat.label}</div>
      <div style={cardStyles.textTitle}>{post.title}</div>
      <div style={cardStyles.meta}>
        <Avatar src={post.avatar} name={post.author}/>
        <span style={cardStyles.metaText}>
          {post.author} · {post.location}
        </span>
      </div>
    </Pressable>
  );
};

const Avatar = ({ src, name, size = 18 }) => {
  const [errored, setErrored] = useState(false);
  if (src && !errored) {
    return (
      <img src={src} alt=""
        style={{ width: size, height: size, borderRadius: size/2, objectFit: "cover", flexShrink: 0 }}
        onError={() => setErrored(true)}/>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size/2, flexShrink: 0,
      background: "var(--surface-tinted)", color: "var(--foreground)",
      fontSize: size * 0.55, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>{(name || "?").charAt(0).toUpperCase()}</div>
  );
};

Object.assign(window, { PostCardV2, Avatar });
