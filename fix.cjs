const fs = require('fs');
let content = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');
const search = '              onClick={() => navigate(/sessions//feedback-details)}';
const replace = '              onClick={() => navigate(/sessions/\/feedback-details)}';
content = content.replace(search, replace);
fs.writeFileSync('src/pages/SessionRecording.tsx', content);
console.log('Fixed');
