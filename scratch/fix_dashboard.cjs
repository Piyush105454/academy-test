const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

// Completely remove all `<TargetSessionsWidget />` calls first
content = content.replace(/<TargetSessionsWidget \/>/g, '');

// Fix any literal \n that might have sneaked in
content = content.replace(/\\n\\n/g, '');

// Place it right above Top Rankings
content = content.replace(
  /\{\/\* Top Rankings & Attendance Grid \*\/\}/g,
  '<TargetSessionsWidget />\n\n          {/* Top Rankings & Attendance Grid */}'
);

fs.writeFileSync('src/pages/Dashboard.tsx', content);
