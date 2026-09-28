const fs = require('fs');
let content = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');

const searchStr = 'Guest Teacher Overview';
const replaceStr = 'Guest Teacher Overview';

if (content.includes(searchStr)) {
  const btnStr = '<Button \n              variant="outline" \n              onClick={() => navigate(/sessions/\/feedback-details)}\n              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"\n            >\n              <Eye className="h-4 w-4" />\n              View Feedback\n            </Button>\n            ';
  const targetStr = '<Button \n              variant="outline" \n              onClick={() => window.open(\'https://docs.google.com/presentation/d/19QjljocxshsJ5pNr_QhtFI2s7ByK91mHgXsILF3K-3k/mobilepresent?pli=1&slide=id.g3f36f08c6d8_1_6\', \'_blank\')}\n              className="gap-2 border-primary/20 text-primary hover:bg-primary/5 shrink-0"\n            >\n              <ExternalLink className="h-4 w-4" />\n              Guest Teacher Overview';
  
  if (content.includes(targetStr)) {
    content = content.replace(targetStr, btnStr + targetStr);
    fs.writeFileSync('src/pages/SessionRecording.tsx', content);
    console.log('Replaced exact block.');
  } else {
    // maybe line endings are \r\n
    const targetWin = targetStr.replace(/\n/g, '\r\n');
    const btnWin = btnStr.replace(/\n/g, '\r\n');
    if (content.includes(targetWin)) {
        content = content.replace(targetWin, btnWin + targetWin);
        fs.writeFileSync('src/pages/SessionRecording.tsx', content);
        console.log('Replaced exact block with CRLF.');
    } else {
        console.log('Target string not found, dumping context...');
        const lines = content.split(/\r?\n/);
        const idx = lines.findIndex(l => l.includes('Guest Teacher Overview'));
        console.log(lines.slice(idx-7, idx+2).join('\n'));
    }
  }
}
