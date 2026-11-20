"""Gym run clubs: a fixed weekly run that a gym owner or coach sets up and invites people to.

Goal: more fighters training more often (weekly sessions and retention), and gyms with a
  reason to bring their members into the app.
Psychology: a fixed day, time and place is an implementation intention ("Tuesdays, 7pm, by the
  gym door"), which makes showing up far more likely than a vague plan; an invite from your own
  coach and seeing who else is going add social accountability (people turn up when they're expected).
Design: owner/coaches create a club with one weekly slot and a meeting point, then invite gym
  members in the app or share a link. Members tap "I'm going" for the next run and see a real count.
  Safety for under-18s: the meeting point and the member list are only shown to people in the club
  (or invited to it), and under-18s can only join run clubs at their own gym.
"""
from datetime import date, datetime, timedelta
from typing import Optional

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MAX_CLUBS_PER_GYM = 10
MAX_MEMBERS = 100
MAX_INVITES_PER_CALL = 50
MIN_KM, MAX_KM = 1.0, 42.2


def clean_time(value: str) -> Optional[str]:
    try:
        t = datetime.strptime((value or "").strip(), "%H:%M")
    except ValueError:
        return None
    return t.strftime("%H:%M")


def clean_distance(km) -> Optional[float]:
    try:
        km = round(float(km), 1)
    except (TypeError, ValueError):
        return None
    return km if MIN_KM <= km <= MAX_KM else None


def next_run_date(weekday: int, time_hhmm: str, now: datetime) -> date:
    """The date of the next run. On run day the run stays "next" until an hour after it starts,
    so people can still say they're going while they're walking over."""
    hh, mm = (int(x) for x in time_hhmm.split(":"))
    days_ahead = (weekday - now.weekday()) % 7
    run_day = now.date() + timedelta(days=days_ahead)
    if days_ahead == 0 and now.replace(tzinfo=None) > datetime(run_day.year, run_day.month, run_day.day, hh, mm) + timedelta(hours=1):
        run_day += timedelta(days=7)
    return run_day


def is_staff(gym: dict, user_id: str) -> bool:
    return user_id == gym.get("owner_id") or user_id in (gym.get("coaches") or [])


def can_see_details(club: dict, gym: dict, user_id: str, invited: bool) -> bool:
    return user_id in (club.get("members") or []) or invited or is_staff(gym, user_id)


def join_blocker(club: dict, user: dict, minor: bool) -> Optional[str]:
    if user["user_id"] in (club.get("members") or []):
        return "You're already in this run club"
    if len(club.get("members") or []) >= MAX_MEMBERS:
        return "This run club is full"
    if minor and user.get("gym_id") != club.get("gym_id"):
        return "Under-18s can only join run clubs at their own gym"
    return None
