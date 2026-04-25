-- Add GPS-based address verification columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS address_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_address text,
  ADD COLUMN IF NOT EXISTS address_verified_at timestamptz;
