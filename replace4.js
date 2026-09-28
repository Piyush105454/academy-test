const fs = require('fs');
let content = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');

const searchStr = ``<div className="flex gap-2">
`;
const replaceStr = ``<div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate(`/sessions/${id}/feedback-details`)}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
            >
              <Eye className="h-4 w-4" />
              View Feedback
            </Button>``;

const idx = content.indexOf(searchStr);
if (idx !== -1) {
  content = content.substring(0, idx) + replaceStr + content.substring(idx + searchStr.length);
  fs.writeFileSync('src/pages/SessionRecording.tsx', content);
  console.log('Success');
} else {
  console.log('String not found');
}