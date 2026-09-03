const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

content = content.replace(/<TargetSessionsWidget \/>\s*\{\/\* Top Rankings & Attendance Grid \*\/\}/, '{/* Top Rankings & Attendance Grid */}');

content = content.replace(
  /\{\/\* Top Rankings & Attendance Grid \*\/\}\s*<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">/,
  '{/* Top Rankings & Attendance Grid */}\n          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">\n            <TargetSessionsWidget />'
);

fs.writeFileSync('src/pages/Dashboard.tsx', content);
