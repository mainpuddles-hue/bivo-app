import { useState, useEffect, useRef } from 'react'
import { useSupabase } from './useSupabase'

// PERF: Defer realtime subscription by this many ms after initial fetch
const REALTIME_DEFER_MS = 5000

export function useUnreadCount(userId: string | null) {
  const supabase = useSupabase()
  const [count, setCount] = useState(0)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!userId) return
    let mounted = true

    async function fetchUnread() {
      // Count messages where user is recipient and is_read = false
      // First get all conversations where user is participant
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

      if (mounted) {
        setCount(unread ?? 0)
        fetchedRef.current = true
      }
    }

    fetchUnread()

    // PERF: Defer realtime subscription — badge updates can wait a few seconds
    let channel: ReturnType<typeof supabase.channel> | null = null
    const timer = setTimeout(() => {
      if (!mounted) return
      channel = supabase
        .channel('unread-badge')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
          fetchUnread() // Refetch on any new message
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
          fetchUnread() // Refetch when messages marked read
        })
        .subscribe()
    }, REALTIME_DEFER_MS)

    return () => {
      mounted = false
      clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  return count
}
