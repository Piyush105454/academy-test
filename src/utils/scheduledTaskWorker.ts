import { supabase } from '@/integrations/supabase/client';

/**
 * Background worker: runs on app load.
 * Finds all wes_scheduled_tasks where creation_date <= today AND status = 'scheduled',
 * then assigns them to all students in their class by inserting into student_task_feedback.
 * Marks each task as 'published' after assignment.
 */
export async function runScheduledTaskWorker(selectedYear: string): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Find all scheduled tasks that are due today or earlier
    const { data: dueTasks, error: fetchError } = await (supabase as any)
      .from('wes_scheduled_tasks')
      .select('*')
      .lte('creation_date', today)
      .eq('status', 'scheduled');

    if (fetchError) {
      console.warn('[Worker] Error fetching scheduled tasks:', fetchError.message);
      return;
    }

    if (!dueTasks || dueTasks.length === 0) {
      console.log('[Worker] No scheduled tasks due today.');
      return;
    }

    console.log(`[Worker] Found ${dueTasks.length} tasks to auto-assign.`);

    for (const task of dueTasks) {
      try {
        // 2. Find class_id by class_name
        const { data: classData } = await (supabase as any)
          .from('classes')
          .select('id')
          .ilike('name', task.class_name.trim())
          .limit(1);

        const classId = classData?.[0]?.id;
        if (!classId) {
          console.warn(`[Worker] Class "${task.class_name}" not found, skipping task "${task.title}"`);
          continue;
        }

        // 3. Fetch all students in that class
        const { data: students } = await (supabase as any)
          .from('students')
          .select('id')
          .eq('class_id', classId);

        if (!students || students.length === 0) {
          console.warn(`[Worker] No students in class "${task.class_name}", skipping.`);
          continue;
        }

        // 4. Generate task_id (matches AddTask format)
        const d = new Date(task.creation_date);
        const yearStr = d.getFullYear();
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const classNameStr = (task.class_name || '').replace(/[\s\/]+/g, '');
        const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;

        const { data: existingTasks } = await (supabase as any)
          .from('student_task_feedback')
          .select('task_id')
          .like('task_id', `${prefix}%`)
          .order('task_id', { ascending: false })
          .limit(1);

        let nextSeq = 1;
        if (existingTasks?.[0]?.task_id) {
          const lastSeqStr = existingTasks[0].task_id.split('-').pop();
          const n = parseInt(lastSeqStr, 10);
          if (!isNaN(n)) nextSeq = n + 1;
        }
        const generatedTaskId = `${prefix}${String(nextSeq).padStart(3, '0')}`;

        // 5. Parse dynamic submission_types from the hidden tag in description
        let actualDesc = task.description || '';
        let dynamicSubmissionTypes = ['video', 'pdf']; // fallback
        const reqMatch = actualDesc.match(/__REQ\[(.*?)\]__/);
        if (reqMatch) {
          dynamicSubmissionTypes = reqMatch[1].split(',').filter(Boolean);
          actualDesc = actualDesc.replace(reqMatch[0], '').trim();
        }

        // 6. Check if already assigned (avoid duplicates)
        const { data: existingAssignment } = await (supabase as any)
          .from('student_task_feedback')
          .select('id')
          .eq('task_name', task.title)
          .eq('academic_year', task.academic_year || selectedYear)
          .limit(1);

        if (existingAssignment && existingAssignment.length > 0) {
          // Already assigned — just mark published
          await (supabase as any)
            .from('wes_scheduled_tasks')
            .update({ status: 'published', updated_at: new Date().toISOString() })
            .eq('id', task.id);
          continue;
        }

        // 7. Insert one row per student
        const taskRecords = students.map((student: any) => ({
          student_id: student.id,
          task_name: task.title,
          task_description: actualDesc,
          task_id: generatedTaskId,
          deadline: task.deadline ? `${task.deadline}T23:59:59Z` : new Date(task.creation_date).toISOString(),
          status: 'pending',
          feedback_type: 'general',
          academic_year: task.academic_year || selectedYear,
          created_at: new Date(task.creation_date).toISOString(),
          submission_types: dynamicSubmissionTypes,
        }));

        const { error: insertError } = await (supabase as any)
          .from('student_task_feedback')
          .insert(taskRecords);

        if (insertError) {
          console.error(`[Worker] Failed to assign "${task.title}":`, insertError.message);
          continue;
        }

        // 7. Mark task as published in wes_scheduled_tasks
        await (supabase as any)
          .from('wes_scheduled_tasks')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', task.id);

        console.log(`[Worker] ✅ Auto-assigned "${task.title}" → ${generatedTaskId} to ${students.length} students`);
      } catch (taskErr) {
        console.error(`[Worker] Error processing task "${task.title}":`, taskErr);
      }
    }

    console.log('[Worker] Auto-assignment complete.');
  } catch (err) {
    console.error('[Worker] Fatal error in scheduled task worker:', err);
  }
}
