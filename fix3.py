import re

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace filters block (and completely strip the comments to avoid JSX errors)
text = re.sub(
    r'\{\/\* Facilitator Status Filter \*\/\}\s*(<div.*?)(?=\s*\{\/\* Coordinator Status Filter \*\/\})',
    r'{currentTab === "facilitator" && (\n\1)}\n',
    text,
    flags=re.DOTALL
)

text = re.sub(
    r'\{\/\* Coordinator Status Filter \*\/\}\s*(<div.*?)(?=\s*\{\/\* Supervisor Status Filter \*\/\})',
    r'{currentTab === "coordinator" && (\n\1)}\n',
    text,
    flags=re.DOTALL
)

text = re.sub(
    r'\{\/\* Supervisor Status Filter \*\/\}\s*(<div.*?)(?=\s*\{\/\* Time Filter \*\/\})',
    r'{currentTab === "supervisor" && (\n\1)}\n',
    text,
    flags=re.DOTALL
)


# Replace Headers Block
text = re.sub(
    r'(<TableHead[^>]*>\s*<div[^>]*>\s*Facilitator Status\s*<span.*?</TableHead>)',
    r'{currentTab === "facilitator" && (\n\1\n)}',
    text,
    flags=re.DOTALL
)
text = re.sub(
    r'(<TableHead[^>]*>\s*<div[^>]*>\s*Coordinator Status\s*<span.*?</TableHead>)',
    r'{currentTab === "coordinator" && (\n\1\n)}',
    text,
    flags=re.DOTALL
)
text = re.sub(
    r'(<TableHead[^>]*>\s*<div[^>]*>\s*Supervisor Status\s*<span.*?</TableHead>)',
    r'{currentTab === "supervisor" && (\n\1\n)}',
    text,
    flags=re.DOTALL
)

# Replace Table Cells Block
# This one is tricky because they are identical generic TableCell tags. We need to match by the getStatusColor property.
text = re.sub(
    r'(<TableCell>\s*<Badge className=\{getStatusColor\(session\.facilitator_feedback_status\)\}>.*?</TableCell>)',
    r'{currentTab === "facilitator" && (\n\1\n)}',
    text,
    flags=re.DOTALL
)
text = re.sub(
    r'(<TableCell>\s*<Badge className=\{getStatusColor\(session\.coordinator_feedback_status\)\}>.*?</TableCell>)',
    r'{currentTab === "coordinator" && (\n\1\n)}',
    text,
    flags=re.DOTALL
)
text = re.sub(
    r'(<TableCell>\s*<Badge className=\{getStatusColor\(session\.supervisor_feedback_status\)\}>.*?</TableCell>)',
    r'{currentTab === "supervisor" && (\n\1\n)}',
    text,
    flags=re.DOTALL
)

with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
