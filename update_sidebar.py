import sys
import re

with open('src/components/layout/AppSidebar.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the Session Management block with two new blocks
session_mgmt_old = '''  {
    label: 'Session Management',
    studentVisible: false,
    items: [
      { title: 'Curriculum', url: '/curriculum', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Session Planner', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Record & Feedback', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },
      { title: 'Tasks & Projects', url: '/tasks', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Scheduled Tasks', url: '/scheduled-tasks', icon: Clock, requiredRole: null, studentVisible: false },
      { title: 'Student Attendance', url: '/admin-attendance', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Attendance Management', url: '/attendance-management', icon: CalendarDays, requiredRole: null, studentVisible: false },
    ]
  },'''

session_mgmt_new = '''  {
    label: 'Curriculum & Session Management',
    studentVisible: false,
    items: [
      { title: 'Curriculum', url: '/curriculum', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Session Planner', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Record & Feedback', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },
      { title: 'Session Planner_by Facilitator', url: '/sessions?tab=facilitator', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Record Feedback_by coordinator', url: '/sessions?tab=coordinator', icon: FileText, requiredRole: null, studentVisible: false },
      { title: 'Track & Review_by Supervisor', url: '/sessions?tab=supervisor', icon: ClipboardList, requiredRole: null, studentVisible: false },
    ]
  },
  {
    label: 'Student Attendance & Task Management',
    studentVisible: false,
    items: [
      { title: 'Tasks & Projects', url: '/tasks', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Scheduled Tasks', url: '/scheduled-tasks', icon: Clock, requiredRole: null, studentVisible: false },
      { title: 'Student Attendance', url: '/admin-attendance', icon: ClipboardList, requiredRole: null, studentVisible: false },
      { title: 'Attendance Management', url: '/attendance-management', icon: CalendarDays, requiredRole: null, studentVisible: false },
    ]
  },'''

text = text.replace(session_mgmt_old, session_mgmt_new)

# Modify isActive to work with query parameters
is_active_old = "const isActive = location.pathname === item.url;"
is_active_new = "const isActive = item.url.includes('?') ? (location.pathname + location.search) === item.url : location.pathname === item.url;"
text = text.replace(is_active_old, is_active_new)

with open('src/components/layout/AppSidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

