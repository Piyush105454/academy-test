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
}

export default function TasksAdmin() {
  const [isCreating, setIsCreating] = useState(false);
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
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role_id', 4)
        .eq('is_active', true)
        .order('full_name');
        
      if (data) {
        setFacilitators(data as Facilitator[]);
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

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return toast.error("Task Name is required");
    
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user logged in");

      // 1. Insert Template
      const { data: template, error: templateError } = await supabase
        .from('academy_task_templates')
        .insert({
          name,
          category,
          description,
          recurrence,
          recurrence_rule: recurrence !== 'onetime' ? selectedDays.join(',') : null,
          base_reward_amount: baseRewardAmount,
          leaderboard_points: includeLeaderboard ? leaderboardPoints : 0,
          requires_note: requiresNote,
          requires_photo: requiresPhoto,
          due_time: dueTime,
          end_date: endDate || null,
          created_by: user.id
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // 2. Insert Assignments
      // If no specific facilitator is selected, assign to ALL facilitators
      const facilitatorsToAssign = selectedFacilitators.length > 0 
        ? selectedFacilitators 
        : facilitators;

      if (facilitatorsToAssign.length > 0) {
        const assignments = facilitatorsToAssign.map(fac => ({
          template_id: template.id,
          facilitator_id: fac.id,
          custom_reward_amount: null // fallback to base
        }));

        const { error: assignError } = await supabase
          .from('academy_task_assignments')
          .insert(assignments);
          
        if (assignError) throw assignError;

        // 3. Immediately generate tasks for today so they show up in My Work
        const { error: rpcError } = await supabase.rpc('generate_academy_tasks');
        if (rpcError) console.error("Error generating initial tasks:", rpcError);
      }

      toast.success("Task template created successfully!");
      setIsCreating(false);
      
      // Refresh templates
      const { data: newTemplates } = await supabase
        .from('academy_task_templates')
        .select(`*, academy_task_assignments(facilitator_id, user_profiles(full_name))`)
        .order('created_at', { ascending: false });
      if (newTemplates) setTemplates(newTemplates);
      
    } catch (err: any) {
      toast.error("Error creating task: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // State for fetched templates
  const [templates, setTemplates] = useState<any[]>([]);
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
        setTemplates(data || []);
      } catch (err: any) {
        toast.error("Failed to load templates: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (!isCreating) {
      fetchTemplates();
    }
  }, [isCreating]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);
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
      
      toast.success("Task template deleted successfully");
      setTemplates(templates.filter(t => t.id !== templateToDelete.id));
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      setDeleteConfirmText("");
    } catch (err: any) {
      toast.error("Error deleting template: " + err.message);
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
              <h1 className="text-2xl font-bold text-slate-900">Tasks & Templates</h1>
              <p className="text-sm text-slate-500 mt-1">Manage recurring task templates and assignments.</p>
            </div>
            <Button onClick={() => setIsCreating(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="h-4 w-4" />
              Create Task
            </Button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-4">Task Name & Details</th>
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
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">No templates found. Click 'Create Task' to add one.</td>
                    </tr>
                  ) : (
                    templates.map((task) => {
                      const assignments = task.academy_task_assignments || [];
                      
                      let assignedText = "All Facilitators";
                      if (assignments.length > 0) {
                        assignedText = assignments.map((a: any) => a.user_profiles?.full_name).join(', ');
                      }

                      // Occurrence logic
                      let occurrenceText = task.recurrence;
                      if (task.recurrence !== 'onetime' && task.recurrence_rule) {
                        const daysMap: any = { '1': 'M', '2': 'T', '3': 'W', '4': 'Th', '5': 'F', '6': 'Sa', '7': 'Su' };
                        const daysArr = task.recurrence_rule.split(',').map((d: string) => daysMap[d]);
                        occurrenceText += ` (${daysArr.join(', ')})`;
                      }

                      // Status Logic (Published vs Ended)
                      const isEnded = task.end_date && new Date(task.end_date) < new Date();
                      
                      // Today's Progress Logic
                      const todayStr = new Date().toISOString().split('T')[0];
                      let todayPending = 0;
                      let todaySubmitted = 0;
                      
                      assignments.forEach((a: any) => {
                        const todayTasks = (a.academy_tasks || []).filter((t: any) => t.task_date === todayStr);
                        todayTasks.forEach((t: any) => {
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
                                <DropdownMenuItem onClick={() => {
                                  // Edit functionality placeholder - would load data into form and set isCreating=true
                                  toast.info("Edit functionality coming soon!");
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Task
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
              <DialogTitle className="text-red-600">Delete Task Template</DialogTitle>
              <DialogDescription>
                This will permanently delete the template <strong>{templateToDelete?.name}</strong> and all its associated assignments and tasks. 
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
          <h1 className="text-2xl font-bold text-slate-900">Create Task</h1>
          <p className="text-sm text-slate-500 mt-1">Assign responsibility, reward and leaderboard rules.</p>
        </div>
        <form onSubmit={handleCreateTask} className="space-y-6 max-w-4xl bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <Card className="border-t-4 border-t-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Task Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Task Name</Label>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-slate-600" /> Submission Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>What evidence is required to complete this task?</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="req_note" 
                      checked={requiresNote}
                      onCheckedChange={(checked) => setRequiresNote(checked as boolean)}
                    />
                    <Label htmlFor="req_note">Text Note</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="req_photo" 
                      checked={requiresPhoto}
                      onCheckedChange={(checked) => setRequiresPhoto(checked as boolean)}
                    />
                    <Label htmlFor="req_photo">Photo(s)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="req_doc" />
                    <Label htmlFor="req_doc">Document (PDF)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="req_link" />
                    <Label htmlFor="req_link">External Link</Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t">
                <Checkbox id="manager_approval" defaultChecked />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="manager_approval" className="font-medium text-sm text-red-600">Manager Approval Required</label>
                  <p className="text-xs text-muted-foreground">If checked, earnings are held pending until a manager approves the submission.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button type="button" variant="outline" className="px-8" onClick={() => setIsCreating(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" className="px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create & Assign Task'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
