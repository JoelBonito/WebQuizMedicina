-- Debug script to check roles configuration

-- 1. Check if role column exists in profiles table
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'role';

-- 2. Check current profiles with roles
SELECT id, display_name, role, created_at
FROM profiles;

-- 3. Check if is_admin function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'is_admin';

-- 4. Test is_admin function for a specific user (replace with your admin user_id)
-- SELECT is_admin();
