import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function MyGoals() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Goals</h1>
          <p className="text-sm text-slate-500 mt-1">Track outcome goals separately from daily tasks.</p>
        </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-8 space-y-12">
        
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">My Class Attendance ≥90%</h3>
              <p className="text-sm text-slate-500">Bi-weekly goal • Current 88.7%</p>
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
              <p className="text-sm text-slate-500">Bi-weekly goal • Current 94%</p>
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
