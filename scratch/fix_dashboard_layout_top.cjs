const fs = require('fs');
let content = fs.readFileSync('src/pages/MonthlyLeaderboard.tsx', 'utf-8');

// The file currently has: return (\n      <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
content = content.replace(
  /return \(\s*<div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">/,
  `return (
    <DashboardLayout>
      <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">`
);

// If the previous script added </DashboardLayout> at the bottom, I should remove it and re-add it cleanly, or just check.
// Since it DID match the end of the file in the last script, it has </DashboardLayout> at the bottom. But since it didn't match the top, I only need to do the top!
fs.writeFileSync('src/pages/MonthlyLeaderboard.tsx', content);
