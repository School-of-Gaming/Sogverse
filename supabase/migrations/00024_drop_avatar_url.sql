-- Drop avatar_url column from profiles (replaced by Identicons generated from user ID)

-- Revoke column-level UPDATE grant that includes avatar_url, re-grant for remaining columns
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (display_name) ON profiles TO authenticated;

-- Drop the column
ALTER TABLE profiles DROP COLUMN avatar_url;
