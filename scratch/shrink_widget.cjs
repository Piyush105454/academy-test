const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/TargetSessionsWidget.tsx', 'utf-8');

// 1. Shrink header padding and font sizes
content = content.replace(
  /p-4 md:p-6 rounded-xl/g,
  'p-3 md:p-4 rounded-lg'
);
content = content.replace(
  /h-8 w-8/g,
  'h-5 w-5'
);
content = content.replace(
  /p-3 bg-indigo-100/g,
  'p-2 bg-indigo-100'
);
content = content.replace(
  /text-xl md:text-2xl font-bold/g,
  'text-base md:text-lg font-bold'
);
content = content.replace(
  /text-sm text-muted-foreground mt-1/g,
  'text-xs text-muted-foreground mt-0.5'
);

// 2. Shrink summary cards padding and font sizes
content = content.replace(
  /CardContent className="p-5 flex flex-col justify-center h-full"/g,
  'CardContent className="p-4 flex flex-col justify-center h-full"'
);
content = content.replace(
  /text-3xl font-bold/g,
  'text-2xl font-bold'
);

// 3. Shrink Progress bar card
content = content.replace(
  /CardContent className="p-6"/g,
  'CardContent className="p-4"'
);

// 4. Shrink table section
content = content.replace(
  /rounded-xl border border-border shadow-sm/g,
  'rounded-lg border border-border shadow-sm'
);
content = content.replace(
  /p-4 border-b/g,
  'p-3 border-b'
);
content = content.replace(
  /font-bold text-lg/g,
  'font-bold text-base md:text-lg'
);

// 5. Shrink overall wrapper margin/space
content = content.replace(
  /space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8/g,
  'space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6'
);

fs.writeFileSync('src/components/dashboard/TargetSessionsWidget.tsx', content);
