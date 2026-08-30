const fs = require('fs');
let content = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf-8');

content = content.replace(
  /const initializeAuth = async \(\) => \{/,
  "const initializeAuth = async () => { console.log('DEBUG: initializeAuth started');"
);
content = content.replace(
  /setLoading\(false\);/,
  "console.log('DEBUG: setLoading(false) called in initializeAuth'); setLoading(false);"
);
content = content.replace(
  /const \{ data: \{ subscription \} \} = supabase\.auth\.onAuthStateChange\(async \(event, currentSession\) => \{/,
  "const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => { console.log('DEBUG: onAuthStateChange event', event);"
);
content = content.replace(
  /setLoading\(false\);/g,
  "console.log('DEBUG: setLoading(false) called'); setLoading(false);"
);

fs.writeFileSync('src/contexts/AuthContext.tsx', content);
