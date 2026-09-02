const fs = require('fs');
let content = fs.readFileSync('src/pages/Curriculum.tsx', 'utf-8');

// 1. Fix missing Material header in desktop view
content = content.replace(
  /<TableHead>Quiz<\/TableHead>/g,
  '<TableHead>Quiz</TableHead>\n                        <TableHead>Material</TableHead>'
);

// 2. Fix weird encoding for PPT/Quiz
content = content.replace(/dY"S View Quiz \+'/g, '📊 View Quiz');
content = content.replace(/dY"S View/g, '📊 View');

fs.writeFileSync('src/pages/Curriculum.tsx', content);
