const fs = require('fs');
let content = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');
content = content.replace(/navigate\(`\/sessions\/\$\{id\}\/feedback-details`\)/g, 'navigate(`/sessions/${sessionId}/feedback-details`)');
fs.writeFileSync('src/pages/SessionRecording.tsx', content);
console.log('Fixed sessionId');
