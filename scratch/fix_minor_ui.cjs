const fs = require('fs');
let content = fs.readFileSync('src/pages/StudentTasks.tsx', 'utf-8');

// Replace mangled rupee icon with standard HTML entity or "Earn:"
content = content.replace(
  /<span className="text-primary font-bold">.*\{task\.earning_amount \|\| 5\}<\/span>/g,
  '<span className="text-primary font-bold">&#8377; {task.earning_amount || 5}</span>'
);

fs.writeFileSync('src/pages/StudentTasks.tsx', content);
