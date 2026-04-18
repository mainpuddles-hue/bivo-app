-- Sprint I: Fix missing message-images bucket + atomic points increment

-- 1. Create the 'message-images' bucket that the app code references
--    (was missing from 20260406_missing_tables_and_storage.sql)
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-images', 'message-images', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for message-images: authenticated users can upload and read
CREATE POLICY "message_images_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-images');

CREATE POLICY "message_images_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'message-images');

-- 2. Atomic points increment to fix race condition in usePoints.ts fallback
--    Two concurrent awards previously could lose points due to read-then-write
CREATE OR REPLACE FUNCTION increment_points(user_id_param UUID, points_param INT)
RETURNS VOID AS $$
  UPDATE profiles
  SET total_points = COALESCE(total_points, 0) + points_param
  WHERE id = user_id_param;
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION increment_points(UUID, INT) TO authenticated;
