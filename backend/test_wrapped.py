"""Self-check for the anticipation strip, Season Wrapped, the Oracle, crew moments and Coach's Eye:

    python3 backend/test_wrapped.py
"""
import gamification as gx


def test_parade_keeps_the_soonest_four_real_items():
    items = [{"title": "B", "sort": 5}, None, {"title": "A", "sort": 1}, {"title": "", "sort": 0},
             {"title": "C", "sort": 9}, {"title": "D", "sort": 2}, {"title": "E", "sort": 3}]
    assert [i["title"] for i in gx.anticipation(items)] == ["A", "D", "E", "B"]


def test_wrapped_uses_only_real_facts_and_ends_on_who_you_became():
    assert gx.wrapped_cards({}) == []
    cards = gx.wrapped_cards({"sessions": 14, "hours": 9.5, "then_vs_now": {"then": 5.1, "now": 6.4, "change": 1.3},
                              "loved": {"date": "3 Jan", "enjoyment": 5, "why": "feel sharp"}, "bosses": 2,
                              "crew_moment": {"big": "3", "label": "crew missions done", "line": "x"},
                              "trait": {"name": "Iron Guard", "count": 6, "statement": "You keep your hands home."}})
    assert [c["kind"] for c in cards] == ["showed_up", "growth", "crew", "loved", "boss", "became"]
    assert cards[0]["line"] == "You trained 14 times this season, with 9.5 proven hours."
    assert cards[3]["line"] == "You rated it 5/5 and said it made you feel sharp."
    assert cards[-1]["big"] == "Iron Guard"
    slipped = gx.wrapped_cards({"sessions": 2, "then_vs_now": {"then": 6, "now": 5.5, "change": -0.5}})
    assert [c["kind"] for c in slipped] == ["showed_up", "became"], "a drop is not dressed up as growth"


def test_oracle_only_predicts_a_real_rising_trend_close_to_the_next_number():
    rising = [{"Jab": 7.0}, {"Jab": 7.3}, {"Jab": 7.6}, {"Jab": 7.8}]
    p = gx.oracle_prediction(rising)
    assert p == {"dimension": "Jab", "target": 8, "sessions": 2}
    close = gx.oracle_prediction([{"Jab": 7.4}, {"Jab": 7.6}, {"Jab": 7.8}, {"Jab": 7.95}])
    assert close == {"dimension": "Jab", "target": 8, "sessions": 1}
    assert gx.oracle_prediction([{"Jab": 7.0}, {"Jab": 7.0}, {"Jab": 7.0}]) is None, "flat is no prediction"
    assert gx.oracle_prediction([{"Jab": 8.0}, {"Jab": 7.5}, {"Jab": 7.0}]) is None, "falling is no prediction"
    assert gx.oracle_prediction(rising[:2]) is None, "too little data"
    slow = [{"Cross": 5.0}, {"Cross": 5.06}, {"Cross": 5.12}, {"Cross": 5.18}]
    assert gx.oracle_prediction(slow) is None, "more than 3 sessions away is too far to promise"
    assert gx.oracle_line("Dee", close) == "Dee: one more AI-scored session at this rate and your jab passes 8. Prove me right."
    assert gx.oracle_line("Dee", p).startswith("Dee: 2 AI-scored sessions at this rate")


def test_crew_moments_are_real_and_never_empty():
    assert gx.crew_moments("Sam", {}) == [{"kind": "trained", "text": "Sam trained today"}]
    m = gx.crew_moments("Sam", {"status": {"leveled_up": True, "level": 4},
                                "personal_bests": {"new": [{"name": "Jab"}, {"name": "Cross"}]},
                                "boss": {"beaten": True, "name": "The Wall"},
                                "quests": [{"just_completed": True, "squad_id": "sq1"}]})
    assert [x["kind"] for x in m] == ["level", "pb", "boss", "quest"] and m[3]["squad_id"] == "sq1"


def test_coach_eye_lists_every_scored_skill_weakest_first_with_a_drill():
    rep = gx.coach_eye_report([{"dimension_name": "Jab", "score": 8}, {"dimension_name": "Footwork", "score": 5},
                               {"dimension_name": "Slip", "score": None}], {"Footwork": {"name": "Box Step"}})
    assert rep == [{"dimension": "Footwork", "score": 5, "drill": "Box Step"}, {"dimension": "Jab", "score": 8, "drill": None}]
    assert "coach_eye" in gx.BOOSTER_CHOICES


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
