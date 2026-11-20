// The first-time walkthrough: a dimmed screen with a cutout around each real button.
// Goal: a new fighter finishes setup knowing exactly where their first round, their partner,
//   Train and help live, so the first session happens (activation) and they feel smart doing it.
// Psychology: pointing at the real button on the real screen builds a map of the app people
//   remember (learning in context beats a slideshow of pictures); short tours get finished
//   (people quit long ones); and steps in the order people will use them mean every step is
//   needed straight away.
// Design: the three rules from the brief, enforced in lib/walkthrough.test.js:
//   1. keep it short: at most 4 steps;
//   2. go in the order people actually use it: start the round first, help last;
//   3. only show it once there's something on screen: it waits until the first button is
//      drawn, and skips any step whose button isn't there.
// Skip sits next to Next on every step but the last, it shows once ever, and it replaces the first two Home tips.
import { tipContext, tipText } from "@/lib/coachMarks";
import { tx } from "@/i18n/tx";

export const MAX_STEPS = 4;
export const SEEN_KEY = "victory_walkthrough_done";
export const COVERS_TIPS = ["home_one_round", "home_partner"];

export function walkthroughSteps(user) {
  const ctx = tipContext(user);
  return [
    { target: "one-round", label: tx("lib.walkthrough.firstLabel", "First"), title: tx("lib.walkthrough.startHere", "Start here."),
      body: tx("lib.walkthrough.startBody", "One 3-minute round with {{partner}}. That's your whole first session.", { partner: ctx.partner }) },
    { target: "partner-condition", label: tx("lib.walkthrough.thenLabel", "Your partner"), title: tx("lib.walkthrough.meetPartner", "Meet {{partner}}.", { partner: ctx.partner }),
      body: tipText("home_partner", ctx) },
    { target: "nav-train", label: tx("lib.walkthrough.nextTimeLabel", "Next time"), title: tx("lib.walkthrough.trainTitle", "Every session starts here."),
      body: tx("lib.walkthrough.trainBody", "Pick your round, turn on video if you want a score, and press start.") },
    { target: "help-button", label: tx("lib.walkthrough.anytimeLabel", "Any time"), title: tx("lib.walkthrough.helpTitle", "Stuck? Ask here."),
      body: tx("lib.walkthrough.helpBody", "Ask Victory answers questions about the app, and can pass anything else to the team.") },
  ];
}

// Rule 3: nothing to point at yet means no walkthrough yet. Steps whose button isn't on
// screen are dropped, so we never point at empty space.
export function readySteps(steps, isPresent) {
  if (!steps.length || !isPresent(steps[0].target)) return null;
  return steps.filter((s) => isPresent(s.target)).slice(0, MAX_STEPS);
}

function storage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function walkthroughDone() {
  try { return !!storage()?.getItem(SEEN_KEY); } catch { return true; }
}

export function markWalkthroughDone() {
  try { storage()?.setItem(SEEN_KEY, "1"); } catch {}
}
