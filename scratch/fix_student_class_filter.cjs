const fs = require('fs');

let content = fs.readFileSync('src/pages/StudentEarnings.tsx', 'utf-8');

// Replace the `.or` with `.in`
content = content.replace(
  /\.or\(`class_id\.in\.\(\$\{classIds\.join\(\',\'\)\}\),class_id\.is\.null`\)/g,
  `.in('class_id', classIds)`
);

fs.writeFileSync('src/pages/StudentEarnings.tsx', content);
console.log("Updated StudentEarnings.tsx");
