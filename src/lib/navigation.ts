import type { Router } from 'expo-router'

type Href = Parameters<Router['replace']>[0]

export function safeBack(router: Router, fallback: Href = '/(tabs)') {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}
