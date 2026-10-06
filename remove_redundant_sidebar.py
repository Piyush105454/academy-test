import sys

with open('src/components/layout/AppSidebar.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# We need to remove these two lines:
# { title: 'Session Planner', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },
# { title: 'Record & Feedback', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },

text = text.replace("      { title: 'Session Planner', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },\n", "")
text = text.replace("      { title: 'Record & Feedback', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },\n", "")

with open('src/components/layout/AppSidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

