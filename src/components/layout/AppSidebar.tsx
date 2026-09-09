import { Home, Users, LogOut, CalendarDays, BookOpen, Menu, X, Users2, MapPin, FileText, GraduationCap, Shield, ClipboardList, ChevronDown, MessageCircle, Clock, Wrench } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { cn } from '@/lib/utils';
import wesLogo from '@/assets/wes-logo.jpg';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';

interface NavItem {
  title: string;
  url: string;
  icon: any;
  requiredRole: number | null;
  studentVisible: boolean;
  hiddenRoles?: number[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  studentVisible: boolean;
  hiddenRoles?: number[];
  requiredRole?: number | null;
}

const navGroups: NavGroup[] = [
  {
    label: 'Main',
    studentVisible: false,
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: Home, requiredRole: null, studentVisible: false },
      { title: 'Calendar', url: '/calendar', icon: CalendarDays, requiredRole: null, studentVisible: false },
      { title: 'Resource Hub', url: '/resources', icon: BookOpen, requiredRole: null, studentVisible: false },
    ],
  },
  {
    label: 'Session Management',
    studentVisible: false,
    items: [
      { title: 'Curriculum', url: '/curriculum', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Session Planner', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Record & Feedback', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },
      { title: 'Tasks & Projects', url: '/tasks', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Scheduled Tasks', url: '/scheduled-tasks', icon: Clock, requiredRole: null, studentVisible: false },
      { title: 'Student Attendance', url: '/admin-attendance', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Attendance Management', url: '/attendance-management', icon: CalendarDays, requiredRole: null, studentVisible: false },
    ]
  },
  {
    label: 'Schedule Facilitator Task Management',
    studentVisible: false,
    items: [
      // Teacher / Employee Views (Only Role 4)
      { title: 'My Work', url: '/academy/my-work', icon: ClipboardList, requiredRole: 4, studentVisible: false },
      { title: 'My Earnings', url: '/academy/my-earnings', icon: FileText, requiredRole: 4, studentVisible: false },
      { title: 'My Goals', url: '/academy/my-goals', icon: FileText, requiredRole: 4, studentVisible: false },
      { title: 'Leaderboard', url: '/academy/leaderboard', icon: Users2, requiredRole: 4, studentVisible: false },
      
      // Admin / Manager Views (Hidden from Role 4)
      { title: 'Tasks & Templates', url: '/academy/tasks', icon: ClipboardList, requiredRole: null, studentVisible: false, hiddenRoles: [4] },
      { title: 'Approvals', url: '/academy/approvals', icon: Shield, requiredRole: null, studentVisible: false, hiddenRoles: [4] },
      { title: 'Goals Admin', url: '/academy/manage-goals', icon: FileText, requiredRole: null, studentVisible: false, hiddenRoles: [4] },
      { title: 'Leaderboard', url: '/academy/leaderboard', icon: Users, requiredRole: null, studentVisible: false, hiddenRoles: [4] },
    ]
  },
  {
    label: 'Rewards & Earnings',
    studentVisible: false,
    items: [
      { title: 'Student Earnings', url: '/admin-earnings', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Facilitator Earnings', url: '/admin-facilitator-earnings', icon: ClipboardList, requiredRole: null, studentVisible: false, hiddenRoles: [4] },
      { title: 'Volunteer Log Hours', url: '/volunteer-log-hours', icon: Clock, requiredRole: null, studentVisible: false, hiddenRoles: [4] },
    ]
  },
  {
    label: 'People Management',
    studentVisible: false,
    hiddenRoles: [4],
    items: [
      { title: 'Facilitator', url: '/facilitators', icon: Users2, requiredRole: null, studentVisible: false },
      { title: 'Coordinators', url: '/coordinators', icon: Users2, requiredRole: null, studentVisible: false },
      { title: 'Class Leaders', url: '/class-leaders', icon: Shield, requiredRole: null, studentVisible: false },
      { title: 'Guest Teacher & Speaker', url: '/volunteers', icon: Users, requiredRole: null, studentVisible: false },
    ],
  },
  {
    label: 'Logistic ',
    studentVisible: false,
    items: [
      { title: 'Centres & Slots', url: '/centres', icon: MapPin, requiredRole: null, studentVisible: false },
      { title: 'Classes & Students', url: '/classes', icon: GraduationCap, requiredRole: null, studentVisible: false },
      { title: 'Support Requests', url: '/support', icon: MessageCircle, requiredRole: null, studentVisible: false },
    ]
  },
  {
    label: 'Admin Panel',
    studentVisible: false,
    items: [
      { title: 'Admin Action', url: '/admin', icon: Shield, requiredRole: 1, studentVisible: false },
      { title: 'Activity Logs', url: '/activity-logs', icon: FileText, requiredRole: 1, studentVisible: false },
    ],
  },
  {
    label: 'Dev Section',
    studentVisible: false,
    requiredRole: 1,
    items: [
      { title: 'Dev Mode & Management', url: '/dev-mode', icon: Wrench, requiredRole: 1, studentVisible: false },
    ],
  },
  {
    label: 'Student',
    studentVisible: true,
    items: [
      { title: 'Student Dashboard', url: '/student-dashboard', icon: Home, requiredRole: null, studentVisible: true },
    ],
  },
];

export function AppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { signOut, user } = useAuth();
  const { isDevMode, toggleDevMode } = useDeveloperMode();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [userRole, setUserRole] = useState<number | null>(() => {
    const saved = localStorage.getItem('user_role');
    return saved ? parseInt(saved, 10) : null;
  });
  const [isRoleLoading, setIsRoleLoading] = useState(userRole === null);
  const roleLoadedRef = useRef(false);

  useEffect(() => {
    if (user?.id && !roleLoadedRef.current) {
      loadUserRole();
    }
  }, [user?.id]);

  const loadUserRole = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role_id')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user role:', error);
      }

      if (data?.role_id) {
        setUserRole(data.role_id);
        localStorage.setItem('user_role', data.role_id.toString());
      } else {
        setUserRole(null);
        localStorage.removeItem('user_role');
      }
      roleLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading user role:', error);
    } finally {
      setIsRoleLoading(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('user_role');
    await signOut();
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border hover:bg-accent"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:sticky md:top-0 h-screen bg-card border-r border-border flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-0 md:w-0 border-r-0 overflow-hidden" : "w-64",
        isOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="w-64 h-full flex flex-col flex-shrink-0">
          {/* Logo Section */}
          <div className="h-[72px] px-4 md:px-6 border-b border-border flex items-center">
            <div className="flex items-center gap-3">
              <img
                src={wesLogo}
                alt="WES Foundation Logo"
              className="h-10 md:h-12 w-10 md:w-12 object-contain"
            />
            <div className="min-w-0">
              <h1 className="font-bold text-foreground text-base md:text-lg truncate">WesFellow Hub</h1>
              <p className="text-xs text-muted-foreground truncate">Management Platform</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 md:p-4 space-y-3 overflow-y-auto">
          {isRoleLoading ? (
            <div className="flex justify-center p-4">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : navGroups.map((group) => {
            // Filter group visibility based on role
            if (userRole === 5 && !group.studentVisible) return null;
            if (userRole !== 5 && group.studentVisible) return null;
            if (group.hiddenRoles && userRole !== null && group.hiddenRoles.includes(userRole)) return null;
            if (group.requiredRole !== undefined && group.requiredRole !== null && userRole !== group.requiredRole) return null;

            const visibleItems = group.items.filter((item) => {
              if (item.requiredRole !== null && userRole !== item.requiredRole) return false;
              if (item.hiddenRoles && userRole !== null && item.hiddenRoles.includes(userRole)) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label}>
                <p className="px-3 md:px-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <NavLink
                        key={item.title}
                        to={item.url}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 md:px-4 py-2 rounded-lg transition-colors',
                          'text-sm font-medium',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sign Out Button */}
        <div className="p-3 md:p-4 border-t border-border">
          <button
            onClick={handleSignOut}
            className={cn(
              'flex items-center gap-3 w-full px-3 md:px-4 py-2 md:py-3 rounded-lg transition-colors',
              'text-sm md:text-base font-medium',
              'text-destructive hover:bg-destructive/10'
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">Sign Out</span>
          </button>
        </div>
        </div>
      </aside>

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
