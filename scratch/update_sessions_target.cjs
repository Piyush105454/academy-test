const fs = require('fs');
let content = fs.readFileSync('src/pages/Sessions.tsx', 'utf-8');

// Add import for MonthTargetDialog
content = content.replace(
  /import \{ DashboardLayout \} from '@\/components\/layout\/DashboardLayout';/,
  "import { DashboardLayout } from '@/components/layout/DashboardLayout';\nimport { MonthTargetDialog } from '@/components/sessions/MonthTargetDialog';"
);

// Add the dialog before Import Sessions button
content = content.replace(
  /<Button\s*onClick=\{\(\) => setIsImportOpen\(true\)\}/,
  "<MonthTargetDialog />\n            <Button\n              onClick={() => setIsImportOpen(true)}"
);

fs.writeFileSync('src/pages/Sessions.tsx', content);
console.log('Sessions updated');
