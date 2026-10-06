const fs = require('fs');
let code = fs.readFileSync('src/pages/Sessions.tsx', 'utf8');

const facHeadRegex = /(<TableHead[\s\S]*?>\s*<div[^>]*>\s*Facilitator Status[\s\S]*?<\/TableHead>)/;
code = code.replace(facHeadRegex, '{currentTab === "facilitator" && (\n\n)}');

const cooHeadRegex = /(<TableHead[\s\S]*?>\s*<div[^>]*>\s*Coordinator Status[\s\S]*?<\/TableHead>)/;
code = code.replace(cooHeadRegex, '{currentTab === "coordinator" && (\n\n)}');

const supHeadRegex = /(<TableHead[\s\S]*?>\s*<div[^>]*>\s*Supervisor Status[\s\S]*?<\/TableHead>)/;
code = code.replace(supHeadRegex, '{currentTab === "supervisor" && (\n\n)}');


// Wait, what about TableCell? They probably didn't match either because I used literal {getStatusColor(...)}. The curlies might be interpreted specially? No, it's just a string match, but maybe there's extra spaces or newlines. Let me just find them by index and replace.

// I'll replace TableCell by searching for the property it contains.
code = code.replace(
  /<TableCell>[\s\S]*?<Badge className=\{getStatusColor\(session\.facilitator_feedback_status\)\}>[\s\S]*?<\/TableCell>/,
  match => \{currentTab === "facilitator" && (\n\\n)}\
);

code = code.replace(
  /<TableCell>[\s\S]*?<Badge className=\{getStatusColor\(session\.coordinator_feedback_status\)\}>[\s\S]*?<\/TableCell>/,
  match => \{currentTab === "coordinator" && (\n\\n)}\
);

code = code.replace(
  /<TableCell>[\s\S]*?<Badge className=\{getStatusColor\(session\.supervisor_feedback_status\)\}>[\s\S]*?<\/TableCell>/,
  match => \{currentTab === "supervisor" && (\n\\n)}\
);

fs.writeFileSync('src/pages/Sessions.tsx', code);
