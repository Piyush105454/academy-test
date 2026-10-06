import sys
import re

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

fac_tc_pattern = re.compile(r'(<TableCell>[\s]*<Badge className={getStatusColor\(session\.facilitator_feedback_status \|\| session\.status\)}>[\s\S]*?</TableCell>)')
if fac_tc_pattern.search(text) and not "{currentTab === 'facilitator' && (" in fac_tc_pattern.search(text).group(0):
    text = fac_tc_pattern.sub(r"{currentTab === 'facilitator' && (\n\1\n)}", text)

coo_tc_pattern = re.compile(r'(<TableCell>[\s]*<Badge className={getStatusColor\(session\.coordinator_feedback_status \|\| \'pending\'\)}>[\s\S]*?</TableCell>)')
if coo_tc_pattern.search(text) and not "{currentTab === 'coordinator' && (" in coo_tc_pattern.search(text).group(0):
    text = coo_tc_pattern.sub(r"{currentTab === 'coordinator' && (\n\1\n)}", text)

sup_tc_pattern = re.compile(r'(<TableCell>[\s]*<Badge className={getStatusColor\(session\.supervisor_feedback_status \|\| \'pending\'\)}>[\s\S]*?</TableCell>)')
if sup_tc_pattern.search(text) and not "{currentTab === 'supervisor' && (" in sup_tc_pattern.search(text).group(0):
    text = sup_tc_pattern.sub(r"{currentTab === 'supervisor' && (\n\1\n)}", text)

with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

