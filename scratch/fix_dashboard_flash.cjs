const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

// Add roleChecking state
content = content.replace(
  /const \[userRole, setUserRole\] = useState<number \| null>\(null\);/,
  `const [userRole, setUserRole] = useState<number | null>(null);
  const [roleChecking, setRoleChecking] = useState(true);`
);

// Update checkUserRole to use finally { setRoleChecking(false); }
content = content.replace(
  /const \{ data: profileData \} = await supabase[\s\S]*?console\.error\('Error checking user role:', error\);\n      \}/,
  `const { data: profileData } = await supabase
          .from('user_profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();

        if (profileData?.role_id) {
          setUserRole(profileData.role_id);
        }

        // Redirect students to their dashboard
        if (profileData?.role_id === 5) {
          navigate('/student-dashboard', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error checking user role:', error);
      } finally {
        setRoleChecking(false);
      }`
);

// Early return before rendering DashboardLayout
content = content.replace(
  /return \(\n\s*<DashboardLayout>/,
  `if (roleChecking || userRole === 5) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>`
);

fs.writeFileSync('src/pages/Dashboard.tsx', content);
