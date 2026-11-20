import json
from pathlib import Path

import pytest

from app.services.grading import grade_attempt, keyword_stem, normalize, round1, stem

CASES = json.loads((Path(__file__).parent / "grading_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_cases(case):
    g = grade_attempt(case["questions"], case["answers"], case["pass_score"])
    assert g["score"] == case["expected"]["score"]
    assert g["status"] == case["expected"]["status"]
    assert [r["points"] for r in g["answers"]] == pytest.approx(case["expected"]["points"])


def test_normalize():
    assert normalize("Ёлка, ЁЖ!  мастер_смены") == ["елка", "еж", "мастер", "смены"]


def test_stem():
    assert stem("остановить") == "останови"
    assert stem("вода") == "вода"
    assert stem("еж") == "еж"
    assert keyword_stem("  Мастер ") == "маст"


def test_round1_half_up():
    assert round1(0.25) == 0.3
    assert round1(66.66666) == 66.7
