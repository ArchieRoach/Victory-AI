import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { ArrowLeft, Zap, Radio, Users, Smile, TrendingUp, Clock, ChevronRight } from "lucide-react";

const PERIODS = [
  { value: "7d",  label: "7 days"  },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const TYPE_COLORS = {
  training: "bg-blue-500/20 text-blue-400",
  sparring:  "bg-yellow-500/20 text-yellow-400",
  smoker:    "bg-orange-500/20 text-orange-400",
  bout:      "bg-red-500/20 text-red-400",
};

function fmt(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-victory-card border border-victory-border rounded-2xl p-4 flex flex-col gap-1">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 ${accent || "bg-victory-lime/10"}`}>
        <Icon className={`w-4 h-4 ${accent ? "text-white" : "text-victory-lime"}`} />
      </div>
      <p className="text-2xl font-bold text-victory-text">{value}</p>
      <p className="text-victory-muted text-xs">{label}</p>
      {sub && <p className="text-victory-lime text-xs font-medium">{sub}</p>}
    </div>
  );
}

function EarningsChart({ data: rawData }) {
  if (!rawData || rawData.length === 0) return null;

  // Long ranges (e.g. "All time" → 365 daily points) don't fit in the column; bucket them
  // into ~52 groups so bars stay readable instead of collapsing to zero-width slivers.
  let data = rawData;
  if (rawData.length > 60) {
    const size = Math.ceil(rawData.length / 52);
    const buckets = [];
    for (let i = 0; i < rawData.length; i += size) {
      const chunk = rawData.slice(i, i + size);
      buckets.push({
        date:   chunk[0].date,
        label:  chunk[0].label,
        tips:   chunk.reduce((s, d) => s + (d.tips   || 0), 0),
        emotes: chunk.reduce((s, d) => s + (d.emotes || 0), 0),
        total:  chunk.reduce((s, d) => s + (d.total  || 0), 0),
      });
    }
    data = buckets;
  }

  const maxVal = Math.max(...data.map((d) => d.total), 1);

  // For 30-day view, label every 5th bar; for 7-day, label all
  const showLabel = data.length <= 10
    ? () => true
    : (_, i) => i % 5 === 0 || i === data.length - 1;

  return (
    <div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d, i) => {
          const tipH   = Math.round((d.tips   / maxVal) * 96);
          const emoteH = Math.round((d.emotes / maxVal) * 96);
          const isEmpty = d.total === 0;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              {/* Tooltip */}
              {!isEmpty && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                  <div className="bg-victory-bg border border-victory-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap text-center shadow-lg">
                    <p className="text-victory-text font-semibold">{fmt(d.total)} tokens</p>
                    {d.tips   > 0 && <p className="text-victory-lime">Tips: {fmt(d.tips)}</p>}
                    {d.emotes > 0 && <p className="text-violet-400">Emotes: {fmt(d.emotes)}</p>}
                    <p className="text-victory-muted">{d.label}</p>
                  </div>
                  <div className="w-1.5 h-1.5 bg-victory-border rotate-45 -mt-1" />
                </div>
              )}
              {/* Bars */}
              <div className="w-full flex flex-col-reverse" style={{ height: "96px" }}>
                {isEmpty ? (
                  <div className="w-full rounded-sm bg-victory-border/30" style={{ height: "3px" }} />
                ) : (
                  <>
                    {emoteH > 0 && (
                      <div
                        className="w-full rounded-t-sm bg-violet-500/70 transition-all"
                        style={{ height: `${emoteH}px` }}
                      />
                    )}
                    {tipH > 0 && (
                      <div
                        className="w-full bg-victory-lime/80 transition-all"
                        style={{ height: `${tipH}px`, borderRadius: emoteH > 0 ? "0" : "2px 2px 0 0" }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex mt-1.5">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {showLabel(d, i) && (
              <span className="text-[9px] text-victory-muted">{d.label}</span>
            )}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-[10px] text-victory-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-victory-lime/80 inline-block" /> Tips
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-victory-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-500/70 inline-block" /> Emotes
        </span>
      </div>
    </div>
  );
}

function StreamRow({ stream }) {
  const dur = stream.duration_mins != null
    ? stream.duration_mins >= 60
      ? `${Math.floor(stream.duration_mins / 60)}h ${stream.duration_mins % 60}m`
      : `${stream.duration_mins}m`
    : null;

  const date = new Date(stream.created_at);
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="flex items-center gap-3 py-3 border-b border-victory-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-victory-text text-sm font-medium truncate">{stream.title}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${TYPE_COLORS[stream.type] || "bg-victory-border/40 text-victory-muted"}`}>
            {stream.type}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-victory-muted flex-wrap">
          <span>{dateStr}</span>
          {dur && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{dur}</span>}
          <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{stream.viewer_count}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {stream.tips_earned > 0 ? (
          <p className="text-victory-lime text-sm font-bold">+{fmt(stream.tips_earned)}</p>
        ) : (
          <p className="text-victory-muted text-xs">—</p>
        )}
        {stream.tips_earned > 0 && <p className="text-victory-muted text-[10px]">tokens</p>}
      </div>
    </div>
  );
}

function EmoteRow({ emote }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-victory-border last:border-0">
      <img
        src={emote.image_url}
        alt={emote.name}
        className="w-10 h-10 rounded-lg object-cover bg-white/5 flex-shrink-0"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="text-victory-text text-sm font-bold">{emote.emoji} {emote.name}</p>
        <p className="text-victory-muted text-xs">
          {emote.token_price === 0 ? "Free" : `${emote.token_price} tokens`}
          {" · "}
          {emote.unlock_count} total unlocks
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-violet-400 text-sm font-bold">
          {emote.unlocks_period > 0 ? `+${fmt(emote.revenue_period)}` : "—"}
        </p>
        {emote.unlocks_period > 0 && (
          <p className="text-victory-muted text-[10px]">{emote.unlocks_period} unlocks</p>
        )}
      </div>
    </div>
  );
}

export default function StreamerDashboardPage() {
  const navigate  = useNavigate();
  const [period,  setPeriod]  = useState("30d");
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/analytics/dashboard`, { params: { period } })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const ov = data?.overview;

  return (
    <div className="min-h-screen bg-victory-bg pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-victory-text font-bold text-base">Streamer Dashboard</h1>
          <p className="text-victory-muted text-xs">Earnings · Viewers · Emotes</p>
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-1 bg-victory-card border border-victory-border rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === p.value
                  ? "bg-victory-lime text-victory-bg"
                  : "text-victory-muted hover:text-victory-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="w-8 h-8 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-center py-24 text-victory-muted">Failed to load analytics.</div>
      ) : (
        <div className="max-w-lg mx-auto px-4 py-5 space-y-6">

          {/* ── All-time earnings hero ── */}
          <div className="bg-gradient-to-br from-victory-lime/15 to-victory-lime/5 border border-victory-lime/30 rounded-2xl p-5 text-center">
            <p className="text-victory-muted text-xs mb-1">All-time earnings</p>
            <p className="text-4xl font-black text-victory-lime tracking-tight">
              {fmt(ov.total_earned_alltime)}
            </p>
            <p className="text-victory-muted text-xs mt-1">tokens</p>
          </div>

          {/* ── Period stat cards ── */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Zap}
              label={`Tips (${PERIODS.find(p => p.value === period)?.label})`}
              value={fmt(ov.tips_earned_period)}
              sub="tokens from tips"
            />
            <StatCard
              icon={Smile}
              label={`Emote sales (${PERIODS.find(p => p.value === period)?.label})`}
              value={fmt(ov.emotes_earned_period)}
              sub="tokens from emotes"
              accent="bg-violet-500/20"
            />
            <StatCard
              icon={Radio}
              label="Total streams"
              value={fmt(ov.total_streams)}
            />
            <StatCard
              icon={Users}
              label="Total viewers (all streams)"
              value={fmt(ov.total_viewers)}
            />
          </div>

          {/* ── Earnings chart ── */}
          <div className="bg-victory-card border border-victory-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-victory-text font-semibold text-sm">Earnings over time</h2>
                <p className="text-victory-muted text-xs mt-0.5">
                  {fmt(ov.total_earned_period)} tokens this period
                </p>
              </div>
              <TrendingUp className="w-4 h-4 text-victory-lime" />
            </div>
            {data.chart.every(d => d.total === 0) ? (
              <p className="text-victory-muted text-sm text-center py-8">No earnings yet this period.</p>
            ) : (
              <EarningsChart data={data.chart} />
            )}
          </div>

          {/* ── Recent streams ── */}
          <div className="bg-victory-card border border-victory-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-victory-text font-semibold text-sm">Stream history</h2>
              <button
                onClick={() => navigate("/go-live")}
                className="text-victory-lime text-xs flex items-center gap-0.5 hover:underline"
              >
                Go Live <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {data.streams.length === 0 ? (
              <p className="text-victory-muted text-sm text-center py-6">No streams yet.</p>
            ) : (
              data.streams.map((s) => <StreamRow key={s.stream_id} stream={s} />)
            )}
          </div>

          {/* ── Emote performance ── */}
          <div className="bg-victory-card border border-victory-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-victory-text font-semibold text-sm">Emote performance</h2>
              <button
                onClick={() => navigate("/emotes")}
                className="text-victory-lime text-xs flex items-center gap-0.5 hover:underline"
              >
                Studio <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {data.emote_performance.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-victory-muted text-sm">No emotes yet.</p>
                <button
                  onClick={() => navigate("/emotes")}
                  className="mt-2 text-victory-lime text-xs underline"
                >
                  Create your first emote
                </button>
              </div>
            ) : (
              data.emote_performance.map((e) => <EmoteRow key={e.emote_id} emote={e} />)
            )}
          </div>

        </div>
      )}
    </div>
  );
}
