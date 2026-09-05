const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

const replacement = `if (roleChecking || userRole === 5) {
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
    <DashboardLayout>`;

content = content.replace(/return \(\s*<DashboardLayout>/, replacement);

fs.writeFileSync('src/pages/Dashboard.tsx', content);
console.log("Fixed early return.");
