import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkafweywaswykowzrhmx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzQ3MzQsImV4cCI6MjA4NDg1MDczNH0.8e9UWH1mx2D1aQrgRV4OzlgmBBDJ30wTRHLMi8gTxqM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const mappings = [
  { old: 'Microsoft - AI Content', new: '3.1.1 Microsoft - AI Content' },
  { old: 'Students Requested - Topics', new: '3.1.2 Students Requested - Topics' },
  { old: 'Python Programming - Topics', new: '3.1.3 Python Programming Basic - Topics' },
  { old: 'GT Suggested - Topics', new: '3.1.4 Volunteers Suggested - Topics' },
];

async function updateCategories() {
  for (const m of mappings) {
    console.log(`Updating '${m.old}' -> '${m.new}'`);
    
    // Update curriculum table
    const { data: currData, error: currErr } = await supabase
      .from('curriculum')
      .update({ content_category: m.new })
      .eq('content_category', m.old)
      .select('id');
      
    if (currErr) console.error('Curriculum error:', currErr);
    else console.log(`Curriculum updated ${currData?.length || 0} rows`);

    // Update sessions table
    const { data: sessData, error: sessErr } = await supabase
      .from('sessions')
      .update({ content_category: m.new })
      .eq('content_category', m.old)
      .select('id');

    if (sessErr) console.error('Sessions error:', sessErr);
    else console.log(`Sessions updated ${sessData?.length || 0} rows`);
  }
}

updateCategories();
