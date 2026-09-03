const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/TargetSessionsWidget.tsx', 'utf-8');

// The file contains literal `\` before backticks and `$`
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\$/g, '$');

fs.writeFileSync('src/components/dashboard/TargetSessionsWidget.tsx', content);
