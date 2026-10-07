"""Self-check for the fantasy automation: cosmetics via Stripe, trusted promoters, results
reminders and auto-close, and the weekly admin digest. Stripe and email are mocked:

    MONGO_URL=x DB_NAME=t python3 backend/test_fantasy_automation.py
"""
import asyncio
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
run = asyncio.get_event_loop().run_until_complete
ADMIN = {"user_id": "admin", "email": "archieroach2013@gmail.com", "name": "Admin"}
ADULT = {"user_id": "u1", "email": "a@x.co", "name": "Adam", "birth_date": "2000-01-01"}
TEEN = {"user_id": "t1", "email": "t@x.co", "name": "Tia", "birth_date": "2012-01-01"}
CURRENT = {"user": ADULT}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
admin_emails, sent, pushes, sessions = [], [], [], {}
TODAY = date(2026, 10, 12)  # a Monday
server._uk_today = lambda: TODAY


async def fake_admin_email(subject, rows, reply_to=None):
    admin_emails.append((subject, rows))


async def fake_send(to, subject, html_body, reply_to=None):
    sent.append((to, subject, html_body))


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append(user_id)


async def no_flags(text):
    return False


async def no_squad(uid):
    return []


server._email_fantasy_admin = fake_admin_email
server._send_email = fake_send
server._send_push = fake_push
server.is_content_flagged = no_flags
server._squad_mate_ids = no_squad


class FakeSession:
    @staticmethod
    def create(**kw):
        sid = f"cs_{len(sessions) + 1}"
        sessions[sid] = {"id": sid, "metadata": kw["metadata"], "payment_status": "unpaid", "customer_email": kw.get("customer_email")}
        return SimpleNamespace(id=sid, url=f"https://checkout.stripe.test/{sid}")

    @staticmethod
    def retrieve(sid):
        return sessions[sid]


server.stripe_lib = SimpleNamespace(checkout=SimpleNamespace(Session=FakeSession),
                                    Webhook=SimpleNamespace(construct_event=lambda body, sig, secret: __import__("json").loads(body)))
server.STRIPE_WEBHOOK_SECRET = "whsec_test"
run(server.db.users.insert_many([dict(ADULT), dict(TEEN), dict(ADMIN)]))


def as_user(u):
    CURRENT["user"] = run(server.db.users.find_one({"user_id": u["user_id"]}, {"_id": 0}))


def test_cosmetic_checkout_then_webhook_switches_it_on():
    as_user(ADULT)
    r = client.post("/api/fantasy/cosmetics/gold_gloves/checkout", json={"origin_url": "https://victory-ai-alpha.vercel.app"}).json()
    assert r["checkout_url"].startswith("https://checkout.stripe.test/") and not r["for_parent"]
    sid = r["checkout_url"].rsplit("/", 1)[-1]
    assert sessions[sid]["metadata"] == {"purchase_type": "fantasy_cosmetic", "user_id": "u1", "cosmetic_id": "gold_gloves"}
    event = {"type": "checkout.session.completed", "data": {"object": {**sessions[sid], "payment_status": "paid"}}}
    assert client.post("/api/webhook/stripe", content=__import__("json").dumps(event), headers={"stripe-signature": "x"}).status_code == 200
    owned = run(server.db.users.find_one({"user_id": "u1"}))["fantasy_cosmetics"]
    assert owned == ["gold_gloves"]
    assert client.post("/api/fantasy/cosmetics/gold_gloves/checkout", json={}).status_code == 400, "can't buy twice"


def test_unpaid_webhook_grants_nothing_and_confirm_is_owner_only():
    as_user(ADULT)
    sid = client.post("/api/fantasy/cosmetics/title_belt/checkout", json={}).json()["checkout_url"].rsplit("/", 1)[-1]
    event = {"type": "checkout.session.completed", "data": {"object": sessions[sid]}}
    client.post("/api/webhook/stripe", content=__import__("json").dumps(event), headers={"stripe-signature": "x"})
    assert "title_belt" not in run(server.db.users.find_one({"user_id": "u1"}))["fantasy_cosmetics"]
    assert client.get("/api/fantasy/cosmetics/confirm", params={"session_id": sid}).json() == {"paid": False}
    sessions[sid]["payment_status"] = "paid"
    as_user(TEEN)
    assert client.get("/api/fantasy/cosmetics/confirm", params={"session_id": sid}).status_code == 404
    as_user(ADULT)
    assert client.get("/api/fantasy/cosmetics/confirm", params={"session_id": sid}).json()["paid"]
    assert "title_belt" in run(server.db.users.find_one({"user_id": "u1"}))["fantasy_cosmetics"]


def test_under_18s_get_a_link_for_a_parent():
    as_user(TEEN)
    r = client.post("/api/fantasy/cosmetics/corner_red/checkout", json={}).json()
    sid = r["checkout_url"].rsplit("/", 1)[-1]
    assert r["for_parent"] and sessions[sid]["customer_email"] is None, "the teen's email isn't pre-filled for payment"


PROMO = {"kind": "promoter", "name": "Pat", "company": "North Box", "email": "Pat@NB.co", "event_name": "Bolton Night",
         "card": {"date": "2026-10-10", "location": "Bolton, England", "bouts": [
             {"scheduled_rounds": 6, "fighters": [{"name": "Lee", "wins": 8}, {"name": "Kay", "wins": 3, "losses": 5}]}]}}


def test_first_card_waits_for_approval_then_the_promoter_is_trusted():
    as_user(ADULT)
    r = client.post("/api/fantasy/enquiries", json=PROMO).json()
    assert r["card_submitted"] and not r.get("published")
    draft = run(server.db.fantasy_cards.find_one({"source": "promoter"}, {"_id": 0}))
    as_user(ADMIN)
    links = client.post(f"/api/admin/fantasy/cards/{draft['card_id']}/publish").json()
    assert "promoter=" in links["submit_link"] and sent[-1][0].lower() == "pat@nb.co" and "promoter link" in sent[-1][2]
    key = links["submit_link"].split("promoter=")[1]
    as_user(ADULT)
    second = client.post("/api/fantasy/enquiries", json={**PROMO, "event_name": "Bolton Night 2", "promoter_key": key}).json()
    assert second["published"], "a trusted promoter's card goes live straight away"
    live = run(server.db.fantasy_cards.find_one({"title": "Bolton Night 2"}))
    assert not live["hidden"] and any("Auto-published" in e[0] for e in admin_emails)
    fake = client.post("/api/fantasy/enquiries", json={**PROMO, "event_name": "Fake", "promoter_key": "guess"}).json()
    assert not fake.get("published"), "a wrong key just waits for approval"


def test_missing_results_get_a_reminder_then_close_as_no_result():
    global TODAY
    card = run(server.db.fantasy_cards.find_one({"title": "Bolton Night"}, {"_id": 0}))
    TODAY = date(2026, 10, 11)
    sent.clear()
    out = run(server.run_fantasy_ops(TODAY))
    assert out["reminded"] >= 1 and any("Results needed" in s[1] for s in sent)
    assert run(server.run_fantasy_ops(TODAY))["reminded"] == 0, "one reminder per card"
    TODAY = date(2026, 10, 13)
    out = run(server.run_fantasy_ops(TODAY))
    closed = run(server.db.fantasy_cards.find_one({"card_id": card["card_id"]}, {"_id": 0}))
    assert out["closed_bouts"] >= 1 and closed["status"] == "complete"
    assert closed["bouts"][0]["result"]["method"] == "VOID"
    assert server.fx.stable_score([closed["bouts"][0]["fighters"][0]["fighter_id"]], closed) == 0


def test_unreported_amateur_fight_closes_after_a_week():
    global TODAY
    TODAY = date(2026, 10, 1)
    as_user(ADULT)
    f = client.post("/api/amateur/fights", json={"date": "2026-10-02", "event_name": "Club Show", "opponent_name": "Ben"}).json()
    TODAY = date(2026, 10, 10)
    assert run(server.run_fantasy_ops(TODAY))["amateur_closed"] == 1
    card = run(server.db.fantasy_cards.find_one({"card_id": f["card_id"]}, {"_id": 0}))
    assert card["status"] == "complete" and card["bouts"][0]["result"]["method"] == "VOID"
    as_user(ADULT)
    client.post(f"/api/amateur/fights/{f['fight_id']}/result", json={"outcome": "win", "method": "UD"})
    card = run(server.db.fantasy_cards.find_one({"card_id": f["card_id"]}, {"_id": 0}))
    assert card["bouts"][0]["result"]["method"] == "UD", "a late real result replaces 'no result'"


def test_weekly_digest_lists_only_what_needs_a_person_once_a_week():
    admin_emails.clear()
    as_user(ADULT)
    client.post("/api/fantasy/enquiries", json={"kind": "sponsor", "name": "Sam", "company": "Gloves Ltd", "email": "s@g.co", "halal_confirmed": True})
    monday = datetime(2026, 10, 19, 9, 30, tzinfo=server.UK_TZ)
    assert not run(server.send_weekly_digest(monday.replace(hour=8))), "not before 9am"
    assert run(server.send_weekly_digest(monday))
    subject, rows = admin_emails[-1]
    assert subject == "Your weekly to-do" and "Gloves Ltd" in rows["Deal enquiries to answer"]
    assert not run(server.send_weekly_digest(monday)), "once a week"
    assert not run(server.send_weekly_digest(monday + timedelta(days=1))), "Mondays only"
    as_user(ADMIN)
    for e in client.get("/api/admin/fantasy/enquiries").json():
        if e.get("enquiry_id"):
            client.post(f"/api/admin/fantasy/enquiries/{e['enquiry_id']}/done")
    rows = run(server.build_admin_digest())
    assert "Deal enquiries to answer" not in rows


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
