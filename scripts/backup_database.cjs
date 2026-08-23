const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read env variables
const envFile = fs.readFileSync('.env', 'utf8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.+)/) || envFile.match(/SUPABASE_URL=(.+)/);
const serviceKeyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/);

const supabaseUrl = urlMatch ? urlMatch[1].trim() : 'https://bkafweywaswykowzrhmx.supabase.co';
const supabaseKey = serviceKeyMatch ? serviceKeyMatch[1].trim() : (keyMatch ? keyMatch[1].trim() : '');

const supabase = createClient(supabaseUrl, supabaseKey);

async function createFullBackup() {
  console.log('🚀 Starting Full Database Backup...');

  const tables = [
    'student_task_feedback',
    'student_earnings',
    'student_performance',
    'students',
    'classes',
    'sessions',
    'subjects',
    'reward_configurations',
    'user_profiles',
    'volunteers',
    'coordinators',
    'facilitators'
  ];

  const backupData = {
    timestamp: new Date().toISOString(),
    supabaseUrl: supabaseUrl,
    tables: {}
  };

  for (const table of tables) {
    let allRows = [];
    let from = 0;
    const step = 1000;
    let keepFetching = true;

    while (keepFetching) {
      const { data, error } = await supabase.from(table).select('*').range(from, from + step - 1);
      if (error) {
        console.error(`Error backing up table '${table}':`, error.message);
        break;
      }
      if (!data || data.length === 0) {
        keepFetching = false;
      } else {
        allRows = allRows.concat(data);
        from += step;
        if (data.length < step) keepFetching = false;
      }
    }

    backupData.tables[table] = allRows;
    console.log(`  ✓ Table '${table}': ${allRows.length} rows backed up.`);
  }

  // Create backups directory if it doesn't exist
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db_backup_${dateStr}.json`;
  const filePath = path.join(backupDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

  console.log(`\n🎉 BACKUP SUCCESSFUL! Saved full snapshot to:`);
  console.log(`   ${filePath}`);
}

createFullBackup();
