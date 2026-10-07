import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CalendarDays, Lock, Swords, Trophy, Handshake } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { FantasySidecar } from "@/components/fantasy/FantasySidecar";
import { LeagueSwitcher } from "@/components/fantasy/LeagueSwitcher";
import { CosmeticsSheet } from "@/components/fantasy/CosmeticsSheet";

// Goal: a free fantasy game on every real UK show and world-title fight, with no admin
//   needed for pro cards.
// Psychology: a fixture list makes the next fight feel close ("Saturday: pick now"), and
//   that coming event pulls people back. Season totals turn single nights into progress
//   you can see.
// Design: next cards first, with the live one on top. Tapping a card opens the same
//   Pick / My team / Friends game as the stream sidecar. Season standings are a Pro perk;
//   playing never is.
const REASON = { uk: "UK show", world_title: "World title", amateur: "Amateur", promoter: "Featured" };
const STATUS = { upcoming: "Pick now", live: "Fights on", complete: "Finished" };
const PRACTICE = "practice";

function formatDay(iso) {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function FantasyPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const cardId = params.get("card");
  const [cards, setCards] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [league, setLeague] = useState("squad");
  const [season, setSeason] = useState(null);
  const [view, setView] = useState("cards"); // cards | season | looks
  const isPro = !!user?.has_subscription;

  // Back from Stripe checkout: switch the item on now rather than waiting for the webhook.
  useEffect(() => {
    const sid = params.get("cosmetic_paid");
    if (!sid) return;
    setParams({}, { replace: true });
    setView("looks");
    axios.get(`${API}/fantasy/cosmetics/confirm`, { params: { session_id: sid } })
      .then(({ data }) => (data.paid ? toast.success(`${data.name} is yours! Tap Use to show it off.`) : toast("Payment still processing: it'll appear shortly.")))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    axios.get(`${API}/fantasy/cards`).then((r) => setCards(r.data)).catch(() => setCards([]));
  }, []);

  const loadLeagues = useCallback(
    () => axios.get(`${API}/fantasy/leagues/mine`).then((r) => setLeagues(r.data)).catch(() => {}),
    [],
  );
  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  useEffect(() => {
    if (view !== "season" || !isPro) return;
    setSeason(null);
    axios.get(`${API}/fantasy/season`, { params: { league } }).then((r) => setSeason(r.data)).catch(() => setSeason({ standings: [] }));
  }, [view, league, isPro]);

  const open = (id) => setParams(id ? { card: id } : {});

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2">
          <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back"
            onClick={() => (cardId ? open(null) : navigate(-1))}>
            <ArrowLeft className="w-5 h-5 text-victory-text" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-extrabold text-victory-text">Fantasy Boxing</h1>
            <p className="text-victory-muted text-sm">Real fights. Free to play. No money, ever.</p>
          </div>
        </header>
      </div>

      {/* Extra bottom room so the floating feedback button never covers the last item. */}
      <main className="max-w-lg mx-auto px-4 pt-4 pb-40 space-y-4">
        {cardId === PRACTICE ? (
          <FantasySidecar key="practice" cardId="card_demo" user={user} practice />
        ) : cardId ? (
          <>
            <LeagueSwitcher api={API} leagues={leagues} value={league} onChange={setLeague} onLeaguesChanged={loadLeagues} isPro={isPro} />
            <FantasySidecar key={`${cardId}-${league}`} cardId={cardId} user={user} api={API} league={league} />
          </>
        ) : (
          <>
            <div className="flex gap-1.5" role="tablist">
              {[["cards", "Fights"], ["season", "Season"], ["looks", "Team looks"]].map(([key, label]) => (
                <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
                  className={`filter-pill ${view === key ? "filter-pill-active" : "filter-pill-inactive"}`}>
                  {label}
                </button>
              ))}
            </div>

            {view === "cards" && <CardList cards={cards} onOpen={open} onCamp={() => navigate("/camp")} />}
            {view === "season" && (isPro ? (
              <>
                <LeagueSwitcher api={API} leagues={leagues} value={league} onChange={setLeague} onLeaguesChanged={loadLeagues} isPro={isPro} />
                <Season season={season} />
              </>
            ) : <SeasonLocked onUpgrade={() => navigate("/paywall")} />)}
            {view === "looks" && <CosmeticsSheet api={API} />}

            <Link to="/fantasy/partners" className="victory-card p-3 flex items-center gap-3 active:scale-[0.99] transition-transform">
              <Handshake className="w-4 h-4 text-victory-teal flex-shrink-0" />
              <span className="text-[11px] text-victory-muted">Promoter or brand? <span className="text-victory-text font-semibold">Feature your show or sponsor a league</span></span>
            </Link>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function CardList({ cards, onOpen, onCamp }) {
  if (!cards) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-16 rounded-lg" />)}</div>;
  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <CalendarDays className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">No fights this fortnight</p>
        <p className="text-victory-muted text-sm">Real cards appear here up to two weeks before. Learn the game on a practice card while you wait.</p>
        <button className="mt-4 victory-btn-primary w-auto px-6" onClick={() => onOpen(PRACTICE)}>Try a practice card</button>
        <button className="mt-2 victory-btn-ghost w-auto px-6" onClick={onCamp}>Got a fight? Add it</button>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="fantasy-cards">
      {cards.map((c) => (
        <button key={c.card_id} onClick={() => onOpen(c.card_id)}
          className={`victory-card p-3 w-full text-left flex items-center gap-3 active:scale-[0.99] transition-transform ${c.featured ? "border-victory-lime/30 bg-victory-lime/5" : ""}`}>
          <div className="w-11 h-11 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
            {c.reason === "world_title" ? <Trophy className="w-5 h-5 text-victory-lime" /> : <Swords className="w-5 h-5 text-victory-lime" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-victory-text text-sm font-semibold truncate">{c.title}</p>
            <p className="text-victory-muted text-[11px] truncate">
              {formatDay(c.date)} · {c.location || REASON[c.reason]} · {c.bout_count} fights
            </p>
            {(c.sponsor?.name || c.promoter) && (
              <p className="text-victory-teal text-[10px] truncate">{c.sponsor?.name ? `Presented by ${c.sponsor.name}` : c.promoter}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded-full ${
              c.status === "live" ? "bg-victory-danger/15 text-victory-danger" : c.status === "complete" ? "bg-victory-card-highlight text-victory-muted" : "bg-victory-lime/15 text-victory-lime"
            }`}>{STATUS[c.status]}</span>
            {c.entered && <p className="text-[10px] text-victory-lime mt-1">Team in</p>}
          </div>
        </button>
      ))}
    </div>
  );
}

function Season({ season }) {
  if (!season) return <div className="skeleton-shimmer h-32 rounded-lg" />;
  if (!season.standings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <Trophy className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">Season starts with your first fight</p>
        <p className="text-victory-muted text-sm">Points from every card in the last {season.days || 90} days add up here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="fantasy-season">
      <p className="section-label mb-2">Last {season.days} days</p>
      {season.standings.map((m) => (
        <div key={m.user_id} className={`victory-card px-3 py-2 flex items-center gap-3 ${m.isMe ? "border-victory-lime/40 bg-victory-lime/5" : ""}`}>
          <span className={`font-mono font-bold w-6 text-center ${m.rank === 1 ? "text-victory-lime" : "text-victory-muted"}`}>{m.rank}</span>
          <div className="flex-1 min-w-0">
            <p className="text-victory-text text-sm font-semibold truncate">{m.isMe ? `${m.name} (you)` : m.name}</p>
            <p className="text-victory-muted text-[10px]">{m.cards} card{m.cards === 1 ? "" : "s"}</p>
          </div>
          <span className="font-mono font-bold text-victory-text">{m.total}</span>
        </div>
      ))}
    </div>
  );
}

function SeasonLocked({ onUpgrade }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-victory-lime/60" />
      </div>
      <p className="text-victory-text font-bold text-lg mb-1">Season table is a Pro perk</p>
      <p className="text-victory-muted text-sm">See who's best over every fight night, and make your own leagues. Playing stays free.</p>
      <button className="mt-4 victory-btn-primary w-auto px-6" onClick={onUpgrade}>See Pro</button>
    </div>
  );
}
