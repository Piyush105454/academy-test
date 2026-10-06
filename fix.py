import re

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix Coordinator Status Filter
pattern_c_filter = re.compile(r'(\s*)\{/\* Coordinator Status Filter \*/\}\s*<div className="flex-1 min-w-\[150px\]">')
text = pattern_c_filter.sub(r'\1{currentTab === "coordinator" && (\1<div className="flex-1 min-w-[150px]">\1  {/* Coordinator Status Filter */}', text)

# Close Coordinator Status Filter
pattern_c_close = re.compile(r'(\s*)</Select>\s*</div>\s*\{/\* Supervisor Status Filter \*/\}')
text = pattern_c_close.sub(r'\1</Select>\1</div>\1)}\1{/* Supervisor Status Filter */}', text)

# Fix Supervisor Status Filter
pattern_s_filter = re.compile(r'(\s*)\{/\* Supervisor Status Filter \*/\}\s*<div className="flex-1 min-w-\[150px\]">')
text = pattern_s_filter.sub(r'\1{currentTab === "supervisor" && (\1<div className="flex-1 min-w-[150px]">\1  {/* Supervisor Status Filter */}', text)

# Close Supervisor Status Filter
pattern_s_close = re.compile(r'(\s*)</Select>\s*</div>\s*</div>\s*\{/\* Mobile Table View')
text = pattern_s_close.sub(r'\1</Select>\1</div>\1)}\1</div>\1{/* Mobile Table View', text)

# For headers and cells, they didn't match before. Let's look exactly at the text.
with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
