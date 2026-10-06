const fs = require('fs');
let code = fs.readFileSync('src/pages/Sessions.tsx', 'utf8');

// For TableHeaders
// Facilitator Status header
const facHeadRegex = /(<TableHead[^>]*>\s*<div[^>]*>\s*Facilitator Status[\s\S]*?<\/TableHead>)/;
code = code.replace(facHeadRegex, '{currentTab === "facilitator" && (\n\n)}');

const cooHeadRegex = /(<TableHead[^>]*>\s*<div[^>]*>\s*Coordinator Status[\s\S]*?<\/TableHead>)/;
code = code.replace(cooHeadRegex, '{currentTab === "coordinator" && (\n\n)}');

const supHeadRegex = /(<TableHead[^>]*>\s*<div[^>]*>\s*Supervisor Status[\s\S]*?<\/TableHead>)/;
code = code.replace(supHeadRegex, '{currentTab === "supervisor" && (\n\n)}');


// For TableCells
const facCellRegex = /(<TableCell>\s*<Badge className=\{getStatusColor\(session\.facilitator_feedback_status\)\}>[\s\S]*?<\/TableCell>)/;
code = code.replace(facCellRegex, '{currentTab === "facilitator" && (\n\n)}');

const cooCellRegex = /(<TableCell>\s*<Badge className=\{getStatusColor\(session\.coordinator_feedback_status\)\}>[\s\S]*?<\/TableCell>)/;
code = code.replace(cooCellRegex, '{currentTab === "coordinator" && (\n\n)}');

const supCellRegex = /(<TableCell>\s*<Badge className=\{getStatusColor\(session\.supervisor_feedback_status\)\}>[\s\S]*?<\/TableCell>)/;
code = code.replace(supCellRegex, '{currentTab === "supervisor" && (\n\n)}');


// Fix the UI filter width - remove flex-1
code = code.replace(/<div className="flex-1 min-w-\[150px\]">/g, '<div className="w-full sm:w-48">');


fs.writeFileSync('src/pages/Sessions.tsx', code);
