const fs = require('fs');

let studentAuth = fs.readFileSync('src/pages/StudentAuth.tsx', 'utf-8');
studentAuth = studentAuth.replace(/\} catch \(err\) \{ \{/g, "} catch (err) {");
fs.writeFileSync('src/pages/StudentAuth.tsx', studentAuth);
console.log('Fixed StudentAuth.tsx');
