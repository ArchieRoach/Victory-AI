import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { Trophy, Target, ScanSearch, Lock, Sparkles, Shield, Video, Megaphone, Crown, UserPlus, Check, Skull, Mountain, Music, CalendarCheck, LockOpen, Egg, PartyPopper, Vote } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { seasonProgress, inviteMoment } from "@/lib/rewards";
import { FighterCardButton } from "@/components/FighterCard";
import { IdentityCard } from "@/components/IdentityCard";
import { BragButton } from "@/components/progress/BragButton";
import { CornerSurprise } from "@/components/progress/CornerSurprise";
import { sessionWin, glovesLine } from "@/lib/progression";

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
      {fresh.length > 0 && <CalloutButton pbs={fresh} />}
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
        <p className="section-label flex items-center gap-1.5"><Shield className="w-3 h-3" /> {season.number ? `Season ${season.number}` : "Preseason"}</p>
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

// A new PB is the moment to turn a private win into a public dare: the squad gets a
// trigger now, and the fighter gets one back whatever happens (accepted, beaten, defended).
function CalloutButton({ pbs }) {
  const navigate = useNavigate();
  const pick = pbs.find((b) => b.name !== "Overall") || pbs[0];
  const [state, setState] = useState("idle");
  const send = async () => {
    setState("sending");
    try {
      await axios.post(`${API}/callouts`, { dimension: pick.name });
      setState("sent");
      analytics.capture("callout_sent", { dimension: pick.name });
    } catch (err) {
      setState("idle");
      const detail = err?.response?.data?.detail;
      if (detail && detail.toLowerCase().includes("squad")) {
        toast(detail, { action: { label: "Squads", onClick: () => navigate("/squads") } });
      } else {
        toast.error(detail || "Couldn't send the callout");
      }
    }
  };
  if (state === "sent") {
    return (
      <p className="text-victory-muted text-xs flex items-center gap-1.5 pt-1">
        <Megaphone className="w-3.5 h-3.5 text-victory-lime" /> Callout sent — your squad has 7 days to beat {pick.name} {pick.score}.
      </p>
    );
  }
  return (
    <button onClick={send} disabled={state === "sending"} className="victory-btn-secondary w-full flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50">
      <Megaphone className="w-4 h-4" /> {state === "sending" ? "Sending…" : `Call out your squad: beat my ${pick.name} ${pick.score}`}
    </button>
  );
}

function CalloutsBeaten({ beaten }) {
  if (!beaten?.length) return null;
  return (
    <section className="victory-card p-4 space-y-2 border-victory-lime/50 bg-victory-lime/5 animate-scale-in" data-testid="callouts-beaten">
      {beaten.map((b) => (
        <div key={b.callout_id} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-victory-lime flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-victory-bg" />
          </div>
          <div>
            <p className="text-victory-text font-heading font-extrabold text-sm">You beat {b.challenger_name}'s callout</p>
            <p className="text-victory-muted text-xs">
              {b.dimension} <span className="font-mono text-victory-lime">{b.your_score}</span> vs {b.score} · title taken: {b.title}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

// Asked only here, straight after a win — never during onboarding. Someone who has just
// tried it and has a score to show off is vouching for it; someone who hasn't is spamming.
function BringYourCrew({ moment }) {
  const [state, setState] = useState("idle");
  const invite = async () => {
    setState("working");
    try {
      const { data } = await axios.post(`${API}/squads/invites`, { dimension: moment.dimension });
      const url = `${window.location.origin}${data.path}`;
      let via = "copy";
      if (navigator.share) {
        try {
          await navigator.share({ title: `Join ${data.squad.name} on Victory AI`, text: data.brag, url });
          via = "share";
        } catch (err) {
          if (err?.name === "AbortError") { setState("idle"); return; }
          await navigator.clipboard?.writeText(`${data.brag} ${url}`);
        }
      } else {
        await navigator.clipboard?.writeText(`${data.brag} ${url}`);
        toast.success("Invite link copied");
      }
      analytics.capture("squad_invite_sent", { via, has_skill: !!moment.dimension });
      setState("sent");
    } catch (err) {
      setState("idle");
      toast.error(err?.response?.data?.detail || "Couldn't make the invite — try again");
    }
  };
  return (
    <section className="victory-card p-4 flex items-center gap-3" data-testid="bring-your-crew">
      <div className="w-10 h-10 rounded-2xl bg-victory-teal/10 border border-victory-teal/30 flex items-center justify-center flex-shrink-0">
        {state === "sent" ? <Check className="w-5 h-5 text-victory-teal" /> : <UserPlus className="w-5 h-5 text-victory-teal" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-victory-text text-sm font-semibold">{state === "sent" ? "Invite sent" : moment.headline}</p>
        <p className="text-victory-muted text-xs">
          {state === "sent" ? "You'll get a ping when they join your squad." : "Send a mate the link. They land straight in your squad."}
        </p>
      </div>
      {state !== "sent" && (
        <button onClick={invite} disabled={state === "working"} className="victory-btn-secondary w-auto px-4 min-h-[44px] text-sm disabled:opacity-50">
          {state === "working" ? "…" : "Invite"}
        </button>
      )}
    </section>
  );
}

// Status points and the squad quest, with a brag button only when something was actually won.
function StatusEarned({ status, quests, gloves }) {
  const navigate = useNavigate();
  if (!status?.earned) return null;
  const glove = glovesLine(gloves);
  const win = sessionWin({ status, quests });
  const quest = (quests || [])[0];
  return (
    <section className={`victory-card p-4 space-y-2 ${status.leveled_up ? "border-victory-lime/30 bg-victory-lime/5" : ""}`} data-testid="status-earned">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Status</p>
        <span className="font-mono font-bold text-victory-lime">+{status.earned}</span>
      </div>
      {status.booster && <p className="text-[11px] text-victory-teal">{status.booster} doubled it</p>}
      {status.leveled_up ? (
        <p className="text-victory-text font-heading font-extrabold text-lg">Level {status.level}!{status.unlocked?.length ? ` Unlocked ${status.unlocked.map((u) => u.name).join(", ")}.` : ""}</p>
      ) : (
        <p className="text-victory-muted text-[12px]">Level <span className="font-mono text-victory-text">{status.level}</span> · <span className="font-mono text-victory-text">{status.total}</span> status points, and they never go down.</p>
      )}
      {quest && (
        <button className="w-full text-left text-[12px] text-victory-muted min-h-[44px]" onClick={() => navigate("/leaderboard?tab=quests")}>
          {quest.just_completed ? <span className="text-victory-lime font-semibold">{quest.name} just completed the mission! Pick your booster.</span>
            : quest.counted === false ? <>This one didn't count toward {quest.name}'s mission. Check what it needs.</>
            : <>Crew mission: <span className="font-mono text-victory-text">{quest.progress}/{quest.target}</span> for {quest.name}</>}
        </button>
      )}
      {glove && (
        <button className={`w-full text-left text-[12px] min-h-[44px] ${gloves?.counted || gloves?.just_earned ? "text-victory-lime" : "text-victory-muted"}`}
          onClick={() => navigate("/leaderboard")}>{glove}</button>
      )}
      {gloves?.just_earned ? <BragButton win={{ kind: "crown", name: gloves.just_earned }} /> : win && <BragButton win={win} />}
    </section>
  );
}

// "How did that feel?" Asking about the experience (not the reward) is what turns training
// into something people relish; at the mastery stage it leads the screen and points fold away.
function Reflection({ sessionId, tags }) {
  const [enjoyment, setEnjoyment] = useState(null);
  const [picked, setPicked] = useState([]);
  const [saved, setSaved] = useState(false);
  if (!sessionId || !tags) return null;
  const save = async (value, nextTags) => {
    try {
      await axios.post(`${API}/sessions/${sessionId}/reflection`, { enjoyment: value, tags: nextTags });
      setSaved(true);
    } catch { /* optional; never block the results screen */ }
  };
  const rate = (v) => { setEnjoyment(v); save(v, picked); };
  const toggle = (t) => {
    const next = picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t];
    setPicked(next);
    if (enjoyment) save(enjoyment, next);
  };
  return (
    <section className="victory-card p-4 space-y-3" data-testid="session-reflection">
      <p className="section-label">How did that feel?</p>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="How much you enjoyed it, 1 to 5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} role="radio" aria-checked={enjoyment === v} onClick={() => rate(v)}
            className={`min-h-[44px] rounded-xl font-mono font-bold ${enjoyment === v ? "bg-victory-lime text-victory-bg" : "bg-victory-card-highlight text-victory-text"}`}>{v}</button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-victory-muted -mt-1"><span>Not for me</span><span>Loved it</span></div>
      {enjoyment && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(tags).map(([k, label]) => (
            <button key={k} onClick={() => toggle(k)} aria-pressed={picked.includes(k)}
              className={`filter-pill ${picked.includes(k) ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
          ))}
        </div>
      )}
      {saved && <p className="text-[11px] text-victory-muted">Noted. Your partner learns what you enjoy.</p>}
    </section>
  );
}

// Boss Round result: the fiero moment when beaten, an honest "not this time" when not.
function BossResult({ boss }) {
  if (!boss) return null;
  return (
    <section className={`victory-card p-4 space-y-2 ${boss.beaten ? "border-victory-lime/40 bg-victory-lime/5" : "border-victory-orange/30"}`} data-testid="boss-result">
      <p className="section-label flex items-center gap-1.5"><Skull className="w-3 h-3" /> Boss Round</p>
      <p className="text-victory-text font-heading font-extrabold text-lg">{boss.line}</p>
      <p className="text-[12px] text-victory-muted">{boss.target?.line}. You got: {Object.entries(boss.got || {}).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(", ") || "nothing counted"}.</p>
      {boss.status > 0 && <p className="text-[12px] text-victory-lime">+{boss.status} status</p>}
      {boss.beaten && <BragButton win={{ kind: "boss", name: boss.name }} label="Show off the win" />}
      <BossVote />
    </section>
  );
}

// Unlock as you go: one new feature at a time, earned by training (gamification.py FEATURE_UNLOCKS).
function Unlocked({ features }) {
  if (!features?.length) return null;
  return (
    <section className="victory-card p-4 space-y-2 border-victory-lime/40" data-testid="unlocked">
      <p className="section-label flex items-center gap-1.5"><LockOpen className="w-3 h-3" /> Unlocked</p>
      {features.map((f) => (
        <div key={f.key}>
          <p className="text-victory-text font-heading font-bold">{f.name}</p>
          <p className="text-[12px] text-victory-muted">{f.line}</p>
        </div>
      ))}
    </section>
  );
}

// Easter eggs (Core Drive 7): found from what you actually did; how many exist is public.
function EasterEgg({ eggs }) {
  if (!eggs?.new?.length) return null;
  return (
    <section className="victory-card p-4 space-y-1 border-victory-orange/40" data-testid="easter-egg">
      <p className="section-label flex items-center gap-1.5"><Egg className="w-3 h-3" /> Hidden egg found</p>
      {eggs.new.map((e) => <p key={e.key} className="text-victory-text text-sm"><span className="font-heading font-bold">{e.name}</span> · {e.desc}</p>)}
      <p className="text-[11px] text-victory-muted"><span className="font-mono">{eggs.found}</span> of {eggs.total} found. The rest are still hidden.</p>
    </section>
  );
}

// Crew cheer (Core Drive 5): one tap, no text, only for crew-mates who trained today.
function CrewCheer() {
  const [mates, setMates] = useState(null);
  useEffect(() => {
    axios.get(`${API}/crew/today`).then((r) => setMates(r.data.mates)).catch(() => setMates([]));
  }, []);
  if (!mates?.length) return null;
  const cheer = async (id) => {
    try {
      await axios.post(`${API}/crew/cheer/${id}`);
      setMates((m) => m.map((x) => (x.user_id === id ? { ...x, cheered: true } : x)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't send that cheer");
    }
  };
  return (
    <section className="victory-card p-4 space-y-2" data-testid="crew-cheer">
      <p className="section-label flex items-center gap-1.5"><PartyPopper className="w-3 h-3" /> Your crew trained today too</p>
      <div className="flex flex-wrap gap-2">
        {mates.map((m) => (
          <button key={m.user_id} disabled={m.cheered} onClick={() => cheer(m.user_id)}
            className={`filter-pill min-h-[44px] ${m.cheered ? "filter-pill-active" : "filter-pill-inactive"}`}>
            {m.cheered ? `Cheered ${m.name}` : `Cheer ${m.name}`}
          </button>
        ))}
      </div>
    </section>
  );
}

// Boss vote (HEXAD Disruptors): fighters choose next week's boss.
function BossVote() {
  const [v, setV] = useState(null);
  useEffect(() => {
    axios.get(`${API}/boss/vote`).then((r) => setV(r.data)).catch(() => {});
  }, []);
  if (!v) return null;
  const vote = (key) => axios.post(`${API}/boss/vote`, { key }).then((r) => setV(r.data)).catch(() => toast.error("Couldn't count that vote"));
  return (
    <div className="pt-2 border-t border-victory-border space-y-2" data-testid="boss-vote">
      <p className="text-[12px] text-victory-muted flex items-center gap-1.5"><Vote className="w-3.5 h-3.5" /> Pick next week's boss. Most votes wins.</p>
      <div className="grid grid-cols-2 gap-2">
        {v.options.map((o) => (
          <button key={o.key} onClick={() => vote(o.key)} aria-pressed={v.my_vote === o.key}
            className={`filter-pill min-h-[44px] ${v.my_vote === o.key ? "filter-pill-active" : "filter-pill-inactive"}`}>
            {o.name} <span className="font-mono">{o.votes}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Flow: how the combo calls went, and where they'll start next time.
function CallsSummary({ calls }) {
  if (!calls?.calls) return null;
  return (
    <section className="victory-card p-3 text-[12px] text-victory-muted flex items-center gap-2" data-testid="calls-summary">
      <Megaphone className="w-4 h-4 text-victory-lime flex-shrink-0" />
      <span>
        {calls.calls} combos called.
        {calls.rate != null ? <> You landed <span className="font-mono text-victory-text">{calls.rate}%</span>; next session starts at that level.</> : " Turn on Live Coach and the calls adapt to you."}
      </span>
    </section>
  );
}

// Make a newcomer feel capable: name what they actually did, in plain words, from real data.
function FirstWins({ rewards, liveStats }) {
  const n = rewards?.sessions_total;
  const lines = [];
  if (n === 1) lines.push("First session done. That's the hardest one.");
  else if (n) lines.push(`Session ${n} done. You're building a habit.`);
  if (liveStats?.punches) lines.push(`You threw ${liveStats.punches} punches${liveStats.best_combo >= 3 ? `, with a ${liveStats.best_combo}-punch combination` : ""}.`);
  if (rewards?.personal_bests?.new?.length) lines.push("You set your first personal bests. Every session from now is measured against you, not anyone else.");
  if (!lines.length) return null;
  return (
    <section className="victory-card p-4 space-y-1 border-victory-lime/40 bg-victory-lime/5" data-testid="first-wins">
      <p className="text-victory-text font-heading font-extrabold text-lg">{lines[0]}</p>
      {lines.slice(1).map((l) => <p key={l} className="text-victory-text text-sm">{l}</p>)}
    </section>
  );
}

export function SessionRewards({ rewards, scoutingReport, overall, liveStats, sessionId, calls }) {
  if (rewards?.freestyle) {
    return (
      <div className="space-y-3" data-testid="session-rewards">
        <section className="victory-card p-4 space-y-1" data-testid="freestyle-done">
          <p className="section-label flex items-center gap-1.5"><Music className="w-3 h-3" /> Freestyle</p>
          <p className="text-victory-text text-sm">No score today, just training. It counts for your week and your partner.</p>
          {rewards.week && <p className="text-[12px] text-victory-muted flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> {rewards.week.done}/{rewards.week.target} this week</p>}
        </section>
        <CallsSummary calls={calls} />
        <CornerSurprise surprise={rewards.surprise} />
        <Reflection sessionId={sessionId} tags={rewards.reflection_tags} />
      </div>
    );
  }
  const moment = inviteMoment(rewards, scoutingReport);
  const mastery = rewards?.stage?.stage === "mastery";
  // Newcomers: what they did, what they unlocked, one next step. The rest is one tap away,
  // so the first screens build confidence instead of burying it in numbers.
  if (rewards?.newcomer) {
    return (
      <div className="space-y-3 reveal-stack" data-testid="session-rewards">
        <FirstWins rewards={rewards} liveStats={liveStats} />
        <IdentityCard identity={rewards?.identity} />
        <Unlocked features={rewards?.unlocked_features} />
        <EasterEgg eggs={rewards?.easter_eggs} />
        <CornerSurprise surprise={rewards?.surprise} />
        <Reflection sessionId={sessionId} tags={rewards?.reflection_tags} />
        <details className="victory-card p-3" data-testid="newcomer-details">
          <summary className="text-[12px] text-victory-muted cursor-pointer min-h-[44px] flex items-center">See all your numbers</summary>
          <div className="space-y-3 mt-3">
            <PersonalBests pb={rewards?.personal_bests} />
            <ScoutingReport report={scoutingReport ?? rewards?.scouting_report} />
            <SeasonProgress season={rewards?.season} />
            <StatusEarned status={rewards?.status} quests={rewards?.quests} gloves={rewards?.gloves} />
            <CallsSummary calls={calls} />
          </div>
        </details>
      </div>
    );
  }
  const points = (
    <>
      <SeasonProgress season={rewards?.season} />
      <StatusEarned status={rewards?.status} quests={rewards?.quests} gloves={rewards?.gloves} />
    </>
  );
  return (
    <div className="space-y-3 reveal-stack" data-testid="session-rewards">
      <BossResult boss={rewards?.boss} />
      <Unlocked features={rewards?.unlocked_features} />
      <EasterEgg eggs={rewards?.easter_eggs} />
      {rewards?.epic_line && (
        <p className="victory-card p-3 text-sm text-victory-text flex items-start gap-2" data-testid="epic-line">
          <Mountain className="w-4 h-4 text-victory-teal mt-0.5 flex-shrink-0" /> {rewards.epic_line}
        </p>
      )}
      <IdentityCard identity={rewards?.identity} />
      <CornerSurprise surprise={rewards?.surprise} />
      {mastery && <Reflection sessionId={sessionId} tags={rewards?.reflection_tags} />}
      <CalloutsBeaten beaten={rewards?.callouts_beaten} />
      <PersonalBests pb={rewards?.personal_bests} />
      <ScoutingReport report={scoutingReport ?? rewards?.scouting_report} />
      {mastery ? (
        <details className="victory-card p-3">
          <summary className="text-[12px] text-victory-muted cursor-pointer min-h-[32px] flex items-center">Points, status and season</summary>
          <div className="space-y-3 mt-3">{points}</div>
        </details>
      ) : points}
      <CallsSummary calls={calls} />
      {!mastery && <Reflection sessionId={sessionId} tags={rewards?.reflection_tags} />}
      <CrewCheer />
      {moment && <FighterCardButton rewards={rewards} overall={overall} liveStats={liveStats} />}
      {moment && <BringYourCrew moment={moment} />}
    </div>
  );
}
