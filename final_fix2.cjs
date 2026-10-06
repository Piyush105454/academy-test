const fs = require('fs');
let code = fs.readFileSync('src/pages/Sessions.tsx', 'utf8');

const facHeadRegex = /(<TableHead[\s\S]*?>\s*<div[^>]*>\s*Facilitator Status[\s\S]*?<\/TableHead>)/;
code = code.replace(facHeadRegex, '{currentTab === "facilitator" && (\n\n)}');

const cooHeadRegex = /(<TableHead[\s\S]*?>\s*<div[^>]*>\s*Coordinator Status[\s\S]*?<\/TableHead>)/;
code = code.replace(cooHeadRegex, '{currentTab === "coordinator" && (\n\n)}');

const supHeadRegex = /(<TableHead[\s\S]*?>\s*<div[^>]*>\s*Supervisor Status[\s\S]*?<\/TableHead>)/;
code = code.replace(supHeadRegex, '{currentTab === "supervisor" && (\n\n)}');

const facCellRegex = /(<TableCell>[\s\S]*?<Badge className=\{getStatusColor\(session\.facilitator_feedback_status\)\}>[\s\S]*?<\/TableCell>)/;
code = code.replace(facCellRegex, '{currentTab === "facilitator" && (\n\n)}');

const cooCellRegex = /(<TableCell>[\s\S]*?<Badge className=\{getStatusColor\(session\.coordinator_feedback_status\)\}>[\s\S]*?<\/TableCell>)/;
code = code.replace(cooCellRegex, '{currentTab === "coordinator" && (\n\n)}');

const supCellRegex = /(<TableCell>[\s\S]*?<Badge className=\{getStatusColor\(session\.supervisor_feedback_status\)\}>[\s\S]*?<\/TableCell>)/;
code = code.replace(supCellRegex, '{currentTab === "supervisor" && (\n\n)}');

fs.writeFileSync('src/pages/Sessions.tsx', code);
