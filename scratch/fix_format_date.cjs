const fs = require('fs');
let content = fs.readFileSync('src/pages/FeedbackSelection.tsx', 'utf-8');
content = content.replace(/formatDate\(session\.session_date\)/g, 'new Date(session.session_date).toLocaleDateString("en-GB")');
fs.writeFileSync('src/pages/FeedbackSelection.tsx', content);
console.log('Fixed formatDate in FeedbackSelection.tsx');
