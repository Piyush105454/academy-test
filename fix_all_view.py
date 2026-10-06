import sys
import re

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Change default to 'all'
text = text.replace("const currentTab = searchParams.get('tab') || 'facilitator';", "const currentTab = searchParams.get('tab') || 'all';")

# Change column visibility conditions
text = text.replace("{currentTab === 'facilitator' && (", "{(currentTab === 'all' || currentTab === 'facilitator') && (")
text = text.replace("{currentTab === 'coordinator' && (", "{(currentTab === 'all' || currentTab === 'coordinator') && (")
text = text.replace("{currentTab === 'supervisor' && (", "{(currentTab === 'all' || currentTab === 'supervisor') && (")

with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

with open('src/components/layout/AppSidebar.tsx', 'r', encoding='utf-8') as f:
    sb = f.read()

sb = sb.replace("{ title: 'Session Planner (All view)', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },", "{ title: 'All Sessions', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },")
sb = sb.replace("{ title: 'Record & Feedback (All view feedbacks)', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },", "{ title: 'All Feedbacks', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },")
sb = sb.replace("{ title: 'Session Planner_by Facilitator', url: '/sessions?tab=facilitator', icon: BookOpen, requiredRole: null, studentVisible: false },", "{ title: 'Facilitator View', url: '/sessions?tab=facilitator', icon: BookOpen, requiredRole: null, studentVisible: false },")
sb = sb.replace("{ title: 'Record Feedback_by coordinator', url: '/sessions?tab=coordinator', icon: FileText, requiredRole: null, studentVisible: false },", "{ title: 'Coordinator View', url: '/sessions?tab=coordinator', icon: FileText, requiredRole: null, studentVisible: false },")
sb = sb.replace("{ title: 'Track & Review_by Supervisor', url: '/sessions?tab=supervisor', icon: ClipboardList, requiredRole: null, studentVisible: false },", "{ title: 'Supervisor View', url: '/sessions?tab=supervisor', icon: ClipboardList, requiredRole: null, studentVisible: false },")

with open('src/components/layout/AppSidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(sb)

