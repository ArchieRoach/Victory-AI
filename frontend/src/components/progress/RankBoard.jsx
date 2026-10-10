import { useEffect, useState } from "react";
import axios from "axios";
import { GraduationCap, Swords, Users } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { rankHeadline, resetCountdown } from "@/lib/progression";
import { BragButton } from "./BragButton";

// Goal: a board that motivates the middle of the pack, not just the top ten.
// Psychology: competition works with even matchups, rivals you care about and a fresh start;
//   it backfires while you're still learning or when you can't win.
// Design: friends first, then fighters at your level, everyone last; you sit in the middle
//   with the fighters just above and below; it resets every Monday; learning mode hides ranks.
const SCOPES = [["friends", "Friends"], ["similar", "My level"], ["global", "Everyone"]];
const PERIODS = [["week", "This week"], ["season", "Season"]];

export function RankBoard() {
  const [scope, setScope] = useState(null);
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    axios.get(`${API}/ranks`, { params: { scope: scope || undefined, period } })
      .then((r) => { setData(r.data); if (!scope) setScope(r.data.scope); })
      .catch(() => { setData({ rows: [] }); toast.error("Could not load ranks. Check your connection."); });
  }, [scope, period]);

  const setLearning = async (on) => {
    try {
      await axios.put(`${API}/progression/competition`, { learning_mode: on });
      setData((d) => ({ ...d, learning_mode: on }));
    } catch {
      toast.error("Couldn't change that, try again");
    }
  };

  if (data?.learning_mode) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6" data-testid="learning-mode">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <GraduationCap className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">Learning mode is on</p>
        <p className="text-victory-muted text-sm">While you learn the basics, you only race your own numbers. Ranks are there when you want them.</p>
        <button className="mt-4 victory-btn-primary w-auto px-6" onClick={() => setLearning(false)}>Show me the ranks</button>
      </div>
    );
  }

  const headline = rankHeadline(data);
  const myTop = data?.me && data.me.rank <= 3 && data.size > 3;
  return (
    <div className="space-y-3" data-testid="rank-board">
      <div className="flex gap-1.5 overflow-x-auto">
        {SCOPES.map(([key, label]) => (
          <button key={key} onClick={() => setScope(key)} className={`filter-pill ${scope === key ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {PERIODS.map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`text-[11px] font-heading font-bold px-3 min-h-[36px] rounded-full ${period === key ? "bg-victory-card-highlight text-victory-text" : "text-victory-muted"}`}>{label}</button>
          ))}
        </div>
        {data?.resets_at && period === "week" && <span className="text-[11px] text-victory-muted">{resetCountdown(data.resets_at)}</span>}
      </div>

      {!data ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton-shimmer h-14 rounded-lg" />)}</div>
      ) : scope === "friends" && data.friend_count === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-victory-lime/60" />
          </div>
          <p className="text-victory-text font-bold text-lg mb-1">No rivals yet</p>
          <p className="text-victory-muted text-sm">Follow fighters or join a squad, and they'll show up here. Beating people you know hits different.</p>
        </div>
      ) : (
        <>
          {headline && <p className="text-[12px] text-victory-teal flex items-center gap-1.5"><Swords className="w-3.5 h-3.5" /> {headline}</p>}
          <ol className="victory-card divide-y divide-victory-border">
            {data.rows.map((r) => (
              <li key={`${r.rank}-${r.name}-${r.points}`} className={`flex items-center gap-3 px-3 py-2.5 ${r.is_me ? "bg-victory-lime/5" : ""}`}>
                <span className={`font-mono font-bold w-8 text-center ${r.is_me ? "text-victory-lime" : "text-victory-muted"}`}>{r.rank}</span>
                {r.avatar ? <img src={r.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                  : <span className="w-8 h-8 rounded-full bg-victory-card-highlight" aria-hidden="true" />}
                <span className={`flex-1 truncate text-sm ${r.is_me ? "text-victory-text font-bold" : "text-victory-text"}`}>{r.name}</span>
                <span className={`font-mono font-bold ${r.is_me ? "text-victory-lime" : "text-victory-text"}`}>{r.points}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-victory-muted">{data.size} fighter{data.size === 1 ? "" : "s"} on this board{data.level ? ` · ${data.level}` : ""}</p>
          {myTop && <BragButton win={{ kind: "rank", rank: data.me.rank, board: scope === "friends" ? "among my friends" : scope === "similar" ? "at my level" : "on Victory AI" }} label="Share your rank" />}
          <button className="text-[11px] text-victory-muted underline min-h-[44px]" onClick={() => setLearning(true)}>Switch to learning mode (hide ranks)</button>
        </>
      )}
    </div>
  );
}

export function GroupBoard() {
  const [kind, setKind] = useState("squad");
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    axios.get(`${API}/ranks/groups`, { params: { kind } }).then((r) => setData(r.data)).catch(() => setData({ rows: [] }));
  }, [kind]);
  return (
    <div className="space-y-3" data-testid="group-board">
      <div className="flex gap-1.5">
        {[["squad", "Squads"], ["gym", "Gyms"]].map(([key, label]) => (
          <button key={key} onClick={() => setKind(key)} className={`filter-pill ${kind === key ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
        ))}
      </div>
      <p className="text-[11px] text-victory-muted">Every member's points this week, added together. {data?.resets_at && resetCountdown(data.resets_at)}</p>
      {!data ? <div className="skeleton-shimmer h-40 rounded-lg" /> : !data.rows.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-victory-lime/60" />
          </div>
          <p className="text-victory-text font-bold text-lg mb-1">{kind === "squad" ? "No squad yet" : "No gym yet"}</p>
          <p className="text-victory-muted text-sm">{kind === "squad" ? "Start a squad and your crew climbs together." : "Join a gym to fight for it on this board."}</p>
        </div>
      ) : (
        <>
          {data.gap_up && <p className="text-[12px] text-victory-teal">{data.gap_up} points between your {kind} and the next one up.</p>}
          <ol className="victory-card divide-y divide-victory-border">
            {data.rows.map((r) => (
              <li key={`${r.rank}-${r.name}`} className={`flex items-center gap-3 px-3 py-2.5 ${r.is_me ? "bg-victory-lime/5" : ""}`}>
                <span className={`font-mono font-bold w-8 text-center ${r.is_me ? "text-victory-lime" : "text-victory-muted"}`}>{r.rank}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block truncate text-sm ${r.is_me ? "font-bold text-victory-text" : "text-victory-text"}`}>{r.name}</span>
                  <span className="text-[10px] text-victory-muted">{r.members} member{r.members === 1 ? "" : "s"}</span>
                </span>
                <span className={`font-mono font-bold ${r.is_me ? "text-victory-lime" : "text-victory-text"}`}>{r.points}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
