const fs = require('fs');
let code = fs.readFileSync('src/pages/Sessions.tsx', 'utf8');

const tableHeaderIndex = code.indexOf('<TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/50 transition-colors"');
console.log(code.substring(tableHeaderIndex, tableHeaderIndex + 1000));
