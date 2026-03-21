import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SmartMatch {
  postId: string
  postTitle: string
  matchedTags: string[]
  posterName: string
}

export function useSmartMatch(userId: string | null) {
  const [matches, setMatches] = useState<SmartMatch[]>([])
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!userId) return

    // Subscribe to new "tarvitsen" posts and check for tag matches
    // with the current user's "tarjoan" posts
    const channel = supabase
      .channel('smart-match')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: 'type=eq.tarvitsen',
      }, async (payload) => {
        const newPost = payload.new as any
        if (!newPost?.tags?.length || newPost.user_id === userId) return

        // Check if current user has tarjoan posts with matching tags
        const { data: userPosts } = await (supabase
          .from('posts')
          .select('id, tags')
          .eq('user_id', userId)
          .eq('type', 'tarjoan')
          .eq('is_active', true) as any)

        if (!userPosts?.length) return

        const userTags = new Set(userPosts.flatMap((p: any) => p.tags ?? []))
        const matchedTags = (newPost.tags as string[]).filter(t => userTags.has(t))

        if (matchedTags.length > 0) {
          // Fetch poster name
          const { data: poster } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', newPost.user_id)
            .single()

          setMatches(prev => [...prev, {
            postId: newPost.id,
            postTitle: newPost.title,
            matchedTags,
            posterName: (poster as any)?.name ?? 'Naapuri',
          }])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase])

  const dismissMatch = (postId: string) => {
    setMatches(prev => prev.filter(m => m.postId !== postId))
  }

  return { matches, dismissMatch }
}
