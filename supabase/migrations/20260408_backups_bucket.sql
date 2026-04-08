-- Create private storage bucket for database backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Allow service_role full access to backups bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'service_role_backups_all'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "service_role_backups_all" ON storage.objects
    FOR ALL USING (bucket_id = 'backups' AND auth.role() = 'service_role');
  END IF;
END $$;
