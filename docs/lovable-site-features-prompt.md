# Lovable prompt: make the waitlist site match the app (October 2026)

Paste everything below the line into Lovable. The pricing prompt (`lovable-waitlist-prompt.md`) should
already be in; this one doesn't touch prices.

---

Please update the Victory AI waitlist site so it describes what the app actually does now. Keep the
existing design, colours, fonts and layout. Keep every live price and the founder-spots counter exactly as
they work today. The backend base URL is `https://victory-ai-backend-production.up.railway.app`.

## Rules for every change
- Only say what's true. Every feature below is built and live. Don't add features, numbers or results
  that aren't listed here.
- No fake urgency. The only countdown is the real launch date from the API (section 1).
- No "invite your friends" or "share to skip the queue" prompts anywhere on the signup flow.
- Prices stay in £ and stay driven by `/api/pricing`, as they are now.
- Plain, friendly words for 13–24 year-olds. Short sentences. No jargon.

## 1. Launch countdown (real data only)
`GET /api/waitlist/stats` now also returns:
```json
{ "limit": 1000, "claimed": 0, "remaining": 1000,
  "launch": { "date": "2026-12-07", "days_to_go": 55, "launched": false } }
```
- In the hero, under the main headline, show: "Season 1 starts 7 December · {days_to_go} days to go".
  Format the date from `launch.date` (don't type it in).
- When `launch.launched` is true, show "Season 1 is live" instead, and change the main button to
  "Get the app".
- If the request fails, hide the line. Never show a made-up number.

## 2. Replace the features section with "What's inside"
Use the existing card style. One short title and one sentence each:

1. **An AI corner in your pocket.** Film a round on your phone and the AI scores your technique, then
   coaches you between rounds.
2. **Live Coach.** Counts your punches, combos and guard as you go. It runs on your phone, so nothing is
   uploaded.
3. **Combo calls that keep up with you.** Your coach shouts combos by number. Land them and they get
   harder; miss a few and they ease off.
4. **A training partner who trains with you.** Build your own AI partner. Train and they stay sharp;
   stop and they end up on the couch. One session brings them back.
5. **Crews and missions.** Your crew votes on a mission each week, cheers each other on and reacts to
   each other's wins with stamps.
6. **Boss Round.** One tough round every week, set by your own best. Three tries to beat it.
7. **Seasons and the Golden Gloves.** Six-week seasons with ranks. Earn the Golden Gloves with 20 hours
   of AI-verified training. Every season ends with your own Season Wrapped.
8. **Your week, your way.** Pick 2, 3 or 4 sessions a week and when you'd like a reminder. Short on time?
   "Just one round" takes three minutes.

## 3. Add a "Your first week" section (three steps)
Place it after "What's inside":
1. **One round.** Your first session is one round with your partner. That's it.
2. **Unlock as you train.** New tools arrive one at a time: pick your week after your first session,
   combo calls and crews after your second, and the Boss Round after your fifth.
3. **Your first win.** Your coach tells you your strongest area, from what the AI actually saw.

## 4. Add a "Safe for teens" section
A simple list with a shield icon:
- High-privacy settings for under-18s by default.
- No private messages. Crews react with stamps, not chat, and live-stream chat is filtered.
- Nothing random is ever sold. Surprises are earned by training, and the odds are shown.
- No reminders after 8pm for under-18s.
- Live Coach runs on your phone and uploads nothing. Videos you record stay private unless you share them.
- Download everything you've built, any time.

## 5. Add a "For gyms" section
- Title: "Bring Victory AI to your gym."
- Points:
  - "Print a check-in poster. Members scan it at the gym and their verified training that day counts
    double for your gym's season total."
  - "Your gym is ranked against other gyms each season."
  - "Coaches can mentor members and leave them notes."
- Button: use the site's existing contact link or email. Don't invent a new address.

## 6. Founding Fighter
Under the founder-pricing lines, add: "Join before Season 2 starts on 18 January 2027 and you'll carry
the Founding Fighter title for good." This is a real cut-off; don't add a countdown for it.

## 7. FAQ: add these questions
- **Do I need a gym?** No. You can train anywhere with your phone. If your gym has a Victory AI poster,
  check in there too.
- **Is my video uploaded?** Live Coach runs on your phone and uploads nothing. If you turn on video
  scoring, your round is uploaded so the AI can score it, and it stays private unless you share it.
- **What's Season Wrapped?** At the end of each season you get a short story of your season: how often
  you trained, how much you improved, your crew's best moment and the fighter you became.
- **Is it safe for under-18s?** Yes. See "Safe for teens" above.
- **What does it cost?** Use the existing live pricing text.

## 8. Check before publishing
- The countdown reads the API and hides on error. Search the source for a typed number of days and
  remove it.
- No "invite friends" or "share" prompt appears before or after signup.
- Every price still comes from `/api/pricing` and shows £.
- The page works at phone width with no sideways scrolling.
