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

    const updateLastSeen = () => {
      ;(supabase.from('profiles') as any)
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId)
        .then(() => {})
        .catch(() => {})
    }

    // Immediately mark as online
    updateLastSeen()

    heartbeatRef.current = setInterval(updateLastSeen, 5 * 60000)

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateLastSeen()
    })

    return () => {
      subscription.remove()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [userId, supabase])

  // Realtime Presence channel
  useEffect(() => {
    if (!userId || !neighborhood) return

    const channelName = `presence:${neighborhood.toLowerCase().replace(/\s/g, '_')}`
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const userIds = Object.keys(state)
        setOnlineCount(userIds.length)
        setOnlineUsers(userIds.slice(0, 10)) // Keep max 10 for display
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() })
        }
      })

    channelRef.current = channel

    // Track app state — untrack when backgrounded
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && channelRef.current) {
        channelRef.current.track({ user_id: userId, online_at: new Date().toISOString() })
      } else if (state === 'background' && channelRef.current) {
        channelRef.current.untrack()
      }
    })

    return () => {
      appSub.remove()
      supabase.removeChannel(channel)
    }
  }, [userId, neighborhood, supabase])

  return { onlineCount, onlineUsers }
}
