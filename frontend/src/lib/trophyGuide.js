// What each thing on the trophy shelf is and how to earn it, in one short line each.
// Goal: people know what to chase next (visible progress).
// Psychology: a goal you can see and understand pulls harder than a surprise (goal gradient);
//   a trophy only feels like bragging rights if others can see what it took.
// Design: a folded "How to earn them" list on the shelf, and tapping any trophy shows its line.
import { tx } from "@/i18n/tx";

const GUIDE = [
  { key: "gloves", name: "Golden Gloves", how: "Train 20 hours the AI has seen in one season." },
  { key: "title", name: "Titles", how: "Train to level up. New titles unlock at set levels." },
  { key: "founder", name: "Founding Fighter", how: "Join before Season 2 starts on 22 February." },
  { key: "crown", name: "Crowns", how: "Top the week: Weekly No. 1 overall, or Squad Crown in your squad." },
  { key: "belt", name: "Belts", how: "Milestones like your first session, 10 sessions or a 7-day streak." },
  { key: "recruiter", name: "Recruiter badges", how: "Friends join from your invites: 1, 10 or 100." },
  { key: "treasure", name: "Treasures", how: "Given by other fighters: Respect, Heart or Sharp." },
  { key: "egg", name: "Hidden eggs", how: "Secret moments you find by training." },
  { key: "hours", name: "Proven hours", how: "Every hour the AI sees counts on the road to 10,000." },
];

const say = (g) => ({ ...g, name: tx(`lib.trophy.${g.key}.name`, g.name), how: tx(`lib.trophy.${g.key}.how`, g.how) });
export const trophyGuide = () => GUIDE.map(say);
export const trophyHow = (key) => trophyGuide().find((t) => t.key === key)?.how || "";
