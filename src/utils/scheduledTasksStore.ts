export interface ScheduledTaskItem {
  id: string;
  title: string;
  description: string;
  class_name: string;
  subject_name: string;
  creation_date: string; // YYYY-MM-DD
  deadline: string;      // YYYY-MM-DD
  status: 'scheduled' | 'published';
  academic_year?: string;
  created_at?: string;
}

export const STORAGE_KEY = 'wes_scheduled_tasks_v2';

export const getCleanTaskId = (st: { id: string; class_name?: string; creation_date?: string }, fallbackIndex?: number): string => {
  const clsName = st.class_name || 'Senior Fellow';
  let clsAbbr = 'SF';
  if (clsName.includes('Senior Fellow')) clsAbbr = 'SF';
  else if (clsName.includes('CCC EMP')) clsAbbr = 'EMP';
  else if (clsName.includes('Class 9')) clsAbbr = 'C9';
  else if (clsName.includes('Class 10')) clsAbbr = 'C10';
  else if (clsName.includes('Class 8')) clsAbbr = 'C8';
  else clsAbbr = clsName.replace(/\s+/g, '').slice(0, 4).toUpperCase();

  const datePrefix = (st.creation_date || '2026-08').slice(0, 7);

  // Use fallbackIndex (position in array, 0-based) as the sequential number
  // fallbackIndex provided → use it (1-based display)
  // Otherwise extract trailing digits from id like sched_0_1_25 → 25
  let numVal: number;
  if (fallbackIndex !== undefined) {
    numVal = fallbackIndex + 1;
  } else {
    // Extract all trailing digit-only segments from id
    const parts = st.id.split('_').filter(p => /^\d+$/.test(p));
    const lastNum = parts.length > 0 ? parseInt(parts[parts.length - 1], 10) : 1;
    numVal = !isNaN(lastNum) ? lastNum : 1;
  }
  const numStr = String(numVal).padStart(3, '0');

  return `${datePrefix}-${clsAbbr}-${numStr}`;
};

export const getScheduledTasks = (): ScheduledTaskItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading scheduled tasks from storage:', e);
  }
  return [];
};

export const saveScheduledTasks = (tasks: ScheduledTaskItem[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error('Error saving scheduled tasks to storage:', e);
  }
};
