const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Ensure MonthlyLeaderboard import is added
if (!content.includes('import("./pages/MonthlyLeaderboard")')) {
  content = content.replace(
    'const AdminStudentEarnings = lazy(() => import("./pages/AdminStudentEarnings"));',
    'const AdminStudentEarnings = lazy(() => import("./pages/AdminStudentEarnings"));\nconst MonthlyLeaderboard = lazy(() => import("./pages/MonthlyLeaderboard"));'
  );
}

// Ensure MonthlyLeaderboard route is added
if (!content.includes('path="/leaderboard"')) {
  content = content.replace(
    '<Route path="/admin-earnings" element={<AdminStudentEarnings />} />',
    '<Route path="/admin-earnings" element={<AdminStudentEarnings />} />\n                    <Route path="/leaderboard" element={<MonthlyLeaderboard />} />'
  );
}

fs.writeFileSync('src/App.tsx', content);
