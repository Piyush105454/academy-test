"""Is the agent marking like a teacher would?

Nobody has ever checked. Speed and Completion are real measurements; every other
parameter is a model's judgement against a rubric written by people who have not
compared it to a human marker. That is the largest untested assumption in this
project, and it has been outstanding since Version 1.

Score overrides close it without anyone running a study. Every time a teacher
changes a score they are saying *the agent said 3, I say 4* on a real piece of
work — which is exactly the data a calibration exercise would have collected,
except it arrives continuously and for free.

Four things this measures:

    bias            mean(teacher - agent). Positive means the agent marks
                    harder than the teacher; negative means it is generous.
                    A consistent bias is the easy problem — it is a rubric
                    wording fix.

    spread          mean absolute difference. Large spread with near-zero bias
                    is worse than a steady bias: it means the agent is
                    inconsistent rather than merely miscalibrated, and no
                    single adjustment fixes it.

    overreach       the agent scored; the teacher said "not assessable from
                    this". The agent judged on evidence a person would not
                    have judged on. This is the finding that should stop a
                    release, and it is why abstentions are counted separately
                    rather than treated as missing data.

    over-caution    the agent abstained; the teacher scored it fine. Cheap by
                    comparison — the cost is a teacher doing work the agent
                    could have done.

What this module will not do: change a score, a threshold or a rubric on its
own. It reports, with the sample size attached, and a person decides. A system
that retunes its own marking from teacher corrections would drift toward
whichever teacher overrides most often.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Optional, Sequence

#: Below this many overrides for a parameter, report the count and nothing else.
#: Three corrections is an anecdote; the temptation to read a trend into it is
#: exactly what a sample-size guard exists to stop.
MIN_SAMPLE = 5

#: A mean gap this wide or wider is worth acting on rather than noting.
MATERIAL_BIAS = 0.5


@dataclass(frozen=True)
class CalibrationPoint:
    """One teacher correction, as evidence about the agent."""
    submission_id: str
    module_id: str
    artifact: str
    parameter: str
    agent_score: Optional[int]
    teacher_score: Optional[int]
    teacher: str = ""
    reason: str = ""

    @property
    def is_numeric_pair(self) -> bool:
        return self.agent_score is not None and self.teacher_score is not None

    @property
    def is_overreach(self) -> bool:
        """Agent scored it; the teacher said it could not be judged."""
        return self.agent_score is not None and self.teacher_score is None

    @property
    def is_over_caution(self) -> bool:
        """Agent abstained; the teacher had no trouble scoring it."""
        return self.agent_score is None and self.teacher_score is not None

    @property
    def delta(self) -> Optional[int]:
        if not self.is_numeric_pair:
            return None
        return self.teacher_score - self.agent_score


@dataclass
class ParameterCalibration:
    parameter: str
    n_pairs: int = 0
    bias: Optional[float] = None
    spread: Optional[float] = None
    exact_agreement: Optional[float] = None
    within_one: Optional[float] = None
    overreach: int = 0
    over_caution: int = 0

    @property
    def enough_data(self) -> bool:
        return self.n_pairs >= MIN_SAMPLE

    def verdict(self) -> str:
        if self.overreach:
            return (f"{self.overreach} case(s) where the agent scored and a teacher "
                    f"said it was not assessable — look at these first.")
        if not self.enough_data:
            return (f"Only {self.n_pairs} correction(s) so far; not enough to say "
                    f"anything. Needs {MIN_SAMPLE}.")
        if self.bias is None:
            return "No numeric comparisons."
        if abs(self.bias) >= MATERIAL_BIAS:
            direction = "harder than" if self.bias > 0 else "more generously than"
            return (f"The agent marks {direction} teachers by {abs(self.bias):.2f} "
                    f"on average ({self.n_pairs} corrections). Worth adjusting the "
                    f"rubric wording for this parameter.")
        if self.spread is not None and self.spread >= 1.0:
            return (f"Little overall bias ({self.bias:+.2f}) but corrections average "
                    f"{self.spread:.2f} points — inconsistent rather than "
                    f"miscalibrated. One adjustment will not fix this.")
        return (f"Close to teachers ({self.bias:+.2f} average, {self.spread:.2f} "
                f"typical gap over {self.n_pairs} corrections).")


@dataclass
class CalibrationSet:
    """Teacher corrections gathered across submissions."""
    points: list[CalibrationPoint] = field(default_factory=list)

    def add(self, point: CalibrationPoint) -> None:
        self.points.append(point)

    def add_from_graded(self, graded) -> int:
        """Harvest every override on one graded submission. Returns how many."""
        added = 0
        for o in graded.extras.get("score_overrides", ()):
            self.add(CalibrationPoint(
                submission_id=graded.submission_id,
                module_id=graded.module_id,
                artifact=o["artifact"], parameter=o["parameter"],
                agent_score=o["agent_score"], teacher_score=o["teacher_score"],
                teacher=o.get("edited_by", ""), reason=o.get("reason", "")))
            added += 1
        return added

    # -- analysis ---------------------------------------------------------

    def by_parameter(self, parameter: str) -> ParameterCalibration:
        pts = [p for p in self.points if p.parameter == parameter]
        pairs = [p for p in pts if p.is_numeric_pair]
        c = ParameterCalibration(
            parameter=parameter,
            n_pairs=len(pairs),
            overreach=sum(1 for p in pts if p.is_overreach),
            over_caution=sum(1 for p in pts if p.is_over_caution))
        if pairs:
            deltas = [p.delta for p in pairs]
            c.bias = round(mean(deltas), 2)
            c.spread = round(mean(abs(d) for d in deltas), 2)
            c.exact_agreement = round(sum(1 for d in deltas if d == 0) / len(deltas), 2)
            c.within_one = round(sum(1 for d in deltas if abs(d) <= 1) / len(deltas), 2)
        return c

    def parameters(self) -> list[str]:
        return sorted({p.parameter for p in self.points})

    def all(self) -> list[ParameterCalibration]:
        return [self.by_parameter(p) for p in self.parameters()]

    def overreach_cases(self) -> list[CalibrationPoint]:
        """The ones to read individually, not in aggregate."""
        return [p for p in self.points if p.is_overreach]

    def report(self) -> str:
        if not self.points:
            return ("No teacher corrections recorded yet. Calibration starts the "
                    "first time a teacher changes a score.\n")

        lines = ["CALIBRATION AGAINST TEACHERS",
                 "",
                 f"{len(self.points)} correction(s) across "
                 f"{len({p.submission_id for p in self.points})} submission(s).",
                 "Nothing here is applied automatically.",
                 ""]

        over = self.overreach_cases()
        if over:
            lines += [f"! {len(over)} case(s) where the agent scored and a teacher said "
                      f"the work could not be judged:"]
            for p in over:
                lines.append(f"    {p.artifact}.{p.parameter} — agent gave "
                             f"{p.agent_score}"
                             + (f" · {p.reason}" if p.reason else ""))
            lines.append("")

        for c in self.all():
            head = f"{c.parameter} ({c.n_pairs} correction(s))"
            lines.append(head)
            lines.append(f"    {c.verdict()}")
            if c.enough_data and c.exact_agreement is not None:
                lines.append(f"    agreed exactly {c.exact_agreement:.0%}, "
                             f"within one point {c.within_one:.0%}")
            if c.over_caution:
                lines.append(f"    {c.over_caution} time(s) the agent abstained and a "
                             f"teacher scored it without difficulty")
            lines.append("")
        return "\n".join(lines).rstrip() + "\n"
