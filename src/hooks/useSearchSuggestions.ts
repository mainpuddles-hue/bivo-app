declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from './useSupabase'

const HISTORY_KEY = 'tackbird_search_history'
const MAX_HISTORY = 20

export interface SearchSuggestion {
  text: string
  type: 'history' | 'trending' | 'popular'
}

export function useSearchSuggestions() {
  const supabase = useSupabase()
  const [history, setHistory] = useState<string[]>([])
  const [trending, setTrending] = useState<string[]>([])

  // Load search history
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      if (raw) {
        try { setHistory(JSON.parse(raw)) } catch {}
      }
    })
  }, [])

  // Load trending searches (most common post titles this week)
  useEffect(() => {
    async function fetchTrending() {
      try {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
        const { data } = await supabase
          .from('posts')
          .select('title, type')
          .eq('is_active', true)
          .gte('created_at', weekAgo)
          .order('like_count', { ascending: false })
          .limit(10)
        if (data) {
          // Extract unique meaningful words (>3 chars)
          const words = new Map<string, number>()
          for (const post of data as any[]) {
            const title = (post.title ?? '').toLowerCase()
            title.split(/\s+/).forEach((w: string) => {
              if (w.length > 3) words.set(w, (words.get(w) ?? 0) + 1)
            })
          }
          const sorted = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          setTrending(sorted.map(([w]) => w))
        }
      } catch {}
    }
    fetchTrending()
  }, [supabase])

  const addToHistory = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) return
    setHistory(prev => {
      const updated = [query, ...prev.filter(h => h !== query)].slice(0, MAX_HISTORY)
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => {})
      return updated
    })
  }, [])

  const clearHistory = useCallback(async () => {
    setHistory([])
    await AsyncStorage.removeItem(HISTORY_KEY).catch(() => {})
  }, [])

  const getSuggestions = useCallback((query: string): SearchSuggestion[] => {
    const q = query.toLowerCase().trim()
    const results: SearchSuggestion[] = []

    // History matches first
    for (const h of history) {
      if (h.toLowerCase().includes(q) || q === '') {
        results.push({ text: h, type: 'history' })
      }
      if (results.length >= 3) break
    }

    // Trending matches
    for (const t of trending) {
      if (t.includes(q) && !results.some(r => r.text === t)) {
        results.push({ text: t, type: 'trending' })
      }
      if (results.length >= 6) break
    }

    return results
  }, [history, trending])

  return { getSuggestions, addToHistory, clearHistory, history, trending }
}
