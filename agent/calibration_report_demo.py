"""A worked calibration report, from the kind of corrections a fortnight produces.

Run after teachers have been overriding scores for a while. Everything here is
computed; nothing is applied. The numbers below come from invented corrections —
replace with `CalibrationSet.add_from_graded(g)` over real graded submissions.
"""
import sys
sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from grading_agent.calibration import CalibrationPoint, CalibrationSet

M = "day12_task2_english"
c = CalibrationSet()
data = [
    ("speed", "video", [(3, 4), (3, 4), (2, 3), (3, 4), (4, 5), (3, 4)]),
    ("tone", "video", [(2, 4), (5, 3), (2, 4), (5, 3), (3, 4), (4, 2)]),
    ("completion", "note", [(5, 5), (4, 4), (5, 4), (4, 4), (5, 5), (3, 3)]),
    ("accuracy", "note", [(3, 4), (4, 5)]),
]
i = 0
for param, art, pairs in data:
    for a, t in pairs:
        i += 1
        c.add(CalibrationPoint(f"s-{i}", M, art, param, a, t, "Mrs Sharma"))
c.add(CalibrationPoint("s-99", M, "video", "hand_gesture", 2, None, "Mrs Sharma",
                       "Hands were never in frame — this should not have been scored."))
c.add(CalibrationPoint("s-100", M, "video", "hand_gesture", 3, None, "Mr Iyer",
                       "Camera too close to judge gestures."))
print(c.report())
