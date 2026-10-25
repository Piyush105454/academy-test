import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Clock, Plus, Users, Award, FileText, Settings2, MoreHorizontal, X, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';

interface Facilitator {
  id: string;
  full_name: string;
  email?: string;
}

export interface WorkRequirement {
  id: string;
  title: string;
  type: 'text' | 'number' | 'image' | 'pdf' | 'link' | 'video' | 'excel';
}

interface TaskAssignment {
  id?: string;
  facilitator_id: string;
  custom_reward_amount?: number | null;
  user_profiles?: { full_name: string } | null;
  academy_tasks?: { status: string; task_date: string }[];
}

interface TaskTemplate {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  recurrence: string;
  recurrence_rule?: string | null;
  base_reward_amount: number;
  leaderboard_points: number;
  requires_note?: boolean;
  requires_photo?: boolean;
  manager_approval_required?: boolean;
  auto_approve_minutes?: number;
  due_time?: string | null;
  end_date?: string | null;
  created_at?: string;
  academy_task_assignments?: TaskAssignment[];
}

export default function TasksAdmin() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState("daily");
  
  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("attendance");
  const [description, setDescription] = useState("");
  const [dueTime, setDueTime] = useState("16:00");
  const [endDate, setEndDate] = useState("");
  const [baseRewardAmount, setBaseRewardAmount] = useState(20);
  const [leaderboardPoints, setLeaderboardPoints] = useState(5);
  const [includeLeaderboard, setIncludeLeaderboard] = useState(true);
  const [requiresNote, setRequiresNote] = useState(true);
  const [requiresPhoto, setRequiresPhoto] = useState(true);
  const [submissionRequirements, setSubmissionRequirements] = useState<WorkRequirement[]>([
    { id: 'req-1', title: 'Work Summary / Notes', type: 'text' }
  ]);

  // Auto-approval state
  const [requiresManagerApproval, setRequiresManagerApproval] = useState(true);
  const [autoApprovePreset, setAutoApprovePreset] = useState("1440");
  const [autoApproveHours, setAutoApproveHours] = useState(24);
  const [autoApproveMins, setAutoApproveMins] = useState(0);

  // State for facilitators
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [selectedFacilitators, setSelectedFacilitators] = useState<Facilitator[]>([]);
  
  // State for repeating days (1=Mon, 7=Sun)
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // default Mon-Fri

  const toggleDay = (dayIndex: number) => {
    setSelectedDays(prev => 
      prev.includes(dayIndex) 
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  useEffect(() => {
    const fetchFacilitators = async () => {
      try {
        // 1. Fetch active and inactive facilitators from facilitators directory
        const { data: facsData } = await supabase
          .from('facilitators')
          .select('name, email, status');

        const norm = (str?: string | null) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const inactiveEmails = new Set(
          facsData?.filter(f => f.status === 'inactive').map(f => f.email?.toLowerCase().trim()).filter(Boolean) || []
        );
        const inactiveNames = new Set(
          facsData?.filter(f => f.status === 'inactive').map(f => norm(f.name)).filter(Boolean) || []
        );

        const activeEmails = new Set(
          facsData?.filter(f => f.status === 'active').map(f => f.email?.toLowerCase().trim()).filter(Boolean) || []
        );
        const activeNames = new Set(
          facsData?.filter(f => f.status === 'active').map(f => norm(f.name)).filter(Boolean) || []
        );

        // 2. Fetch user_profiles (role_id 4 = Facilitator)
        const { data: profiles, error } = await supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .eq('role_id', 4)
          .eq('is_active', true)
          .order('full_name');

        if (error) {
          console.error("Error fetching profiles:", error);
          return;
        }

        if (profiles) {
          // Filter matching active facilitators by either email OR name
          const filteredData = profiles.filter(p => {
            const pEmail = (p.email || '').toLowerCase().trim();
            const pName = norm(p.full_name);

            // Exclude test/deleted accounts
            if (pName.includes('delete') || pName.includes('test')) return false;

            // Exclude inactive facilitators
            if (inactiveEmails.has(pEmail) || inactiveNames.has(pName)) return false;

            // Match if active by email or active by name
            return activeEmails.has(pEmail) || activeNames.has(pName);
          });

          // Deduplicate by normalized name (prefer official domain email if multiple accounts exist)
          const byName = new Map<string, Facilitator>();
          for (const p of filteredData) {
            const key = norm(p.full_name);
            const cleanedProfile = { ...p, full_name: p.full_name?.trim() || '' };
            if (!byName.has(key)) {
              byName.set(key, cleanedProfile);
            } else {
              const existing = byName.get(key)!;
              if (p.email?.includes('wazireducationsociety.org') && !existing.email?.includes('wazireducationsociety.org')) {
                byName.set(key, cleanedProfile);
              }
            }
          }

          const uniqueData = Array.from(byName.values()).sort((a, b) => 
            a.full_name.localeCompare(b.full_name)
          );

          setFacilitators(uniqueData);
        }
      } catch (err) {
        console.error("Error loading facilitators:", err);
      }
    };
    fetchFacilitators();
  }, []);

  const handleAddFacilitator = (facilitatorId: string) => {
    if (facilitatorId === 'all') {
      setSelectedFacilitators([]);
      return;
    }
    const fac = facilitators.find(f => f.id === facilitatorId);
    if (fac && !selectedFacilitators.find(s => s.id === fac.id)) {
      setSelectedFacilitators([...selectedFacilitators, fac]);
    }
  };

  const handleRemoveFacilitator = (id: string) => {
    setSelectedFacilitators(selectedFacilitators.filter(f => f.id !== id));
  };

  const resetForm = () => {
    setName("");
    setCategory("attendance");
    setDescription("");
    setRecurrence("daily");
    setDueTime("16:00");
    setEndDate("");
    setBaseRewardAmount(20);
    setLeaderboardPoints(5);
    setIncludeLeaderboard(true);
    setRequiresNote(true);
    setRequiresPhoto(true);
    setSubmissionRequirements([
      { id: `req-${Date.now()}`, title: 'Work Summary / Notes', type: 'text' }
    ]);
    setRequiresManagerApproval(true);
    setAutoApprovePreset("1440");
    setAutoApproveHours(24);
    setAutoApproveMins(0);
    setSelectedFacilitators([]);
    setSelectedDays([1, 2, 3, 4, 5]);
    setEditingTemplateId(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleEditTemplate = (task: TaskTemplate) => {
    setEditingTemplateId(task.id);
    setName(task.name || "");
    setCategory(task.category || "attendance");

    const cleanDesc = (task.description || "")
      .replace(/__AUTOAPPROVE\[.*?\]__/g, "")
      .replace(/__REQS\[.*?\]__/g, "")
      .trim();
    setDescription(cleanDesc);

    // Extract submission requirements
    const reqMatch = (task.description || "").match(/__REQS\[(.*?)\]__/);
    if (reqMatch) {
      try {
        const parsed = JSON.parse(decodeURIComponent(reqMatch[1]));
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSubmissionRequirements(parsed);
        } else {
          setSubmissionRequirements([{ id: `req-${Date.now()}`, title: 'Work Summary / Notes', type: 'text' }]);
        }
      } catch (e) {
        setSubmissionRequirements([{ id: `req-${Date.now()}`, title: 'Work Summary / Notes', type: 'text' }]);
      }
    } else {
      // Legacy fallback
      const legacyReqs: WorkRequirement[] = [];
      if (task.requires_note) {
        legacyReqs.push({ id: `req-note-${Date.now()}`, title: 'Text Note / Context Summary', type: 'text' });
      }
      if (task.requires_photo) {
        legacyReqs.push({ id: `req-photo-${Date.now()}`, title: 'Photo(s) / Image Evidence', type: 'image' });
      }
      if (task.description?.includes('Document')) {
        legacyReqs.push({ id: `req-doc-${Date.now()}`, title: 'Document (PDF / Word)', type: 'pdf' });
      }
      if (task.description?.includes('Link')) {
        legacyReqs.push({ id: `req-link-${Date.now()}`, title: 'External / Drive Link', type: 'link' });
      }
      setSubmissionRequirements(legacyReqs.length > 0 ? legacyReqs : [
        { id: `req-${Date.now()}`, title: 'Work Summary / Notes', type: 'text' }
      ]);
    }

    setRecurrence(task.recurrence || "daily");
    if (task.recurrence_rule) {
      const days = task.recurrence_rule.split(',').map((d: string) => parseInt(d, 10)).filter(Boolean);
      setSelectedDays(days.length > 0 ? days : [1, 2, 3, 4, 5]);
    } else {
      setSelectedDays([1, 2, 3, 4, 5]);
    }

    setDueTime(task.due_time || "16:00");
    setEndDate(task.end_date || "");
    setBaseRewardAmount(Number(task.base_reward_amount) || 0);
    setLeaderboardPoints(Number(task.leaderboard_points) || 0);
    setIncludeLeaderboard(Number(task.leaderboard_points) > 0);
    setRequiresNote(task.requires_note ?? true);
    setRequiresPhoto(task.requires_photo ?? true);

    const approvalReq = task.manager_approval_required ?? true;
    setRequiresManagerApproval(approvalReq);
    const autoMins = Number(task.auto_approve_minutes) || 0;
    if (!approvalReq && autoMins > 0) {
      setAutoApproveHours(Math.floor(autoMins / 60));
      setAutoApproveMins(autoMins % 60);
      if ([0, 360, 720, 1440, 2880, 4320].includes(autoMins)) {
        setAutoApprovePreset(String(autoMins));
      } else {
        setAutoApprovePreset("custom");
      }
    } else if (!approvalReq && autoMins === 0) {
      setAutoApprovePreset("0");
      setAutoApproveHours(0);
      setAutoApproveMins(0);
    } else {
      setAutoApprovePreset("1440");
      setAutoApproveHours(24);
      setAutoApproveMins(0);
    }

    const assignments = task.academy_task_assignments || [];
    const assignedFacIds = assignments.map((a: TaskAssignment) => a.facilitator_id).filter(Boolean);
    if (assignedFacIds.length > 0 && assignedFacIds.length < facilitators.length) {
      const matched = facilitators.filter(f => assignedFacIds.includes(f.id));
      setSelectedFacilitators(matched);
    } else {
      setSelectedFacilitators([]);
    }

    setIsCreating(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Work Name is required");
    
    // Validate submission requirements: at least one is mandatory, and all must have titles
    if (submissionRequirements.length === 0) {
      return toast.error("Please add at least one submission requirement.");
    }
    const missingTitle = submissionRequirements.some(req => !req.title.trim());
    if (missingTitle) {
      return toast.error("All submission requirements must have a title.");
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user logged in");

      const totalAutoApproveMinutes = requiresManagerApproval ? 0 : ((Number(autoApproveHours) || 0) * 60 + (Number(autoApproveMins) || 0));
      const autoApproveTag = `__AUTOAPPROVE[${requiresManagerApproval ? 'manual' : totalAutoApproveMinutes}]__`;
      const reqsTag = `__REQS[${encodeURIComponent(JSON.stringify(submissionRequirements))}]__`;

      const cleanUserDesc = (description || "")
        .replace(/__AUTOAPPROVE\[.*?\]__/g, "")
        .replace(/__REQS\[.*?\]__/g, "")
        .trim();

      const finalDescription = `${cleanUserDesc} ${autoApproveTag} ${reqsTag}`.trim();

      const hasTextReq = submissionRequirements.some(r => r.type === 'text');
      const hasImageReq = submissionRequirements.some(r => r.type === 'image');

      const templatePayload = {
        name: name.trim(),
        category,
        description: finalDescription,
        recurrence,
        recurrence_rule: recurrence !== 'onetime' ? selectedDays.join(',') : null,
        base_reward_amount: baseRewardAmount,
        leaderboard_points: includeLeaderboard ? leaderboardPoints : 0,
        requires_note: hasTextReq,
        requires_photo: hasImageReq,
        manager_approval_required: requiresManagerApproval,
        auto_approve_minutes: totalAutoApproveMinutes,
        due_time: dueTime,
        end_date: endDate || null,
      };

      if (editingTemplateId) {
        // UPDATE existing template
        const { error: updateError } = await supabase
          .from('academy_task_templates')
          .update(templatePayload)
          .eq('id', editingTemplateId);

        if (updateError) throw updateError;

        // Sync Assignments
        const facilitatorsToAssign = selectedFacilitators.length > 0 
          ? selectedFacilitators 
          : facilitators;
        const targetFacIds = facilitatorsToAssign.map(f => f.id);

        const { data: existingAssignments } = await supabase
          .from('academy_task_assignments')
          .select('id, facilitator_id')
          .eq('template_id', editingTemplateId);

        const existingMap = new Map((existingAssignments || []).map(a => [a.facilitator_id, a.id]));

        // Add new assignments
        const toAdd = targetFacIds.filter(id => !existingMap.has(id));
        if (toAdd.length > 0) {
          const newAssignments = toAdd.map(facId => ({
            template_id: editingTemplateId,
            facilitator_id: facId,
            custom_reward_amount: null
          }));
          const { error: insErr } = await supabase
            .from('academy_task_assignments')
            .insert(newAssignments);
          if (insErr) console.error("Error inserting new assignments:", insErr);
        }

        // Remove unselected assignments
        const toRemove = (existingAssignments || [])
          .filter(a => !targetFacIds.includes(a.facilitator_id))
          .map(a => a.id);
        if (toRemove.length > 0) {
          const { error: delErr } = await supabase
            .from('academy_task_assignments')
            .delete()
            .in('id', toRemove);
          if (delErr) console.error("Error removing old assignments:", delErr);
        }

        // Regenerate/refresh tasks for today
        try {
          await supabase.rpc('generate_academy_tasks');
        } catch (rpcErr) {
          console.error("Error regenerating tasks:", rpcErr);
        }

        toast.success("Work template updated successfully!");
      } else {
        // CREATE new template
        const { data: template, error: templateError } = await supabase
          .from('academy_task_templates')
          .insert({
            ...templatePayload,
            created_by: user.id
          })
          .select()
          .single();

        if (templateError) throw templateError;

        const facilitatorsToAssign = selectedFacilitators.length > 0 
          ? selectedFacilitators 
          : facilitators;

        if (facilitatorsToAssign.length > 0) {
          const assignments = facilitatorsToAssign.map(fac => ({
            template_id: template.id,
            facilitator_id: fac.id,
            custom_reward_amount: null
          }));

          const { error: assignError } = await supabase
            .from('academy_task_assignments')
            .insert(assignments);
            
          if (assignError) throw assignError;

          const { error: rpcError } = await supabase.rpc('generate_academy_tasks');
          if (rpcError) console.error("Error generating initial tasks:", rpcError);
        }

        toast.success("Work template created successfully!");
      }

      resetForm();
      setIsCreating(false);
      
      // Refresh templates
      const { data: newTemplates } = await supabase
        .from('academy_task_templates')
        .select(`
          *,
          academy_task_assignments (
            facilitator_id,
            user_profiles (full_name),
            academy_tasks (status, task_date)
          )
        `)
        .order('created_at', { ascending: false });
      if (newTemplates) setTemplates(newTemplates as TaskTemplate[]);
      
    } catch (err: unknown) {
      toast.error("Error saving work: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // State for fetched templates
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('academy_task_templates')
          .select(`
            *,
            academy_task_assignments (
              facilitator_id,
              user_profiles (full_name),
              academy_tasks (status, task_date)
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTemplates((data as TaskTemplate[]) || []);
      } catch (err: unknown) {
        toast.error("Failed to load templates: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    };
    
    if (!isCreating) {
      fetchTemplates();
    }
  }, [isCreating]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<TaskTemplate | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteTemplate = async () => {
    if (!templateToDelete || deleteConfirmText !== "DELETE") return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('academy_task_templates')
        .delete()
        .eq('id', templateToDelete.id);
        
      if (error) throw error;
      
      toast.success("Work template deleted successfully");
      setTemplates(templates.filter(t => t.id !== templateToDelete.id));
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      setDeleteConfirmText("");
    } catch (err: unknown) {
      toast.error("Error deleting template: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isCreating) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Work & Templates</h1>
              <p className="text-sm text-slate-500 mt-1">Manage recurring work templates and assignments.</p>
            </div>
            <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="h-4 w-4" />
              Create Work
            </Button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-4">Work Name & Details</th>
                    <th className="px-6 py-4">Creation Date</th>
                    <th className="px-6 py-4">Occurrence & Deadline</th>
                    <th className="px-6 py-4">Template Status</th>
                    <th className="px-6 py-4">Today's Progress</th>
                    <th className="px-6 py-4">Assigned To</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading templates...</td>
                    </tr>
                  ) : templates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">No work templates found. Click 'Create Work' to add one.</td>
                    </tr>
                  ) : (
                    templates.map((task) => {
                      const assignments = task.academy_task_assignments || [];
                      
                      let assignedText = "All Facilitators";
                      if (assignments.length > 0) {
                        assignedText = assignments.map((a: TaskAssignment) => a.user_profiles?.full_name).filter(Boolean).join(', ');
                      }

                      // Occurrence logic
                      let occurrenceText = task.recurrence;
                      if (task.recurrence !== 'onetime' && task.recurrence_rule) {
                        const daysMap: Record<string, string> = { '1': 'M', '2': 'T', '3': 'W', '4': 'Th', '5': 'F', '6': 'Sa', '7': 'Su' };
                        const daysArr = task.recurrence_rule.split(',').map((d: string) => daysMap[d]);
                        occurrenceText += ` (${daysArr.join(', ')})`;
                      }

                      // Status Logic (Published vs Ended)
                      const isEnded = task.end_date && new Date(task.end_date) < new Date();
                      
                      // Today's Progress Logic
                      const todayStr = new Date().toISOString().split('T')[0];
                      let todayPending = 0;
                      let todaySubmitted = 0;
                      
                      assignments.forEach((a: TaskAssignment) => {
                        const todayTasks = (a.academy_tasks || []).filter((t: { status: string; task_date: string }) => t.task_date === todayStr);
                        todayTasks.forEach((t: { status: string }) => {
                          if (t.status === 'pending') todayPending++;
                          if (t.status === 'submitted' || t.status === 'approved') todaySubmitted++;
                        });
                      });

                      const totalToday = todayPending + todaySubmitted;

                      return (
                        <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{task.name}</div>
                            <div className="text-xs text-slate-500 capitalize">{task.category} • ₹{task.base_reward_amount}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {new Date(task.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="inline-flex px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md capitalize">
                              {occurrenceText}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Due: {task.due_time || 'EOD'}</div>
                          </td>
                          <td className="px-6 py-4">
                            {isEnded ? (
                              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded">Ended</span>
                            ) : (
                              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">Published</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {totalToday > 0 ? (
                              <div className="space-y-1">
                                {todaySubmitted > 0 && <div className="text-green-600 font-medium">✓ {todaySubmitted} Submitted</div>}
                                {todayPending > 0 && <div className="text-orange-600">⌛ {todayPending} Pending</div>}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No tasks today</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            <div className="truncate max-w-[150px]" title={assignedText}>{assignedText}</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditTemplate(task)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Work
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                  onClick={() => {
                                    setTemplateToDelete(task);
                                    setDeleteConfirmText("");
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600">Delete Work Template</DialogTitle>
              <DialogDescription>
                This will permanently delete the work template <strong>{templateToDelete?.name}</strong> and all its associated assignments and tasks. 
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <Label htmlFor="confirm-delete">
                Please type <strong>DELETE</strong> to confirm:
              </Label>
              <Input 
                id="confirm-delete"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
              <Button 
                variant="destructive" 
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                onClick={handleDeleteTemplate}
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{editingTemplateId ? 'Edit Work' : 'Create Work'}</h1>
          <p className="text-sm text-slate-500 mt-1">Assign responsibility, reward and leaderboard rules.</p>
        </div>
        <form onSubmit={handleCreateTask} className="space-y-6 max-w-4xl bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <Card className="border-t-4 border-t-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Work Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Work Name</Label>
                  <Input 
                    placeholder="e.g. Daily Attendance Record" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attendance">Attendance</SelectItem>
                      <SelectItem value="teaching">Teaching / Academics</SelectItem>
                      <SelectItem value="outreach">Outreach & Home Visits</SelectItem>
                      <SelectItem value="planning">Lesson Planning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  placeholder="Instructions for the facilitator..." 
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" /> Schedule & Occurrence
              </CardTitle>
              <CardDescription>Set up Microsoft Teams-style series recurrence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={recurrence} onValueChange={setRecurrence} className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 min-w-[140px] cursor-pointer hover:bg-slate-50">
                  <RadioGroupItem value="onetime" id="onetime" />
                  <Label htmlFor="onetime" className="cursor-pointer">One Time</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 min-w-[140px] cursor-pointer hover:bg-slate-50">
                  <RadioGroupItem value="daily" id="daily" />
                  <Label htmlFor="daily" className="cursor-pointer">Daily (Series)</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 min-w-[140px] cursor-pointer hover:bg-slate-50">
                  <RadioGroupItem value="weekly" id="weekly" />
                  <Label htmlFor="weekly" className="cursor-pointer">Weekly (Series)</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 min-w-[140px] cursor-pointer hover:bg-slate-50">
                  <RadioGroupItem value="biweekly" id="biweekly" />
                  <Label htmlFor="biweekly" className="cursor-pointer">Bi-Weekly (Series)</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 min-w-[140px] cursor-pointer hover:bg-slate-50">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <Label htmlFor="monthly" className="cursor-pointer">Monthly (Series)</Label>
                </div>
              </RadioGroup>

              {(recurrence === 'weekly' || recurrence === 'daily' || recurrence === 'biweekly') && (
                <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                  <Label>Repeats on</Label>
                  <div className="flex gap-2">
                    {[
                      { label: 'M', value: 1 },
                      { label: 'T', value: 2 },
                      { label: 'W', value: 3 },
                      { label: 'T', value: 4 },
                      { label: 'F', value: 5 },
                      { label: 'S', value: 6 },
                      { label: 'S', value: 7 }
                    ].map((day) => {
                      const isSelected = selectedDays.includes(day.value);
                      return (
                        <div 
                          key={day.value} 
                          onClick={() => toggleDay(day.value)}
                          className={`h-10 w-10 flex items-center justify-center border rounded-full cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50'
                          }`}
                        >
                          {day.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Clock className="h-4 w-4" /> Due Time</Label>
                  <Input 
                    type="time" 
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                  />
                </div>
                {recurrence === 'onetime' ? (
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Series End Date</Label>
                    <Input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">When should this recurring task stop?</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" /> Assignment & Base Reward
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Assign to specific facilitators (or leave blank for all)</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedFacilitators.length === 0 ? (
                    <span className="text-sm text-muted-foreground italic">All Facilitators</span>
                  ) : (
                    selectedFacilitators.map(fac => (
                      <span key={fac.id} className="px-3 py-1 bg-slate-100 rounded-full text-sm flex items-center gap-1">
                        {fac.full_name} 
                        <button 
                          type="button" 
                          onClick={() => handleRemoveFacilitator(fac.id)}
                          className="text-muted-foreground hover:text-red-500 ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                
                <Select onValueChange={handleAddFacilitator} value="">
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="Add Facilitator..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Facilitators (Clear Selection)</SelectItem>
                    {facilitators.map(f => (
                      <SelectItem key={f.id} value={f.id} disabled={selectedFacilitators.some(s => s.id === f.id)}>
                        {f.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Base Reward (₹)</Label>
                  <Input 
                    type="number" 
                    placeholder="e.g. 20" 
                    value={baseRewardAmount}
                    onChange={(e) => setBaseRewardAmount(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">This can be overridden per person later.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" /> Gamification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="leaderboard" 
                  checked={includeLeaderboard}
                  onCheckedChange={(checked) => setIncludeLeaderboard(checked as boolean)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="leaderboard" className="font-medium text-sm">Include in Leaderboard</label>
                  <p className="text-xs text-muted-foreground">If checked, this task awards points towards the monthly leaderboard.</p>
                </div>
              </div>
              <div className="space-y-2 pl-6">
                <Label>Leaderboard Points</Label>
                <Input 
                  type="number" 
                  className="w-32" 
                  value={leaderboardPoints}
                  onChange={(e) => setLeaderboardPoints(Number(e.target.value))}
                  disabled={!includeLeaderboard}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-slate-600" /> Submission Requirements *
                  </CardTitle>
                  <CardDescription className="mt-1">
                    What evidence or data must facilitators provide when submitting this work? (At least 1 required)
                  </CardDescription>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  className="gap-1.5 text-xs font-semibold self-start sm:self-auto border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => {
                    const newReq: WorkRequirement = {
                      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      title: '',
                      type: 'text'
                    };
                    setSubmissionRequirements(prev => [...prev, newReq]);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Requirement
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {submissionRequirements.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-red-200 bg-red-50 text-red-700 text-xs font-medium flex items-center justify-between">
                  <span>At least one submission requirement is mandatory. Add a requirement to proceed.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-300 bg-white hover:bg-red-100"
                    onClick={() => {
                      setSubmissionRequirements([{
                        id: `req-${Date.now()}`,
                        title: '',
                        type: 'text'
                      }]);
                    }}
                  >
                    Add Requirement
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {submissionRequirements.map((req, index) => (
                    <div key={req.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center border border-slate-200 p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 shrink-0">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs">
                          {index + 1}
                        </span>
                      </div>
                      
                      <div className="flex-1 w-full space-y-1">
                        <Label className="text-xs text-slate-600 font-semibold">Requirement Title *</Label>
                        <Input 
                          placeholder={
                            req.type === 'number' ? 'e.g. Number of Students Present' :
                            req.type === 'text' ? 'e.g. Session Summary / Observation Notes' :
                            req.type === 'image' ? 'e.g. Class Activity Photo' :
                            req.type === 'pdf' ? 'e.g. Attendance Sheet (PDF / Doc)' :
                            req.type === 'link' ? 'e.g. Google Drive Folder Link' :
                            req.type === 'video' ? 'e.g. Class Video Recording' :
                            'e.g. Requirement Title'
                          }
                          value={req.title}
                          onChange={(e) => {
                            const updated = [...submissionRequirements];
                            updated[index].title = e.target.value;
                            setSubmissionRequirements(updated);
                          }}
                          className="bg-white h-9 text-sm"
                          required
                        />
                      </div>

                      <div className="w-full sm:w-56 space-y-1">
                        <Label className="text-xs text-slate-600 font-semibold">Submission Type</Label>
                        <select 
                          className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                          value={req.type}
                          onChange={(e) => {
                            const updated = [...submissionRequirements];
                            updated[index].type = e.target.value as WorkRequirement['type'];
                            setSubmissionRequirements(updated);
                          }}
                        >
                          <option value="text">📝 Text Box (Summary / Notes)</option>
                          <option value="number">🔢 Number Field (Count / Value)</option>
                          <option value="image">📸 Photo / Image</option>
                          <option value="pdf">📄 Document (PDF / Word)</option>
                          <option value="link">🔗 External / Drive Link</option>
                          <option value="video">🎥 Video Recording</option>
                          <option value="excel">📊 Spreadsheet (Excel / Sheet)</option>
                        </select>
                      </div>

                      <div className="self-end sm:self-center sm:pt-5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSubmissionRequirements(prev => prev.filter((_, i) => i !== index));
                          }}
                          title="Remove requirement"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="manager_approval" 
                    checked={requiresManagerApproval}
                    onCheckedChange={(checked) => setRequiresManagerApproval(checked as boolean)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label htmlFor="manager_approval" className="font-medium text-sm text-slate-800 cursor-pointer">
                      Manager Approval Required
                    </label>
                    <p className="text-xs text-muted-foreground">
                      If checked, earnings and task completion require manual manager review & approval.
                    </p>
                  </div>
                </div>

                {!requiresManagerApproval && (
                  <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100 space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold text-blue-900">Auto-Approve Submission After</Label>
                      <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                        Auto-Approve Enabled
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs text-slate-600 mb-1 block">Preset Option</Label>
                        <Select 
                          value={autoApprovePreset} 
                          onValueChange={(val) => {
                            setAutoApprovePreset(val);
                            if (val !== "custom") {
                              const totalMins = parseInt(val, 10) || 0;
                              setAutoApproveHours(Math.floor(totalMins / 60));
                              setAutoApproveMins(totalMins % 60);
                            }
                          }}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select Duration" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0 Hours (Immediate)</SelectItem>
                            <SelectItem value="360">6 Hours</SelectItem>
                            <SelectItem value="720">12 Hours</SelectItem>
                            <SelectItem value="1440">24 Hours</SelectItem>
                            <SelectItem value="2880">48 Hours</SelectItem>
                            <SelectItem value="4320">72 Hours</SelectItem>
                            <SelectItem value="custom">Custom Time (Hours & Mins)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 mb-1 block">Hours (0-999)</Label>
                        <Input 
                          type="number"
                          min={0}
                          max={999}
                          value={autoApproveHours}
                          disabled={autoApprovePreset !== "custom"}
                          onChange={(e) => setAutoApproveHours(Math.max(0, parseInt(e.target.value) || 0))}
                          className="bg-white"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 mb-1 block">Minutes (0-59)</Label>
                        <Input 
                          type="number"
                          min={0}
                          max={59}
                          value={autoApproveMins}
                          disabled={autoApprovePreset !== "custom"}
                          onChange={(e) => setAutoApproveMins(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="bg-white"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-blue-700">
                      ⏱ Task submissions will be automatically approved after{' '}
                      <span className="font-semibold">
                        {autoApprovePreset === "custom" 
                          ? `${autoApproveHours}h ${autoApproveMins}m`
                          : (autoApprovePreset === "0" ? "Immediate (0 mins)" : `${parseInt(autoApprovePreset, 10) / 60} hours`)}
                      </span> if no manager review occurs.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              className="px-8" 
              onClick={() => { resetForm(); setIsCreating(false); }} 
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg" disabled={isSubmitting}>
              {isSubmitting 
                ? (editingTemplateId ? 'Updating...' : 'Creating...') 
                : (editingTemplateId ? 'Update Work Template' : 'Create & Assign Work')}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
