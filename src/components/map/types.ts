import type { Post, Event, CityEvent, LocalPlace } from '@/lib/types'
export type { ThemeColors } from '@/lib/theme'

export type ItemKind = 'post' | 'community_event' | 'city_event' | 'place'

export interface ListItem {
  id: string
  kind: ItemKind
  title: string
  subtitle: string
  color: string
  latitude: number
  longitude: number
  distance: number
  sortDate?: string
  sourceData: Post | Event | CityEvent | LocalPlace
}

export interface StableMarker {
  key: string
  latitude: number
  longitude: number
  pinColor: string
  title: string
  description: string
}

export type FilterKey = 'all' | 'posts' | 'events' | 'places'

export interface Section {
  title: string
  data: ListItem[]
  color?: string
}
