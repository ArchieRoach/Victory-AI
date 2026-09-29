import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Trophy, Target, ScanSearch, Lock, Sparkles, Shield, Video } from "lucide-react";
import { seasonProgress } from "@/lib/rewards";

const RARITY = {
  common: { label: "SCOUTING REPORT", cls: "bg-victory-card-highlight text-victory-muted border-victory-border" },
  rare:   { label: "RARE REPORT",     cls: "bg-victory-teal/15 text-victory-teal border-victory-teal/40" },
  epic:   { label: "EPIC REPORT",     cls: "bg-victory-lime/15 text-victory-lime border-victory-lime/50" },
};

function PersonalBests({ pb }) {
  if (!pb) return null;
  const { new: fresh = [], near = [], baselines = 0 } = pb;
  if (!fresh.length && !near.length && !baselines) return null;
  return (
    <section
      className={`victory-card p-4 space-y-3 ${fresh.length ? "border-victory-lime/40 bg-victory-lime/5" : ""}`}
      data-testid="personal-bests"
    >
      {fresh.length > 0 && (
        <div>
          <p className="section-label mb-2 flex items-center gap-1.5">
            <Trophy className="w-3 h-3" /> {fresh.length === 1 ? "New personal best" : `${fresh.length} new personal bests`}
          </p>
          <div className="space-y-1.5">
            {fresh.map((b) => (
              <div key={b.name} className="flex items-center justify-between animate-scale-in">
                <span className="text-victory-text text-sm font-semibold">{b.name}</span>
                <span className="font-mono text-sm">
                  <span className="text-victory-muted line-through mr-2">{Number(b.prev).toFixed(b.name === "Overall" ? 1 : 0)}</span>
                  <span className="text-victory-lime font-bold">{Number(b.score).toFixed(b.name === "Overall" ? 1 : 0)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {near.length > 0 && (
        <div>
          <p className="text-victory-orange text-[10px] font-bold uppercase tracking-[0.18em] mb-2 flex items-center gap-1.5">
            <Target className="w-3 h-3" /> So close
          </p>
          <div className="space-y-1.5">
            {near.map((n) => (
              <div key={n.name} className="flex items-center justify-between">
                <span className="text-victory-text text-sm">{n.name}</span>
                <span className="text-victory-muted text-xs">
                  <span className="font-mono text-victory-orange font-bold">{n.gap}</span> off your best ({n.best})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!fresh.length && !near.length && baselines > 0 && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-victory-lime" />
          </div>
          <div>
            <p className="text-victory-text text-sm font-semibold">Personal bests set for {baselines} skills</p>
            <p className="text-victory-muted text-xs">Every one of them can be broken next session.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ScoutingReport({ report }) {
  const navigate = useNavigate();
  if (!report) return null;
  if (report.locked) {
    return (
      <section className="victory-card p-4 flex items-start gap-3" data-testid="scouting-report-locked">
        <div className="w-10 h-10 rounded-2xl bg-victory-card-highlight border border-victory-border flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-victory-muted" />
        </div>
        <div className="flex-1">
          <p className="text-victory-text text-sm font-semibold">{report.title}</p>
          <p className="text-victory-muted text-xs mb-2">{report.body}</p>
          <button onClick={() => navigate("/train")} className="text-victory-lime text-xs font-heading font-bold flex items-center gap-1 touch-target">
            <Video className="w-3.5 h-3.5" /> Turn on video next session
          </button>
        </div>
      </section>
    );
  }
  const rarity = RARITY[report.rarity] || RARITY.common;
  return (
    <section
      className={`victory-card p-4 space-y-2 animate-slide-up ${report.rarity === "epic" ? "border-victory-lime/50" : report.rarity === "rare" ? "border-victory-teal/40" : ""}`}
      data-testid="scouting-report"
    >
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 text-[10px] font-heading font-extrabold px-2 py-0.5 rounded-full border ${rarity.cls}`}>
          {report.rarity === "common" ? <ScanSearch className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />} {rarity.label}
        </span>
        {report.types_total > 0 && (
          <span className="text-victory-muted text-[10px] font-mono">{report.types_found}/{report.types_total} report types found</span>
        )}
      </div>
      <p className="text-victory-text font-heading font-bold">{report.title}</p>
      <p className="text-victory-muted text-sm">{report.body}</p>
      <p className="text-victory-muted text-[11px]">Your next report unlocks after your next session.</p>
    </section>
  );
}

function SeasonProgress({ season: initial }) {
  const [season, setSeason] = useState(initial || null);
  useEffect(() => {
    if (initial) return;
    axios.get(`${API}/seasons/me`).then((r) => setSeason(r.data)).catch(() => {});
  }, [initial]);
  if (!season) return null;
  const { pct, label } = seasonProgress(season);
  return (
    <section className="victory-card p-4 space-y-2" data-testid="season-progress">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Shield className="w-3 h-3" /> Season {season.number}</p>
        <span className="text-victory-muted text-[11px]">{season.days_left} days left</span>
      </div>
      <div className="flex items-baseline justify-between">
        <p className="font-heading font-extrabold text-xl text-victory-text">
          {season.rank}
          {season.ranked_up && (
            <span className="ml-2 align-middle text-[10px] font-heading font-extrabold bg-victory-lime text-victory-bg px-2 py-0.5 rounded-full animate-scale-in">RANKED UP</span>
          )}
        </p>
        <p className="font-mono text-sm text-victory-lime font-bold">
          {season.points}{season.next_at ? <span className="text-victory-muted font-normal"> / {season.next_at}</span> : null}
        </p>
      </div>
      <div className="h-2 rounded-full bg-victory-border overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-gradient-to-r from-victory-teal to-victory-lime" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-victory-muted text-xs">
        {season.earned ? <><span className="font-mono text-victory-lime">+{season.earned}</span> this session · </> : null}
        {label}
      </p>
    </section>
  );
}

export function SessionRewards({ rewards, scoutingReport }) {
  return (
    <div className="space-y-3" data-testid="session-rewards">
      <PersonalBests pb={rewards?.personal_bests} />
      <ScoutingReport report={scoutingReport ?? rewards?.scouting_report} />
      <SeasonProgress season={rewards?.season} />
    </div>
  );
}
