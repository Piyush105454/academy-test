const fs = require('fs');
let content = fs.readFileSync('src/pages/AdminStudentEarnings.tsx', 'utf-8');

// The original code probably didn't have an ID for new ones, but upserts usually use a primary key.
// Let's replace `onConflict: 'task_type'` with something that won't fail if we drop the unique constraint or use id.
// We will just let Supabase handle it (upsert without onConflict if id is present, otherwise insert).
content = content.replace(/\{ onConflict: 'task_type' \}/g, "");

fs.writeFileSync('src/pages/AdminStudentEarnings.tsx', content);
console.log('Fixed onConflict');
