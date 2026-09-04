const fs = require('fs');
let content = fs.readFileSync('src/pages/Curriculum.tsx', 'utf-8');

// The file has mangled characters due to terminal encoding when I ran replacement.
// I will just look for the text right after it and replace the whole block.
content = content.replace(/dYZ\ufffd View/g, '🎥 View');
content = content.replace(/dY"S View/g, '📊 View');
content = content.replace(/dYZ\ufffd View Videos \ufffd\+'/g, '🎥 View Videos');
content = content.replace(/dY"S View Quiz \ufffd\+'/g, '📊 View Quiz');

fs.writeFileSync('src/pages/Curriculum.tsx', content);
