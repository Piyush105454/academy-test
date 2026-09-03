const fs = require('fs');

let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

content = content.replace(
  /\{\/\* Grid View \(Always on Mobile, Optional on Desktop\) \*\/\}\s*<div className=\{cn\(\"grid grid-cols-1/g,
  '<>\n            {/* Grid View (Always on Mobile, Optional on Desktop) */}\n            <div className={cn("grid grid-cols-1'
);

content = content.replace(
  /<\/div>\s*\)\}\s*\{\/\* Table View \(Desktop Only\) \*\/\}/g,
  '</div>\n\n            {/* Table View (Desktop Only) */}'
);

content = content.replace(
  /<\/Table>\s*<\/div>\s*\)\}\s*<\/div>\s*<\/DashboardLayout>/g,
  '</Table>\n              </div>\n            )}\n          </>\n        )}\\n      </div>\n    </DashboardLayout>'
);

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
