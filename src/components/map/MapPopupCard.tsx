/**
 * MapPopupCard — Leaflet HTML popup content builders for the web map.
 *
 * These are NOT React components — Leaflet popups are raw HTML strings.
 * Each builder returns an HTML string that Leaflet renders inside a popup.
 */

import { CATEGORIES } from '@/lib/constants'
import type { PostType, Post, Event, CityEvent, LocalPlace } from '@/lib/types'

// ── Helper utilities ──

/** Escape HTML entities to prevent XSS in Leaflet popup content */
function esc(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Validate URL scheme — only allow http/https in popup links */
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

// Place categories with SVG icons + colors (matching web's marker-icons.ts)
export const PLACE_CATS: Record<string, { color: string; icon: string; label: string }> = {
  restaurant: { color: '#E74C3C', icon: 'UtensilsCrossed', label: 'Ravintola' },
  cafe: { color: '#8B5E3C', icon: 'Coffee', label: 'Kahvila' },
  bar: { color: '#9B59B6', icon: 'Coffee', label: 'Baari' },
  shop: { color: '#3498DB', icon: 'Store', label: 'Kauppa' },
  library: { color: '#27AE60', icon: 'BookOpen', label: 'Kirjasto' },
  health: { color: '#E91E63', icon: 'Heart', label: 'Terveys' },
  sport: { color: '#F39C12', icon: 'Dumbbell', label: 'Urheilu' },
  culture: { color: '#8E44AD', icon: 'Palette', label: 'Kulttuuri' },
  hotel: { color: '#2C3E50', icon: 'MapPin', label: 'Hotelli' },
  attraction: { color: '#F1C40F', icon: 'MapPin', label: 'Nähtävyys' },
  service: { color: '#607D8B', icon: 'MapPin', label: 'Palvelu' },
  fast_food: { color: '#FF5722', icon: 'UtensilsCrossed', label: 'Pikaruoka' },
  pub: { color: '#795548', icon: 'Coffee', label: 'Pubi' },
  other: { color: '#78716C', icon: 'MapPin', label: 'Muu' },
}

// City event category config matching web exactly
export const CITY_EVENT_CATS: Record<string, { color: string; icon: string }> = {
  culture: { color: '#8E44AD', icon: 'Palette' },
  music: { color: '#E91E63', icon: 'Music' },
  sport: { color: '#27AE60', icon: 'Dumbbell' },
  family: { color: '#FF9800', icon: 'Users' },
  food: { color: '#E74C3C', icon: 'UtensilsCrossed' },
  nature: { color: '#4CAF50', icon: 'Leaf' },
  education: { color: '#2196F3', icon: 'GraduationCap' },
  theatre: { color: '#9C27B0', icon: 'Drama' },
  exhibition: { color: '#795548', icon: 'Frame' },
  festival: { color: '#FF5722', icon: 'PartyPopper' },
  market: { color: '#FF9800', icon: 'Store' },
  other: { color: '#607D8B', icon: 'CalendarDays' },
}

// Lucide SVG paths for markers (white stroke, matching web's MARKER_SVG)
export const MARKER_SVG: Record<string, string> = {
  HandHelping:
    '<path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14"/><path d="m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 13 6 6"/>',
  Gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  Heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  Zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  BookOpen:
    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  CalendarDays:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  Music:
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  Dumbbell:
    '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
  Users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  UtensilsCrossed:
    '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  Leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  GraduationCap:
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  Drama:
    '<path d="M10 11h.01"/><path d="M14 6h.01"/><path d="M18 6h.01"/><path d="M6.5 13.1h.01"/><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3"/><path d="M17.4 12.9c-.8 6-2.7 8.1-4.2 9.1-1 .6-2.4-.3-2.6-1.5a43.7 43.7 0 0 1-.4-5.5"/><path d="M2 5c0 9 4 12 6 12s6-3 6-12c0-2-2-3-6-3S2 3 2 5"/>',
  Frame:
    '<line x1="22" x2="2" y1="6" y2="6"/><line x1="22" x2="2" y1="18" y2="18"/><line x1="6" x2="6" y1="2" y2="22"/><line x1="18" x2="18" y1="2" y2="22"/>',
  PartyPopper:
    '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>',
  Store:
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
  Palette:
    '<circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  Coffee:
    '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  MapPin:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
}

export function svgMarker(iconName: string, size: number): string {
  const paths = MARKER_SVG[iconName]
  if (paths)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>`
}

// ── Popup HTML builders ──

interface PopupTheme {
  isDark: boolean
  borderColor: string
}

export function buildPostPopup(
  p: Post,
  dist: string,
  theme: PopupTheme,
  t: (key: string) => string
): string {
  const cat = CATEGORIES[p.type as PostType]
  const color = cat?.color ?? '#2D6B5E'
  return `<div style="font-family:system-ui;min-width:220px;max-width:280px;">
    ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:calc(100%+40px);height:120px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" onerror="this.style.display='none'" />` : ''}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <span style="width:10px;height:10px;border-radius:5px;background:${color};display:inline-block;"></span>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${color};">${esc(t(cat?.label ?? ''))}</span>
    </div>
    <div style="font-size:15px;font-weight:600;margin-bottom:4px;line-height:1.3;">${esc(p.title)}</div>
    ${p.description ? `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.description.slice(0, 100))}</div>` : ''}
    ${p.location ? `<div style="font-size:11px;color:#9CA3AF;margin-bottom:2px;">\u{1F4CD} ${esc(p.location)}</div>` : ''}
    ${dist ? `<div style="font-size:11px;color:#9CA3AF;">\u{1F9ED} ${dist}</div>` : ''}
    ${p.user ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid ${theme.isDark ? '#333' : '#eee'};">
      ${p.user.avatar_url ? `<img src="${esc(p.user.avatar_url)}" style="width:22px;height:22px;border-radius:11px;border:1px solid ${theme.isDark ? '#444' : '#ddd'};" onerror="this.style.display='none'" />` : ''}
      <span style="font-size:12px;color:#6B7280;">${esc(p.user.name ?? '')}</span>
      ${p.user.naapurusto ? `<span style="font-size:10px;color:#9CA3AF;margin-left:auto;">${esc(p.user.naapurusto)}</span>` : ''}
    </div>` : ''}
    ${p.daily_fee ? `<div style="margin-top:6px;"><span style="background:#FDF6E8;color:#C98B2E;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">${p.daily_fee} \u20AC/pv</span></div>` : ''}
    <a href="#" data-route="/post/${esc(p.id)}" style="display:block;margin-top:10px;background:${color};color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Katso ilmoitus \u2192</a>
  </div>`
}

export function buildEventPopup(
  e: Event,
  dist: string,
  theme: PopupTheme
): string {
  const day = new Date(e.event_date).getDate()
  const dateStr = new Date(e.event_date).toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const ac = (e as any).attendee_count as number | undefined
  const attendeeBar =
    e.max_attendees && ac != null
      ? `<div style="margin-top:6px;"><div style="display:flex;justify-content:space-between;font-size:10px;color:#6B7280;margin-bottom:2px;"><span>${ac}/${e.max_attendees}</span><span>${Math.round((ac / e.max_attendees) * 100)}%</span></div><div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${Math.min((ac / e.max_attendees) * 100, 100)}%;background:${ac / e.max_attendees >= 0.9 ? '#dc2626' : ac / e.max_attendees >= 0.7 ? '#d97706' : '#2B8A62'};border-radius:2px;"></div></div></div>`
      : ''
  const evS = theme.isDark
    ? { bg: '#1E1E1E', text: '#E8E6E0', muted: '#9CA3AF' }
    : { bg: '#FFFFFF', text: '#1A1A1A', muted: '#9CA3AF' }

  return `<div style="font-family:system-ui;min-width:220px;max-width:280px;margin:-13px -20px;border-radius:12px;overflow:hidden;background:${evS.bg};">
    <div style="background:linear-gradient(135deg,#2B8A62,#34D399);padding:10px 14px;display:flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.2);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="color:white;font-size:18px;font-weight:800;line-height:1;">${day}</span>
      </div>
      <div>
        <div style="font-size:12px;color:rgba(255,255,255,0.95);font-weight:600;">${dateStr}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.7);font-weight:600;text-transform:uppercase;">Tapahtuma</div>
      </div>
    </div>
    <div style="padding:10px 14px 12px;">
      <div style="font-size:14px;font-weight:600;color:${evS.text};margin-bottom:4px;line-height:1.3;">${esc(e.title)}</div>
      ${e.creator ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        ${e.creator.avatar_url ? `<img src="${esc(e.creator.avatar_url)}" style="width:16px;height:16px;border-radius:8px;" onerror="this.style.display='none'" />` : ''}
        <span style="font-size:11px;color:${evS.muted};">${esc(e.creator.name ?? '')}</span>
      </div>` : ''}
      ${e.description ? `<div style="font-size:11px;color:${evS.muted};margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(e.description)}</div>` : ''}
      ${e.location_name ? `<div style="font-size:11px;color:${evS.muted};">${esc(e.location_name)}</div>` : ''}
      ${dist ? `<div style="font-size:10px;color:${evS.muted};">${dist}</div>` : ''}
      ${attendeeBar}
      <a href="#" data-route="/events" style="display:inline-flex;align-items:center;justify-content:center;margin-top:10px;background:linear-gradient(135deg,#2B8A62,#34D399);color:white;padding:0 18px;min-height:36px;border-radius:20px;font-size:12px;font-weight:600;text-decoration:none;">Katso tapahtuma \u2192</a>
    </div>
  </div>`
}

export function buildCityEventPopup(
  ce: CityEvent,
  dist: string,
  theme: PopupTheme
): string {
  const catCfg = CITY_EVENT_CATS[ce.category] ?? CITY_EVENT_CATS.other
  const catColor = catCfg.color
  const ceInfoUrl = safeUrl(ce.info_url)
  const ceDate = new Date(ce.start_time)
  const ceDateStr = ceDate.toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const ceDay = ceDate.getDate()
  const ceS = theme.isDark
    ? { bg: '#1E1E1E', text: '#E8E6E0', muted: '#9CA3AF', link: '#6FCF97' }
    : { bg: '#FFFFFF', text: '#1A1A1A', muted: '#9CA3AF', link: '#2D6B5E' }

  return `<div style="font-family:system-ui;min-width:220px;max-width:280px;margin:-13px -20px;border-radius:12px;overflow:hidden;background:${ceS.bg};">
    ${ce.image_url ? `<img src="${esc(ce.image_url)}" style="width:100%;height:100px;object-fit:cover;" onerror="this.style.display='none'" />` : ''}
    <div style="background:linear-gradient(135deg,${catColor},${catColor}dd);padding:10px 14px;display:flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;border-radius:14px;background:rgba(255,255,255,0.2);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;">
        <span style="color:white;font-size:18px;font-weight:800;">${ceDay}</span>
      </div>
      <div>
        <div style="font-size:12px;color:rgba(255,255,255,0.95);font-weight:600;">${ceDateStr}</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.7);font-weight:600;text-transform:uppercase;">${esc(ce.category)}</div>
      </div>
    </div>
    <div style="padding:10px 14px 12px;">
      <span style="display:inline-block;border-radius:20px;padding:2px 9px;font-size:9px;font-weight:600;color:white;background:${catColor};text-transform:uppercase;margin-bottom:6px;">${esc(ce.category)}</span>
      <div style="font-size:14px;font-weight:600;color:${ceS.text};margin-bottom:4px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(ce.name_fi)}</div>
      ${ce.description_fi ? `<div style="font-size:11px;color:${ceS.muted};margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(ce.description_fi.slice(0, 120))}</div>` : ''}
      ${ce.location_name ? `<div style="font-size:11px;color:${ceS.muted};">${esc(ce.location_name)}</div>` : ''}
      ${dist ? `<div style="font-size:10px;color:${ceS.muted};">${dist}</div>` : ''}
      ${ce.is_free ? `<div style="margin-top:6px;"><span style="font-size:11px;font-weight:600;color:${theme.isDark ? '#34d399' : '#2B8A62'};background:${theme.isDark ? 'rgba(52,211,153,0.15)' : 'rgba(43,138,98,0.1)'};padding:2px 8px;border-radius:6px;">Ilmainen</span></div>` : ce.price_info ? `<div style="font-size:11px;color:${ceS.muted};margin-top:4px;">${esc(ce.price_info.slice(0, 40))}</div>` : ''}
      ${ceInfoUrl ? `<a href="${esc(ceInfoUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;gap:4px;margin-top:10px;background:linear-gradient(135deg,#2D6B5E,#4CAF6A);color:white;padding:0 18px;min-height:36px;border-radius:20px;font-size:12px;font-weight:600;text-decoration:none;">Lis\u00E4tietoja \u2192</a>` : `<a href="https://www.google.com/maps/dir/?api=1&amp;destination=${ce.latitude},${ce.longitude}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;margin-top:10px;background:${catColor};color:white;padding:0 18px;min-height:36px;border-radius:20px;font-size:12px;font-weight:600;text-decoration:none;">Reittiohjeet \u2192</a>`}
    </div>
  </div>`
}

export function buildPlacePopup(
  pl: LocalPlace,
  dist: string,
  theme: PopupTheme
): string {
  const pCat = PLACE_CATS[pl.category] ?? PLACE_CATS.other
  const pColor = pCat.color
  const plWebsite = safeUrl(pl.website)
  const s = theme.isDark
    ? { bg: '#1E1E1E', text: '#E8E6E0', muted: '#9CA3AF', link: '#6FCF97', border: '#2A2A2A' }
    : { bg: '#FFFFFF', text: '#1A1A1A', muted: '#9CA3AF', link: '#2D6B5E', border: '#E5E7EB' }

  return `<div style="font-family:system-ui;min-width:220px;max-width:300px;margin:-13px -20px;border-radius:12px;overflow:hidden;background:${s.bg};">
    <div style="background:linear-gradient(135deg,${pColor},${pColor}cc);padding:8px 14px;display:flex;align-items:center;gap:8px;">
      ${svgMarker(pCat.icon, 14)}
      <div>
        <div style="font-size:11px;color:rgba(255,255,255,0.95);font-weight:600;">${esc(pCat.label)}</div>
        ${pl.subcategory ? `<div style="font-size:9px;color:rgba(255,255,255,0.7);">${esc(pl.subcategory)}</div>` : ''}
      </div>
    </div>
    <div style="padding:10px 14px 12px;">
      <div style="font-size:14px;font-weight:600;color:${s.text};margin-bottom:6px;line-height:1.3;">${esc(pl.name)}</div>
      ${pl.address ? `<div style="font-size:11px;color:${s.muted};margin-bottom:2px;">${esc(pl.address)}</div>` : ''}
      ${dist ? `<div style="font-size:10px;color:${s.muted};">${dist}</div>` : ''}
      ${pl.opening_hours ? `<div style="font-size:10px;color:${s.muted};margin-top:4px;">${esc(pl.opening_hours)}</div>` : ''}
      ${pl.phone ? `<div style="margin-top:6px;"><a href="tel:${esc(pl.phone)}" style="color:${s.link};font-size:12px;text-decoration:none;">${esc(pl.phone)}</a></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;">
        ${plWebsite ? `<a href="${esc(plWebsite)}" target="_blank" rel="noopener" style="flex:1;display:block;background:${s.link};color:white;text-align:center;padding:8px;border-radius:20px;font-size:12px;font-weight:600;text-decoration:none;">Verkkosivut</a>` : ''}
        <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${pl.latitude},${pl.longitude}" target="_blank" rel="noopener" style="flex:1;display:block;background:${pColor};color:white;text-align:center;padding:8px;border-radius:20px;font-size:12px;font-weight:600;text-decoration:none;">Reittiohjeet</a>
      </div>
    </div>
  </div>`
}

export { esc, safeUrl }
