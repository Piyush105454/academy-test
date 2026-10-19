import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const ROLE_NAMES: Record<number, string> = {
  1: 'Admin',
  2: 'Supervisor',
  3: 'Coordinator',
  4: 'Facilitator',
  5: 'Student',
};

export const ROLE_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  2: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  3: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  4: { bg: 'bg-pink-50 dark:bg-pink-950/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800' },
  5: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
};

export function useUserRole() {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<number | null>(() => {
    const saved = localStorage.getItem('user_role');
    return saved ? parseInt(saved, 10) : null;
  });
  const [availableRoles, setAvailableRoles] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if (!user) {
      setUserRole(null);
      setAvailableRoles([]);
      setIsLoading(false);
      return;
    }

    const detectRoles = async () => {
      try {
        setIsLoading(true);
        const rolesSet = new Set<number>();
        const email = user.email?.trim().toLowerCase();

        // 1. Fetch user_profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, role_id')
          .eq('id', user.id)
          .maybeSingle();

        let activeRoleId = profile?.role_id;

        if (!profile && email) {
          const { data: emailProfile } = await supabase
            .from('user_profiles')
            .select('id, role_id')
            .ilike('email', email)
            .limit(1)
            .maybeSingle();
          if (emailProfile?.role_id) activeRoleId = emailProfile.role_id;
        }

        if (activeRoleId) rolesSet.add(activeRoleId);

        // 2. Check coordinators table by email
        if (email) {
          const { data: coord } = await supabase
            .from('coordinators')
            .select('id, status')
            .ilike('email', email)
            .maybeSingle();
          if (coord && coord.status !== 'inactive') {
            rolesSet.add(3); // Coordinator
          }
        }

        // 3. Check facilitators table by email
        if (email) {
          const { data: facil } = await supabase
            .from('facilitators')
            .select('id, status')
            .ilike('email', email)
            .maybeSingle();
          if (facil && facil.status !== 'inactive') {
            rolesSet.add(4); // Facilitator
          }
        }

        // 4. Check students table by email
        if (email) {
          const { data: stud } = await supabase
            .from('students')
            .select('id, status')
            .ilike('email', email)
            .maybeSingle();
          if (stud && stud.status !== 'inactive') {
            rolesSet.add(5); // Student
          }
        }

        // Admin (role 1) has authority to switch to staff roles
        if (activeRoleId === 1) {
          rolesSet.add(1);
          rolesSet.add(2);
          rolesSet.add(3);
          rolesSet.add(4);
        }

        const rolesArray = Array.from(rolesSet);

        // Saved role in localStorage
        const savedRole = localStorage.getItem('user_role');
        const parsedSaved = savedRole ? parseInt(savedRole, 10) : null;

        let effectiveRole = activeRoleId || (rolesArray.length > 0 ? rolesArray[0] : null);
        if (parsedSaved && rolesSet.has(parsedSaved)) {
          effectiveRole = parsedSaved;
        }

        if (isMounted) {
          setAvailableRoles(rolesArray);
          setUserRole(effectiveRole);
          if (effectiveRole) {
            localStorage.setItem('user_role', effectiveRole.toString());
          }
        }
      } catch (err) {
        console.error('Error detecting user roles:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    detectRoles();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const switchRole = async (newRoleId: number) => {
    if (!user) return;
    
    // Strict security check: User cannot switch to a role that is not verified in availableRoles
    if (!availableRoles.includes(newRoleId)) {
      console.warn('Unauthorized role switch attempt:', newRoleId, 'Available:', availableRoles);
      toast.error('You are not authorized to switch to this role');
      return;
    }

    try {
      // 1. Update in user_profiles
      const { error } = await supabase
        .from('user_profiles')
        .update({ role_id: newRoleId, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error && user.email) {
        // Fallback by email
        await supabase
          .from('user_profiles')
          .update({ role_id: newRoleId, updated_at: new Date().toISOString() })
          .ilike('email', user.email);
      }

      // 2. Update localStorage
      localStorage.setItem('user_role', newRoleId.toString());
      setUserRole(newRoleId);

      // 3. Determine redirect target
      const targetPath = newRoleId === 5 ? '/student-dashboard' : '/dashboard';
      toast.success(`Switched to ${ROLE_NAMES[newRoleId] || 'Role'} mode`);

      // 4. Navigate
      window.location.href = targetPath;
    } catch (error) {
      console.error('Error switching role:', error);
      toast.error('Failed to switch role');
    }
  };

  return {
    userRole,
    availableRoles,
    isMultiRole: availableRoles.length > 1,
    roleNames: ROLE_NAMES,
    roleColors: ROLE_COLORS,
    switchRole,
    isLoading,
  };
}
