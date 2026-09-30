const fs = require('fs');

let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

code = code.replace(
  /grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6/,
  'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5'
);

fs.writeFileSync('src/pages/Dashboard.tsx', code, 'utf8');
console.log('Updated Dashboard.tsx grid to xl:grid-cols-5');
