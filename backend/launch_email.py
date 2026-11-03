"""The waitlist's "you're in" email on early-access day.

Goal: turn waitlist sign-ups into people who train in the first week (activation).
Psychology: a promise kept builds trust ("you said 30 November, it's 30 November"). One clear next
  step beats a menu (choice overload), and the first session is framed as small and doable
  ("one round"), so starting feels easy. Founders are reminded of the perk they were promised,
  which is earned, not invented.
Design: short, the app's own colours, one lime button to app.victoryai.co.uk. It says which email
  to sign in with (that's how founder perks are matched), what to do first, and when Season 1 starts.
  Plain-text copy and a one-click unsubscribe go with it.
"""
import hashlib
import hmac
import html
from typing import Optional
from urllib.parse import quote

SUBJECT = "You're in. Victory AI is open for you"


def unsubscribe_token(email: str, secret: str) -> str:
    return hmac.new(secret.encode(), email.strip().lower().encode(), hashlib.sha256).hexdigest()[:32]


def token_ok(email: str, token: str, secret: str) -> bool:
    return hmac.compare_digest(unsubscribe_token(email, secret), token or "")


def unsubscribe_url(api_base: str, email: str, secret: str) -> str:
    return f"{api_base}/api/waitlist/unsubscribe?e={quote(email)}&t={unsubscribe_token(email, secret)}"


def render(name: Optional[str], email: str, founder: bool, app_url: str, unsub_url: str,
           trial_days: int, founder_trial_days: int, app_store_url: Optional[str] = None) -> dict:
    first = (name or "").strip().split(" ")[0][:40] or "fighter"
    days = founder_trial_days if founder else trial_days
    perk = (f"You're a founding member: {founder_trial_days} days of Pro free." if founder
            else f"Pro is free for {trial_days} days when you want it.")
    perk += " Sign up before Season 2 and the Founding Fighter title is yours for good."
    store = (f'<p style="margin:0 0 18px;color:#8888A0;font-size:14px">On iPhone? '
             f'<a href="{html.escape(app_store_url)}" style="color:#E8FF47">Get the app</a>.</p>') if app_store_url else ""
    body = f"""<!doctype html><html><body style="margin:0;background:#0A0A0F">
<div style="max-width:520px;margin:0 auto;padding:32px 22px;font-family:Inter,Arial,sans-serif;color:#F0F0F5">
  <p style="margin:0 0 6px;color:#E8FF47;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Early access</p>
  <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-size:30px;line-height:1.1">You're in, {html.escape(first)}.</h1>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.5">We said 30 November, so here it is: Victory AI is open for you, a week before everyone else.</p>
  <div style="background:#12121A;border:1px solid #2A2A3A;border-radius:16px;padding:18px;margin:0 0 20px">
    <p style="margin:0 0 10px;font-weight:700;font-size:16px">Your first session is one round.</p>
    <p style="margin:0;color:#8888A0;font-size:15px;line-height:1.5">Prop your phone up, press start, and box. Your coach calls the combos and tells you one thing you did well.</p>
  </div>
  <a href="{html.escape(app_url)}" style="display:inline-block;background:#E8FF47;color:#0A0A0F;font-weight:800;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:999px">Start training</a>
  <p style="margin:20px 0 6px;font-size:15px;line-height:1.5">Sign up with <b>{html.escape(email)}</b>, so your waitlist perks find you.</p>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.5">{html.escape(perk)}</p>
  {store}
  <p style="margin:0 0 26px;font-size:15px;line-height:1.5">Season 1 starts on 7 December. This week is your warm-up.</p>
  <p style="margin:0;color:#8888A0;font-size:12px;line-height:1.5">You're getting this because you joined the Victory AI waitlist.
    <a href="{html.escape(unsub_url)}" style="color:#8888A0">Unsubscribe</a>.</p>
</div></body></html>"""
    text = (f"You're in, {first}.\n\nWe said 30 November, so here it is: Victory AI is open for you, a week before everyone else.\n\n"
            f"Your first session is one round. Prop your phone up, press start, and box.\n\nStart training: {app_url}\n\n"
            f"Sign up with {email}, so your waitlist perks find you. {perk}\n\n"
            + (f"On iPhone? {app_store_url}\n\n" if app_store_url else "")
            + "Season 1 starts on 7 December. This week is your warm-up.\n\n"
            f"Unsubscribe: {unsub_url}\n")
    return {"subject": SUBJECT, "html": body, "text": text, "days": days}
