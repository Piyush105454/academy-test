const fs = require('fs');
let content = fs.readFileSync('src/pages/MonthlyLeaderboard.tsx', 'utf-8');

// 1. Add import
if (!content.includes('DashboardLayout')) {
  content = content.replace(
    "import { toast } from 'sonner';",
    "import { toast } from 'sonner';\nimport { DashboardLayout } from '@/components/layout/DashboardLayout';"
  );
}

// 2. Wrap return statement
// Find return (
// replace with return ( <DashboardLayout><div className="space-y-6">
// Find the last );
// replace with </div></DashboardLayout> );

content = content.replace(
  /return \(\s*<div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-0">/,
  `return (
    <DashboardLayout>
      <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-0">`
);

// We need to replace the last closing tag of the main div.
// It looks like:
//       )}
//     </div>
//   );
// }

content = content.replace(
  /    <\/div>\n  \);\n}/,
  `    </div>
    </DashboardLayout>
  );
}`
);

fs.writeFileSync('src/pages/MonthlyLeaderboard.tsx', content);
