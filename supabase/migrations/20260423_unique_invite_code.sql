-- Add unique partial index on profiles.invite_code to prevent TOCTOU race
-- condition in invite code generation. NULL values are allowed (most users
-- won't have a code yet), and PostgreSQL UNIQUE allows multiple NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_unique
  ON profiles (invite_code)
  WHERE invite_code IS NOT NULL;
