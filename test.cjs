const fs = require('fs');
let code = fs.readFileSync('src/pages/Sessions.tsx', 'utf8');

console.log('Facilitator TableHead matched:', /(<TableHead[^>]*>\s*<div[^>]*>\s*Facilitator Status[\s\S]*?<\/TableHead>)/.test(code));
console.log('Coordinator TableHead matched:', /(<TableHead[^>]*>\s*<div[^>]*>\s*Coordinator Status[\s\S]*?<\/TableHead>)/.test(code));
console.log('Supervisor TableHead matched:', /(<TableHead[^>]*>\s*<div[^>]*>\s*Supervisor Status[\s\S]*?<\/TableHead>)/.test(code));

console.log('Facilitator TableCell matched:', /(<TableCell>\s*<Badge className=\{getStatusColor\(session\.facilitator_feedback_status\)\}>[\s\S]*?<\/TableCell>)/.test(code));
console.log('Coordinator TableCell matched:', /(<TableCell>\s*<Badge className=\{getStatusColor\(session\.coordinator_feedback_status\)\}>[\s\S]*?<\/TableCell>)/.test(code));
console.log('Supervisor TableCell matched:', /(<TableCell>\s*<Badge className=\{getStatusColor\(session\.supervisor_feedback_status\)\}>[\s\S]*?<\/TableCell>)/.test(code));

