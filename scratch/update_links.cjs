const fs = require('fs');

// 1. Sessions.tsx
let sessionsContent = fs.readFileSync('src/pages/Sessions.tsx', 'utf-8');
sessionsContent = sessionsContent.replace(
  /<TableCell className="font-medium text-primary">\s*\{session\.session_id_code \|\| '---\'\}\s*<\/TableCell>/g,
  `<TableCell className="font-medium">
                            <span 
                              className="text-primary hover:underline cursor-pointer" 
                              onClick={() => navigate(\`/sessions/\${session.id}/recording\`)}
                            >
                              {session.session_id_code || '---'}
                            </span>
                          </TableCell>`
);
fs.writeFileSync('src/pages/Sessions.tsx', sessionsContent);

// 2. FeedbackSelection.tsx
let feedbackContent = fs.readFileSync('src/pages/FeedbackSelection.tsx', 'utf-8');
feedbackContent = feedbackContent.replace(
  /<TableCell className="font-medium text-primary">\s*\{session\.session_id_code \|\| '---\'\}\s*<\/TableCell>/g,
  `<TableCell className="font-medium">
                          <span 
                            className="text-primary hover:underline cursor-pointer" 
                            onClick={() => navigate(\`/sessions/\${session.id}/feedback-details\`)}
                          >
                            {session.session_id_code || '---'}
                          </span>
                        </TableCell>`
);
fs.writeFileSync('src/pages/FeedbackSelection.tsx', feedbackContent);

console.log("Updated both files successfully.");
