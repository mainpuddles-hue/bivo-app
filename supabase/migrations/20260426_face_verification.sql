-- Add face_verified column to profiles for AI-based face detection verification
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS face_verified boolean NOT NULL DEFAULT false;

-- Index for quick lookup of verified users
CREATE INDEX IF NOT EXISTS idx_profiles_face_verified ON profiles(face_verified) WHERE face_verified = true;
