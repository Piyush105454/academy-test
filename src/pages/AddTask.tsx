import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseSubmissionRequirements, serializeSubmissionRequirements, type SubmissionRequirement } from "../utils/submissionUtils";
import { logActivity } from '@/utils/activityLogger';
import { useAcademicYear } from '@/contexts/AcademicYearContext';

interface ClassOption {
  id: string;
  name: string;
}

interface SessionOption {
  id: string;
  title: string;
}

interface StudentOption {
  id: string;
  name: string;
}

export default function AddTask() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [subjects, setSubjects] = useState<{ id: string, name: string }[]>([]);
  const [rewardConfigs, setRewardConfigs] = useState<{ task_type: string, rate_per_task: number }[]>([]);

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    class_id: string;
    session_id: string;
    due_date: string;
    submission_link: string;
    academic_year: string;
    subject_id: string;
    earning_amount: number | '';
    task_type: string;
    submission_requirements: SubmissionRequirement[];
  }>({
    title: '',
    description: '',
    class_id: '',
    session_id: '',
    due_date: '',
    submission_link: '',
    academic_year: selectedYear,
    subject_id: '',
    earning_amount: 5,
    task_type: '',
    submission_requirements: [],
  });
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  useEffect(() => {
    fetchClasses();
    fetchSubjects();
      }, []);

  const fetchRewardConfigs = async (classId: string) => {
    let query = supabase.from('reward_configurations').select('task_type, rate_per_task');
    if (classId) {
      query = query.eq('class_id', classId);
    } else {
      query = query.is('class_id', null);
    }
    const { data, error } = await query.order('task_type');
    if (!error && data) {
      // If we queried a specific class and got nothing, maybe fallback to global defaults?
      if (classId && data.length === 0) {
        const { data: fallbackData } = await supabase.from('reward_configurations').select('task_type, rate_per_task').is('class_id', null).order('task_type');
        if (fallbackData) setRewardConfigs(fallbackData);
      } else {
        setRewardConfigs(data);
      }
    }
  };

  useEffect(() => {
    if (formData.class_id) {
      fetchRewardConfigs(formData.class_id);
    } else {
      setRewardConfigs([]);
    }
  }, [formData.class_id]);

  useEffect(() => {
    if (formData.class_id) {
      fetchSessionsByClass(formData.class_id);
      fetchStudentsByClass(formData.class_id, formData.academic_year);
    } else {
      setSessions([]);
      setStudents([]);
      setSelectedStudents([]);
    }
  }, [formData.class_id, formData.academic_year]);

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name')
      .neq('name', '__SYSTEM_DEV_MODE__')
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .order('name');
    if (!error && data) setClasses(data);
  };

  const fetchSubjects = async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name')
      .order('name');
    if (!error && data) setSubjects(data);
  };

  const fetchSessionsByClass = async (classId: string) => {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title')
      .eq('class_batch', cls.name)
      .order('session_date', { ascending: false });
    if (!error && data) setSessions(data);
  };

  const fetchStudentsByClass = async (classId: string, academicYear: string) => {
    let query = supabase
      .from('students')
      .select('id, name')
      .eq('class_id', classId);

    if (academicYear) {
      query = query.eq('academic_year', academicYear);
    }

    query = query.order('name');

    const { data, error } = await query;
    if (!error && data) {
        setStudents(data);
        setSelectedStudents(data.map(s => s.id));
    }
  };

  const handleCreate = async () => {
    if (!formData.title || !formData.class_id || !formData.academic_year || !formData.task_type) {
      toast.error('Please fill in required fields (Title, Task Type, Class, Academic Year)');
      return;
    }

    // Validate task description
    const isDescriptionEmpty = !formData.description || formData.description.replace(/<[^>]*>/g, '').trim() === '';
    if (isDescriptionEmpty) {
      toast.error('Task description is required');
      return;
    }

    // Validate due date
    if (!formData.due_date) {
      toast.error('Due date is required');
      return;
    }

    // Validate submission requirements
    if (formData.submission_requirements.length === 0) {
      toast.error('Please add at least one submission requirement');
      return;
    }

    // Validate that all submission requirements have a title
    const missingTitle = formData.submission_requirements.some(req => !req.title.trim());
    if (missingTitle) {
      toast.error('All submission requirements must have a title');
      return;
    }

    try {
      setLoading(true);
      if (selectedStudents.length === 0) {
        toast.error('Please select at least one student to assign the task');
        setLoading(false);
        return;
      }

      const studentsToAssign = selectedStudents.map(id => ({ id }));

      // Check if a task with the same name already exists in this academic year
      const { data: duplicateCheck, error: duplicateCheckError } = await supabase
        .from('student_task_feedback')
        .select('id')
        .eq('task_name', formData.title)
        .eq('academic_year', formData.academic_year)
        .limit(1);

      if (duplicateCheck && duplicateCheck.length > 0) {
        toast.error('A task with this title already exists in this academic year. Please use a unique title.');
        setLoading(false);
        return;
      }

      const d = new Date();
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const selectedClass = classes.find(c => c.id === formData.class_id);
      const classNameStr = selectedClass ? selectedClass.name.replace(/[\s\/]+/g, '') : 'Class';
      const prefix = `${yearStr}-${monthStr}-${classNameStr}-`;
      
      const { data: existingTasks } = await supabase
        .from('student_task_feedback')
        .select('task_id')
        .like('task_id', `${prefix}%`)
        .order('task_id', { ascending: false })
        .limit(1);
      
      let nextSeq = 1;
      if (existingTasks && existingTasks.length > 0 && existingTasks[0].task_id) {
        const lastId = existingTasks[0].task_id;
        const lastSeqStr = lastId.split('-').pop();
        if (lastSeqStr) {
          const lastSeqNum = parseInt(lastSeqStr, 10);
          if (!isNaN(lastSeqNum)) {
            nextSeq = lastSeqNum + 1;
          }
        }
      }
      
      const seqStr = String(nextSeq).padStart(3, '0');
      const generatedTaskId = `${prefix}${seqStr}`;

      const taskRecords = studentsToAssign.map(student => ({
        session_id: formData.session_id || null,
        student_id: student.id,
        feedback_type: formData.task_type,
        task_name: formData.title,
        task_id: generatedTaskId,
        task_description: formData.description || null,
        deadline: formData.due_date ? new Date(formData.due_date).toISOString() : null,
        submission_link: formData.submission_link || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        academic_year: formData.academic_year,
        subject_id: formData.subject_id || null,
        earning_amount: formData.earning_amount === '' ? 0 : formData.earning_amount,
        submission_types: serializeSubmissionRequirements(formData.submission_requirements),
        created_by: user?.id || null,
      }));

      const { error } = await supabase.from('student_task_feedback').insert(taskRecords);
      if (error) throw error;

      await logActivity('CREATE', 'Tasks', `Created task: ${formData.title} (Assigned to ${studentsToAssign.length} students)`);

      toast.success(`Task assigned to ${studentsToAssign.length} students`);
      navigate('/tasks');
    } catch (e) {
      console.error('Error creating task:', e);
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/tasks')}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Create New Task</h1>
            <p className="text-sm text-muted-foreground">Assign a new task to students or a whole class</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Task Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="title">Task Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Homework Assignment 1"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label htmlFor="class">Assign to Class *</Label>
                <Select
                  value={formData.class_id}
                  onValueChange={(value) => setFormData({ ...formData, class_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subject (Optional)</Label>
                <Select value={formData.subject_id} onValueChange={v => setFormData({ ...formData, subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1 md:col-span-2">
                <div className="space-y-4 mt-6">
                  <div className="flex items-center justify-between">
                    <Label>Submission Requirements *</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const newReq: SubmissionRequirement = {
                          id: `req-${Date.now()}`,
                          title: '',
                          type: 'pdf'
                        };
                        setFormData({
                          ...formData,
                          submission_requirements: [...formData.submission_requirements, newReq]
                        });
                      }}
                    >
                      + Add Requirement
                    </Button>
                  </div>
                  
                  {formData.submission_requirements.length === 0 ? (
                    <div className="text-sm text-red-500 font-medium">At least one submission requirement is mandatory. Add a requirement to assign the task.</div>
                  ) : (
                    <div className="space-y-3">
                      {formData.submission_requirements.map((req, index) => (
                        <div key={req.id} className="flex gap-2 items-start border p-3 rounded-md bg-gray-50">
                          <div className="flex-1 space-y-2">
                            <div>
                              <Label className="text-xs">Requirement Title *</Label>
                              <Input 
                                placeholder="e.g., Presentation PPT" 
                                value={req.title}
                                onChange={(e) => {
                                  const updated = [...formData.submission_requirements];
                                  updated[index].title = e.target.value;
                                  setFormData({ ...formData, submission_requirements: updated });
                                }}
                              />
                            </div>
                          </div>
                          <div className="w-48 space-y-2">
                            <Label className="text-xs">File Type</Label>
                            <select 
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                              value={req.type}
                              onChange={(e) => {
                                const updated = [...formData.submission_requirements];
                                updated[index].type = e.target.value as SubmissionRequirement['type'];
                                setFormData({ ...formData, submission_requirements: updated });
                              }}
                            >
                              <option value="video">Video</option>
                              <option value="pdf">Pdf</option>
                              <option value="doc">Doc</option>
                              <option value="ppt">Ppt</option>
                              <option value="excel">Excel</option>
                              <option value="image">Image</option>
                              <option value="code">Code</option>
                              <option value="link">Link</option>
                            </select>
                          </div>
                          <div className="pt-6">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() => {
                                const updated = formData.submission_requirements.filter((_, i) => i !== index);
                                setFormData({ ...formData, submission_requirements: updated });
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="academic_year">Academic Year *</Label>
                <Select
                  value={formData.academic_year}
                  onValueChange={(value) => setFormData({ ...formData, academic_year: value })}
                >
                  <SelectTrigger id="academic_year">
                    <SelectValue placeholder="Select Academic Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-26">2025-26</SelectItem>
                    <SelectItem value="2026-27">2026-27</SelectItem>
                    <SelectItem value="2027-28">2027-28</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task_type">Task Type *</Label>
                <Select
                    disabled={!formData.class_id}
                    value={formData.task_type}
                  onValueChange={(value) => {
                    const config = rewardConfigs.find(c => c.task_type === value);
                    setFormData({
                      ...formData,
                      task_type: value,
                      earning_amount: config ? config.rate_per_task : formData.earning_amount
                    });
                  }}
                >
                  <SelectTrigger id="task_type">
                    <SelectValue placeholder="Select Task Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {rewardConfigs.filter(c => c.task_type).map((config) => (
                      <SelectItem key={config.task_type} value={config.task_type}>
                        {config.task_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.class_id && students.length > 0 && (
                  <div className="space-y-2">
                      <Label>Assign to Students *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal border-border">
                            {selectedStudents.length === students.length 
                              ? "All Students Selected" 
                              : selectedStudents.length > 0 
                                ? `${selectedStudents.length} Student(s) Selected` 
                                : "Select Students..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] sm:w-[400px] p-0" align="start">
                          <div className="p-3 border-b flex justify-between items-center bg-muted/20">
                            <span className="text-sm font-medium">Select Students</span>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-xs px-2"
                              onClick={() => {
                                  if (selectedStudents.length === students.length) {
                                      setSelectedStudents([]);
                                  } else {
                                      setSelectedStudents(students.map(s => s.id));
                                  }
                              }}
                            >
                                {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                            </Button>
                          </div>
                          <div className="p-2 border-b">
                            <Input
                              type="text"
                              placeholder="Search students..."
                              value={studentSearchQuery}
                              onChange={(e) => setStudentSearchQuery(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="max-h-[250px] overflow-y-auto p-2 space-y-1">
                            {(() => {
                              const filtered = students.filter(s => 
                                s.name.toLowerCase().includes(studentSearchQuery.toLowerCase())
                              );
                              if (filtered.length === 0) {
                                return (
                                  <div className="text-center py-4 text-xs text-muted-foreground">
                                    No matching students found
                                  </div>
                                );
                              }
                              return filtered.map(student => (
                                <div key={student.id} className="flex items-center space-x-3 hover:bg-accent hover:text-accent-foreground p-2 rounded-sm cursor-pointer"
                                  onClick={() => {
                                    if (selectedStudents.includes(student.id)) {
                                      setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                                    } else {
                                      setSelectedStudents([...selectedStudents, student.id]);
                                    }
                                  }}
                                >
                                  <Checkbox 
                                    id={`student-${student.id}`}
                                    checked={selectedStudents.includes(student.id)}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setSelectedStudents([...selectedStudents, student.id]);
                                        } else {
                                            setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <label 
                                    htmlFor={`student-${student.id}`}
                                    className="text-sm font-medium leading-none cursor-pointer flex-1"
                                    onClick={(e) => e.preventDefault()}
                                  >
                                    {student.name}
                                  </label>
                                </div>
                              ));
                            })()}
                          </div>
                        </PopoverContent>
                      </Popover>
                  </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="session">Linked Session (Optional)</Label>
                <Select
                  value={formData.session_id}
                  onValueChange={(value) => setFormData({ ...formData, session_id: value })}
                  disabled={!formData.class_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No Session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>{session.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Academic Year field moved up */}

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date *</Label>
                <Input
                  id="due_date"
                  type="datetime-local"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reward">Reward Points</Label>
                <Input
                  id="reward"
                  type="number"
                  value={formData.earning_amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, earning_amount: val === '' ? '' : parseInt(val) || 0 });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Task Description *</Label>
              <RichTextEditor
                value={formData.description}
                onChange={(value) => setFormData({ ...formData, description: value })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => navigate('/tasks')}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={loading} className="gap-2">
                {loading ? 'Creating...' : (
                  <>
                    <Save className="h-4 w-4" />
                    Create Task
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
