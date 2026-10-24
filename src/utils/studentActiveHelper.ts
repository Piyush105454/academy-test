/**
 * Utility functions for student active/inactive status management.
 * Protects against mass deactivations caused by shared placeholder emails (e.g. bob@example.com).
 */

export const isPlaceholderEmail = (email?: string | null): boolean => {
  if (!email) return true;
  const em = email.trim().toLowerCase();
  return (
    em === 'bob@example.com' ||
    em.endsWith('@example.com') ||
    em.includes('example.com') ||
    em === 'test@test.com' ||
    em === 'student@example.com' ||
    em === 'null' ||
    em === 'undefined'
  );
};

export const getUniqueStudentEmail = (student: { id: string; student_id?: string | null }): string => {
  const cleanId = student.student_id ? student.student_id.toLowerCase().replace(/[^a-z0-9]/g, '') : student.id.slice(0, 8);
  return `${cleanId || student.id.slice(0, 8)}@student.wes`;
};

/**
 * Filter students list based on user_profiles active status.
 * Never deactivates a student based on a shared placeholder email.
 */
export const filterActiveStudents = <T extends { id: string; email?: string | null }>(
  students: T[],
  profiles: { id: string; email?: string | null; is_active: boolean }[]
): T[] => {
  if (!profiles || profiles.length === 0) return students;

  const profileMapById = new Map<string, boolean>();
  const profileMapByEmail = new Map<string, boolean>();

  profiles.forEach(p => {
    if (p.id) profileMapById.set(p.id, p.is_active);
    if (p.email && !isPlaceholderEmail(p.email)) {
      profileMapByEmail.set(p.email.toLowerCase().trim(), p.is_active);
    }
  });

  return students.filter(s => {
    // 1. Direct ID match always takes precedence
    if (profileMapById.has(s.id)) {
      return profileMapById.get(s.id) !== false;
    }
    // 2. Only match by email if it's NOT a placeholder email
    if (s.email && !isPlaceholderEmail(s.email)) {
      const emailLower = s.email.toLowerCase().trim();
      if (profileMapByEmail.has(emailLower)) {
        return profileMapByEmail.get(emailLower) !== false;
      }
    }
    // Default to active
    return true;
  });
};

/**
 * Determine a single student's active status from profile maps.
 */
export const getStudentActiveStatus = (
  student: { id: string; email?: string | null },
  profileMapById: Map<string, boolean>,
  profileMapByEmail: Map<string, boolean>
): boolean => {
  if (profileMapById.has(student.id)) {
    return profileMapById.get(student.id) !== false;
  }
  if (student.email && !isPlaceholderEmail(student.email)) {
    const emailLower = student.email.toLowerCase().trim();
    if (profileMapByEmail.has(emailLower)) {
      return profileMapByEmail.get(emailLower) !== false;
    }
  }
  return true;
};
