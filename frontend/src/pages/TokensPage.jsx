import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { ArrowLeft, Zap, Check, Shield, RefreshCw } from "lucide-react";
import { tx } from "@/i18n/tx";

const FALLBACK_PACKAGES = [
  {
    id: "starter",  tokens: 200,  price: 1.99,  get label() { return tx("ui.tokensPage.starter", "Starter"); },
    badge: null,           highlight: false, get tagline() { return tx("ui.tokensPage.getInTheRing", "Get in the ring"); },
    perks: ["2–3 tips", "4 emote unlocks", "Try punch alerts"],
    cents_per_token: 1.00, savings_pct: 0,
  },
  {
    id: "fighter",  tokens: 500,  price: 4.99,  get label() { return tx("ui.tokensPage.fighter", "Fighter"); },
    badge: "Most Popular", highlight: true,  get tagline() { return tx("ui.tokensPage.stayInTheFight", "Stay in the fight"); },
    perks: ["8–10 tips", "10 emote unlocks", "Full punch menu"],
    cents_per_token: 1.00, savings_pct: 0,
  },
  {
    id: "champion", tokens: 1200, price: 9.99,  get label() { return tx("ui.tokensPage.champion", "Champion"); },
    badge: "Best Value",   highlight: false, get tagline() { return tx("ui.tokensPage.goHard", "Go hard"); },
    perks: ["20+ tips", "24 emote unlocks", "Title Shot alerts"],
    cents_per_token: 0.83, savings_pct: 17,
  },
  {
    id: "legend",   tokens: 3000, price: 19.99, get label() { return tx("ui.tokensPage.legend", "Legend"); },
    badge: "Go All Out",   highlight: false, get tagline() { return tx("ui.tokensPage.dominateTheFeed", "Dominate the feed"); },
    perks: ["60+ tips", "60 emote unlocks", "All punch tiers"],
    cents_per_token: 0.67, savings_pct: 33,
  },
];

const TOKEN_USES = [
  { emoji: "⚡", get label() { return tx("ui.tokensPage.tipStreamers", "Tip streamers"); },  get sub() { return tx("ui.tokensPage.showLoveGetOn", "Show love, get on the leaderboard"); } },
  { emoji: "🎭", get label() { return tx("ui.tokensPage.unlockEmotes", "Unlock emotes"); },  get sub() { return tx("ui.tokensPage.buyCustomEmotesFrom", "Buy custom emotes from any streamer"); } },
  { emoji: "💥", get label() { return tx("ui.tokensPage.punchAlerts", "Punch alerts"); },   get sub() { return tx("ui.tokensPage.sendExplosiveOnStream", "Send explosive on-stream reactions"); } },
  { emoji: "🎁", get label() { return tx("ui.tokensPage.giftSubs", "Gift subs"); },      get sub() { return tx("ui.tokensPage.giveASubscriptionTo", "Give a subscription to the community"); } },
];

function PackageCard({ pkg, selected, onSelect }) {
  const isSelected = selected === pkg.id;
  return (
    <button
      onClick={() => onSelect(pkg.id)}
      className={`relative w-full text-left rounded-2xl border-2 p-4 transition-all ${
        isSelected
          ? "border-victory-lime bg-victory-lime/10 scale-[1.01]"
          : pkg.highlight
          ? "border-victory-lime/40 bg-victory-card"
          : "border-victory-border bg-victory-card hover:border-victory-lime/30"
      }`}
    >
      {/* Badge */}
      {pkg.badge && (
        <span className={`absolute -top-3 left-4 text-[11px] font-bold px-3 py-0.5 rounded-full ${
          pkg.badge === "Most Popular" ? "bg-victory-lime text-victory-bg"
          : pkg.badge === "Best Value" ? "bg-violet-500 text-white"
          : "bg-victory-orange text-white"
        }`}>
          {pkg.badge}
        </span>
      )}

      <div className="flex items-start justify-between gap-3 mt-1">
        {/* Left: name + perks */}
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-base ${isSelected ? "text-victory-lime" : "text-victory-text"}`}>
            {pkg.label}
          </p>
          <p className="text-victory-muted text-xs mb-2">{pkg.tagline}</p>
          <div className="space-y-1">
            {pkg.perks.map((perk) => (
              <div key={perk} className="flex items-center gap-1.5">
                <Check className={`w-3 h-3 flex-shrink-0 ${isSelected ? "text-victory-lime" : "text-victory-muted"}`} />
                <span className={`text-xs ${isSelected ? "text-victory-text" : "text-victory-muted"}`}>{perk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: token count + price */}
        <div className="text-right flex-shrink-0">
          <p className={`font-mono font-black text-2xl leading-none ${isSelected ? "text-victory-lime" : "text-victory-text"}`}>
            {pkg.tokens >= 1000 ? `${pkg.tokens / 1000}K` : pkg.tokens}
          </p>
          <p className={`text-xs mt-0.5 ${isSelected ? "text-victory-lime/70" : "text-victory-muted"}`}>{tx("ui.tokensPage.tokens", "tokens")}</p>
          <p className={`font-bold text-sm mt-2 ${isSelected ? "text-victory-lime" : "text-victory-text"}`}>
            £{pkg.price.toFixed(2)}
          </p>
          {pkg.savings_pct > 0 && (
            <p className="text-victory-lime text-[10px] font-semibold mt-0.5">
              {tx("ui.tokensPage.save", "Save")} {pkg.savings_pct}%
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function TokensPage() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user }   = useAuth();

  const [packages, setPackages] = useState(FALLBACK_PACKAGES);
  const [selected, setSelected] = useState("fighter");
  const [balance,  setBalance]  = useState(user?.token_balance ?? null);
  const [loading,  setLoading]  = useState(false);

  // returnPath: where the user was before — passed via location.state or default to /live
  const returnPath = location.state?.returnPath || "/live";

  useEffect(() => {
    const load = async () => {
      try {
        const [pkgRes, balRes] = await Promise.all([
          axios.get(`${API}/tokens/packages`),
          axios.get(`${API}/tokens/balance`),
        ]);
        setPackages(pkgRes.data);
        setBalance(balRes.data.balance);
      } catch {}
    };
    load();
  }, []);

  const handleBuy = async () => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${API}/tokens/purchase`,
        null,
        {
          params: {
            pkg_id:      selected,
            origin_url:  window.location.origin,
            return_path: "/tokens",
          },
        }
      );
      window.location.href = res.data.checkout_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || tx("ui.tokensPage.couldNotStartCheckout", "Could not start checkout — please try again."));
      setLoading(false);
    }
  };

  const pkg = packages.find((p) => p.id === selected);

  return (
    <div className="min-h-screen bg-victory-bg pb-28">

      {/* Header */}
      <div className="sticky top-0 z-20 material-header px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(returnPath)} aria-label={tx("ui.tokensPage.goBack", "Go back")} className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-victory-text font-bold text-base">{tx("ui.tokensPage.getTokens", "Get Tokens")}</h1>
          <p className="text-victory-muted text-xs">{tx("ui.tokensPage.fuelYourFight", "Fuel your fight")}</p>
        </div>
        {balance !== null && (
          <div className="flex items-center gap-1.5 bg-victory-lime/10 border border-victory-lime/30 rounded-full px-3 py-1">
            <Zap className="w-3.5 h-3.5 text-victory-lime" />
            <span className="text-victory-lime text-xs font-bold font-mono">{balance.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">

        {/* What tokens do */}
        <div className="grid grid-cols-2 gap-3">
          {TOKEN_USES.map((u) => (
            <div key={u.label} className="bg-victory-card border border-victory-border rounded-xl p-3 flex items-start gap-2">
              <span className="text-xl flex-shrink-0">{u.emoji}</span>
              <div>
                <p className="text-victory-text text-xs font-semibold">{u.label}</p>
                <p className="text-victory-muted text-[10px] mt-0.5 leading-snug">{u.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Package cards */}
        <div className="space-y-3 pt-1">
          <h2 className="text-victory-text font-semibold text-sm">{tx("ui.tokensPage.chooseYourPack", "Choose your pack")}</h2>
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} selected={selected} onSelect={setSelected} />
          ))}
        </div>

        {/* Trust row */}
        <div className="flex items-center justify-center gap-6 text-victory-muted text-xs">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> {tx("ui.tokensPage.securedByStripe", "Secured by Stripe")}
          </span>
          <span>·</span>
          <span>{tx("ui.tokensPage.instantDelivery", "Instant delivery")}</span>
          <span>·</span>
          <span>{tx("ui.tokensPage.nonRefundable", "Non-refundable")}</span>
        </div>

      </div>

      {/* Sticky buy bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-victory-bg/95 backdrop-blur border-t border-victory-border p-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleBuy}
            disabled={loading || !pkg}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-victory-lime text-victory-bg font-extrabold text-base disabled:opacity-40 active:scale-[0.99] transition-all"
          >
            {loading ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> {tx("ui.tokensPage.openingCheckout", "Opening checkout…")}</>
            ) : pkg ? (
              <><Zap className="w-5 h-5" /> {tx("ui.tokensPage.buy", "Buy")} {pkg.tokens.toLocaleString()} {tx("ui.tokensPage.tokens2", "tokens — £")}{pkg.price.toFixed(2)}</>
            ) : null}
          </button>
          {pkg?.savings_pct > 0 && !loading && (
            <p className="text-center text-victory-lime text-xs mt-2 font-medium">
              {pkg.savings_pct}{tx("ui.tokensPage.cheaperPerTokenThan", "% cheaper per token than the base rate")}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
