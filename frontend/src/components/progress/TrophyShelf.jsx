import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Crown, Award, Heart, Sparkles, Flame, Medal, Trophy, Gift } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { BragButton } from "./BragButton";
import { isNativeShell } from "@/lib/nativeShell";

// Goal: permission to show off without posting anything.
// Psychology: a trophy shelf is implicit bragging; it only means something because every
//   item was hard to earn, and treasures can only come from other people (social treasures).
// Design: titles, crowns, belts and treasures in one shelf on every profile. On someone
//   else's profile you can give them a treasure, a few a day.
const TREASURE_ICONS = { respect: Medal, heart: Heart, sharp: Flame };

export function TrophyShelf({ userId, isMe = false }) {
  const [shelf, setShelf] = useState(null);
  const [giving, setGiving] = useState(false);
  const load = useCallback(() => {
    axios.get(`${API}/users/${userId}/trophy-shelf`).then((r) => setShelf(r.data)).catch(() => setShelf(false));
  }, [userId]);
  useEffect(() => { if (userId) load(); }, [userId, load]);

  const give = async (kind) => {
    setGiving(true);
    try {
      const { data } = await axios.post(`${API}/treasures`, { recipient_id: userId, kind });
      toast.success(`You gave ${data.given}. ${data.left_today} left today.`);
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Couldn't give that right now");
    }
    setGiving(false);
  };

  // Gifted gloves always show as gifted, so a pair that was earned keeps its meaning.
  const giftGloves = async () => {
    setGiving(true);
    try {
      const { data } = await axios.post(`${API}/gloves/gift/checkout`, { recipient_id: userId, origin_url: window.location.origin });
      if (data.for_parent) toast("Ask a parent or guardian to complete this payment.");
      window.location.href = data.checkout_url;
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Couldn't start the gift right now");
      setGiving(false);
    }
  };

  if (shelf === false) return null;
  if (!shelf) return <div className="skeleton-shimmer h-28 rounded-lg" />;
  const empty = !shelf.gloves?.length && !shelf.gifted_gloves?.length && !shelf.mastery?.tier && !shelf.titles.length && !shelf.crowns.length && !shelf.belts.length && !shelf.treasures.length;
  return (
    <section className="victory-card p-4 space-y-3" data-testid="trophy-shelf">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Award className="w-3 h-3" /> Trophy shelf</p>
        <span className="text-[11px] text-victory-muted">Level <span className="font-mono text-victory-text">{shelf.level}</span></span>
      </div>
      {empty && <p className="text-victory-muted text-sm">{isMe ? "Belts, crowns and titles land here as you earn them." : "Nothing on the shelf yet."}</p>}

      {(shelf.gloves?.length > 0 || shelf.gifted_gloves?.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {shelf.gloves.map((g) => (
            <span key={g.season_id} title={g.hours ? `${g.hours} proven hours` : undefined}
              className="text-[11px] font-heading font-bold px-2.5 py-1 rounded-full bg-victory-lime/15 border border-victory-lime/40 text-victory-lime flex items-center gap-1">
              <Trophy className="w-3 h-3" /> {g.name}{g.hours ? ` · ${g.hours}h earned` : " · earned"}
            </span>
          ))}
          {shelf.gifted_gloves.map((g) => (
            <span key={`gift-${g.season_id}`} className="text-[11px] font-heading font-bold px-2.5 py-1 rounded-full border border-victory-teal/40 text-victory-teal flex items-center gap-1">
              <Gift className="w-3 h-3" /> {g.name} · gifted by {g.count} fan{g.count === 1 ? "" : "s"}
            </span>
          ))}
        </div>
      )}

      {shelf.mastery?.tier && (
        <p className="text-[11px] text-victory-muted">
          <span className="text-victory-teal font-semibold">{shelf.mastery.tier}</span> · <span className="font-mono text-victory-text">{shelf.mastery.verified_hours}</span> proven hours on the road to 10,000
        </p>
      )}

      {(shelf.titles.length > 0 || shelf.crowns.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {shelf.titles.map((t) => (
            <span key={t.name} title={t.desc} className="text-[11px] font-heading font-bold px-2.5 py-1 rounded-full bg-victory-teal/10 text-victory-teal flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {t.name}
            </span>
          ))}
          {shelf.crowns.map((c) => (
            <span key={`${c.name}-${c.week_id}-${c.scope}`} title={`${c.scope}, ${c.week_id}`} className="text-[11px] font-heading font-bold px-2.5 py-1 rounded-full bg-victory-lime/10 text-victory-lime flex items-center gap-1">
              <Crown className="w-3 h-3" /> {c.name}
            </span>
          ))}
        </div>
      )}

      {shelf.belts.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {shelf.belts.slice(0, 8).map((b) => (
            <div key={b.belt_id} title={b.desc} className="rounded-lg bg-victory-card-highlight border border-victory-border p-2 text-center">
              <Award className="w-5 h-5 mx-auto text-victory-lime" />
              <p className="text-[10px] text-victory-text mt-1 leading-tight line-clamp-2">{b.name}</p>
            </div>
          ))}
        </div>
      )}

      {shelf.treasures.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {shelf.treasures.map((t) => {
            const Icon = TREASURE_ICONS[t.kind] || Medal;
            return (
              <span key={t.kind} className="flex items-center gap-1.5 text-[12px] text-victory-text">
                <Icon className="w-4 h-4 text-victory-orange" /> {t.name} <span className="font-mono text-victory-muted">×{t.count}</span>
              </span>
            );
          })}
        </div>
      )}

      {shelf.can_give && (
        <div className="pt-1">
          <p className="text-[11px] text-victory-muted mb-1.5">Give them something only a friend can</p>
          <div className="grid grid-cols-3 gap-2">
            {[["respect", "Respect"], ["heart", "Heart"], ["sharp", "Sharp"]].map(([kind, label]) => {
              const Icon = TREASURE_ICONS[kind];
              return (
                <button key={kind} disabled={giving} onClick={() => give(kind)} className="victory-btn-ghost min-h-[44px] flex items-center justify-center gap-1.5 text-sm">
                  <Icon className="w-4 h-4 text-victory-orange" /> {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {shelf.can_gift_gloves && !isNativeShell() && (
        <button type="button" onClick={giftGloves} disabled={giving} data-testid="gift-gloves"
          className="victory-btn-secondary flex items-center justify-center gap-2">
          <Gift className="w-4 h-4" /> Gift them Golden Gloves · £5
        </button>
      )}
      {isMe && !empty && <BragButton win={{ kind: "shelf", level: shelf.level, crowns: shelf.crown_count }} label="Share your shelf" />}
    </section>
  );
}
