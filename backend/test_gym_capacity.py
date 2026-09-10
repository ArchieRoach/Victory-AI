"""Self-check for gym capacity math (_gym_capacity + the clamp in create_gym).
Run: python3 backend/test_gym_capacity.py
"""
from server import _gym_capacity, GYM_DEFAULT_CAP, GYM_MIN_CAP, GYM_MAX_CAP


def clamp(cap):
    return max(GYM_MIN_CAP, min(GYM_MAX_CAP, cap))


def run():
    # Missing member_cap → falls back to default, no migration needed
    c = _gym_capacity({"members": ["a", "b"], "member_count": 2})
    assert c == {"member_cap": GYM_DEFAULT_CAP, "spots_left": GYM_DEFAULT_CAP - 2, "is_full": False}, c

    # Explicit cap, room left
    c = _gym_capacity({"member_cap": 10, "member_count": 7})
    assert c == {"member_cap": 10, "spots_left": 3, "is_full": False}, c

    # Exactly at cap → full, spots_left 0
    c = _gym_capacity({"member_cap": 10, "member_count": 10})
    assert c == {"member_cap": 10, "spots_left": 0, "is_full": True}, c

    # Over cap (owner lowered it below current count) → never negative spots_left
    c = _gym_capacity({"member_cap": 5, "member_count": 8})
    assert c == {"member_cap": 5, "spots_left": 0, "is_full": True}, c

    # member_count missing → derived from members list length
    c = _gym_capacity({"member_cap": 3, "members": ["a", "b", "c"]})
    assert c["is_full"] is True and c["spots_left"] == 0, c

    # member_cap of 0 or None both fall back to default (the `or` in _gym_capacity)
    assert _gym_capacity({"member_cap": 0, "member_count": 1})["member_cap"] == GYM_DEFAULT_CAP
    assert _gym_capacity({"member_cap": None, "member_count": 1})["member_cap"] == GYM_DEFAULT_CAP

    # create_gym clamp
    assert clamp(1) == GYM_MIN_CAP
    assert clamp(999999) == GYM_MAX_CAP
    assert clamp(50) == 50

    print("all gym-capacity assertions passed")


if __name__ == "__main__":
    run()
