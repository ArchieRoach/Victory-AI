import { useEffect, useState } from "react";
import axios from "axios";
import { Flame, BookOpen } from "lucide-react";
import { API } from "@/App";

// Fight for your gym: every member's proven hours this season add up. Reasoning in
// backend/server.py ("Fight for your gym").
export function GymSeasonHours({ gymId }) {
  const [g, setG] = useState(null);
  const [story, setStory] = useState(null);
  useEffect(() => {
    axios.get(`${API}/gyms/${gymId}/season-hours`).then((r) => {
      setG(r.data);
      if (r.data.is_member) axios.get(`${API}/gyms/${gymId}/season-story`).then((s) => setStory(s.data)).catch(() => {});
    }).catch(() => setG(false));
  }, [gymId]);
  if (!g) return null;
  return (
    <>
    {story?.ready && <SeasonStory s={story} />}
    <section className="victory-card p-4 space-y-2" data-testid="gym-season-hours">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Flame className="w-3 h-3" /> {g.preseason ? "Preseason" : `Season ${g.season}`}: fight for your gym</p>
        {g.rank && <span className="text-[11px] text-victory-muted">#<span className="font-mono text-victory-text">{g.rank}</span> of {g.of} gyms</span>}
      </div>
      <p className="text-victory-text text-sm"><span className="font-mono font-bold text-2xl text-victory-lime">{g.hours}</span> proven hours this season</p>
      {g.is_member && g.contributors.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {g.contributors.map((c, i) => (
            <li key={`${c.name}-${i}`} className={`text-[11px] px-2 py-1 rounded-full ${c.name === "You" ? "bg-victory-lime/15 text-victory-lime" : "bg-victory-card-highlight text-victory-text"}`}>
              {c.name} · <span className="font-mono">{c.hours}h</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-victory-muted">{g.is_member ? "Every round the AI scores from your video adds to this total." : "Only AI-verified training counts."}</p>
    </section>
    </>
  );
}

// Peak-end and epic meaning: when a season ends, the gym gets the story of what it fought for.
function SeasonStory({ s }) {
  return (
    <section className="victory-card p-4 space-y-2 border-victory-lime/30 bg-victory-lime/5" data-testid="season-story">
      <p className="section-label flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> Season {s.season}: the story of {s.gym}</p>
      <p className="text-victory-text text-sm">
        <span className="font-mono font-bold">{s.fighters}</span> fighters put in <span className="font-mono font-bold">{s.hours}</span> proven hours.
        That's about <span className="font-mono">{s.rounds.toLocaleString()}</span> three-minute rounds{s.rank ? <>, finishing <span className="font-mono">#{s.rank}</span> of the public gyms</> : null}.
      </p>
      {s.carried_by.length > 0 && (
        <p className="text-[12px] text-victory-muted">Carried by {s.carried_by.map((c) => `${c.name} (${c.hours}h)`).join(", ")}.</p>
      )}
    </section>
  );
}
