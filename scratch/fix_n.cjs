const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

content = content.replace(')}\\n      </div>', ')}\n      </div>');

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
