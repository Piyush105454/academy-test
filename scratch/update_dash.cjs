const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');
content = content.replace(
  /import \{ TodayClassAttendanceWidget \} from '@\/components\/dashboard\/TodayClassAttendanceWidget';/,
  "import { TodayClassAttendanceWidget } from '@/components/dashboard/TodayClassAttendanceWidget';\nimport { TargetSessionsWidget } from '@/components/dashboard/TargetSessionsWidget';"
);
content = content.replace(
  /\{\/\* 5\. Today's Attendance \*\/\}/,
  "<TargetSessionsWidget />\n\n          {/* 5. Today's Attendance */}"
);
fs.writeFileSync('src/pages/Dashboard.tsx', content);
console.log('Dashboard updated');
