import type { CityEvent } from './types'

export function getCityEventName(event: CityEvent, locale: string): string {
  if (locale === 'en' && event.name_en) return event.name_en
  if (locale === 'sv' && event.name_sv) return event.name_sv
  return event.name_fi
}
