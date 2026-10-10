import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Trophy, Compass, Users2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { LevelCard } from "@/components/progress/LevelCard";
import { RankBoard, GroupBoard } from "@/components/progress/RankBoard";
import { QuestList } from "@/components/progress/QuestCard";
import { MentorPanel } from "@/components/progress/MentorPanel";
import { GoldenGloves } from "@/components/progress/GoldenGloves";

// Goal: one place to watch yourself grow: level, ranks, your crew's quest and your mentors.
// Psychology: monitoring attachment (people keep checking on something they own that's
//   growing), the Alfred effect (a plan built from your own data) and "everyone like you"
//   social norms, which only appear when the sample is real.
// Design: your level and next unlock on top, a personal next step, then four tabs.
const TABS = [["ranks", "Ranks"], ["crews", "Crews"], ["quests", "Quests"], ["mentors", "Mentors"]];

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "ranks";
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    axios.get(`${API}/progression/me`).then((r) => setProgress(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="leaderboard-page">
      <header className="p-4 border-b border-victory-border">
        <h1 className="text-xl font-heading font-extrabold text-victory-text flex items-center gap-2">
          <Trophy className="w-5 h-5 text-victory-lime" />
          {t("leaderboard.title")}
        </h1>
        <p className="text-victory-muted text-sm">Status only goes up. Ranks reset every Monday.</p>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <LevelCard p={progress} />
        <GoldenGloves />
        <ForYou p={progress} />

        <div className="flex gap-1.5 overflow-x-auto" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key }, { replace: true })}
              className={`filter-pill ${tab === key ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
          ))}
        </div>

        {tab === "ranks" && <RankBoard />}
        {tab === "crews" && <GroupBoard />}
        {tab === "quests" && <QuestList />}
        {tab === "mentors" && <MentorPanel />}
      </main>

      <BottomNav />
    </div>
  );
}

function ForYou({ p }) {
  const f = p?.for_you;
  if (!f) return null;
  return (
    <section className="victory-card p-4 space-y-2" data-testid="for-you">
      <p className="section-label flex items-center gap-1.5"><Compass className="w-3 h-3" /> Your next step</p>
      <p className="text-victory-text text-sm">{f.line}</p>
      {f.mentor_note && (
        <p className="text-[12px] text-victory-teal">{f.mentor_note.mentor_name.split(" ")[0]}: “{f.mentor_note.text}”</p>
      )}
      {p.peers && (
        <p className="text-[12px] text-victory-muted flex items-start gap-1.5 pt-1 border-t border-victory-border">
          <Users2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{p.peers.text} You're on <span className="font-mono text-victory-text">{p.peers.mine_per_week}</span>.</span>
        </p>
      )}
    </section>
  );
}
