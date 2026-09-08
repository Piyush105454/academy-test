import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Plus, Users, Award, FileText, Settings2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

export default function TasksAdmin() {
  const [isCreating, setIsCreating] = useState(false);
  const [recurrence, setRecurrence] = useState("daily");

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Task template created successfully! (UI Prototype)");
    setIsCreating(false);
  };

  // Dummy list of task templates
  const dummyTasks = [
    { id: 1, name: "Daily Attendance Record", category: "Attendance", occurrence: "Daily", reward: "₹20", assigned: "Riya Soni" },
    { id: 2, name: "Classroom Learning Engagement", category: "Teaching", occurrence: "Daily", reward: "₹20", assigned: "All Facilitators" },
    { id: 3, name: "Weekly Home Visit", category: "Outreach", occurrence: "Weekly", reward: "₹125", assigned: "Afreen, Riya" },
    { id: 4, name: "Daily Lesson Plan", category: "Planning", occurrence: "Daily", reward: "₹24", assigned: "All Facilitators" }
  ];

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
                    <th className="px-6 py-4">Task Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Occurrence</th>
                    <th className="px-6 py-4">Reward</th>
                    <th className="px-6 py-4">Assigned To</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dummyTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">{task.name}</td>
                      <td className="px-6 py-4 text-slate-600">{task.category}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                          {task.occurrence}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-green-700">{task.reward}</td>
                      <td className="px-6 py-4 text-slate-600">{task.assigned}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-900">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
                  <Input placeholder="e.g. Daily Attendance Record" required />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select>
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
                <Textarea placeholder="Instructions for the facilitator..." rows={3} />
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

              {recurrence === 'weekly' && (
                <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                  <Label>Repeats on</Label>
                  <div className="flex gap-2">
                    {['M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                      <div key={i} className="h-10 w-10 flex items-center justify-center border rounded-full bg-white hover:bg-blue-50 cursor-pointer">
                        {day}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Clock className="h-4 w-4" /> Due Time</Label>
                  <Input type="time" defaultValue="16:00" />
                </div>
                {recurrence === 'onetime' && (
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input type="date" />
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
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-slate-100 rounded-full text-sm flex items-center gap-1">Riya Soni <span className="text-muted-foreground ml-1">×</span></span>
                  <span className="px-3 py-1 bg-slate-100 rounded-full text-sm flex items-center gap-1">Afreen <span className="text-muted-foreground ml-1">×</span></span>
                  <Button variant="outline" size="sm" type="button" className="rounded-full h-7"> <Plus className="h-3 w-3 mr-1" /> Add</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Base Reward (₹)</Label>
                  <Input type="number" placeholder="e.g. 20" defaultValue="20" />
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
                <Checkbox id="leaderboard" defaultChecked />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="leaderboard" className="font-medium text-sm">Include in Leaderboard</label>
                  <p className="text-xs text-muted-foreground">If checked, this task awards points towards the monthly leaderboard.</p>
                </div>
              </div>
              <div className="space-y-2 pl-6">
                <Label>Leaderboard Points</Label>
                <Input type="number" className="w-32" defaultValue="5" />
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
                    <Checkbox id="req_note" defaultChecked />
                    <Label htmlFor="req_note">Text Note</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="req_photo" defaultChecked />
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
            <Button type="button" variant="outline" className="px-8" onClick={() => setIsCreating(false)}>Cancel</Button>
            <Button type="submit" className="px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Create & Assign Task</Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
