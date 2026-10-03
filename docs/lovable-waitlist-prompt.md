# Lovable prompt — victoryai.co.uk waitlist fixes

Paste everything below the line into Lovable. It relies on the backend endpoints added in the
`feature/gbp-pricing-founder-cap` PR, so merge and deploy that first.

---

Please make these changes to the Victory AI waitlist site. The backend base URL is
`https://victory-ai-backend-production.up.railway.app` (the signup form already posts to
`/api/waitlist/signup` on it). Keep the existing design, layout and copy style. Only change what's listed.

## 1. Fix the broken Terms of Service link
The footer link `/terms-of-service` shows the 404 page. Add a `/terms-of-service` route with a
Terms of Service page styled like the existing Privacy Policy and Data Deletion pages. Until we
supply the full text, make that route redirect to `https://victory-ai-alpha.vercel.app/terms`.

## 2. Show real founder spots, not hard-coded numbers
"437 / 1,000 spots claimed" (hero badge and waitlist section) and "Only 563 spots left" are typed into
the page. Replace all three with live data:

- `GET /api/waitlist/stats` returns `{ "limit": 1000, "claimed": 512, "remaining": 488 }`.
- Fetch it once on page load (React Query is fine, 60-second stale time). Render
  `{claimed} / {limit} spots claimed` and `Only {remaining} spots left for founding Pro pricing`, formatted
  with thousands separators (`toLocaleString()`).
- While loading, or if the request fails, **hide the numbers** (show the badge as "Early access" with no
  count). Never show a made-up number.
- When `remaining` is `0`, change the copy to "Founding spots are full — Pro is £3.99/month" (use the live
  price from section 3), hide the "lock in founding pricing" lines and the 40% FAQ's "you're early" angle,
  and keep "Join free" (the free tier is open to everyone).

After a successful signup, the response now includes
`{ "founder": true | false, "promo_code": string | null, "founder_spots": { ...same as stats } }`.

- Update the counter from `founder_spots` without a reload.
- If `founder` is `false` (the 1,000 are gone), show: "You're on the list. Founding pricing has run out,
  but the free tier is yours — we'll email your early-access link." instead of the founding-community
  message.

## 3. Make every price match Stripe, in the visitor's currency
Pro is sold in **GBP** in Stripe: **£3.99/month** and **£24.99/year**, with a **40% off forever** founder
coupon (**£2.39/month**, **£14.99/year**). The site currently shows $5, $25, "Save 58%", "~$0.48/week" and
"$0", which are all wrong. Remove every hard-coded price, saving and currency symbol and drive them from:

`GET /api/pricing` returns:
```json
{
  "currency": "GBP",
  "plans": {
    "monthly": { "price": 3.99, "interval": "month" },
    "annual":  { "price": 24.99, "interval": "year", "saving_percent": 48 }
  },
  "trial_days": 14,
  "founder_trial_days": 30,
  "founder": { "percent_off": 40, "lifetime": true, "monthly": 2.39, "annual": 14.99 },
  "founder_spots": { "limit": 1000, "claimed": 512, "remaining": 488 },
  "fx": { "rates": { "USD": 1.32, "EUR": 1.18, "...": 0 }, "updated": "…", "source": "https://www.exchangerate-api.com" }
}
```
(`founder` can be `null` and `fx` can be `null`; handle both.)

**Visitor currency**
- Detect it in the browser: take the region from `navigator.languages` (e.g. `en-US` → `US`,
  `de-DE` → `DE`), falling back to the time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`,
  e.g. `America/` → US). Map the region to its currency with a small country→currency table
  (US→USD, CA→CAD, AU→AUD, NZ→NZD, IE/DE/FR/ES/IT/NL/PT/BE/AT/FI→EUR, IN→INR, JP→JPY, and so on).
- Default to GBP for GB, an unknown region, or a currency missing from `fx.rates`.
- Add a small currency switcher (GBP, USD, EUR, plus the detected currency) next to the pricing toggle,
  so a visitor can override it. Remember the choice in `localStorage`.

**Conversion and display**
- `local = gbpAmount * fx.rates[CUR]`, formatted with
  `new Intl.NumberFormat(navigator.language, { style: "currency", currency: CUR })`. That handles symbols,
  decimal commas and zero-decimal currencies like JPY.
- For non-GBP visitors, show the converted price as the main number, with the real charge underneath in
  small text:
  - "≈ US$5.27/month"
  - "Billed as £3.99/month. Your bank converts it, so the final amount can differ slightly."
- GBP visitors see just "£3.99/month".
- Apply the same rule everywhere a price appears:
  - the hero "AI features from …" line;
  - the Monthly and Annual cards: price, "~£0.48/week" (annual ÷ 52), and "Save {saving_percent}%"
    computed from the API, never hard-coded;
  - the Free card: "Free" (or the local zero, e.g. "£0" or "$0" in the visitor's currency);
  - the founder lines and the FAQ "Why {percent_off}% off Pro for life?";
  - when `founder` is present and spots remain, the founder price next to the struck-through regular
    price on both Pro cards: "£2.39/month ~~£3.99~~ for founding members".
- Add a tiny attribution under the pricing ("Exchange rates by Exchange Rate API" linking to
  `fx.source`). Their free tier requires it.
- If `/api/pricing` fails, fall back to the GBP values above so the page never shows a blank price.

**Trial length:** the cards say "Start 14-Day Free Trial" and the form says "30-day Pro trial", which
contradict each other. Use the API values:
- Plan card buttons: "Start free trial".
- Under the cards: "Founding members get a {founder_trial_days}-day free trial. Everyone else gets
  {trial_days} days."
- Form button: keep "Get free early access + {founder_trial_days}-day Pro trial" while founder spots
  remain. When they're gone, use "Get free early access".

## 4. Check before publishing
- No `$` or hard-coded price remains anywhere in the source (search for `$5`, `$25`, `58%`, `0.48`, `437`,
  `563`).
- Load the page with the browser language set to en-US, de-DE and en-GB, and check USD, EUR and GBP
  render correctly.
- The Terms link no longer 404s.
- Submit the form once: the counter goes up by one and the right success message shows.
