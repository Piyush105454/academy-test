import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
async function run() {
  const studentIds = [
    'e44d617c-7797-4e7d-802f-5c48662eec28',
    '2fa2765d-2d7b-421e-b202-3a1549df6b45',
    '7f26aa60-44eb-4f03-a58d-8dfe4b93b89d',
    '1135decb-a8fe-4a1d-a3f0-de2c6ad60892',
    'eaf34fb0-d749-4ebe-98d4-c2d5562e4cb4',
    'c87884e6-c920-4cb2-a390-c7cc145b49bd',
    'abc8d031-7d2a-4ab1-a405-192cdf2cd6c1'
  ];
  
  const { data, error } = await supabase
    .from('student_earnings')
    .update({ earned_at: '2026-08-31T10:00:00+00:00' })
    .in('student_id', studentIds)
    .ilike('description', '%100 Percent%')
    .select();
    
  console.log(JSON.stringify({data, error}, null, 2));
}
run();
