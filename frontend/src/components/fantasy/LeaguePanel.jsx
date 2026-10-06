import { ArrowUp, ArrowDown, Users } from "lucide-react";

// Goal: the reason to play with friends — where you stand, right now.
// Psychology: a small group you know (not a global table of strangers) makes rank changes
//   personal; movement arrows make each result feel like it changed something.
// Design: dense rows, your row lime-highlighted, ties share a rank. Bragging rights only —
//   no prizes, no tokens, nothing of value changes hands.
export function LeaguePanel({ league, movement }) {
  if (!league.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">No league yet</p>
        <p className="text-victory-muted text-sm">Lock in a stable and your squad shows up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="fantasy-league">
      <p className="section-label mb-2">Friends league</p>
      {league.map((m) => {
        const move = movement[m.user_id];
        return (
          <div
            key={m.user_id}
            className={`victory-card px-3 py-2 flex items-center gap-3 ${m.isMe ? "border-victory-lime/40 bg-victory-lime/5" : ""}`}
          >
            <span className={`font-mono font-bold w-6 text-center ${m.rank === 1 ? "text-victory-lime" : "text-victory-muted"}`}>{m.rank}</span>
            <div className="flex-1 min-w-0">
              <p className="text-victory-text text-sm font-semibold truncate">{m.isMe ? `${m.name} (you)` : m.name}</p>
              <p className="text-victory-muted text-[10px] truncate">
                {m.breakdown.map((b) => b.fighter?.name.split(" ").slice(-1)[0]).join(" · ")}
              </p>
            </div>
            {move ? (
              <span className={`flex items-center text-[10px] font-mono font-bold ${move > 0 ? "text-victory-lime" : "text-victory-danger"}`}>
                {move > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{Math.abs(move)}
              </span>
            ) : null}
            <span className="font-mono font-bold text-victory-text w-10 text-right">{m.total}</span>
          </div>
        );
      })}
    </div>
  );
}
