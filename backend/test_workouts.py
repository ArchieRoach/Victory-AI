"""Self-check: saved timer workouts and logging them as training.

    MONGO_URL=x DB_NAME=t python3 backend/test_workouts.py
"""
import asyncio

from mongomock_motor import AsyncMongoMockClient

import server
import workouts as wk

server.db = AsyncMongoMockClient()["test"]
USER = {"user_id": "u1"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def preset(**kw):
    base = {"name": "Bag work", "type": "bag", "warmup_s": 10, "rounds": 3, "round_s": 180, "rest_s": 60,
            "round_warning_s": 10, "rest_warning_s": 10, "inner_alert_s": 0, "stations": [], "station_rest_s": 0}
    return {**base, **kw}


def test_every_builtin_workout_is_valid():
    for p in wk.DEFAULT_PRESETS:
        assert wk.preset_problem(p) is None, p["name"]


def test_bad_workouts_are_refused_with_a_plain_reason():
    assert "name" in wk.preset_problem(preset(name=""))
    assert "type" in wk.preset_problem(preset(type="yoga"))
    assert "Rounds" in wk.preset_problem(preset(rounds=0))
    assert "exercise" in wk.preset_problem(preset(stations=[{"name": "Burpees", "seconds": 2}]))


def test_total_time_counts_warmup_rounds_rests_and_stations():
    assert wk.total_seconds(preset()) == 10 + 3 * 180 + 2 * 60
    circuit = preset(type="circuit", rounds=2, rest_s=60, station_rest_s=15,
                     stations=[{"name": "Burpees", "seconds": 40}, {"name": "Plank", "seconds": 30}])
    assert wk.total_seconds(circuit) == 10 + 2 * (40 + 15 + 30) + 60


def test_saving_keeps_mine_first_then_the_builtins():
    run(server.db.users.insert_one({"user_id": "u1"}))
    body = server.WorkoutPresetsIn(presets=[server.WorkoutPresetIn(**preset(name="Monday bag"))])
    out = run(server.save_workout_presets(body, user=USER))
    assert out["presets"][0]["name"] == "Monday bag" and not out["presets"][0]["builtin"]
    assert out["presets"][0]["id"].startswith("w_")
    assert len(out["presets"]) == 1 + len(wk.DEFAULT_PRESETS)
    again = run(server.get_workout_presets(user=USER))
    assert again["presets"][0]["id"] == out["presets"][0]["id"]


def test_a_finished_workout_counts_for_the_week():
    out = run(server.complete_workout(server.WorkoutDoneIn(name="Bag work", type="bag", seconds_trained=600, rounds_done=3), user=USER))
    assert out["logged"] and out["streak"]["this_week_days"] == 1
    s = run(server.db.sessions.find_one({"user_id": "u1"}))
    assert s["source"] == "timer" and s["overall_score"] is None and s["workout_type"] == "bag"


def test_a_few_seconds_is_not_a_workout():
    out = run(server.complete_workout(server.WorkoutDoneIn(name="Bag work", type="bag", seconds_trained=20), user={"user_id": "u2"}))
    assert not out["logged"]
    assert run(server.db.sessions.count_documents({"user_id": "u2"})) == 0


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
