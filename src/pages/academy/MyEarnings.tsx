import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function MyEarnings() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Earnings</h1>
          <p className="text-sm text-slate-500 mt-1">Transparent approved and pending earnings.</p>
        </div>
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Approved</p>
            <h2 className="text-3xl font-bold text-slate-900">₹1,840</h2>
            <p className="text-xs text-slate-400 mt-2">Ready for payout</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Pending</p>
            <h2 className="text-3xl font-bold text-slate-900">₹375</h2>
            <p className="text-xs text-slate-400 mt-2">Manager approval needed</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Possible</p>
            <h2 className="text-3xl font-bold text-slate-900">₹250</h2>
            <p className="text-xs text-slate-400 mt-2">Upcoming tasks / goals</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <p className="text-sm font-medium text-slate-500 mb-2">Paid</p>
            <h2 className="text-3xl font-bold text-slate-900">₹1,100</h2>
            <p className="text-xs text-slate-400 mt-2">This month</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-4">
            <h3 className="text-lg font-bold text-slate-900">Earnings ledger</h3>
            <p className="text-sm text-slate-400">Expected → Pending → Approved → Paid</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Classroom Learning Engagement</h3>
                <p className="text-sm text-slate-500 mt-1">7 Sep • Approved</p>
              </div>
              <div className="font-bold text-green-600 text-lg">+₹20</div>
            </div>

            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Attendance Record</h3>
                <p className="text-sm text-slate-500 mt-1">7 Sep • Approved</p>
              </div>
              <div className="font-bold text-green-600 text-lg">+₹20</div>
            </div>

            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Home Visit</h3>
                <p className="text-sm text-slate-500 mt-1">6 Sep • Approved</p>
              </div>
              <div className="font-bold text-green-600 text-lg">+₹125</div>
            </div>

            <div className="p-6 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Lesson Plan</h3>
                <p className="text-sm text-slate-500 mt-1">5 Sep • Pending approval</p>
              </div>
              <div className="font-bold text-orange-500 text-lg">₹24</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
