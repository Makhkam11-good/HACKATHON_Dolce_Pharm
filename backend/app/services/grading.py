"""Единая логика оценки тестов (раздел 8.1 ТЗ).

Зеркало: frontend/src/offline/grading.ts. Обе реализации прогоняются на общих
тест-кейсах backend/tests/grading_cases.json — любые изменения делать в обеих.

Формат вопроса (dict):
  {id, type: single|multi|open|order, points, options: [{id, is_correct, correct_order}],
   keywords: [..], keywords_min}
Формат ответа (dict): {selected_option_ids, order_option_ids, answer_text}
"""
from __future__ import annotations

import math
import re

_PUNCT = re.compile(r"[^\w\s]|_", re.UNICODE)


def normalize(text: str | None) -> list[str]:
    t = (text or "").lower().replace("ё", "е")
    t = _PUNCT.sub(" ", t)
    return [w for w in t.split() if w]


def stem(word: str) -> str:
    return word[: max(4, len(word) - 2)]


def keyword_stem(keyword: str) -> str:
    """Ключевое слово — одно слово; если ввели фразу, берётся первое слово."""
    words = normalize(keyword)
    return stem(words[0]) if words else ""


def keyword_stems(keywords: list[str] | None) -> list[str]:
    out: list[str] = []
    for k in keywords or []:
        s = keyword_stem(k)
        if s and s not in out:
            out.append(s)
    return out


def round1(x: float) -> float:
    return math.floor(x * 10 + 0.5) / 10


def count_matched(stems: list[str], answer_text: str | None) -> int:
    words = normalize(answer_text)
    return sum(1 for s in stems if any(w.startswith(s) for w in words))


def grade_question(q: dict, a: dict | None) -> dict:
    a = a or {}
    t = q["type"]
    pts = float(q.get("points", 1) or 0)
    opts = q.get("options") or []
    res = {"question_id": q["id"], "is_correct": False, "points": 0.0, "needs_review": False, "matched_keywords": 0}

    if t == "single":
        sel = a.get("selected_option_ids") or []
        correct = {o["id"] for o in opts if o.get("is_correct")}
        ok = len(sel) == 1 and sel[0] in correct
        res["is_correct"] = ok
        res["points"] = pts if ok else 0.0
    elif t == "multi":
        sel = set(a.get("selected_option_ids") or [])
        correct = {o["id"] for o in opts if o.get("is_correct")}
        total = len(correct)
        if total:
            c = len(sel & correct)
            w = len(sel - correct)
            res["points"] = pts * max(0, c - w) / total
            res["is_correct"] = c == total and w == 0
    elif t == "order":
        order = a.get("order_option_ids") or []
        correct_ids = [o["id"] for o in sorted(opts, key=lambda o: o.get("correct_order") or 0)]
        n = len(correct_ids)
        hits = sum(1 for i, cid in enumerate(correct_ids) if i < len(order) and order[i] == cid)
        if n:
            res["points"] = pts * hits / n
            res["is_correct"] = hits == n
    elif t == "open":
        text = a.get("answer_text")
        if normalize(text):
            stems = keyword_stems(q.get("keywords"))
            matched = count_matched(stems, text)
            res["matched_keywords"] = matched
            need = min(q.get("keywords_min") or 1, len(stems))
            if stems and matched >= need:
                res["is_correct"] = True
                res["points"] = pts
            else:
                res["is_correct"] = None
                res["needs_review"] = True
    return res


def summarize(results: list[dict], points_max: float, pass_score: float) -> dict:
    earned = 0.0
    for r in results:
        earned += r["points"]
    score = round1(100 * earned / points_max) if points_max > 0 else 0.0
    if any(r["needs_review"] for r in results):
        status = "pending_review"
    elif score >= pass_score:
        status = "passed"
    else:
        status = "failed"
    return {"points_earned": earned, "points_max": points_max, "score": score, "status": status}


def grade_attempt(questions: list[dict], answers: dict[str, dict], pass_score: float) -> dict:
    """questions — в порядке позиций; answers — {question_id: answer}."""
    results = [grade_question(q, answers.get(q["id"])) for q in questions]
    points_max = 0.0
    for q in questions:
        points_max += float(q.get("points", 1) or 0)
    out = summarize(results, points_max, pass_score)
    out["answers"] = results
    return out
