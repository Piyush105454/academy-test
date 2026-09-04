import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AcademicYearProvider } from "@/contexts/AcademicYearContext";
import { DeveloperModeProvider } from "@/contexts/DeveloperModeContext";
import { MaintenanceGuard } from "@/components/layout/MaintenanceGuard";

// Core Auth & Dashboard Pages (Fast static load)
import Auth from "./pages/Auth";
import { StudentAuth } from "./pages/StudentAuth";
import Dashboard from "./pages/Dashboard";
import StudentDashboard from "./pages/StudentDashboard";

// Lazy Loaded Heavy Pages for Fast UI Chunking
const Calendar = lazy(() => import("./pages/Calendar"));
const Sessions = lazy(() => import("./pages/Sessions"));
const SessionRecording = lazy(() => import("./pages/SessionRecording"));
const StudentPerformance = lazy(() => import("./pages/StudentPerformance"));
const FeedbackSelection = lazy(() => import("./pages/FeedbackSelection"));
const FeedbackDetails = lazy(() => import("./pages/FeedbackDetails"));
const StudentCalendar = lazy(() => import("./pages/StudentCalendar"));
const Curriculum = lazy(() => import("./pages/Curriculum"));
const Facilitators = lazy(() => import("./pages/Facilitators"));
const Coordinators = lazy(() => import("./pages/Coordinators").then(m => ({ default: m.Coordinators })));
const Centres = lazy(() => import("./pages/Centres"));
const Classes = lazy(() => import("./pages/Classes"));
const ClassStudents = lazy(() => import("./pages/ClassStudents"));
const AddVolunteer = lazy(() => import("./pages/AddVolunteer"));
const EditVolunteer = lazy(() => import("./pages/EditVolunteer"));
const VolunteerList = lazy(() => import("./pages/VolunteerList"));
const Settings = lazy(() => import("./pages/Settings"));
const AttendanceManagement = lazy(() => import("./pages/attendance/AttendanceManagement"));
const DailyRegister = lazy(() => import("./pages/attendance/DailyRegister"));
const DailyAttendanceMarking = lazy(() => import("./pages/attendance/DailyAttendanceMarking"));
const ClassWiseGrid = lazy(() => import("./pages/attendance/ClassWiseGrid"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

// Task Management Heavy Routes (Lazy Loaded)
const Tasks = lazy(() => import("./pages/Tasks"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const TaskEdit = lazy(() => import("./pages/TaskEdit"));
const StudentTasks = lazy(() => import("./pages/StudentTasks"));
const StudentTaskDetail = lazy(() => import("./pages/StudentTaskDetail"));
const AddTask = lazy(() => import("./pages/AddTask"));
const ClassTaskReview = lazy(() => import("@/pages/ClassTaskReview"));

const StudentEarnings = lazy(() => import("./pages/StudentEarnings"));
const StudentAttendance = lazy(() => import("./pages/StudentAttendance"));
const AdminStudentEarnings = lazy(() => import("./pages/AdminStudentEarnings"));
const MonthlyLeaderboard = lazy(() => import("./pages/MonthlyLeaderboard"));

const AdminFacilitatorEarnings = lazy(() => import("./pages/AdminFacilitatorEarnings"));
const VolunteerLogHours = lazy(() => import("./pages/VolunteerLogHours"));
const FacilitatorEarnings = lazy(() => import("./pages/FacilitatorEarnings"));
const AdminStudentAttendance = lazy(() => import("./pages/AdminStudentAttendance"));
const ClassLeaders = lazy(() => import("./pages/ClassLeaders"));
const ActivityLogs = lazy(() => import("./pages/ActivityLogs"));
const ResourceHub = lazy(() => import("./pages/ResourceHub"));
const StudentSupport = lazy(() => import("./pages/StudentSupport"));
const SupportManagement = lazy(() => import("./pages/SupportManagement"));
const ScheduledTasks = lazy(() => import("./pages/ScheduledTasks"));
const DeveloperModePage = lazy(() => import("./pages/DeveloperModePage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DeveloperModeProvider>
        <AcademicYearProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <MaintenanceGuard>
                <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm text-muted-foreground">Loading page...</div>}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/auth" replace />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/student-auth" element={<StudentAuth />} />
                    <Route path="/student-dashboard" element={<StudentDashboard />} />
                    <Route path="/student-calendar" element={<StudentCalendar />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/sessions" element={<Sessions />} />
                    <Route path="/feedback" element={<FeedbackSelection />} />
                    <Route path="/sessions/:sessionId/recording" element={<SessionRecording />} />
                    <Route path="/sessions/:sessionId/feedback-details" element={<FeedbackDetails />} />
                    <Route path="/student-performance/:sessionId" element={<StudentPerformance />} />
                    <Route path="/curriculum" element={<Curriculum />} />
                    <Route path="/student-curriculum" element={<Curriculum isStudent={true} />} />
                    <Route path="/student-resources" element={<ResourceHub isStudent={true} />} />
                    <Route path="/facilitators" element={<Facilitators />} />
                    <Route path="/coordinators" element={<Coordinators />} />
                    <Route path="/centres" element={<Centres />} />
                    <Route path="/classes" element={<Classes />} />
                    <Route path="/classes/:classId/students" element={<ClassStudents />} />
                    <Route path="/volunteers/edit/:id" element={<EditVolunteer />} /> 
                    <Route path="/volunteers" element={<VolunteerList />} />
                    <Route path="/volunteers/add" element={<AddVolunteer />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/profile/edit" element={<EditProfile />} />
                    <Route path="/tasks" element={<Tasks />} />
                    <Route path="/scheduled-tasks" element={<ScheduledTasks />} />
                    <Route path="/tasks/:taskTitle" element={<TaskDetail />} />
                    <Route path="/tasks/:taskTitle/edit" element={<TaskEdit />} />
                    <Route path="/student-tasks" element={<StudentTasks />} />
                    <Route path="/student-tasks/:taskId" element={<StudentTaskDetail />} />
                    <Route path="/student-earnings" element={<StudentEarnings />} />
                    <Route path="/student-attendance" element={<StudentAttendance />} />
                    <Route path="/admin-earnings" element={<AdminStudentEarnings />} />
                    <Route path="/leaderboard" element={<MonthlyLeaderboard />} />
                    
                    <Route path="/admin-facilitator-earnings" element={<AdminFacilitatorEarnings />} />
                    <Route path="/admin-facilitator-earnings/:facilitatorId" element={<AdminFacilitatorEarnings />} />
                    <Route path="/volunteer-log-hours" element={<VolunteerLogHours />} />
                    <Route path="/facilitator-earnings" element={<FacilitatorEarnings />} />
                    <Route path="/admin-attendance" element={<AdminStudentAttendance />} />
                    <Route path="/attendance-management" element={<AttendanceManagement />} />
                    <Route path="/attendance-management/daily" element={<DailyRegister />} />
                    <Route path="/attendance-management/daily/:classId" element={<DailyAttendanceMarking />} />
                    <Route path="/attendance-management/class-wise" element={<ClassWiseGrid />} />
                    <Route path="/class-task-review" element={<ClassTaskReview />} />
                    <Route path="/class-leaders" element={<ClassLeaders />} />
                    <Route path="/tasks/add" element={<AddTask />} />
                    <Route path="/resources" element={<ResourceHub />} />
                    <Route path="/admin" element={<AdminPanel />} />
                    <Route path="/activity-logs" element={<ActivityLogs />} />
                    <Route path="/student-support" element={<StudentSupport />} />
                    <Route path="/support" element={<SupportManagement />} />
                    <Route path="/dev-mode" element={<DeveloperModePage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </MaintenanceGuard>
            </BrowserRouter>
          </TooltipProvider>
        </AcademicYearProvider>
      </DeveloperModeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
