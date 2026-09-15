import { supabase } from '@/integrations/supabase/client';
import { type SubmissionRequirement, serializeSubmissionRequirements } from '@/utils/submissionUtils';

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

        // 5. Parse dynamic metadata from the hidden tag in description
        let finalDesc = task.description || '';
        let finalReqs = ['video', 'pdf']; // fallback
        let finalType = 'general';
        let finalYear = task.academic_year || selectedYear;
        let finalSessionId = null;
        let finalInchargeId = null;
        let finalEarningAmount = 5;

        const reqMatch = finalDesc.match(/__REQS\[(.*?)\]__/);
        if (reqMatch) {
          try {
            const decodedReqs = JSON.parse(decodeURIComponent(reqMatch[1]));
            finalReqs = serializeSubmissionRequirements(decodedReqs);
          } catch(e) {}
          finalDesc = finalDesc.replace(reqMatch[0], '');
        } else {
          // Fallback to old format
          const oldReqMatch = finalDesc.match(/__REQ\[(.*?)\]__/);
          if (oldReqMatch) { finalReqs = oldReqMatch[1] ? oldReqMatch[1].split(',') : []; finalDesc = finalDesc.replace(oldReqMatch[0], ''); }
        }

        const typeMatch = finalDesc.match(/__TYPE\[(.*?)\]__/);
        if (typeMatch) { finalType = typeMatch[1]; finalDesc = finalDesc.replace(typeMatch[0], ''); }

        const yearMatch = finalDesc.match(/__YEAR\[(.*?)\]__/);
        if (yearMatch) { finalYear = yearMatch[1]; finalDesc = finalDesc.replace(yearMatch[0], ''); }

        const sessionMatch = finalDesc.match(/__SESSION\[(.*?)\]__/);
        if (sessionMatch) { finalSessionId = sessionMatch[1] === 'none' ? null : sessionMatch[1]; finalDesc = finalDesc.replace(sessionMatch[0], ''); }

        const incMatch = finalDesc.match(/__INCHARGE\[(.*?)\]__/);
        if (incMatch && incMatch[1] !== 'none') {
          finalInchargeId = incMatch[1];
          finalDesc = finalDesc.replace(incMatch[0], '');
        }

        const earningMatch = finalDesc.match(/__EARNING\[(.*?)\]__/);
        if (earningMatch) { finalEarningAmount = Number(earningMatch[1]) || 5; finalDesc = finalDesc.replace(earningMatch[0], ''); }

        finalDesc = finalDesc.trim();

        // 6. Check if already assigned (avoid duplicates)
        const { data: existingAssignment } = await (supabase as any)
          .from('student_task_feedback')
          .select('id')
          .eq('task_name', task.title)
          .eq('academic_year', finalYear)
          .limit(1);

        if (existingAssignment && existingAssignment.length > 0) {
          // Already assigned — just mark published
          await (supabase as any)
            .from('wes_scheduled_tasks')
            .update({ status: 'published', updated_at: new Date().toISOString() })
            .eq('id', task.id);
          continue;
        }

        // 6b. Look up real subject_id from subjects table using subject_name
        let resolvedSubjectId: string | null = null;
        if (task.subject_name) {
          const { data: subjectData } = await (supabase as any)
            .from('subjects')
            .select('id')
            .ilike('name', task.subject_name.trim())
            .limit(1);
          resolvedSubjectId = subjectData?.[0]?.id || null;
        }

        // 7. Insert one row per student
        const taskRecords = students.map((student: any) => ({
          student_id: student.id,
          task_name: task.title,
          task_description: finalDesc,
          task_id: generatedTaskId,
          deadline: task.deadline ? `${task.deadline}T23:59:59Z` : new Date(task.creation_date).toISOString(),
          session_id: finalSessionId,
          created_by: finalInchargeId,
          earning_amount: finalEarningAmount,
          status: 'pending',
          feedback_type: finalType,
          academic_year: finalYear,
          created_at: new Date(task.creation_date).toISOString(),
          submission_types: finalReqs,
          subject_id: resolvedSubjectId,
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

        console.log(`[Worker] ✓ Auto-assigned "${task.title}" → ${generatedTaskId} to ${students.length} students`);
      } catch (taskErr) {
        console.error(`[Worker] Error processing task "${task.title}":`, taskErr);
      }
    }

    console.log('[Worker] Auto-assignment complete.');
    // Run auto-approval worker for academy tasks
    await runAutoApprovalWorker();
  } catch (err) {
    console.error('[Worker] Fatal error in scheduled task worker:', err);
  }
}

/**
 * Auto-approval background worker:
 * Queries all academy_tasks where status = 'submitted' and auto_approve_at <= NOW().
 * Automatically approves them and updates the corresponding academy_submissions record.
 */
export async function runAutoApprovalWorker(): Promise<void> {
  try {
    const nowIso = new Date().toISOString();

    // Fetch submitted academy tasks where auto_approve_at is reached
    const { data: expiredTasks, error } = await (supabase as any)
      .from('academy_tasks')
      .select('id, auto_approve_at, auto_approve_minutes, submitted_at, created_at')
      .eq('status', 'submitted')
      .lte('auto_approve_at', nowIso);

    if (error) {
      console.warn('[AutoApprove Worker] Fetch error (schema may not be migrated yet):', error.message);
      return;
    }

    if (!expiredTasks || expiredTasks.length === 0) {
      return;
    }

    console.log(`[AutoApprove Worker] Found ${expiredTasks.length} tasks ready for auto-approval.`);

    for (const task of expiredTasks) {
      try {
        // Update task status to approved
        const { error: taskErr } = await (supabase as any)
          .from('academy_tasks')
          .update({ status: 'approved' })
          .eq('id', task.id);

        if (taskErr) {
          console.error(`[AutoApprove Worker] Failed to update task ${task.id}:`, taskErr.message);
          continue;
        }

        // Update corresponding submission review status
        await (supabase as any)
          .from('academy_submissions')
          .update({
            reviewed_at: nowIso,
            reviewer_comments: 'Auto-Approved after specified duration'
          })
          .eq('task_id', task.id);

        console.log(`[AutoApprove Worker] ✓ Auto-approved task ${task.id}`);
      } catch (err) {
        console.error(`[AutoApprove Worker] Error approving task ${task.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[AutoApprove Worker] Fatal error:', err);
  }
}

