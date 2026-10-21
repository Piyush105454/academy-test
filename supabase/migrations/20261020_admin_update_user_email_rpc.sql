-- Migration: Add admin_update_user_email RPC to update a user's email in place across auth.users and all platform tables
CREATE OR REPLACE FUNCTION admin_update_user_email(
  old_email TEXT,
  new_email TEXT,
  target_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  caller_role_id INT;
  actual_user_id UUID := target_user_id;
  user_found BOOLEAN := false;
BEGIN
  -- 1. Security Check: Only administrators (role_id = 1) can update user emails
  SELECT role_id INTO caller_role_id FROM public.user_profiles WHERE id = auth.uid();
  
  IF caller_role_id IS NULL OR caller_role_id != 1 THEN
    RAISE EXCEPTION 'Access denied. Only administrators can update user emails.';
  END IF;

  old_email := lower(trim(old_email));
  new_email := lower(trim(new_email));

  IF old_email = new_email THEN
    RETURN jsonb_build_object('success', true, 'message', 'Emails are identical, no update needed');
  END IF;

  -- 2. Find target user in auth.users if target_user_id is null
  IF actual_user_id IS NULL THEN
    SELECT id INTO actual_user_id FROM auth.users WHERE lower(email) = old_email LIMIT 1;
  END IF;

  -- 3. If target user exists in auth.users, update auth.users and auth.identities
  IF actual_user_id IS NOT NULL THEN
    user_found := true;

    UPDATE auth.users
    SET 
      email = new_email,
      updated_at = now(),
      email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = actual_user_id;

    -- Update identities table for email logins
    UPDATE auth.identities
    SET 
      identity_data = jsonb_build_object('sub', actual_user_id, 'email', new_email),
      provider_id = new_email,
      updated_at = now()
    WHERE user_id = actual_user_id AND provider = 'email';
  END IF;

  -- 4. Update public.user_profiles
  IF actual_user_id IS NOT NULL THEN
    UPDATE public.user_profiles
    SET email = new_email, updated_at = now()
    WHERE id = actual_user_id OR lower(email) = old_email;
  ELSE
    UPDATE public.user_profiles
    SET email = new_email, updated_at = now()
    WHERE lower(email) = old_email;
  END IF;

  -- 5. Update public.coordinators
  UPDATE public.coordinators
  SET email = new_email, updated_at = now()
  WHERE lower(email) = old_email;

  -- 6. Update public.facilitators
  UPDATE public.facilitators
  SET email = new_email
  WHERE lower(email) = old_email;

  -- 7. Update public.students
  UPDATE public.students
  SET email = new_email
  WHERE lower(email) = old_email;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', actual_user_id,
    'old_email', old_email,
    'new_email', new_email,
    'auth_updated', user_found
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_update_user_email(TEXT, TEXT, UUID) TO authenticated;
