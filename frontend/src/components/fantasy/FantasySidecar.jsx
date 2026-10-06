import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useFantasyLeague } from "@/hooks/useFantasyLeague";
import { isCardLocked } from "@/lib/fantasyScoring";
import { DraftPanel } from "@/components/fantasy/DraftPanel";
import { ScorecardPanel } from "@/components/fantasy/ScorecardPanel";
import { LeaguePanel } from "@/components/fantasy/LeaguePanel";
import { AdminPanel } from "@/components/fantasy/AdminPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Fantasy Boxing sidecar — sits beside the live player (StreamViewPage's "Fantasy" tab).
//
// Goal: give friends watching the same card something to play together, with nothing at
//   stake.
// Psychology: social prediction is fun because you're proven right in front of friends.
//   It needs no money to work, and keeping money out keeps it halal and safe for teens.
// Design: Draft → Scorecard → League tabs, with a "free to play" line always visible.
//   No entry fee, no tokens, no prizes, and a fictional budget.
//
// Props:
//   cardId  — the fight card being streamed. REAL BACKEND: take it from the stream
//             (e.g. stream.fight_card_id) once streams are linked to cards.
//   user    — the signed-in user from useAuth().
//   showAdmin — shows the test controls (mock data only; see fantasyAdminAllowed below).
//   api     — the backend base URL; given, the card is a real one (see lib/fantasyApi.js).
//   league  — "squad" (friends) or a private league id, for the Friends tab.
// ─────────────────────────────────────────────────────────────────────────────

// Three tabs named for what you do there, in the order you do it.
const TABS = [
  { key: "draft", label: "1. Pick" },
  { key: "score", label: "2. My team" },
  { key: "league", label: "3. Friends" },
];

export function FantasySidecar({ cardId = "card_demo", user, showAdmin = false, api, league: leagueId = "squad" }) {
  const { service, card, me, league, movement, myStable } = useFantasyLeague({ cardId, user, api, league: leagueId });
  // Before the card starts, land on Draft; once it's under way, land on the scorecard.
  const [tab, setTab] = useState(() => (isCardLocked(card) && me.saved ? "score" : "draft"));
  const tabs = showAdmin && service.admin ? [...TABS, { key: "admin", label: "Admin" }] : TABS;

  return (
    <section className="space-y-3" data-testid="fantasy-sidecar" aria-label="Fantasy boxing">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading font-extrabold text-victory-text text-base leading-tight truncate">
            {card.title} {card.venue && <span className="text-victory-muted font-body font-normal text-xs">· {card.venue}</span>}
          </h2>
          {card.sponsor?.name && <SponsorLine sponsor={card.sponsor} />}
          <p className="text-[11px] text-victory-teal flex items-center gap-1 mt-0.5" data-testid="free-to-play">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" /> Free game · no money, ever · just for fun with friends
          </p>
        </div>
        <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${
          card.status === "live" ? "bg-victory-danger/15 text-victory-danger" : card.status === "complete" ? "bg-victory-card-highlight text-victory-muted" : "bg-victory-lime/15 text-victory-lime"
        }`}>
          {card.status === "upcoming" ? "Pick now" : card.status === "live" ? "Fights on" : "Finished"}
        </span>
      </header>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`filter-pill ${tab === t.key ? "filter-pill-active" : "filter-pill-inactive"}`}
          >
            {t.label}
            {t.key === "score" && me.saved && <span className="ml-1 font-mono">{myStable.total}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "draft" && <DraftPanel card={card} me={me} service={service} />}
        {tab === "score" && <ScorecardPanel myStable={myStable} me={me} />}
        {tab === "league" && <LeaguePanel league={league} movement={movement} />}
        {tab === "admin" && showAdmin && service.admin && <AdminPanel card={card} service={service} />}
      </div>
    </section>
  );
}

// Sponsored leagues: a plain "presented by" credit. The sponsor funds the game, never prizes
// or points, and only non-gambling, non-alcohol, non-interest brands are accepted.
function SponsorLine({ sponsor }) {
  const label = <>Presented by <span className="font-semibold text-victory-text">{sponsor.name}</span></>;
  return (
    <p className="text-[10px] text-victory-muted mt-0.5" data-testid="fantasy-sponsor">
      {sponsor.url ? <a href={sponsor.url} target="_blank" rel="noopener noreferrer sponsored" className="hover:underline">{label}</a> : label}
    </p>
  );
}

// The sidecar runs on mock data until the backend exists, so it's off for viewers by
// default. Turn it on with REACT_APP_FANTASY_ENABLED=true (Vercel env) or ?fantasy=1 to
// preview it on any stream. The admin tab needs ?fantasyAdmin=1 (or a dev build).
export function fantasyEnabled(search = typeof window !== "undefined" ? window.location.search : "") {
  return process.env.REACT_APP_FANTASY_ENABLED === "true" || new URLSearchParams(search).has("fantasy");
}

export function fantasyAdminAllowed(search = typeof window !== "undefined" ? window.location.search : "") {
  return process.env.NODE_ENV !== "production" || new URLSearchParams(search).has("fantasyAdmin");
}
