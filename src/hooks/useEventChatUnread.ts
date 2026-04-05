declare const __DEV__: boolean

import { useState, useEffect, useRef } from 'react'
import { useSupabase } from './useSupabase'

/**
 * Counts total unread messages across all event group chats the user belongs to.
 * Uses the existing conversations + messages infrastructure (is_group = true events).
 */
export function useEventChatUnread(userId: string | null) {
  const supabase = useSupabase()
  const [count, setCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const convIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    let mounted = true

    async function fetchUnread() {
      try {
        // Get group conversations this user is a member of
        const { data: memberships } = await (supabase.from('conversation_members') as any)
          .select('conversation_id')
          .eq('user_id', userId)

        if (!memberships || !mounted) return
        const convIds = memberships.map((m: any) => m.conversation_id)
        convIdsRef.current = new Set(convIds)
        if (convIds.length === 0) { setCount(0); return }

        // Count unread messages in those conversations
        const { count: unread } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', userId)
          .eq('is_read', false)

        if (mounted) setCount(unread ?? 0)
      } catch (err) {
        if (__DEV__) console.warn('[useEventChatUnread] error:', err)
      }
    }

    fetchUnread()

    function debouncedFetchUnread() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (mounted) fetchUnread()
      }, 500)
    }

    const channel = supabase
      .channel(`event-chat-unread-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as any
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
          if (!convIdsRef.current.has(msg.conversation_id)) return
          debouncedFetchUnread()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  return count
}
