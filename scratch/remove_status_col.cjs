const fs = require('fs');
let content = fs.readFileSync('src/pages/Tasks.tsx', 'utf-8');

// 1. Remove the Status TableHead
content = content.replace(
  /<TableHead><div className="flex items-center gap-1 cursor-pointer hover:text-primary" onClick=\{\(\) => handleSort\('approved'\)\}>Status <ArrowUpDown className="h-3 w-3" \/><\/div><\/TableHead>\s*/,
  ''
);

// 2. Remove the TableCell with the progress bar.
// This cell starts with `<TableCell>` and ends with `</TableCell>`. It's the one before `group.submittedCount`.
// Let's use a regex to capture it.
content = content.replace(
  /<TableCell>\s*\{\(\(\) => \{\s*const classKey = `\$\{group\.class_id\}-\$\{group\.academic_year\}`;[\s\S]*?<span>Progress<\/span>[\s\S]*?<\/TableCell>\s*(<TableCell className="text-center">[\s\S]*?group\.submittedCount)/,
  '$1'
);

fs.writeFileSync('src/pages/Tasks.tsx', content);
