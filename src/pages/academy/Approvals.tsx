import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from "@/components/ui/button";

export default function Approvals() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review evidence before earnings are credited.</p>
        </div>
      <div className="space-y-6">
        
        <div className="flex gap-2">
          <button className="px-5 py-2 bg-[#0f172a] text-white rounded-full text-sm font-medium">Pending 18</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Needs change</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Approved</button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Riya Soni — Weekly Home Visit</h3>
              <p className="text-sm text-slate-500 mt-1">Submitted 7 Sep • 4:28 PM</p>
              <div className="flex gap-2 mt-3">
                <span className="inline-flex px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                  2 photos
                </span>
                <span className="inline-flex px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                  Visit notes
                </span>
                <span className="inline-flex px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  ⏳ 20 pts
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-900 text-lg">₹125</span>
              <Button variant="outline" className="text-red-500 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-600 rounded-lg">Needs change</Button>
              <Button className="bg-[#10b981] hover:bg-[#059669] text-white rounded-lg px-6">Approve</Button>
            </div>
          </div>

          <div className="p-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Mohammad Ittehad — Lesson Plan</h3>
              <p className="text-sm text-slate-500 mt-1">Submitted 7 Sep • 1:45 PM</p>
              <div className="flex gap-2 mt-3">
                <span className="inline-flex px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
                  Document
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-900 text-lg">₹24</span>
              <Button variant="outline" className="text-red-500 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-600 rounded-lg">Needs change</Button>
              <Button className="bg-[#10b981] hover:bg-[#059669] text-white rounded-lg px-6">Approve</Button>
            </div>
          </div>

        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
