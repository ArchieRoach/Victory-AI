# /mockup-app-skill

Generate a quick visual mockup of an app screen for: $ARGUMENTS

1. Read `DESIGN.md` first — use its tokens, components, and patterns exactly (colors, spacing,
   buttons, cards, empty states, page header/shell). Never invent new colors or fall back to
   generic Tailwind defaults.
2. Render the mockup as a single self-contained HTML file (inline CSS using the `victory-*` hex
   values from `DESIGN.md`) and publish it with the Artifact tool so it's viewable in the browser.
3. It's a static visual mockup, not a working page — no real data fetching or routing. Use
   realistic placeholder content instead of lorem ipsum.
4. Match the mobile-first frame: `max-width: 32rem` centered, dark `victory-bg` background,
   bottom nav bar if the screen is a primary tab (Home/Train/Feed/Profile/etc).

Output: one Artifact link. Don't dump the markup in chat.
