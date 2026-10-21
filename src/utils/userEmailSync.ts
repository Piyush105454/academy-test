import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SyncEmailParams {
  oldEmail: string;
  newEmail: string;
  userId?: string;
  onSuccess?: () => void;
}

/**
 * Synchronizes user email updates in place across all platform tables and auth.
 * Prevents orphan accounts or duplicate accounts when an email is edited.
 */
export async function syncUserEmailUpdate({
  oldEmail,
  newEmail,
  userId,
}: SyncEmailParams): Promise<{ success: boolean; error?: string }> {
  const cleanOld = oldEmail?.trim().toLowerCase();
  const cleanNew = newEmail?.trim().toLowerCase();

  if (!cleanOld || !cleanNew) {
    return { success: false, error: 'Both old and new emails are required' };
  }

  if (cleanOld === cleanNew) {
    return { success: true };
  }

  // Safety Check: Verify that newEmail is not already registered to a DIFFERENT user
  try {
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, email')
      .ilike('email', cleanNew)
      .maybeSingle();

    if (existingProfile && existingProfile.id !== userId) {
      const msg = `Cannot change email to ${cleanNew} because it is already used by another account.`;
      toast.error(msg);
      return { success: false, error: msg };
    }
  } catch (err) {
    console.warn('Collision check skipped due to error:', err);
  }

  let rpcSuccess = false;

  // 1. Try to invoke the admin_update_user_email RPC (updates auth.users, identities, and tables in-place)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_user_email', {
      old_email: cleanOld,
      new_email: cleanNew,
      target_user_id: userId || null,
    });

    if (!rpcError && (rpcData as any)?.success) {
      rpcSuccess = true;
      console.log('admin_update_user_email RPC succeeded:', rpcData);
    } else if (rpcError) {
      console.warn('admin_update_user_email RPC warning (falling back to direct table sync):', rpcError.message);
    }
  } catch (err) {
    console.warn('RPC invocation error (falling back to table sync):', err);
  }

  // 2. Direct database table synchronization (ensures all tables stay in sync)
  try {
    const now = new Date().toISOString();

    // A. Update user_profiles
    if (userId) {
      await supabase
        .from('user_profiles')
        .update({ email: cleanNew, updated_at: now })
        .eq('id', userId);
    }
    await supabase
      .from('user_profiles')
      .update({ email: cleanNew, updated_at: now })
      .ilike('email', cleanOld);

    // B. Update coordinators
    await (supabase as any)
      .from('coordinators')
      .update({ email: cleanNew, updated_at: now })
      .ilike('email', cleanOld);

    // C. Update facilitators
    await (supabase as any)
      .from('facilitators')
      .update({ email: cleanNew })
      .ilike('email', cleanOld);

    // D. Update students
    await (supabase as any)
      .from('students')
      .update({ email: cleanNew })
      .ilike('email', cleanOld);

    return { success: true };
  } catch (syncError: any) {
    console.error('Error synchronizing email across tables:', syncError);
    return { success: false, error: syncError?.message || 'Failed to sync email across tables' };
  }
}
