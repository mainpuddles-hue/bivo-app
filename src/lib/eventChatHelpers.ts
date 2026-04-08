declare const __DEV__: boolean

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Create a group conversation for an event and link it.
 * Uses the existing conversations + conversation_members tables.
 */
export async function createEventChat(
  supabase: SupabaseClient,
  eventId: string,
  eventTitle: string,
  creatorId: string,
): Promise<string | null> {
  try {
    // Create group conversation
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        is_group: true,
        group_name: eventTitle,
        user1_id: creatorId,
      })
      .select('id')
      .single()

    if (convError || !conv) {
      if (__DEV__) console.warn('[eventChat] Failed to create conversation:', convError?.message)
      return null
    }

    // Add creator as first member
    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert({ conversation_id: conv.id, user_id: creatorId })

    if (memberError) {
      if (__DEV__) console.warn('[eventChat] Failed to add creator as member:', memberError.message)
      return null
    }

    // Link conversation to community event
    const { error: linkError } = await supabase
      .from('community_events')
      .update({ conversation_id: conv.id })
      .eq('id', eventId)

    if (linkError) {
      if (__DEV__) console.warn('[eventChat] Failed to link conversation to event:', linkError.message)
    }

    return conv.id
  } catch (err) {
    if (__DEV__) console.warn('[eventChat] createEventChat error:', err)
    return null
  }
}

/**
 * Add a user to the event's group chat.
 * Looks up the conversation_id from the event, then adds the member.
 */
export async function addMemberToChat(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<void> {
  try {
    const { data: event } = await supabase
      .from('community_events')
      .select('conversation_id')
      .eq('id', eventId)
      .maybeSingle()

    if (!event?.conversation_id) return

    await supabase
      .from('conversation_members')
      .upsert(
        { conversation_id: event.conversation_id, user_id: userId },
        { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
      )
  } catch (err) {
    if (__DEV__) console.warn('[eventChat] addMemberToChat error:', err)
  }
}

/**
 * Remove a user from the event's group chat.
 */
export async function removeMemberFromChat(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<void> {
  try {
    const { data: event } = await supabase
      .from('community_events')
      .select('conversation_id')
      .eq('id', eventId)
      .maybeSingle()

    if (!event?.conversation_id) return

    await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', event.conversation_id)
      .eq('user_id', userId)
  } catch (err) {
    if (__DEV__) console.warn('[eventChat] removeMemberFromChat error:', err)
  }
}
