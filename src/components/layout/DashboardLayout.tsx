import { RoleSwitcher } from './RoleSwitcher';
import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from './AppSidebar';
import { StudentSidebar } from './StudentSidebar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  User, 
  Settings, 
  LogOut, 
  Edit, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Calendar as CalendarIcon, 
  ChevronDown,
  Shield,
  ShieldCheck,
  UserCheck,
  GraduationCap,
  BookOpen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

const ROLE_BADGE_CONFIG: Record<number, { label: string; icon: any; className: string }> = {
  1: { label: 'Admin', icon: Shield, className: 'bg-red-50 text-red-700 border-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
  2: { label: 'Supervisor', icon: ShieldCheck, className: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  3: { label: 'Coordinator', icon: UserCheck, className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  4: { label: 'Facilitator', icon: GraduationCap, className: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
  5: { label: 'Student', icon: BookOpen, className: 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
};

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const { selectedYear, setSelectedYear } = useAcademicYear();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      loadUserRole();
      loadProfileImage();
    }
  }, [user?.id]);

  const loadUserRole = async () => {
    try {
      let role: number | null = null;
      let name: string = '';

      // 1. Try to get role_id and full_name using auth user ID
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role_id, full_name, email')
        .eq('id', user?.id)
        .maybeSingle();

      if (data) {
        if (data.role_id) role = data.role_id;
        if (data.full_name) name = data.full_name;
      } else {
        // Query by email
        const { data: emailData } = await supabase
          .from('user_profiles')
          .select('role_id, full_name, email')
          .ilike('email', user?.email || '')
          .limit(1)
          .maybeSingle();

        if (emailData) {
          if (emailData.role_id) role = emailData.role_id;
          if (emailData.full_name) name = emailData.full_name;
        }
      }

      // Check coordinators and facilitators tables if name or role is missing
      if (user?.email) {
        const email = user.email.trim().toLowerCase();
        if (!name || !role) {
          const { data: coord } = await supabase
            .from('coordinators')
            .select('name, status')
            .ilike('email', email)
            .maybeSingle();
          if (coord) {
            if (!name && coord.name) name = coord.name;
            if (!role && coord.status !== 'inactive') role = 3;
          }
        }
        if (!name || !role) {
          const { data: fac } = await supabase
            .from('facilitators')
            .select('name, status')
            .ilike('email', email)
            .maybeSingle();
          if (fac) {
            if (!name && fac.name) name = fac.name;
            if (!role && fac.status !== 'inactive') role = 4;
          }
        }
        if (!name || !role) {
          const { data: std } = await supabase
            .from('students')
            .select('name')
            .ilike('email', email)
            .maybeSingle();
          if (std && std.name) {
            if (!name) name = std.name;
            if (!role) role = 5;
          }
        }
      }

      if (!name) {
        name = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
      }

      setUserName(name);
      setUserRole(role);
      setRoleLoaded(true);
    } catch (error) {
      console.error('Error loading user role:', error);
      setUserRole(null);
      setRoleLoaded(true);
    }
  };

  const loadProfileImage = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_image_url')
        .eq('id', user?.id)
        .maybeSingle();

      if (!data) {
        const { data: emailData } = await supabase
          .from('user_profiles')
          .select('profile_image_url')
          .ilike('email', user?.email)
          .limit(1)
          .maybeSingle();

        if (emailData?.profile_image_url) {
          setProfileImage(emailData.profile_image_url);
        }
      } else if (error) {
        console.error('Error loading profile image:', error);
      }

      if (data?.profile_image_url) {
        setProfileImage(data.profile_image_url);
      }
    } catch (error) {
      console.error('Error loading profile image:', error);
    }
  };

  const location = useLocation();

  useEffect(() => {
    // Only redirect if we've finished loading and there's no user
    if (!loading && !user) {
      navigate('/auth', { replace: true });
      return;
    }

    if (roleLoaded && user) {
      const isStudent = userRole === 5;
      const path = location.pathname;

      // Define allowed paths for students
      const isStudentPath = 
        path.startsWith('/student-') || 
        path === '/class-task-review' || 
        path === '/profile/edit' ||
        path === '/student-support' ||
        path === '/auth';

      // Define allowed paths for staff (admin, coordinator, teacher, etc.)
      const isStaffPath = 
        !path.startsWith('/student-') && 
        path !== '/class-task-review' ||
        path === '/profile/edit' ||
        path === '/auth';
        
      // Special check: student-performance is actually a staff page for grading students
      const isStudentPerformance = path.startsWith('/student-performance');

      if (isStudent) {
        // Prevent student from accessing staff pages
        if (!isStudentPath || isStudentPerformance) {
          toast.error('You do not have permission to access this page');
          navigate('/student-dashboard', { replace: true });
        }
      } else {
        // Prevent staff from accessing student pages (except auth and profile)
        if (isStudentPath && path !== '/profile/edit' && path !== '/auth' && path !== '/student-auth') {
          toast.error('You do not have permission to access the student portal');
          navigate('/dashboard', { replace: true });
        }
      }
    }
  }, [user, loading, navigate, roleLoaded, userRole, location.pathname]);

  const handleSignOut = async () => {
    try {
      await signOut();
      // Navigate to auth page after sign out
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Sign out error:', error);
      // Still navigate even if there's an error
      navigate('/auth', { replace: true });
    }
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  const handleEditProfile = () => {
    navigate('/profile/edit');
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If not loading and no user, don't render anything (redirect will happen)
  if (!user) {
    return null;
  }

  // Show loading state while role is being fetched
  if (!roleLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // User is authenticated and role is loaded, render the dashboard
  return (
    <div className="min-h-screen print:min-h-0 bg-muted/30 flex w-full">
      {/* Sidebar - Frozen on left side */}
      <div className="print:hidden shrink-0">
        {userRole === 5 ? (
          <StudentSidebar collapsed={isSidebarCollapsed} />
        ) : (
          <AppSidebar collapsed={isSidebarCollapsed} />
        )}
        {/* Desktop spacer to preserve layout flow since sidebar is fixed */}
        <div
          className={cn(
            "hidden md:block shrink-0 transition-all duration-300",
            isSidebarCollapsed ? "w-0 md:w-16" : "w-64"
          )}
          aria-hidden="true"
        />
      </div>
      <main className="flex-1 flex flex-col min-w-0 print:block">
        {/* Top Header with Profile (Frozen / Sticky at top) */}
        <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-4 md:px-8 h-[72px] flex items-center justify-between print:hidden shrink-0">
          <div className="flex-1 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex h-9 w-9 text-muted-foreground hover:text-foreground mr-2"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/60">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Academic Year:</span>
              <Select value={selectedYear} onValueChange={(value: any) => setSelectedYear(value)}>
                <SelectTrigger className="h-8 w-[110px] border-none bg-transparent focus:ring-0 text-sm font-bold p-0">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025-26">2025-26</SelectItem>
                  <SelectItem value="2026-27">2026-27</SelectItem>
                  <SelectItem value="2027-28">2027-28</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Quick Role Switcher Pill in Top Header */}
            <div className="ml-2">
              <RoleSwitcher variant="header" />
            </div>
          </div>

          {/* Right Section: User Role Badge & Profile Dropdown */}
          <div className="flex items-center gap-3">
            {/* User Type / Role Badge shown near the icon */}
            {userRole && ROLE_BADGE_CONFIG[userRole] && (() => {
              const config = ROLE_BADGE_CONFIG[userRole];
              const Icon = config.icon;
              return (
                <div 
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-xs transition-colors ${config.className}`}
                  title={`User Type: ${config.label}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-bold tracking-wide uppercase text-[11px]">{config.label}</span>
                </div>
              );
            })()}

            {/* Profile Dropdown with Name & Email Visible by Default */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl hover:bg-accent/70 transition-all border border-border/50 hover:border-border text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none bg-card shadow-2xs"
                  title={userName ? `${userName} (${userEmail})` : userEmail}
                >
                  {/* Avatar Circle */}
                  <div className="rounded-full h-9 w-9 bg-primary/10 flex-shrink-0 overflow-hidden ring-1 ring-border flex items-center justify-center">
                    {profileImage ? (
                      <img
                        src={profileImage}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-bold text-sm text-primary uppercase">
                        {userName ? userName.trim().charAt(0) : (userEmail ? userEmail.charAt(0) : <User className="h-4 w-4 text-primary" />)}
                      </div>
                    )}
                  </div>

                  {/* Name and Email shown directly in top bar */}
                  <div className="flex flex-col text-left max-w-[120px] sm:max-w-[170px] md:max-w-[210px]">
                    <span className="text-xs md:text-sm font-bold text-foreground leading-tight truncate">
                      {userName || 'User'}
                    </span>
                    <span className="text-[10px] md:text-[11px] text-muted-foreground truncate leading-tight mt-0.5" title={userEmail}>
                      {userEmail}
                    </span>
                  </div>

                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-foreground transition-transform duration-200 shrink-0 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1.5">
                {/* User Info Header: Name + Email + Role */}
                <div className="px-3 py-2.5 bg-muted/40 rounded-md border border-border/50 mb-1">
                  <p className="text-sm font-bold text-foreground leading-tight truncate">
                    {userName || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5" title={userEmail}>
                    {userEmail}
                  </p>
                  {userRole && ROLE_BADGE_CONFIG[userRole] && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${ROLE_BADGE_CONFIG[userRole].className}`}>
                        {ROLE_BADGE_CONFIG[userRole].label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Edit Profile Option */}
                <DropdownMenuItem onClick={handleEditProfile} className="cursor-pointer">
                  <Edit className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>Edit Profile</span>
                </DropdownMenuItem>

                {/* Settings Option */}
                <DropdownMenuItem onClick={handleSettings} className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>

                {/* Role Switcher in Profile Menu */}
                <RoleSwitcher variant="profile-menu" />

                <DropdownMenuSeparator className="my-1" />

                {/* Sign Out Option */}
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden print:overflow-visible print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}

