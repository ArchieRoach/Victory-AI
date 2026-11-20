import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Gift, Users, Heart } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { tx } from "@/i18n/tx";

// The motivation journey: a tangible starter reward once, then recognition and belonging,
// then the sport itself. Reasoning: "motivation journey" in backend/gamification.py.
export function JourneyCard() {
  const navigate = useNavigate();
  const [j, setJ] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/journey`).then((r) => setJ(r.data)).catch(() => setJ(false));
  useEffect(() => { load(); }, []);

  if (!j) return null;
  const s = j.starter;

  const claim = async (choice) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/journey/starter/claim`, { choice });
      toast.success(tx("ui.journeyCard.isYoursPlusStatus", "{{granted}} is yours, plus {{status}} status. Find it in Fantasy → Team looks.", { granted: data.granted, status: data.status }));
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : tx("ui.journeyCard.couldnTClaimThat", "Couldn't claim that right now"));
    }
    setBusy(false);
  };

  // Hook: the starter challenge, shown only while it can still be won or claimed.
  if (j.stage === "hook" || (s.complete && !s.claimed)) {
    // Free fighters see the Pro offer during their first week only; it never lingers on Home.
    if (s.claimed || (!s.open && !s.complete) || (!s.pro && !s.open)) return null;
    return (
      <section className="victory-card p-4 space-y-2" data-testid="journey-starter">
        <p className="section-label flex items-center gap-1.5"><Gift className="w-3 h-3" /> {tx("ui.journeyCard.starterChallenge", "Starter challenge")}</p>
        {s.complete && !s.pro ? (
          <>
            <p className="text-victory-text text-sm font-semibold">{tx("ui.journeyCard.threeSessionsInYour", "Three sessions in your first week. Nice work.")}</p>
            <p className="text-[12px] text-victory-muted">{tx("ui.journeyCard.theStarterKitFree", "The starter kit (free corner colours for your Fantasy team) is for Pro members. Go Pro and it's yours to claim.")}</p>
            <button className="victory-btn-primary" onClick={() => navigate("/paywall")}>{tx("ui.journeyCard.seePro", "See Pro")}</button>
          </>
        ) : s.complete ? (
          <>
            <p className="text-victory-text text-sm font-semibold">{tx("ui.journeyCard.threeSessionsInYour2", "Three sessions in your first week. Pick your corner:")}</p>
            <div className="grid grid-cols-2 gap-2">
              {s.choices.map((c) => (
                <button key={c.id} disabled={busy} onClick={() => claim(c.id)} className="victory-btn-secondary">{c.name}</button>
              ))}
            </div>
            <p className="text-[11px] text-victory-muted">{tx("ui.journeyCard.teamColoursForFantasy", "Team colours for Fantasy, normally £")}{s.choices[0].worth_gbp.toFixed(2)}{tx("ui.journeyCard.yoursToKeep", ". Yours to keep.")}</p>
          </>
        ) : (
          <>
            <p className="text-victory-text text-sm">{tx("ui.journeyCard.train", "Train")} {s.target} {tx("ui.journeyCard.timesInYourFirst", "times in your first week")}{s.pro ? tx("ui.journeyCard.andEarnYourCorner", " and earn your corner colours, free.") : tx("ui.journeyCard.proMembersAlsoEarn", ". Pro members also earn free corner colours.")}</p>
            <div className="flex gap-1.5" aria-label={`${s.done} of ${s.target} sessions`}>
              {Array.from({ length: s.target }, (_, i) => (
                <div key={i} className={`h-2 flex-1 rounded-full ${i < s.done ? "bg-victory-lime" : "bg-victory-card-highlight"}`} />
              ))}
            </div>
            <p className="text-[11px] text-victory-muted"><span className="font-mono text-victory-text">{s.done}/{s.target}</span> · {s.days_left} {tx("ui.journeyCard.day", "day")}{s.days_left === 1 ? "" : "s"} {tx("ui.journeyCard.left", "left")}</p>
          </>
        )}
      </section>
    );
  }

  if (j.stage === "belong") {
    return (
      <section className="victory-card p-4 flex items-center gap-3" data-testid="journey-belong">
        <Users className="w-5 h-5 text-victory-teal flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-victory-text text-sm font-semibold">{j.name}</p>
          <p className="text-victory-muted text-[12px]">{j.line}</p>
        </div>
        <button className="victory-btn-ghost w-auto px-3 min-h-[44px] text-sm" onClick={() => navigate("/leaderboard?tab=crews")}>{tx("ui.journeyCard.squads", "Squads")}</button>
      </section>
    );
  }

  return j.enjoyment ? (
    <section className="victory-card p-4 flex items-start gap-3" data-testid="journey-mastery">
      <Heart className="w-5 h-5 text-victory-orange flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-victory-text text-sm">{j.enjoyment.line}</p>
        <p className="text-victory-muted text-[11px] mt-1">{tx("ui.journeyCard.youLoved", "You loved")} <span className="font-mono text-victory-text">{j.enjoyment.loved_pct}%</span> {tx("ui.journeyCard.ofYourLast", "of your last")} {j.enjoyment.sessions} {tx("ui.journeyCard.sessions", "sessions.")}</p>
      </div>
    </section>
  ) : null;
}
