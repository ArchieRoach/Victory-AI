import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { TrendingDown, TrendingUp, Info, User } from "lucide-react";
import { usePalette } from "@/hooks/useSystemTheme";
import { API } from "@/App";

// Goal: fighters train a few times every week, and open the app to check on their partner.
// Psychology: loss aversion and the endowment effect: we fight to keep what we've built.
//   A loss that feels permanent makes people quit, so one session always brings them back.
// Design: the partner's picture and three stats mirror your real training rhythm. They slide
//   to the bench, then the couch, when you stop; one session lifts them straight back up.
const STAT_LABELS = [["conditioning", "Conditioning"], ["sharpness", "Sharpness"], ["consistency", "Consistency"]];
const ACCENT = { peak: "text-victory-lime", ready: "text-victory-teal", waiting: "text-victory-orange", rusty: "text-victory-orange", new: "text-victory-muted" };

export function PartnerCondition() {
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [why, setWhy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/partner/condition`).then((r) => setC(r.data)).catch(() => setC(false));
  }, []);

  if (c === false) return null;
  if (!c) return <div className="skeleton-shimmer h-36 rounded-lg" />;
  const slipping = c.comeback;

  return (
    <section className={`victory-card overflow-hidden ${slipping ? "border-victory-orange/40" : ""}`} data-testid="partner-condition">
      <div className="flex gap-3 p-3">
        <PartnerScene state={c.state} avatar={c.avatar_url} name={c.partner_name} label={c.label} />
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-heading font-bold uppercase ${ACCENT[c.state]}`}>{c.label}</p>
          <p className="text-victory-text text-sm leading-snug mt-0.5">{c.line}</p>
        </div>
      </div>

      {c.state !== "new" && (
        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          {STAT_LABELS.map(([key, label]) => {
            const drop = c.drops?.[key];
            return (
              <div key={key} className="stat-pill !px-2 !py-2">
                <span className="font-mono font-bold text-victory-text text-lg flex items-center gap-1">
                  {c.stats[key]}
                  {drop ? <TrendingDown className="w-3.5 h-3.5 text-victory-orange" aria-label={`down ${-drop}`} />
                    : c.change_7d > 0 ? <TrendingUp className="w-3.5 h-3.5 text-victory-lime" aria-label="rising" /> : null}
                </span>
                <span className="text-victory-muted text-[10px]">{label}{drop ? ` (${drop})` : ""}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-3 pb-3 flex items-center gap-2">
        <button className={`${slipping || c.state === "new" ? "victory-btn-primary" : "victory-btn-secondary"} flex-1`} onClick={() => navigate("/train")}>
          {c.state === "rusty" ? "Get them off the couch" : c.state === "waiting" ? "Back to the gym" : "Train together"}
        </button>
        <button aria-label="How these numbers work" className="w-11 h-11 rounded-full flex items-center justify-center text-victory-muted" onClick={() => setWhy((w) => !w)}>
          <Info className="w-4 h-4" />
        </button>
      </div>
      {why && (
        <p className="px-3 pb-3 text-[11px] text-victory-muted">
          {c.note} Three sessions a week keeps your partner in peak shape. Rest days are fine: your partner only slides after 4 days without training.
        </p>
      )}
    </section>
  );
}

// Each state is drawn around the avatar the fighter chose, so it's always the same character.
// Rusty is played for comedy, not shame: a sofa, cobwebs and dusty gloves. No smoking,
// drinking or body changes, because the audience is 13-24.
export function PartnerScene({ state, avatar, name, label }) {
  const p = usePalette();
  const [imgOk, setImgOk] = useState(true);
  const dim = state === "rusty" ? "grayscale opacity-70" : state === "waiting" ? "opacity-85" : "";
  return (
    <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-victory-card-highlight flex-shrink-0" data-scene={state}
      role="img" aria-label={`${name}: ${label}`}>
      {avatar && imgOk ? (
        <img src={avatar} alt="" loading="lazy" onError={() => setImgOk(false)}
          className={`absolute inset-0 w-full h-full object-cover transition ${dim} ${state === "rusty" ? "translate-y-3 scale-90" : ""}`} />
      ) : (
        <User className={`absolute inset-0 m-auto w-12 h-12 text-victory-muted ${dim}`} />
      )}
      <svg viewBox="0 0 96 96" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {state === "peak" && (
          <g fill={p.lime}>
            <circle cx="14" cy="18" r="2.5" /><circle cx="82" cy="22" r="2" /><circle cx="78" cy="12" r="1.5" />
          </g>
        )}
        {state === "waiting" && (
          <g>
            <rect x="0" y="80" width="96" height="16" fill={p.border} />
            <circle cx="80" cy="16" r="10" fill={p.card} stroke={p.orange} strokeWidth="2" />
            <path d="M80 10 V16 L85 19" stroke={p.orange} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        )}
        {state === "rusty" && (
          <g>
            <rect x="4" y="68" width="88" height="24" rx="8" fill={p.border} />
            <rect x="0" y="60" width="14" height="32" rx="6" fill={p.border} />
            <rect x="82" y="60" width="14" height="32" rx="6" fill={p.border} />
            <path d="M0 0 L22 0 M0 0 L0 22 M0 0 L18 18 M0 9 Q6 7 9 0 M0 16 Q12 12 16 0" stroke={p.muted} strokeWidth="1" fill="none" opacity="0.8" />
            <line x1="78" y1="4" x2="78" y2="14" stroke={p.muted} strokeWidth="1.5" />
            <ellipse cx="78" cy="20" rx="6" ry="7" fill={p.muted} opacity="0.6" />
            <text x="56" y="44" fill={p.orange} fontSize="14" fontWeight="800">z</text>
            <text x="66" y="32" fill={p.orange} fontSize="11" fontWeight="800">z</text>
          </g>
        )}
      </svg>
      {state === "peak" && <div className="absolute inset-0 rounded-2xl ring-[3px] ring-inset ring-victory-lime animate-pulse" />}
    </div>
  );
}
