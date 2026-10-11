// Guards the invite rule (CLAUDE.md): never ask people to invite friends during onboarding.
// They don't know yet if they like the app, and the prompt delays their first win.
import fs from "fs";
import path from "path";

test("onboarding never asks for invites, contacts or shares", () => {
  const src = fs.readFileSync(path.join(__dirname, "../pages/OnboardingFlow.jsx"), "utf8");
  expect(src).not.toMatch(/squads\/invites|contacts\/find-matches|pickContactEmailHashes|navigator\.share|ShareSheet|invite your friends/i);
});
