import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";

export default function MyWork() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Work</h1>
          <p className="text-sm text-slate-500 mt-1">See what is assigned, due and completed.</p>
        </div>
      <div className="space-y-6">
        <div className="flex gap-2">
          <button className="px-5 py-2 bg-[#0f172a] text-white rounded-full text-sm font-medium">Today</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Upcoming</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Submitted</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Completed</button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Daily Attendance Record</h3>
              <p className="text-sm text-slate-500 mt-1">Today • Due 9:30 AM</p>
              <div className="mt-2 inline-flex px-2 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded">
                Approved
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-bold text-slate-900">₹20</span>
              <Button variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full px-6">View</Button>
            </div>
          </div>

          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Classroom Learning Engagement</h3>
              <p className="text-sm text-slate-500 mt-1">Today • Due 4:00 PM</p>
              <div className="flex gap-2 mt-2">
                <div className="inline-flex px-2 py-1 bg-orange-50 text-orange-700 text-xs font-semibold rounded">
                  Pending
                </div>
                <div className="inline-flex px-2 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded flex items-center gap-1">
                  ⏳ 5 pts
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-bold text-slate-900">₹20</span>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">Open task</Button>
            </div>
          </div>

          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Daily Lesson Plan</h3>
              <p className="text-sm text-slate-500 mt-1">Today • Due 2:00 PM</p>
              <div className="mt-2 inline-flex px-2 py-1 bg-orange-50 text-orange-700 text-xs font-semibold rounded">
                Pending
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-bold text-slate-900">₹24</span>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">Open task</Button>
            </div>
          </div>

          <div className="p-6 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Safety & Discipline</h3>
              <p className="text-sm text-slate-500 mt-1">Today • Due 5:00 PM</p>
              <div className="flex gap-2 mt-2">
                <div className="inline-flex px-2 py-1 bg-orange-50 text-orange-700 text-xs font-semibold rounded">
                  Pending
                </div>
                <div className="inline-flex px-2 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded flex items-center gap-1">
                  ⏳ 3 pts
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-bold text-slate-900">₹20</span>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6">Open task</Button>
            </div>
          </div>

        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
