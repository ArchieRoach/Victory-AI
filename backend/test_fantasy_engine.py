"""Self-check for the fantasy engine (prices, card selection, result mapping, scoring):

    python3 backend/test_fantasy_engine.py
"""
import fantasy_engine as fx
from fantasy_engine import (
    fighter_rating, win_probability, bout_prices, card_qualifies, clean_sweep, map_result,
    score_fighter, check_stable, stable_score, card_status, rank_entries, SALARY_CAP,
)

CHAMP = {"wins": 30, "losses": 1, "draws": 0, "total_bouts": 31, "ko_wins": 24, "stopped": 0}
JOURNEYMAN = {"wins": 8, "losses": 40, "draws": 3, "total_bouts": 51, "ko_wins": 1, "stopped": 9}
PROSPECT = {"wins": 3, "losses": 0, "draws": 0, "total_bouts": 3, "ko_wins": 3, "stopped": 0}
EVEN = {"wins": 15, "losses": 3, "draws": 0, "total_bouts": 18, "ko_wins": 8, "stopped": 1}


def test_ratings_reward_proven_records_over_short_ones():
    assert fighter_rating(CHAMP) > fighter_rating(PROSPECT) > fighter_rating(JOURNEYMAN)
    assert fighter_rating(None) == fighter_rating({})


def test_prices_range_10_to_50_and_favourite_costs_more():
    fav, dog = bout_prices(CHAMP, JOURNEYMAN)
    assert 45 <= fav <= 50 and 10 <= dog <= 15
    a, b = bout_prices(EVEN, EVEN)
    assert a == b == 30
    assert abs(win_probability(80, 80) - 0.5) < 1e-9


def test_three_big_favourites_bust_the_cap():
    fav, _ = bout_prices(CHAMP, JOURNEYMAN)
    assert 3 * fav > SALARY_CAP, "picking only favourites must not be possible"


def test_which_cards_become_games():
    assert card_qualifies("London, United Kingdom", []) == "uk"
    assert card_qualifies("Glasgow, Scotland", []) == "uk"
    world = [{"titles": [{"name": "WBO World Lightweight Champion"}]}]
    assert card_qualifies("New York, United States", world) == "world_title"
    regional = [{"titles": [{"name": "WBC Silver Lightweight"}]}]
    assert card_qualifies("Las Vegas, United States", regional) is None
    assert card_qualifies("Riyadh, Saudi Arabia", [{"titles": [{"name": "Undisputed Heavyweight"}]}]) == "world_title"


def test_clean_sweep_from_scorecards():
    assert clean_sweep(["120-108", "118-110", "117-111"], 12) is True
    assert clean_sweep(["119-109", "118-110"], 12) is False
    assert clean_sweep(["80-72"], 8) is True
    assert clean_sweep(None, 12) is False and clean_sweep(["garbage"], 12) is False


def fight(status="FINISHED", outcome="UD", rnd="12", w1=True, w2=False, scores=None, rounds=12):
    return {"status": status, "scheduled_rounds": rounds, "scores": scores,
            "results": {"outcome": outcome, "round": rnd} if outcome else None,
            "fighters": {"fighter_1": {"fighter_id": "a", "winner": w1}, "fighter_2": {"fighter_id": "b", "winner": w2}}}


def test_mapping_feed_results():
    assert map_result(fight(status="NOT_STARTED")) is None
    assert map_result(fight(outcome="KO", rnd="3")) == {"winner_id": "a", "method": "KO", "round": 3, "clean_sweep": False}
    assert map_result(fight(outcome="PTS", rnd="6", rounds=6))["method"] == "UD"
    assert map_result(fight(outcome="UD", scores=["120-108", "119-109", "119-109"]))["clean_sweep"] is True
    draw = map_result(fight(outcome="D", w1=False, w2=False))
    assert draw["winner_id"] is None and draw["method"] == "D"
    assert map_result(fight(outcome="XYZ"))["needs_review"] is True, "unknown outcomes are never guessed"


def test_scoring_matches_the_app_rules():
    b = lambda r: {"status": "complete", "result": r}
    assert score_fighter("a", b({"winner_id": "a", "method": "KO", "round": 2, "clean_sweep": True})) == 40
    assert score_fighter("a", b({"winner_id": "a", "method": "TKO", "round": 7})) == 25
    assert score_fighter("a", b({"winner_id": "a", "method": "KO", "round": 11})) == 22
    assert score_fighter("a", b({"winner_id": "a", "method": "DQ", "round": 2})) == 20
    assert score_fighter("a", b({"winner_id": "a", "method": "UD", "round": 12, "clean_sweep": True})) == 25
    assert score_fighter("a", b({"winner_id": "a", "method": "SD", "round": 12})) == 10
    assert score_fighter("b", b({"winner_id": "a", "method": "KO", "round": 1})) == 0
    assert score_fighter("b", b({"winner_id": None, "method": "NC", "round": 2})) == 5
    assert score_fighter("a", {"status": "live", "result": None}) is None


def test_stables_status_and_ranks():
    card = {"bouts": [
        {"status": "complete", "result": {"winner_id": "a", "method": "KO", "round": 2}, "fighters": [{"fighter_id": "a", "salary": 45}, {"fighter_id": "b", "salary": 15}]},
        {"status": "upcoming", "result": None, "fighters": [{"fighter_id": "c", "salary": 40}, {"fighter_id": "d", "salary": 20}]},
    ]}
    assert check_stable(["a", "b", "d"], card) is None
    assert "over" in check_stable(["a", "c", "d"], card)
    assert check_stable(["a", "a", "d"], card) == "You picked the same boxer twice."
    assert check_stable(["a", "b"], card) == "Pick 3 boxers."
    assert stable_score(["a", "b", "d"], card) == 30
    assert card_status(card["bouts"]) == "live" and card_status([]) == "upcoming"
    ranked = rank_entries([{"name": "Zed", "total": 30}, {"name": "amy", "total": 30}, {"name": "Bo", "total": 5}])
    assert [(e["name"], e["rank"]) for e in ranked] == [("amy", 1), ("Zed", 1), ("Bo", 3)]



def test_small_cards_pick_fewer_boxers():
    assert fx.team_rules(1) == (1, 50) and fx.team_rules(2) == (2, 80) and fx.team_rules(9) == (3, 100)
    card = {"stable_size": 1, "salary_cap": 50, "bouts": [{"fighters": [{"fighter_id": "a", "salary": 48}, {"fighter_id": "b", "salary": 12}]}]}
    assert fx.check_stable(["a"], card) is None
    assert fx.check_stable(["a", "b"], card) == "Pick 1 boxer."


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
