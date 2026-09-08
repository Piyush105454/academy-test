import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function Leaderboard() {
  const leaderboardData = [
    { rank: 1, name: "Naziya Afreen", tasks: 18, points: 485 },
    { rank: 2, name: "Riya Soni", tasks: 16, points: 450 },
    { rank: 3, name: "Arman Sir", tasks: 15, points: 410 },
    { rank: 4, name: "Mohammad Ittehad", tasks: 14, points: 390 },
    { rank: 5, name: "Neetu Soni", tasks: 12, points: 365 },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
          <p className="text-sm text-slate-500 mt-1">Only approved, leaderboard-enabled work counts.</p>
        </div>
      <div className="space-y-6">
        <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg text-sm font-medium border border-blue-100">
          Only tasks explicitly marked for leaderboard and approved by a manager contribute points.
        </div>

        <div className="flex gap-2">
          <button className="px-5 py-2 bg-[#0f172a] text-white rounded-full text-sm font-medium">This week</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">Monthly</button>
          <button className="px-5 py-2 bg-white text-slate-600 border rounded-full text-sm font-medium hover:bg-slate-50">All time</button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {leaderboardData.map((user, index) => (
            <div key={user.rank} className={`p-6 flex items-center justify-between ${index !== leaderboardData.length - 1 ? 'border-b border-slate-100' : ''}`}>
              <div className="flex items-center gap-8">
                <span className="text-xl font-bold text-slate-900 w-4">{user.rank}</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{user.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{user.tasks} approved leaderboard tasks</p>
                </div>
              </div>
              <div className="font-bold text-slate-900 text-lg">
                {user.points} pts
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
