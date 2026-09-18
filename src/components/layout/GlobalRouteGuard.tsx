import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function GlobalRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [role, setRole] = useState<number | null>(null);
  const [roleFetchedFor, setRoleFetchedFor] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    
    const isAuthRoute = location.pathname === '/auth' || location.pathname === '/student-auth' || location.pathname === '/';
    
    if (!user) {
      if (!isAuthRoute) {
        navigate('/auth', { replace: true });
      }
      setIsChecking(false);
      return;
    }

    let isMounted = true;

    const verifyAccess = async () => {
      try {
        let currentRole = role;
        
        // Fetch role if not already fetched for the current user
        if (roleFetchedFor !== user.id) {
          setIsChecking(true);
          let fetchedRole = null;
          const { data } = await supabase.from('user_profiles').select('role_id').eq('id', user.id).maybeSingle();
          
          if (data?.role_id) {
            fetchedRole = data.role_id;
          } else {
            const { data: emailData } = await supabase.from('user_profiles').select('role_id').ilike('email', user.email || '').limit(1).maybeSingle();
            if (emailData?.role_id) fetchedRole = emailData.role_id;
          }
          
          if (!isMounted) return;
          setRole(fetchedRole);
          setRoleFetchedFor(user.id);
          currentRole = fetchedRole;
        }
        
        // Now check authorization for the current path
        const isStudent = currentRole === 5;
        const path = location.pathname;
        
        // Define allowed paths for students
        const isStudentPath = 
          path.startsWith('/student-') || 
          path === '/class-task-review' || 
          path === '/profile/edit' ||
          path === '/student-support' ||
          path === '/auth';
          
        const isStudentPerformance = path.startsWith('/student-performance');

        if (isStudent) {
          // Prevent student from accessing staff pages
          if (!isStudentPath || isStudentPerformance) {
            toast.error('You do not have permission to access this page');
            navigate('/student-dashboard', { replace: true });
            return;
          }
        } else {
          // Prevent staff from accessing student pages (except auth and profile)
          if (isStudentPath && path !== '/profile/edit' && path !== '/auth' && path !== '/student-auth') {
            toast.error('You do not have permission to access the student portal');
            navigate('/dashboard', { replace: true });
            return;
          }
        }
        
        if (isMounted) setIsChecking(false);
      } catch (err) {
        console.error('Error verifying access:', err);
        if (isMounted) setIsChecking(false);
      }
    };
    
    verifyAccess();
    
    return () => {
      isMounted = false;
    };
  }, [user, loading, location.pathname, navigate, role, roleFetchedFor]);

  if (loading || isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
