import sys
import re

with open('src/pages/Sessions.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# The user wants to hide the horizontal tabs. 
# They look like this:
# <Tabs value={currentTab} onValueChange={(v) => { ... }} className="w-full sm:w-auto">
#   <TabsList>
#     ...
#   </TabsList>
# </Tabs>
# We can just remove or comment out this block. Let's find it.

tab_pattern = re.compile(r'<Tabs value=\{currentTab\}.*?</Tabs>', re.DOTALL)
text = tab_pattern.sub('', text)

with open('src/pages/Sessions.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

