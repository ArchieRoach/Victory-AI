import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Check, Mail, Palette } from "lucide-react";
import { isNativeShell } from "@/lib/nativeShell";

// Goal: identity expression — your team looks like yours on every leaderboard.
// Psychology: people value what shows who they are, but anything that changes the
//   result would turn a free game into pay-to-win (and a paid stake into gambling).
// Design: each item has a fixed price and is bought outright, with no random boxes. It
//   never changes points. Buying is by email: the admin sends a payment link, then
//   switches the item on. Buying is hidden inside the native app (App Store rule 3.1.1).
export function CosmeticsSheet({ api }) {
  const [data, setData] = useState(null);
  const [teamName, setTeamName] = useState("");
  const native = isNativeShell();

  const load = () => axios.get(`${api}/fantasy/cosmetics`).then((r) => setData(r.data)).catch(() => setData({ items: [] }));
  useEffect(() => { load(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const request = async (item) => {
    try {
      const { data: r } = await axios.post(`${api}/fantasy/cosmetics/${item.id}/request`);
      toast.success(r.message);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send that. Try again.");
    }
  };

  const equip = async (item) => {
    try {
      await axios.post(`${api}/fantasy/cosmetics/${item.id}/equip`, item.id === "team_name" ? { team_name: teamName } : {});
      toast.success(item.id === "team_name" ? "Team name saved" : `${item.name} on!`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't change that. Try again.");
    }
  };

  if (!data) return <div className="skeleton-shimmer h-16 rounded-lg" />;

  return (
    <div className="space-y-2" data-testid="fantasy-cosmetics">
      <p className="section-label flex items-center gap-1.5"><Palette className="w-3 h-3" /> Team looks</p>
      <p className="text-[11px] text-victory-muted">Just for show. They never change your points.</p>
      {data.items.map((item) => (
        <div key={item.id} className="victory-card p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-victory-text text-sm font-semibold">{item.name}</p>
              <p className="text-victory-muted text-[11px]">{item.description}</p>
            </div>
            {item.owned ? (
              item.id === "team_name" ? null : data.equipped === item.id ? (
                <span className="text-victory-lime text-xs font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> On</span>
              ) : (
                <button className="victory-btn-secondary w-auto px-3 min-h-[44px] text-xs" onClick={() => equip(item)}>Use</button>
              )
            ) : native ? (
              <span className="text-victory-muted text-[11px]">Not owned</span>
            ) : (
              <button className="victory-btn-ghost w-auto px-3 min-h-[44px] text-xs flex items-center gap-1" onClick={() => request(item)}>
                <Mail className="w-3.5 h-3.5" /> £{item.price_gbp.toFixed(2)}
              </button>
            )}
          </div>
          {item.owned && item.id === "team_name" && (
            <div className="flex gap-2">
              <input className="victory-input flex-1" maxLength={24} value={teamName} onChange={(e) => setTeamName(e.target.value)}
                placeholder="Your team name" aria-label="Team name" />
              <button className="victory-btn-secondary w-auto px-3" disabled={teamName.trim().length < 2} onClick={() => equip(item)}>Save</button>
            </div>
          )}
        </div>
      ))}
      {!native && (
        <p className="text-[10px] text-victory-muted">Tap a price and we'll email you a payment link from {data.contact}.</p>
      )}
    </div>
  );
}
