import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Timer, X } from "lucide-react";
import { API, useAuth } from "@/App";
import { welcomeBackLines } from "@/lib/welcomeBack";

// Value Replay: after a week or more away, open on what they've already built and what
// their squad did meanwhile, then one easy step back in. No guilt, no streak shaming.
export function WelcomeBack() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    axios.get(`${API}/home/welcome-back`).then((r) => setData(r.data)).catch(() => setData(null));
  }, []);

  if (!data?.show || hidden) return null;
  const name = (user?.display_name || user?.name || "").split(" ")[0];
  const { headline, built, missed } = welcomeBackLines(data, name);

  return (
    <section className="victory-card p-4 space-y-3 border-victory-lime/40 bg-victory-lime/5 animate-slide-up" data-testid="welcome-back">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">Welcome back</p>
          <p className="text-victory-text font-heading font-extrabold text-lg leading-tight">{headline}</p>
        </div>
        <button aria-label="Hide" onClick={() => setHidden(true)} className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center text-victory-muted flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-victory-text text-sm">{built}</p>
      {missed && <p className="text-victory-muted text-sm">{missed}</p>}
      <button className="victory-btn-primary flex items-center justify-center gap-2" onClick={() => navigate("/train?quick=1")}>
        <Timer className="w-4 h-4" /> Ease back in: one round
      </button>
    </section>
  );
}
