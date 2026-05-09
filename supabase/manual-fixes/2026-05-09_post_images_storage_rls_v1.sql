BEGIN;

-- Lisätään puuttuva INSERT-policy 'post-images'-bucketille.
-- Sallii authenticated-käyttäjien upload:n omaan kansioonsa
-- (path muodossa <auth.uid()>/<temp_id>/<idx>.<ext>, kuten new-listing.tsx tekee).
CREATE POLICY "Owner upload post-images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- UPDATE-policy upsert-flow:lle (uusi kuva samaan polkuun korvaa vanhan).
CREATE POLICY "Owner update post-images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

COMMIT;
