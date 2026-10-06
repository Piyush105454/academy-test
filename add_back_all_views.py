import sys

with open('src/components/layout/AppSidebar.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# We need to insert them back right after "Curriculum"
insert_point = "{ title: 'Curriculum', url: '/curriculum', icon: BookOpen, requiredRole: null, studentVisible: false },"
new_items = """      { title: 'Session Planner (All view)', url: '/sessions', icon: BookOpen, requiredRole: null, studentVisible: false },
      { title: 'Record & Feedback (All view feedbacks)', url: '/feedback', icon: FileText, requiredRole: null, studentVisible: false },"""

text = text.replace(insert_point, insert_point + "\n" + new_items)

with open('src/components/layout/AppSidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

