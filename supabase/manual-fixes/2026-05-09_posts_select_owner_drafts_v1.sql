BEGIN;

-- Allow users to always SELECT their own posts (including is_active=false drafts).
-- This both fixes the INSERT-with-RETURNING failure and lets owners view their
-- drafts/inactive posts in profile screens.
ALTER POLICY posts_select ON public.posts
  USING (
    -- Always visible to the author, regardless of activation/operator/blocks
    user_id = auth.uid()
    OR (
      is_active = true
      AND (
        (operator_id IS NULL)
        OR (operator_id = get_user_operator_id())
        OR is_operator_admin(operator_id)
        OR is_platform_admin()
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users
        WHERE (
          (blocked_users.blocker_id = auth.uid() AND blocked_users.blocked_id = posts.user_id)
          OR (blocked_users.blocker_id = posts.user_id AND blocked_users.blocked_id = auth.uid())
        )
      )
    )
  );

COMMIT;
