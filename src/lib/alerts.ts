// HSL Digitransit API + Ilmatieteen laitos API — alert fetchers

export interface TransitAlert {
  id: string
  type: 'transit'
  severity: 'warning' | 'info'
  title: string
  description: string | null
  url: string | null
  startTime: string | null
  endTime: string | null
}

export interface WeatherAlert {
  id: string
  type: 'weather'
  severity: 'warning' | 'severe'
  title: string
  description: string | null
  startTime: string | null
  endTime: string | null
}

export type AppAlert = TransitAlert | WeatherAlert

const HSL_GRAPHQL_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1'

const HSL_ALERTS_QUERY = `{
  alerts(feeds: ["HSL"]) {
    id
    alertSeverityLevel
    alertHeaderText
    alertDescriptionText
    alertUrl
    effectiveStartDate
    effectiveEndDate
    alertHeaderTextTranslations {
      language
      text
    }
    alertDescriptionTextTranslations {
      language
      text
    }
  }
}`

export async function fetchHSLAlerts(): Promise<TransitAlert[]> {
  try {
    const res = await fetch(HSL_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: HSL_ALERTS_QUERY }),
    })
    if (!res.ok) return []
    const json = await res.json()
    const alerts = json?.data?.alerts ?? []

    const now = Date.now() / 1000

    return alerts
      .filter((a: any) => {
        // Only show currently active alerts
        if (a.effectiveEndDate && a.effectiveEndDate < now) return false
        return true
      })
      .slice(0, 5)
      .map((a: any) => {
        // Prefer Finnish translation
        const header = a.alertHeaderTextTranslations?.find((t: any) => t.language === 'fi')?.text
          ?? a.alertHeaderText ?? ''
        const desc = a.alertDescriptionTextTranslations?.find((t: any) => t.language === 'fi')?.text
          ?? a.alertDescriptionText ?? null

        return {
          id: `hsl-${a.id}`,
          type: 'transit' as const,
          severity: a.alertSeverityLevel === 'SEVERE' ? 'warning' as const : 'info' as const,
          title: header,
          description: desc,
          url: a.alertUrl ?? null,
          startTime: a.effectiveStartDate ? new Date(a.effectiveStartDate * 1000).toISOString() : null,
          endTime: a.effectiveEndDate ? new Date(a.effectiveEndDate * 1000).toISOString() : null,
        }
      })
  } catch {
    return []
  }
}

// Ilmatieteen laitos Open Data — simple XML warnings for Helsinki
const FMI_WARNINGS_URL = 'https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::weather::symbols::point::simple&place=helsinki&parameters=weathersymbol3'

export async function fetchWeatherAlerts(): Promise<WeatherAlert[]> {
  try {
    // FMI warnings API — fetch active weather warnings for Uusimaa region
    const res = await fetch(
      'https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::simple&place=helsinki&parameters=t2m&maxlocations=1',
      { headers: { 'Accept': 'application/xml' } }
    )
    if (!res.ok) return []

    // For now, we parse a simplified approach: check if temperature is extreme
    const text = await res.text()
    const tempMatch = text.match(/<wml2:value>([^<]+)<\/wml2:value>/)
    if (!tempMatch) return []

    const temp = parseFloat(tempMatch[1])
    const alerts: WeatherAlert[] = []

    if (temp <= -20) {
      alerts.push({
        id: 'fmi-cold',
        type: 'weather',
        severity: 'severe',
        title: `Pakkasvaroitus: ${temp.toFixed(0)} °C`,
        description: 'Voimakas pakkanen — pukeudu lämpi\u00e4sti.',
        startTime: new Date().toISOString(),
        endTime: null,
      })
    } else if (temp >= 30) {
      alerts.push({
        id: 'fmi-heat',
        type: 'weather',
        severity: 'warning',
        title: `Hellevaroitus: ${temp.toFixed(0)} °C`,
        description: 'Korkea lämpötila — muista juoda vettä.',
        startTime: new Date().toISOString(),
        endTime: null,
      })
    }

    return alerts
  } catch {
    return []
  }
}

export async function fetchAllAlerts(): Promise<AppAlert[]> {
  const [transit, weather] = await Promise.all([
    fetchHSLAlerts(),
    fetchWeatherAlerts(),
  ])
  return [...weather, ...transit]
}
