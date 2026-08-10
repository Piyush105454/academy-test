import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkafweywaswykowzrhmx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYWZ3ZXl3YXN3eWtvd3pyaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzQ3MzQsImV4cCI6MjA4NDg1MDczNH0.8e9UWH1mx2D1aQrgRV4OzlgmBBDJ30wTRHLMi8gTxqM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
  const { data, error } = await supabase.from('volunteers').select('*').limit(1);
  if (error) console.error('Error:', error);
  else if (data && data.length > 0) console.log('Volunteers columns:', Object.keys(data[0]));
  else console.log('No rows returned, but query succeeded');
}

checkSchema();
