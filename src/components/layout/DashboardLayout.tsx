import { RoleSwitcher } from './RoleSwitcher';
import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from './AppSidebar';
import { StudentSidebar } from './StudentSidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, Settings, LogOut, Edit, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>('');
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
      // Try to get role_id using auth user ID (normal case)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role_id')
        .eq('id', user?.id)
        .maybeSingle();

      if (!data) {
        // If data is null, try querying by email instead
        // This handles the case where profile ID doesn't match auth user ID
        const { data: emailData, error: emailError } = await supabase
          .from('user_profiles')
          .select('role_id')
          .ilike('email', user?.email)
          .limit(1)
          .maybeSingle();

        if (emailError) {
          console.error('Error loading user role by email:', emailError);
          setUserRole(null);
        } else if (emailData?.role_id) {
          setUserRole(emailData.role_id);
        }
      } else if (error) {
        console.error('Error loading user role:', error);
        setUserRole(null);
      } else if (data?.role_id) {
        setUserRole(data.role_id);
      }
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
      <div className="print:hidden h-full flex">
        {userRole === 5 ? (
          <StudentSidebar collapsed={isSidebarCollapsed} />
        ) : (
          <AppSidebar collapsed={isSidebarCollapsed} />
        )}
      </div>
      <main className="flex-1 flex flex-col min-w-0 print:block">
        {/* Top Header with Profile */}
        <div className="bg-card border-b border-border px-4 md:px-8 h-[72px] flex items-center justify-between print:hidden">
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

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-10 w-10 bg-primary/10 hover:bg-primary/20 p-0 overflow-hidden"
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5 text-primary" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* User Info */}
              <div className="px-2 py-1.5">
                <p className="text-sm font-semibold text-foreground">Logged In</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>

              <DropdownMenuSeparator />

              {/* Edit Profile Option */}
              <DropdownMenuItem onClick={handleEditProfile} className="cursor-pointer">
                <Edit className="h-4 w-4 mr-2" />
                <span>Edit Profile</span>
              </DropdownMenuItem>

              {/* Settings Option */}
              <DropdownMenuItem onClick={handleSettings} className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                <span>Settings</span>
              </DropdownMenuItem>

              {/* Role Switcher in Profile Menu */}
              <RoleSwitcher variant="profile-menu" />

              <DropdownMenuSeparator />

              {/* Sign Out Option */}
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden print:overflow-visible print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}

