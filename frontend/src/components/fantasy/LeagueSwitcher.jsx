import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Lock, Plus, LogIn, Copy } from "lucide-react";

// Goal: give friends their own table (visible progress) and give Pro a reason to stay.
// Psychology: a league you named and invited people to is an investment, and people
//   return to what they've built. Joining is always free, so the Pro perk never stops a
//   friend from playing.
// Design: pills for "Friends" (your squad) plus each private league; creating one is Pro,
//   joining by code is free for everyone.
export function LeagueSwitcher({ api, leagues, value, onChange, onLeaguesChanged, isPro }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | "create" | "join"
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const current = leagues.find((l) => l.league_id === value);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = mode === "create"
        ? await axios.post(`${api}/fantasy/leagues`, { name: text.trim() })
        : await axios.post(`${api}/fantasy/leagues/join`, { code: text.trim() });
      toast.success(mode === "create" ? `League made! Share code ${data.code} with friends.` : `You joined ${data.name}!`);
      setMode(null);
      setText("");
      await onLeaguesChanged();
      onChange(data.league_id);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "That didn't work. Try again.");
    }
    setBusy(false);
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(current.code).then(() => toast.success("Code copied"), () => {});
  };

  return (
    <div className="space-y-2" data-testid="league-switcher">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[{ league_id: "squad", name: "Friends" }, ...leagues].map((l) => (
          <button
            key={l.league_id}
            onClick={() => onChange(l.league_id)}
            className={`filter-pill whitespace-nowrap ${value === l.league_id ? "filter-pill-active" : "filter-pill-inactive"}`}
          >
            {l.name}
          </button>
        ))}
        <button onClick={() => setMode(mode === "join" ? null : "join")} className="filter-pill filter-pill-inactive whitespace-nowrap flex items-center gap-1">
          <LogIn className="w-3 h-3" /> Join
        </button>
        <button
          onClick={() => (isPro ? setMode(mode === "create" ? null : "create") : navigate("/paywall"))}
          className="filter-pill filter-pill-inactive whitespace-nowrap flex items-center gap-1"
        >
          {isPro ? <Plus className="w-3 h-3" /> : <Lock className="w-3 h-3" />} New league
        </button>
      </div>

      {current?.code && (
        <button onClick={copyCode} className="text-[11px] text-victory-muted flex items-center gap-1 min-h-[44px]">
          Invite code <span className="font-mono font-bold text-victory-lime">{current.code}</span> <Copy className="w-3 h-3" />
        </button>
      )}

      {mode && (
        <div className="victory-card p-3 flex gap-2">
          <input
            className="victory-input flex-1"
            value={text}
            maxLength={mode === "create" ? 40 : 12}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "create" ? "League name" : "Invite code"}
            aria-label={mode === "create" ? "League name" : "Invite code"}
          />
          <button className="victory-btn-primary w-auto px-4" disabled={busy || text.trim().length < 2} onClick={submit}>
            {mode === "create" ? "Make" : "Join"}
          </button>
        </div>
      )}
    </div>
  );
}
