import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ManageGoals() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manage Goals</h1>
            <p className="text-sm text-slate-500 mt-1">Track outcome goals separately from daily tasks.</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="h-4 w-4" />
            Create Goal
          </Button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-8 space-y-12">
          
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Class Attendance ≥90%</h3>
                <p className="text-sm text-slate-500">Bi-weekly goal • Current average 88.7%</p>
              </div>
              <div className="font-bold text-slate-900">Reward ₹500</div>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full" style={{ width: '88.7%' }}></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Lesson Plan Completion ≥90%</h3>
                <p className="text-sm text-slate-500">Bi-weekly goal • Current average 94%</p>
              </div>
              <div className="font-bold text-slate-900">Reward ₹250</div>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full" style={{ width: '94%' }}></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Assessment & Student Progress</h3>
                <p className="text-sm text-slate-500">Bi-weekly • 1 of 2 cycles complete</p>
              </div>
              <div className="font-bold text-slate-900">Reward ₹125</div>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full" style={{ width: '50%' }}></div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
