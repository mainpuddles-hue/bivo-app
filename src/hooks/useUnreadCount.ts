import { useState, useEffect } from 'react'
import { useSupabase } from './useSupabase'

export function useUnreadCount(userId: string | null) {
  const supabase = useSupabase()
  const [count, setCount] = useState(0)

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

      if (mounted) setCount(unread ?? 0)
    }

    fetchUnread()

    // Subscribe to new messages for realtime badge
    const channel = supabase
      .channel('unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchUnread() // Refetch on any new message
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        fetchUnread() // Refetch when messages marked read
      })
      .subscribe()

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [userId, supabase])

  return count
}
