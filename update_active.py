import sys

with open('src/components/layout/AppSidebar.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_logic = "const isActive = item.url.includes('?') ? (location.pathname + location.search) === item.url : location.pathname === item.url;"
new_logic = "const isActive = item.url.includes('?') ? (location.pathname + location.search) === item.url : (location.pathname === item.url && (!location.search || !location.search.includes('tab=')));"

text = text.replace(old_logic, new_logic)

with open('src/components/layout/AppSidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

