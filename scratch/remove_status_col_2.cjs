const fs = require('fs');
let content = fs.readFileSync('src/pages/Tasks.tsx', 'utf-8');

// The TableCell starts with: <TableCell>\n                            {(() => {\n                              const classKey = (group.class_name || '').trim().toLowerCase();
const regex = /<TableCell>\s*\{\(\(\) => \{\s*const classKey = \(group\.class_name \|\| ''\)\.trim\(\)\.toLowerCase\(\);[\s\S]*?<span>Progress<\/span>[\s\S]*?<\/TableCell>/;

if (content.match(regex)) {
  content = content.replace(regex, '');
  fs.writeFileSync('src/pages/Tasks.tsx', content);
  console.log("Replaced successfully!");
} else {
  console.log("Could not find the block!");
}
