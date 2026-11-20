import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Trophy, Users, Compass, Skull, ChevronRight } from "lucide-react";
import { API } from "@/App";
import { rankHeadline } from "@/lib/progression";
import { orderCards, readTaps, recordTap, resetTaps } from "@/lib/homeOrder";
import { isUnlocked } from "@/lib/unlocks";
import { tx } from "@/i18n/tx";

// Ordered by what this fighter actually taps (reasoning in lib/homeOrder.js).
export function DriveCards({ unlocks }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(() => orderCards(readTaps()));
  const [ranks, setRanks] = useState(null);
  const [quest, setQuest] = useState(null);
  const [boss, setBoss] = useState(null);

  useEffect(() => {
    axios.get(`${API}/ranks`, { params: { period: "week" } }).then((r) => setRanks(r.data)).catch(() => {});
    axios.get(`${API}/quests/mine`).then((r) => setQuest(r.data.quests?.[0] || null)).catch(() => {});
    axios.get(`${API}/boss`).then((r) => setBoss(r.data)).catch(() => {});
  }, []);

  const go = (card, path) => { recordTap(card); navigate(path); };
  const reset = () => { resetTaps(); setOrder(orderCards({})); };

  const cards = {
    compete: {
      icon: Trophy, get title() { return tx("ui.driveCards.yourRank", "Your rank"); }, path: "/leaderboard?tab=ranks",
      line: (ranks && rankHeadline(ranks)) || "See where you stand this week.",
    },
    crew: {
      icon: Users, title: quest ? quest.name : "Your squad", path: quest ? "/leaderboard?tab=quests" : "/squads",
      line: quest ? (quest.completed ? "Mission done. Pick your booster." : `${quest.progress}/${quest.target} on this week's mission`) : "Missions are better with a squad.",
    },
    explore: isUnlocked(unlocks, "boss") && boss && !boss.beaten && boss.attempts_left > 0
      ? { icon: Skull, get title() { return tx("ui.driveCards.boss", "Boss: {{name}}", { name: boss.name }); }, path: "/train?mode=boss", get line() { return tx("ui.driveCards.triesLeft", "{{line}}. {{attempts_left}} tries left.", { line: boss.target.line, attempts_left: boss.attempts_left }); } }
      : isUnlocked(unlocks, "round_types")
        ? { icon: Compass, get title() { return tx("ui.driveCards.trySomethingNew", "Try something new"); }, path: "/train?mode=freestyle", get line() { return tx("ui.driveCards.aFreestyleRoundNo", "A freestyle round: no score, just you and your music."); } }
        : { icon: Compass, get title() { return tx("ui.driveCards.buildACombination", "Build a combination"); }, path: "/combos", get line() { return tx("ui.driveCards.putYourOwnCombo", "Put your own combo together and drill it."); } },
  };

  return (
    <section className="space-y-2" data-testid="drive-cards">
      {order.map((key) => {
        const c = cards[key];
        const Icon = c.icon;
        return (
          <button key={key} data-card={key} onClick={() => go(key, c.path)}
            className="victory-card w-full p-3 flex items-center gap-3 text-left min-h-[56px]">
            <Icon className="w-5 h-5 text-victory-lime flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-victory-text text-sm font-semibold truncate">{c.title}</span>
              <span className="block text-[12px] text-victory-muted">{c.line}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-victory-muted flex-shrink-0" />
          </button>
        );
      })}
      <button onClick={reset} className="text-[11px] text-victory-muted min-h-[44px] w-full text-right">{tx("ui.driveCards.resetMyHome", "Reset my Home")}</button>
    </section>
  );
}
