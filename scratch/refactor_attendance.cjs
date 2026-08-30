const fs = require('fs');

let content = fs.readFileSync('src/pages/AdminStudentAttendance.tsx', 'utf-8');

// Add email to select
content = content.replace(
  /class_id,\s*classes\s*\(\s*name\s*\)/,
  "class_id,\n            email,\n            classes (name)"
);

// Add filter logic right after fetching students
const filter_logic = `
      if (studentError) throw studentError;

      // Filter out inactive students
      let activeStudents = students;
      try {
        const emails = students.map(s => s.email).filter(Boolean);
        if (emails.length > 0) {
          const { data: profiles } = await supabase.from('user_profiles').select('email, is_active').in('email', emails);
          if (profiles) {
            const profileMap = new Map(profiles.map(p => [p.email?.toLowerCase(), p.is_active]));
            activeStudents = students.filter(s => {
              if (!s.email) return true;
              return profileMap.get(s.email.toLowerCase()) !== false;
            });
          }
        }
      } catch (e) {
        console.error('Error filtering active students', e);
      }
      const finalStudents = activeStudents;
`;
content = content.replace(/if \(studentError\) throw studentError;/g, filter_logic);

// Replace `students` array with `finalStudents` array downstream in that function
content = content.replace(/students\.forEach\(\(student\) => \{/g, "finalStudents.forEach((student) => {");

fs.writeFileSync('src/pages/AdminStudentAttendance.tsx', content);

// Now do the same for AdminStudentEarnings.tsx
let earnings = fs.readFileSync('src/pages/AdminStudentEarnings.tsx', 'utf-8');

earnings = earnings.replace(
  /class_id,\s*classes\s*\(\s*name\s*\)/,
  "class_id,\n            email,\n            classes (name)"
);

earnings = earnings.replace(/if \(studentError\) throw studentError;/g, filter_logic);
earnings = earnings.replace(/students\.forEach\(\(student\) => \{/g, "finalStudents.forEach((student) => {");

fs.writeFileSync('src/pages/AdminStudentEarnings.tsx', earnings);

console.log('Attendance and Earnings updated!');
