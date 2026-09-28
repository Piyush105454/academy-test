const fs = require('fs');
let content = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');

const regex = /<Button\s+variant="outline"\s+onClick=\{(\) => window\.open\('https:\\/\\/docs(\.google\.com\\/presentation\\/d\\/19QjljocxshsJ5pNr_QhtFI2s7ByK91mHgXsILF3K-3k\\/mobilepresent\?pli=1&slide=id\.g3f36f08c6d8_1_6', '_blank'\)\}/;

const replaceStr = `<Button 
              variant="outline" 
              onClick={() => navigate(`/sessions/${id}/feedback-details`)}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"
            >
              <Eye className="h-4 w-4" />
              View Feedback
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open('https://docs.google.com/presentation/d/19QjljocxshsJ5pNr_QhtFI2s7ByK91mHgXsILF3K-3k/mobilepresent?pli=1&slide=id.g3f36f08c6d8_1_6', '_blank')}`;

if (regex.test(content)) {
  content = content.replace(regex, replaceStr);
  fs.writeFileSync('src/pages/SessionRecording.tsx', content);
  console.log('Success');
} else {
  console.log('String not found');
}