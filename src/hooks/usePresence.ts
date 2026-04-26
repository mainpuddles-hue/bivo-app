declare const __DEV__: boolean

import { useState, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useSupabase } from './useSupabase'

/**
 * Track user presence and count online users in neighborhood.
 * Uses Supabase Realtime Presence channels + profiles.last_seen_at heartbeat.
 */
export function usePresence(userId: string | null, neighborhood: string | null) {
  const supabase = useSupabase()
  const [onlineCount, setOnlineCount] = useState(0)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const channelRef = useRef<any>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Heartbeat: update profiles.last_seen_at every 5 min
  useEffect(() => {
    if (!userId) return
    let mounted = true

    const updateLastSeen = () => {
      if (!mounted) return
      ;(supabase.from('profiles') as any)
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId)
        .then(({ error }: { error: any }) => {
          if (error && __DEV__) console.warn('usePresence:updateLastSeen:', error.message)
        })
        .catch((e: unknown) => { if (__DEV__) console.warn('usePresence:updateLastSeen:', e) })
    }

    // Immediately mark as online
    updateLastSeen()

    heartbeatRef.current = setInterval(updateLastSeen, 5 * 60000)

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateLastSeen()
    })

    return () => {
      mounted = false
      subscription.remove()
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [userId, supabase])

  // Realtime Presence channel
  useEffect(() => {
    if (!userId || !neighborhood) return
    let mounted = true

    const channelName = `presence:${neighborhood.toLowerCase().replace(/\s/g, '_')}`
    const presExisting = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`)
    if (presExisting) supabase.removeChannel(presExisting)

    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        if (!mounted) return
        const state = channel.presenceState()
        const userIds = Object.keys(state)
        setOnlineCount(userIds.length)
        setOnlineUsers(userIds.slice(0, 10))
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED' && mounted) {
          try {
            await channel.track({ user_id: userId, online_at: new Date().toISOString() })
          } catch (e) {
            if (__DEV__) console.warn('usePresence:track:', e)
          }
        }
      })

    channelRef.current = channel

    // Track app state — untrack when backgrounded
    const appSub = AppState.addEventListener('change', (state) => {
      if (!mounted || !channelRef.current) return
      if (state === 'active') {
        channelRef.current.track({ user_id: userId, online_at: new Date().toISOString() }).catch(() => {})
      } else if (state === 'background') {
        channelRef.current.untrack().catch(() => {})
      }
    })

    return () => {
      mounted = false
      appSub.remove()
      channel.untrack().catch(() => {})
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [userId, neighborhood, supabase])

  return { onlineCount, onlineUsers }
}
