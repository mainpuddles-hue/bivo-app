declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSupabase } from './useSupabase'
import { EVENT_CHAT_PAGE_SIZE } from '@/lib/constants'
import type { Message } from '@/lib/types'

interface EventChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  image_url: string | null
  is_read: boolean
  created_at: string
  sender?: { id: string; name: string; avatar_url: string | null }
}

/**
 * Hook for event group chat — reuses the existing conversations/messages infrastructure.
 * The `conversationId` is the conversation linked to the event via community_events.conversation_id.
 */
export function useEventChat(conversationId: string | null, userId: string | null) {
  const supabase = useSupabase()
  const [messages, setMessages] = useState<EventChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const messagesRef = useRef<EventChatMessage[]>([])
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  messagesRef.current = messages
  // Cache sender profiles to avoid N+1 SELECTs on every incoming realtime message
  const senderCacheRef = useRef<Map<string, { id: string; name: string; avatar_url: string | null }>>(new Map())

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, image_url, is_read, created_at, sender:profiles!messages_sender_id_fkey(id, name, avatar_url)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(EVENT_CHAT_PAGE_SIZE)

      if (error) {
        if (__DEV__) console.warn('[useEventChat] fetch error:', error.message)
      }
      const msgs = (data ?? []) as EventChatMessage[]
      // Prime sender cache from the initial fetch so realtime handlers can
      // reuse these profiles instead of issuing individual SELECTs.
      for (const m of msgs) {
        if (m.sender) senderCacheRef.current.set(m.sender.id, m.sender)
      }
      setMessages(msgs)
      setHasOlder(msgs.length >= EVENT_CHAT_PAGE_SIZE)
    } catch (err) {
      if (__DEV__) console.warn('[useEventChat] error:', err)
    } finally {
      setLoading(false)
    }
  }, [conversationId, supabase])

  // Load older messages — use messagesRef to avoid re-creating callback on every message change
  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasOlder || messagesRef.current.length === 0) return
    const oldest = messagesRef.current[messagesRef.current.length - 1]
    try {
      const { data } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, image_url, is_read, created_at, sender:profiles!messages_sender_id_fkey(id, name, avatar_url)')
        .eq('conversation_id', conversationId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(EVENT_CHAT_PAGE_SIZE)

      if (!mountedRef.current) return
      const older = (data ?? []) as EventChatMessage[]
      if (older.length < EVENT_CHAT_PAGE_SIZE) setHasOlder(false)
      setMessages(prev => [...prev, ...older])
    } catch (err) {
      if (__DEV__) console.warn('[useEventChat] loadOlder error:', err)
    }
  }, [conversationId, hasOlder, supabase])

  // Send message
  const sendMessage = useCallback(async (content: string, imageUrl?: string) => {
    if (!conversationId || !userId || (!content.trim() && !imageUrl)) return false
    setSending(true)
    try {
      const { error } = await (supabase.from('messages') as any)
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: content.trim() || null,
          image_url: imageUrl ?? null,
        })

      if (error) {
        if (__DEV__) console.warn('[useEventChat] send error:', error.message)
        return false
      }
      return true
    } catch (err) {
      if (__DEV__) console.warn('[useEventChat] send error:', err)
      return false
    } finally {
      if (mountedRef.current) setSending(false)
    }
  }, [conversationId, userId, supabase])

  // Mark as read
  const markAsRead = useCallback(async () => {
    if (!conversationId || !userId) return
    try {
      await (supabase.from('messages') as any)
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId)
        .eq('is_read', false)
    } catch (err) {
      if (__DEV__) console.warn('[useEventChat] markAsRead error:', err)
    }
  }, [conversationId, userId, supabase])

  // Keep a stable ref to fetchMessages so the realtime effect doesn't need
  // it in its deps — avoids tearing down the channel on every re-render.
  const fetchMessagesRef = useRef(fetchMessages)
  fetchMessagesRef.current = fetchMessages

  // Subscribe to realtime
  useEffect(() => {
    if (!conversationId) return
    let mounted = true

    fetchMessagesRef.current()

    const channel = supabase
      .channel(`event-chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as any
          // Look up sender in cache first — avoids N+1 profile SELECTs on
          // every incoming realtime message
          let sender = senderCacheRef.current.get(newMsg.sender_id)
          if (!sender) {
            const { data: senderRow } = await supabase
              .from('profiles')
              .select('id, name, avatar_url')
              .eq('id', newMsg.sender_id)
              .maybeSingle()
            if (senderRow) {
              sender = senderRow as { id: string; name: string; avatar_url: string | null }
              senderCacheRef.current.set(sender.id, sender)
            }
          }

          if (!mounted) return

          const fullMsg: EventChatMessage = {
            ...newMsg,
            sender: sender ?? undefined,
          }
          // Deduplicate — the same message may already exist from a recent fetch
          setMessages(prev => {
            if (prev.some(m => m.id === fullMsg.id)) return prev
            return [fullMsg, ...prev]
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      mounted = false
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [conversationId, supabase])

  return {
    messages,
    loading,
    sending,
    hasOlder,
    sendMessage,
    loadOlder,
    markAsRead,
    refetch: fetchMessages,
  }
}
