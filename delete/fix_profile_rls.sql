-- Fix RLS policies for profiles table

-- 1. Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 2. Drop the problematic admin policy if it exists
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 3. Verify the basic user policies work correctly
-- Keep the existing policies that allow users to view/update their own profile

-- 4. Test: Try to select your own profile
-- SELECT * FROM profiles WHERE id = auth.uid();
