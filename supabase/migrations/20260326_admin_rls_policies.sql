-- Admin-only RLS policies for moderation actions
-- Run this against the Supabase project to ensure content_flags and profiles
-- have proper admin-only update policies.

-- Allow admins to update content_flags (approve/reject reports)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_content_flags' AND tablename = 'content_flags'
  ) THEN
    EXECUTE 'CREATE POLICY admin_update_content_flags ON content_flags FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))';
  END IF;
END $$;

-- Allow users to update their own profile, OR admins to update any profile (for banning)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_profiles_banned' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'CREATE POLICY admin_update_profiles_banned ON profiles FOR UPDATE USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))';
  END IF;
END $$;
