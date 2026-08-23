import { ReactNode, useEffect, useState } from 'react';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import MaintenancePage from '@/pages/MaintenancePage';
import { Wrench, ShieldAlert, Power, ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function MaintenanceGuard({ children }: { children: ReactNode }) {
  const { isDevMode, toggleDevMode } = useDeveloperMode();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkAdminStatus = async () => {
      if (!user?.id) {
        if (isMounted) setIsAdmin(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();

        if (isMounted) {
          if (data?.role_id === 1) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        }
      } catch (err) {
        console.error('Error checking admin status in MaintenanceGuard:', err);
        if (isMounted) setIsAdmin(false);
      }
    };

    checkAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Public auth pages should remain accessible even during maintenance so admins can log in
  const isAuthPage = location.pathname === '/auth' || location.pathname === '/student-auth';

  // If Maintenance Mode is ON:
  if (isDevMode && !isAuthPage) {
    // If user is not authenticated or not an admin, show Maintenance Page
    if (isAdmin === false || (!user && isAdmin === null)) {
      return <MaintenancePage />;
    }
  }

  return (
    <>
      {/* Floating Developer Alert Bar for Admin when Dev Mode is ON */}
      {isDevMode && isAdmin === true && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 flex items-center justify-between shadow-md text-xs md:text-sm font-semibold border-b border-amber-600 sticky top-0 z-[100]">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 animate-bounce text-slate-950 flex-shrink-0" />
            <span>
              <strong>DEVELOPER MODE IS ON:</strong> Platform is in Maintenance Mode for normal users. You have developer access.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/dev-mode">
              <Button size="sm" variant="secondary" className="h-7 bg-slate-950 text-white hover:bg-slate-900 text-xs gap-1.5 border border-slate-800">
                Dev Management
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>

            <Button
              size="sm"
              onClick={() => toggleDevMode(false)}
              className="h-7 bg-rose-700 text-white hover:bg-rose-800 text-xs font-bold gap-1 px-2.5"
            >
              <Power className="h-3.5 w-3.5" />
              Turn OFF
            </Button>
          </div>
        </div>
      )}

      {children}
    </>
  );
}
