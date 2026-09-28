const fs = require('fs');
let content = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');
content = content.replace(/navigate\(\/sessions\/\/feedback-details\)/g, 'navigate(`/sessions/${id}/feedback-details`)');
fs.writeFileSync('src/pages/SessionRecording.tsx', content);
console.log('Fixed');
