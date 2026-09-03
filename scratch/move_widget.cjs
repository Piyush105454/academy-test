const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

content = content.replace(/<MonthlyLeaderboardWidget \/>\s*\{\/\* Top Rankings & Attendance Grid \*\/\}/g, '{/* Top Rankings & Attendance Grid */}');

content = content.replace(
  /\{\/\* Top Rankings & Attendance Grid \*\/\}\s*<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">/,
  '{/* Top Rankings & Attendance Grid */}\n          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">\n            <MonthlyLeaderboardWidget />'
);

// Just in case it missed because of spacing, also remove stray instances above grid:
content = content.replace(/<\/div>\s*<MonthlyLeaderboardWidget \/>\s*\{\/\* Top Rankings/g, '</div>\n\n          {/* Top Rankings');

fs.writeFileSync('src/pages/Dashboard.tsx', content);
