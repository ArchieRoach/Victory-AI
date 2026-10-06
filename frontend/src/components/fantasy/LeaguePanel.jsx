import { ArrowUp, ArrowDown, Users, Sparkles, Trophy, Circle } from "lucide-react";

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
        <p className="text-victory-text font-bold text-lg mb-1">No friends here yet</p>
        <p className="text-victory-muted text-sm">Save your team and you'll see how you rank against your friends.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="fantasy-league">
      <p className="section-label mb-2">Who's winning</p>
      {league.map((m) => {
        const move = movement[m.user_id];
        return (
          <div
            key={m.user_id}
            className={`victory-card px-3 py-2 flex items-center gap-3 ${m.isMe ? "border-victory-lime/40 bg-victory-lime/5" : ""}`}
          >
            <span className={`font-mono font-bold w-6 text-center ${m.rank === 1 ? "text-victory-lime" : "text-victory-muted"}`}>{m.rank}</span>
            <div className="flex-1 min-w-0">
              <p className="text-victory-text text-sm font-semibold truncate">
                {m.isMe ? `${m.name} (you)` : m.name}
                {m.cosmetic && <CosmeticBadge style={m.cosmetic} />}
              </p>
              {m.team_name && <p className="text-victory-teal text-[10px] truncate">{m.team_name}</p>}
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

// Bought cosmetics are looks only: the badge never changes a score or a rank.
const COSMETIC = {
  gold: { Icon: Sparkles, className: "text-victory-orange", title: "Gold Gloves" },
  belt: { Icon: Trophy, className: "text-victory-orange", title: "Title Belt" },
  red: { Icon: Circle, className: "text-victory-danger fill-current", title: "Red Corner" },
  blue: { Icon: Circle, className: "text-victory-teal fill-current", title: "Blue Corner" },
};

function CosmeticBadge({ style }) {
  const c = COSMETIC[style];
  if (!c) return null;
  return <c.Icon className={`inline ml-1 w-3 h-3 align-[-1px] ${c.className}`} aria-label={c.title} />;
}
