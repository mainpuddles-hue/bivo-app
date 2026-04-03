/**
 * Messages API — centralized data access for conversations and messages.
 */
import { createClient } from '@/lib/supabase/client'
import { isValidUUID } from '@/lib/validation'
import type { Message, Conversation } from '@/lib/types'

const supabase = () => createClient()

/** Fetch conversations for a user */
export async function fetchConversations(userId: string): Promise<Conversation[]> {
  if (!isValidUUID(userId)) return []

  const { data, error } = await supabase()
    .from('conversations')
    .select('*, user1:profiles!conversations_user1_id_fkey(id, name, avatar_url), user2:profiles!conversations_user2_id_fkey(id, name, avatar_url), last_message:messages(content, created_at, sender_id, image_url)')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []) as unknown as Conversation[]
}

/** Fetch messages for a conversation with pagination */
export async function fetchMessages(conversationId: string, limit = 30, before?: string): Promise<{ messages: Message[]; hasMore: boolean }> {
  let query = supabase()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query
  if (error) throw error
  const messages = (data ?? []) as unknown as Message[]
  return { messages, hasMore: messages.length >= limit }
}

/** Send a text message */
export async function sendMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
  const { data, error } = await (supabase().from('messages') as any)
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: content.trim(),
    })
    .select('*')
    .single()

  if (error) throw error

  // Update conversation timestamp
  await (supabase().from('conversations') as any)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return data as unknown as Message
}

/** Mark messages as read */
export async function markMessagesRead(conversationId: string, userId: string): Promise<void> {
  await (supabase().from('messages') as any)
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false)
}

/** Find or create a conversation between two users */
export async function findOrCreateConversation(
  userId: string,
  otherUserId: string,
  postId?: string,
): Promise<string> {
  if (!isValidUUID(userId) || !isValidUUID(otherUserId)) {
    throw new Error('Invalid user ID')
  }

  // Check for existing conversation
  const { data: existing } = await supabase()
    .from('conversations')
    .select('id')
    .or(`and(user1_id.eq.${userId},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${userId})`)
    .maybeSingle()

  if (existing) return (existing as any).id

  // Create new conversation
  const { data, error } = await (supabase().from('conversations') as any)
    .insert({
      user1_id: userId,
      user2_id: otherUserId,
      post_id: postId ?? null,
    })
    .select('id')
    .single()

  if (error) throw error
  return (data as any).id
}
