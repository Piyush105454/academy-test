"""Rubric loading and lookup.

The rubric lives in JSON (``rubric_config.json``) rather than in code so it can
be tuned — weights, thresholds, abstain confidence — without a code change and
without a developer. Calibration against a real teacher will change these
numbers; that should be an edit to one file.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).with_name("rubric_config.json")


@dataclass(frozen=True)
class ScaleBand:
    score: int
    band: str
    meaning: str


class Rubric:
    """Parsed rubric configuration."""

    def __init__(self, raw: dict[str, Any]):
        self._raw = raw

    # -- construction -----------------------------------------------------

    @classmethod
    def load(cls, path: str | Path | None = None) -> "Rubric":
        p = Path(path) if path else DEFAULT_CONFIG_PATH
        with open(p, encoding="utf-8") as fh:
            return cls(json.load(fh))

    # -- scale ------------------------------------------------------------

    def band(self, score: int) -> ScaleBand:
        entry = self._raw["scale"][str(int(score))]
        return ScaleBand(score=int(score), band=entry["band"], meaning=entry["meaning"])

    def band_name(self, rating: float) -> str:
        """Band for a (possibly fractional) rating, rounded to the nearest score."""
        return self.band(max(1, min(5, round(rating)))).band

    # -- parameters -------------------------------------------------------

    @property
    def video_parameters(self) -> dict[str, dict]:
        return self._raw["video_parameters"]

    @property
    def note_parameters(self) -> dict[str, dict]:
        return self._raw["note_parameters"]

    def label(self, parameter: str) -> str:
        for group in (self.video_parameters, self.note_parameters):
            if parameter in group:
                return group[parameter]["label"]
        return parameter

    def label_hi(self, parameter: str) -> str:
        return self.video_parameters.get(parameter, {}).get("label_hi", self.label(parameter))

    def is_measured(self, parameter: str) -> bool:
        """True only for parameters that come from direct measurement.

        Everything else is a model judgement and should be treated as a good
        estimate, not a fact. Currently only Speed (computed WPM) and note
        Completion (presence counting) qualify.
        """
        for group in (self.video_parameters, self.note_parameters):
            if parameter in group:
                return group[parameter].get("evidence") == "measured"
        return False

    def depends_on_script_reading(self, parameter: str) -> bool:
        """True if this note parameter's score depends on reading handwriting.

        Used to keep Completion independent of OCR quality: whether a row was
        filled in at all does not require reading what it says.
        """
        return self.note_parameters.get(parameter, {}).get("depends_on_script_reading", False)

    # -- thresholds -------------------------------------------------------

    @property
    def overall_weights(self) -> dict[str, float]:
        return self._raw["rating_weights"]["overall"]

    @property
    def abstain_min_confidence(self) -> float:
        return float(self._raw["abstain"]["min_confidence"])

    @property
    def devanagari_min_confidence(self) -> float:
        return float(self._raw["abstain"]["devanagari_match_min_confidence"])

    @property
    def trend_window(self) -> int:
        return int(self._raw["trend"]["history_window"])

    @property
    def trend_delta(self) -> float:
        return float(self._raw["trend"]["delta_threshold"])

    @property
    def trend_floor(self) -> float:
        return float(self._raw["trend"]["needs_attention_floor"])

    @property
    def flags(self) -> dict[str, Any]:
        return self._raw["teacher_flags"]

    @property
    def fairness(self) -> dict[str, Any]:
        return self._raw["fairness"]
