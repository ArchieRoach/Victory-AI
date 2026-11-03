# Lovable prompt: make victoryai.co.uk short and simple

Paste everything below the line into Lovable (Chat mode off, so it edits). The test: a 7-year-old
should know what the app is within 20 seconds. Anything that doesn't help with that is cut. Words
and looks match the app as it is now (squads, combo calls in words, the workout timer, weekly
streaks).

---

Please rebuild the Victory AI waitlist home page so it is **much shorter and simpler**. Today it is
about 17,000px tall on a phone with 20 sections. The new page should be **6 short sections**. Use plain
words a child would understand. Keep the existing waitlist form logic, legal pages, routes and backend
calls. Only change the layout and copy as described here.

## Match the app's look exactly
- Background `#0A0A0F`, cards `#12121A`, raised surfaces/inputs `#1A1A26`, borders `#2A2A3A`.
- Text `#F0F0F5`, secondary text `#8888A0`. Main accent lime `#E8FF47`, second accent teal `#47E8C8`.
- Headings use **Space Grotesk** (extra bold, tight letter spacing). Body uses **Inter**. Numbers and
  prices use **JetBrains Mono** (bold).
- **One** lime button per screen. Use solid lime with dark text, not a gradient. Corners are rounded,
  and cards have a 1px border.
- No emoji as icons. Use simple line icons (lucide).
- Mobile first, content max width about 512px on phones.

## Words rule
- Friend groups are always a **squad** ("your squad"), never "crew". Replace every "crew" on the site.
- No jargon. Write "AI coach", not "AI-powered coaching platform". Short sentences.

## The new page, top to bottom

### 1. Top bar
Logo on the left, one lime button on the right: **"Join free"**. It scrolls to the form.

### 2. Hero
- Headline: **"Your AI boxing coach."**
- Line under it: **"Film a round on your phone. Your coach counts your punches, calls your combos
  and tells you what to fix."**
- Lime button: **"Join the waitlist, it's free"**. It scrolls to the form.
- Small line under the button: **"Waitlist gets in on 30 November, a week before everyone else."**
- Remove the separate Season 1 countdown card at the very top, and remove "The Home of Modern Boxing".
- Founder counter badge: only show `{claimed} / {limit} spots claimed` from `GET /api/waitlist/stats`
  when `claimed` is **100 or more**. Below that, show the badge as **"Early access"** with no number.
  Never show "0 / 1,000".

### 3. How it works (3 steps, one short line each)
1. **Film a round.** Prop your phone up and box.
2. **Hear your coach.** It shouts combos like "Jab, cross, hook" and counts every punch.
3. **Get better every week.** Keep your streak, rank up with your squad, and see your progress.

### 4. What's inside (4 cards, max 12 words each)
- **AI coach.** Sees your punches, guard and combos as you go.
- **Workout timer.** Bag, pads, circuits and HIIT, with your camera on.
- **Your squad.** Train with friends, keep a weekly streak together.
- **Seasons and the Golden Gloves.** Six-week seasons, ranks and one prize you earn.

### 5. Price (one simple block)
- Two columns: **Free** ("Train, stream and join the community") and **Pro** ("Unlimited AI coaching,
  no ads").
- Pro price comes from `GET /api/pricing` (`plans.monthly.price`, `plans.annual.price`,
  `trial_days`, `founder_trial_days`). Today that's **£7.99/month or £59.99/year**, a **14-day free
  trial**, and a **30-day trial for waitlist members**. Never type prices into the page.
- One line: **"No card needed to start."**
- Remove the "Founder places are gone" line. It's wrong (the founder spots are still open). Only show
  it when `/api/waitlist/stats` says `remaining` is `0`.

### 6. Join the waitlist (the form)
- Heading: **"Join free"**.
- Three short perks with tick icons:
  - "Get in a week early (30 November)"
  - "30 days of Pro free"
  - "Keep the Founding Fighter title forever"
- Fields: **First name** and **Email** only. Remove the WhatsApp field.
- Button: **"Join the waitlist"**.
- After success: **"You're in! We'll email your early-access link before 30 November."**
- On an error, show the server's message (the `detail` field of the JSON response) if there is one,
  otherwise "Couldn't join just now. Please try again in a minute." On HTTP 429, say "Too many tries.
  Wait a minute and try again."
- Under the form, one small line: **"Safe for teens: private by default, no private messages, nothing
  random for sale."**

### Footer
Keep the email, Privacy Policy, Terms of Service and Data Deletion links. Remove the long mission
sentence.

## Remove completely
- "Straight from the community" (the TikTok/YouTube comment quotes)
- The TikTok/YouTube follower-count strip
- "Why join the waitlist now" (its three perks now live in the form, see section 6)
- "Why Victory exists / From the gym to your corner"
- "More than an AI tool / A growing boxing platform"
- "Built for Every Boxer"
- "Your path forward. Round by round." (replaced by section 3)
- "Fantasy Boxing League, coming soon"
- "What's inside", the long version with 8+ features (replaced by section 4)
- "Your first week"
- "Safe for teens" as a full section (now one line under the form)
- "Bring Victory AI to your gym"
- "What's free. What's Pro." (merged into section 5)
- The FAQ
- The "What kind of fighter are you?" style quiz banner (keep its page and route, just remove the banner
  from the home page)

## Check before you finish
- On a 390px-wide phone the hero's headline, line and button all fit on the first screen without
  scrolling.
- The word "crew" appears nowhere on the site.
- No hard-coded prices or spot counts.
- The form posts to `https://victory-ai-backend-production.up.railway.app/api/waitlist/signup`
  exactly as today, with `{ name, email }`.
