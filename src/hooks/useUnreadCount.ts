import { useState, useEffect, useRef } from 'react'
import { useSupabase } from './useSupabase'

// Note: app-icon badge count is managed centrally in app/(tabs)/_layout.tsx
// using totalUnread = useUnreadCount + useEventChatUnread to avoid the two
// hooks overwriting each other's badge value.
export function useUnreadCount(userId: string | null) {
  const supabase = useSupabase()
  const [count, setCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache conversation IDs to filter realtime events without extra queries
  const convIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) {
      setCount(0)
      return
    }
    let mounted = true

    async function fetchUnread() {
      // Get user's conversation IDs
      const { data: convs, error: convsError } = await supabase
        .from('conversations')
        .select('id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)

      if (convsError) {
        if (__DEV__) console.warn('[useUnreadCount] conversations fetch failed:', convsError.message)
        return
      }
      if (!convs || !mounted) return
      const convIds = convs.map((c: any) => c.id)
      convIdsRef.current = new Set(convIds)
      if (convIds.length === 0) { setCount(0); return }

      const { count: unread, error: msgError } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', userId)
        .eq('is_read', false)

      if (msgError) {
        if (__DEV__) console.warn('[useUnreadCount] messages count failed:', msgError.message)
        return // preserve previous count on error
      }
      if (mounted) setCount(unread ?? 0)
    }

    fetchUnread()

    // Debounced refetch to avoid rapid-fire queries from realtime events
    function debouncedFetchUnread() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        fetchUnread()
      }, 500) // Wait 500ms to batch rapid message events
    }

    // Remove any stale channel with same name before creating a new one
    const channelName = `unread-badge-${userId}`
    const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    // Subscribe to messages — filter out own messages on INSERT.
    // Supabase realtime only supports a single eq() filter, so we use
    // is_read=false for UPDATEs (mark-as-read) and check conversation
    // membership client-side via convIdsRef to skip irrelevant events.
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as any
          // Skip own messages and messages from other users' conversations
          if (msg.sender_id === userId) return
          if (!convIdsRef.current.has(msg.conversation_id)) return
          debouncedFetchUnread()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: 'is_read=eq.true' },
        (payload) => {
          const msg = payload.new as any
          // Only refetch when messages in our conversations are marked read
          if (!convIdsRef.current.has(msg.conversation_id)) return
          debouncedFetchUnread()
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (__DEV__) console.warn('[useUnreadCount] Realtime channel error:', status)
        }
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [userId, supabase])

  return count
}
