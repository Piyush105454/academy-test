const fs = require('fs');
let content = fs.readFileSync('src/pages/Sessions.tsx', 'utf-8');
content = content.replace(/formatDate\(session\.session_date\)/g, 'new Date(session.session_date).toLocaleDateString("en-GB")');
fs.writeFileSync('src/pages/Sessions.tsx', content);
console.log('Fixed formatDate in Sessions.tsx');
