import { Home, LogOut, CalendarDays, CheckSquare, Wallet, CalendarCheck, BookOpen, KeyRound, MessageCircle } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import wesLogo from '@/assets/wes-logo.jpg';
import { useState, useEffect } from 'react';
import { RoleSwitcher } from './RoleSwitcher';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { supabase } from '@/integrations/supabase/client';

const studentNavItems = [
  { title: 'My Dashboard', url: '/student-dashboard', icon: Home },
  { title: 'My Calendar', url: '/student-calendar', icon: CalendarDays },
  { title: 'My Tasks', url: '/student-tasks', icon: CheckSquare },
  { title: 'My Earnings', url: '/student-earnings', icon: Wallet },
  { title: 'My Attendance', url: '/student-attendance', icon: CalendarCheck },
  { title: 'My Curriculum', url: '/student-curriculum', icon: BookOpen },
  { title: 'Resource Hub', url: '/student-resources', icon: BookOpen },
  { title: 'Request Support', url: '/student-support', icon: MessageCircle },
];

const monitorNavItems = [
  { title: 'Class Task Review', url: '/class-task-review', icon: CheckSquare },
];

export function StudentSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [designation, setDesignation] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      const fetchDesignation = async () => {
        const { data, error } = await supabase
          .from('students')
          .select('designation')
          .ilike('email', user.email)
          .limit(1)
          .maybeSingle();
        
        if (data) {
          setDesignation(data.designation);
        }
      };
      fetchDesignation();
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border hover:bg-accent"
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 bottom-0 h-screen bg-card border-r border-border flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-0 md:w-16" : "w-64",
        isOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
      )}>
        <div className={cn(
          "h-full flex flex-col transition-all duration-300",
          collapsed ? "w-full md:w-16" : "w-64"
        )}>
          {/* Logo Section */}
          <div className={cn(
            "h-[72px] border-b border-border flex items-center transition-all duration-300",
            collapsed ? "px-2 justify-center" : "px-4 md:px-6"
          )}>
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={wesLogo}
                alt="WES Foundation Logo"
                className="h-10 md:h-12 w-10 md:w-12 object-contain shrink-0"
              />
              {!collapsed && (
                <div className="min-w-0">
                  <h1 className="font-bold text-foreground text-base md:text-lg truncate">WesFellow Hub</h1>
                  <p className="text-xs text-muted-foreground truncate">Student Portal</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className={cn(
            "flex-1 space-y-1 md:space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain transition-all",
            collapsed ? "p-2" : "p-3 md:p-4"
          )}>
            {studentNavItems.map((item) => {
              const isActive = location.pathname === item.url;
              return (
                <NavLink
                  key={item.title}
                  to={item.url}
                  onClick={() => setIsOpen(false)}
                  title={item.title}
                  className={cn(
                    'flex items-center rounded-xl transition-colors',
                    collapsed 
                      ? 'justify-center w-10 h-10 mx-auto' 
                      : 'gap-3 px-3 md:px-4 py-2 md:py-3 text-sm md:text-base font-medium',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.title}</span>}
                </NavLink>
              );
            })}

            {(designation === '3. Senior Fellow' || (designation && designation.includes('Senior Fellow'))) && (
              <>
                <div className={cn(collapsed ? "py-1 flex justify-center" : "pt-4 pb-2")}>
                  {collapsed ? (
                    <div className="w-2 h-1 rounded-full bg-border" title="Class Monitor" />
                  ) : (
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-4">Class Monitor</p>
                  )}
                </div>
                {monitorNavItems.map((item) => {
                  const isActive = location.pathname === item.url;
                  return (
                    <NavLink
                      key={item.title}
                      to={item.url}
                      onClick={() => setIsOpen(false)}
                      title={item.title}
                      className={cn(
                        'flex items-center rounded-xl transition-colors',
                        collapsed 
                          ? 'justify-center w-10 h-10 mx-auto' 
                          : 'gap-3 px-3 md:px-4 py-2 md:py-3 text-sm md:text-base font-medium',
                        isActive
                          ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  );
                })}
              </>
            )}
          </nav>

          {/* Role Switcher Section (expanded only) */}
          {!collapsed && <RoleSwitcher variant="sidebar" />}

          {/* Bottom Actions */}
          <div className={cn(
            "border-t border-border space-y-1 transition-all",
            collapsed ? "p-2 flex flex-col items-center" : "p-3 md:p-4"
          )}>
            <button
              onClick={() => setIsResetDialogOpen(true)}
              title="Reset Password"
              className={cn(
                'flex items-center rounded-xl transition-colors text-muted-foreground hover:bg-accent hover:text-foreground',
                collapsed 
                  ? 'justify-center w-10 h-10 p-0' 
                  : 'gap-3 w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base font-medium'
              )}
            >
              <KeyRound className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">Reset Password</span>}
            </button>
            
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className={cn(
                'flex items-center rounded-xl transition-colors text-destructive hover:bg-destructive/10',
                collapsed 
                  ? 'justify-center w-10 h-10 p-0' 
                  : 'gap-3 w-full px-3 md:px-4 py-2 md:py-3 text-sm md:text-base font-medium'
              )}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      <ResetPasswordDialog 
        open={isResetDialogOpen} 
        onOpenChange={setIsResetDialogOpen} 
      />

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
