import { useState, useEffect, useRef } from 'react'
import { useSupabase } from './useSupabase'

export function useUnreadCount(userId: string | null) {
  const supabase = useSupabase()
  const [count, setCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) return
    let mounted = true

    async function fetchUnread() {
      // Combine into fewer queries: get conversation IDs and unread count in parallel
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)

      if (!convs || !mounted) return
      const convIds = convs.map((c: any) => c.id)
      if (convIds.length === 0) { setCount(0); return }

      const { count: unread } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', userId)
        .eq('is_read', false)

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

    // Subscribe to new messages for realtime badge
    const channel = supabase
      .channel(`unread-badge-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        debouncedFetchUnread()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        debouncedFetchUnread()
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [userId, supabase])

  return count
}
