"""Waitlist emails: "you're on the list" when someone joins, and "you're in" on early-access day.
They replace the old n8n workflow, so everything lives in one place and costs nothing extra.

Goal: turn waitlist sign-ups into people who train in the first week (activation).
Psychology: a promise kept builds trust ("we said 30 November, here it is"). The welcome email
  confirms the choice they just made (commitment and consistency) and tells them exactly what
  happens next, so the wait feels short. One clear next step beats a menu (choice overload), and the
  first session is framed as small and doable ("one round"). Founders see the perk they were
  promised, with their own code, which is earned, not invented.
Design: short, the app's own colours, one lime button. Both say which email to sign in with (that's
  how founder perks are matched; the discount is added for them at checkout). Plain-text copy and a
  one-click unsubscribe go with each.
"""
import hashlib
import hmac
import html
from typing import Optional
from urllib.parse import quote

SUBJECT = "You're in. Victory AI is open for you"
WELCOME_SUBJECT = "You're on the Victory AI waitlist"


def unsubscribe_token(email: str, secret: str) -> str:
    return hmac.new(secret.encode(), email.strip().lower().encode(), hashlib.sha256).hexdigest()[:32]


def token_ok(email: str, token: str, secret: str) -> bool:
    return hmac.compare_digest(unsubscribe_token(email, secret), token or "")


def unsubscribe_url(api_base: str, email: str, secret: str) -> str:
    return f"{api_base}/api/waitlist/unsubscribe?e={quote(email)}&t={unsubscribe_token(email, secret)}"


def founder_perk(founder: bool, promo_code: Optional[str], percent_off: Optional[float],
                 trial_days: int, founder_trial_days: int) -> str:
    if not founder:
        return f"Pro is free for {trial_days} days whenever you want it."
    price = (f", then {percent_off:g}% off Pro for as long as you stay subscribed" if percent_off else "")
    code = f" Your code is {promo_code}; it's added for you at checkout." if promo_code else ""
    return f"You're a founding member: {founder_trial_days} days of Pro free{price}.{code}"


def _shell(eyebrow: str, title: str, inner: str, unsub_url: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#0A0A0F">
<div style="max-width:520px;margin:0 auto;padding:32px 22px;font-family:Inter,Arial,sans-serif;color:#F0F0F5">
  <p style="margin:0 0 6px;color:#E8FF47;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">{eyebrow}</p>
  <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-size:30px;line-height:1.1">{title}</h1>
  {inner}
  <p style="margin:0;color:#8888A0;font-size:12px;line-height:1.5">You're getting this because you joined the Victory AI waitlist.
    <a href="{html.escape(unsub_url)}" style="color:#8888A0">Unsubscribe</a>.</p>
</div></body></html>"""


P = '<p style="margin:0 0 18px;font-size:15px;line-height:1.5">'
BUTTON = ('<a href="{url}" style="display:inline-block;background:#E8FF47;color:#0A0A0F;font-weight:800;font-size:16px;'
          'text-decoration:none;padding:14px 26px;border-radius:999px;margin:0 0 20px">{label}</a>')


def _first(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0][:40] or "fighter"


def render(name: Optional[str], email: str, founder: bool, app_url: str, unsub_url: str,
           trial_days: int, founder_trial_days: int, app_store_url: Optional[str] = None,
           promo_code: Optional[str] = None, percent_off: Optional[float] = None) -> dict:
    first = _first(name)
    perk = founder_perk(founder, promo_code, percent_off, trial_days, founder_trial_days)
    perk += " Sign up before Season 2 and the Founding Fighter title is yours for good."
    store = (f'<p style="margin:0 0 18px;color:#8888A0;font-size:14px">On iPhone? '
             f'<a href="{html.escape(app_store_url)}" style="color:#E8FF47">Get the app</a>.</p>') if app_store_url else ""
    inner = f"""<p style="margin:0 0 18px;font-size:16px;line-height:1.5">We said 30 November, so here it is: Victory AI is open for you, a week before everyone else.</p>
  <div style="background:#12121A;border:1px solid #2A2A3A;border-radius:16px;padding:18px;margin:0 0 20px">
    <p style="margin:0 0 10px;font-weight:700;font-size:16px">Your first session is one round.</p>
    <p style="margin:0;color:#8888A0;font-size:15px;line-height:1.5">Prop your phone up, press start, and box. Your coach calls the combos and tells you one thing you did well.</p>
  </div>
  {BUTTON.format(url=html.escape(app_url), label="Start training")}
  {P}Sign up with <b>{html.escape(email)}</b>, so your waitlist perks find you.</p>
  {P}{html.escape(perk)}</p>
  {store}
  <p style="margin:0 0 26px;font-size:15px;line-height:1.5">Season 1 starts on 7 December. This week is your warm-up.</p>"""
    text = (f"You're in, {first}.\n\nWe said 30 November, so here it is: Victory AI is open for you, a week before everyone else.\n\n"
            f"Your first session is one round. Prop your phone up, press start, and box.\n\nStart training: {app_url}\n\n"
            f"Sign up with {email}, so your waitlist perks find you. {perk}\n\n"
            + (f"On iPhone? {app_store_url}\n\n" if app_store_url else "")
            + "Season 1 starts on 7 December. This week is your warm-up.\n\n"
            f"Unsubscribe: {unsub_url}\n")
    return {"subject": SUBJECT, "html": _shell("Early access", f"You're in, {html.escape(first)}.", inner, unsub_url), "text": text}


def render_welcome(name: Optional[str], email: str, founder: bool, unsub_url: str, trial_days: int,
                   founder_trial_days: int, promo_code: Optional[str] = None,
                   percent_off: Optional[float] = None, early_access: str = "30 November") -> dict:
    first = _first(name)
    perk = founder_perk(founder, promo_code, percent_off, trial_days, founder_trial_days)
    inner = f"""<p style="margin:0 0 18px;font-size:16px;line-height:1.5">Good call. On {early_access} we'll email you your early-access link, a week before everyone else.</p>
  <div style="background:#12121A;border:1px solid #2A2A3A;border-radius:16px;padding:18px;margin:0 0 20px">
    <p style="margin:0 0 10px;font-weight:700;font-size:16px">What you get</p>
    <p style="margin:0;color:#8888A0;font-size:15px;line-height:1.5">{html.escape(perk)} Sign up before Season 2 (18 January) and the Founding Fighter title is yours for good.</p>
  </div>
  {P}When it opens, sign up with <b>{html.escape(email)}</b> so your perks find you.</p>
  <p style="margin:0 0 26px;font-size:15px;line-height:1.5">Your first session will be one round with your AI coach. That's it.</p>"""
    text = (f"You're on the list, {first}.\n\nGood call. On {early_access} we'll email you your early-access link, a week before everyone else.\n\n"
            f"What you get: {perk} Sign up before Season 2 (18 January) and the Founding Fighter title is yours for good.\n\n"
            f"When it opens, sign up with {email} so your perks find you.\n\n"
            "Your first session will be one round with your AI coach. That's it.\n\n"
            f"Unsubscribe: {unsub_url}\n")
    return {"subject": WELCOME_SUBJECT,
            "html": _shell("Waitlist", f"You're on the list, {html.escape(first)}.", inner, unsub_url), "text": text}
