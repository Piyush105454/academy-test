const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(
  /const AdminStudentEarnings = lazy\(\(\) => import\("\.\/pages\/AdminStudentEarnings"\)\);/,
  'const AdminStudentEarnings = lazy(() => import("./pages/AdminStudentEarnings"));\nconst MonthlyLeaderboard = lazy(() => import("./pages/MonthlyLeaderboard"));'
);

content = content.replace(
  /<Route path="\/admin-earnings" element=\{<AdminStudentEarnings \/>\} \/>/,
  '<Route path="/admin-earnings" element={<AdminStudentEarnings />} />\n                    <Route path="/leaderboard" element={<MonthlyLeaderboard />} />'
);

fs.writeFileSync('src/App.tsx', content);
