const fs = require('fs');

let code = fs.readFileSync('src/pages/SessionRecording.tsx', 'utf8');

// 1. Remove record_sheet_link required validation
code = code.replace(
  /\r?\n\s*if\s*\(!\(formData as any\)\.record_sheet_link \|\| \(formData as any\)\.record_sheet_link\.trim\(\) === ''\)\s*\{\s*toast\.error\("Record Sheet Link is required"\);\s*return;\s*\}/,
  '\n      // Record sheet link and pictures are optional'
);

// 2. Make session_pictures conditionally included in updateData
code = code.replace(
  /record_sheet_link:\s*\(formData as any\)\.record_sheet_link \|\| null,\s*session_pictures:\s*\(formData as any\)\.session_pictures \|\| \[\],/,
  'record_sheet_link: (formData as any).record_sheet_link?.trim() || null,\n        ...(Array.isArray((formData as any).session_pictures) && (formData as any).session_pictures.length > 0 ? { session_pictures: (formData as any).session_pictures } : {}),'
);

// 3. Add graceful fallback retry if session_pictures column does not exist
code = code.replace(
  /const \{ error \} = await supabase\r?\n\s*\.from\('sessions'\)\r?\n\s*\.update\(updateData\)\r?\n\s*\.eq\('id', sessionId\);/,
  `let { error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error && (error.message?.includes('session_pictures') || error.code === 'PGRST204')) {
        console.warn('session_pictures column not in schema cache, retrying without it...');
        delete updateData.session_pictures;
        const retryResult = await supabase
          .from('sessions')
          .update(updateData)
          .eq('id', sessionId);
        error = retryResult.error;
      }`
);

// 4. Update UI labels
code = code.replace(
  'Record PPT Slide Link and picture <span className="text-destructive">*</span>',
  'Record PPT Slide Link and picture <span className="text-xs text-muted-foreground font-normal">(Optional)</span>'
);

code = code.replace(
  '<Label htmlFor="record_sheet_link" className="text-sm">Record PPT Slide Link <span className="text-destructive">*</span></Label>',
  '<Label htmlFor="record_sheet_link" className="text-sm">Record PPT Slide Link <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>'
);

fs.writeFileSync('src/pages/SessionRecording.tsx', code, 'utf8');
console.log('Update script finished successfully');
