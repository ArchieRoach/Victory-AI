"""Print Victory AI habit metrics as a table.

Needs two environment variables (set them in the Claude Code cloud environment, or your shell):
  VICTORY_API_URL        backend base URL, e.g. https://<service>.up.railway.app
  VICTORY_METRICS_TOKEN  the same value as METRICS_API_TOKEN on Railway (32+ characters)

    python3 tools/habit_metrics.py [weeks]
"""
import json
import os
import sys
import urllib.request


def main():
    base = os.environ.get("VICTORY_API_URL", "").strip().rstrip("/")
    if base and "://" not in base:
        base = f"https://{base}"
    token = os.environ.get("VICTORY_METRICS_TOKEN", "")
    if not base or not token:
        sys.exit("Set VICTORY_API_URL and VICTORY_METRICS_TOKEN first.")
    weeks = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    req = urllib.request.Request(f"{base}/api/admin/habit-metrics?weeks={weeks}",
                                 headers={"X-Metrics-Token": token})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)

    print(f"{'week of':<11}{'sessions':>9}{'users':>7}{'% direct':>10}{'median/wk':>11}"
          f"{'2-4/wk':>8}{'>4/wk':>7}{'% video':>9}{'kept':>7}  top triggers")
    for w in data["weeks"]:
        fmt = lambda v: "—" if v is None else v
        top = ", ".join(f"{k} {v}" for k, v in list(w["by_trigger"].items())[:4])
        print(f"{w['week_of']:<11}{w['sessions']:>9}{w['active_users']:>7}{fmt(w['pct_direct']):>10}"
              f"{w['median_sessions_per_user']:>11}{w['users_in_habit_zone']:>8}{w['users_over_zone']:>7}"
              f"{fmt(w['pct_recorded']):>9}{fmt(w['bookings']['kept_rate']):>7}  {top}")


if __name__ == "__main__":
    main()
