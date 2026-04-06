-- Applied to production 2026-04-06
-- Fixes: 3 storage buckets missing RLS policies (uploads silently failed)

-- post-images: code uses this bucket (not 'posts')
CREATE POLICY "Public read post-images" ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');
CREATE POLICY "Auth upload post-images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owner delete post-images" ON storage.objects FOR DELETE
  USING (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- message-images: code uses this bucket (not 'messages')
CREATE POLICY "Auth read message-images" ON storage.objects FOR SELECT
  USING (bucket_id = 'message-images' AND auth.role() = 'authenticated');
CREATE POLICY "Auth upload message-images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'message-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- group-images: was completely unprotected
CREATE POLICY "Public read group-images" ON storage.objects FOR SELECT
  USING (bucket_id = 'group-images');
CREATE POLICY "Auth upload group-images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'group-images' AND auth.role() = 'authenticated');
