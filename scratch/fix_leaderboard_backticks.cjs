const fs = require('fs');
let content = fs.readFileSync('src/pages/MonthlyLeaderboard.tsx', 'utf-8');
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\$/g, '$');
fs.writeFileSync('src/pages/MonthlyLeaderboard.tsx', content);
