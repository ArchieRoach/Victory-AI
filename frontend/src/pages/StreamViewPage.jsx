import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Radio, Users, Scissors, Zap, Gift, Smile, UserPlus, UserCheck, X, Share2, Flag } from "lucide-react";
import { ShareSheet } from "@/components/ShareSheet";
import { ReportModal } from "@/components/ReportModal";
import LivePlayer from "@/components/LivePlayer";
import LiveChat from "@/components/LiveChat";
import { TipModal }           from "@/components/streaming/TipModal";
import { PunchAlert }         from "@/components/streaming/PunchAlert";
import { TopKnockouts }       from "@/components/streaming/TopKnockouts";
import { GiftSubModal }       from "@/components/streaming/GiftSubModal";
import { SponsorBanner }      from "@/components/streaming/SponsorBanner";
import { TokenPurchaseModal } from "@/components/streaming/TokenPurchaseModal";
import { EmoteShop }          from "@/components/streaming/EmoteShop";

const TYPE_COLORS = {
  training: "bg-blue-500/20 text-blue-400",
  sparring:  "bg-yellow-500/20 text-yellow-400",
  smoker:    "bg-orange-500/20 text-orange-400",
  bout:      "bg-red-500/20 text-red-400",
};

export default function StreamViewPage() {
  const { streamId } = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();

  const [stream,       setStream]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(null);
  const [clipping,     setClipping]     = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [following,    setFollowing]    = useState(false);
  const [followBusy,   setFollowBusy]   = useState(false);

  // Clip + share flow
  const [clipPost,       setClipPost]       = useState(null);   // saved clip post
  const [showClipModal,  setShowClipModal]  = useState(false);
  const [clipCaption,    setClipCaption]    = useState("");
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Modal visibility
  const [showTip,     setShowTip]     = useState(false);
  const [showGift,    setShowGift]    = useState(false);
  const [showTopUp,   setShowTopUp]   = useState(false);
  const [showEmotes,  setShowEmotes]  = useState(false);
  const [showReport,  setShowReport]  = useState(false);

  // PunchAlert queue: array of tip/gift events awaiting display
  const [alertQueue, setAlertQueue] = useState([]);
  // Trigger for leaderboard refresh on each new tip
  const [tipTick, setTipTick] = useState(0);

  const streamStartRef = useRef(Date.now());

  // ── Fetch stream + token balance ──────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Stream is required; the token balance is best-effort and must not block the page.
        const streamRes = await axios.get(`${API}/streams/${streamId}`);
        setStream(streamRes.data);
        setLoadError(null);
        streamStartRef.current = Date.now();
        axios.get(`${API}/tokens/balance`)
          .then((r) => setTokenBalance(r.data.balance))
          .catch(() => {});
        // Load follow state for this streamer
        if (streamRes.data.user_id && streamRes.data.user_id !== user?.user_id) {
          try {
            const profileRes = await axios.get(`${API}/users/${streamRes.data.user_id}/profile`);
            setFollowing(profileRes.data.is_following);
          } catch {}
        }
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
          toast.error("Stream not found.");
          navigate("/live");
        } else if (status === 403) {
          setLoadError("This stream is private.");
        } else {
          setLoadError("Couldn't load this stream. Check your connection and try again.");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAll();

    const poll = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/streams/${streamId}`);
        setStream((prev) => prev ? { ...prev, viewer_count: res.data.viewer_count, status: res.data.status } : prev);
      } catch {}
    }, 30_000);
    return () => clearInterval(poll);
  }, [streamId, navigate]);

  // ── WebSocket event handlers ──────────────────────────────────────────────
  const handleTipEvent = useCallback((data) => {
    setAlertQueue((q) => [...q, { ...data, _key: data.tip_id || Date.now() }]);
    setTipTick((n) => n + 1);
    // Balance is refreshed via handleTipSuccess after the API call confirms — no optimistic deduction
  }, []);

  const handleGiftEvent = useCallback((data) => {
    setAlertQueue((q) => [...q, { ...data, type: "gift_sub", _key: `gift-${Date.now()}` }]);
  }, []);

  const dismissAlert = useCallback((event) => {
    setAlertQueue((q) => q.filter((e) => e._key !== event._key));
  }, []);

  // ── Clip handler ──────────────────────────────────────────────────────────
  const handleClip = async () => {
    if (!stream?.playback_id) return;
    setClipping(true);
    const end = Date.now();
    try {
      const res = await axios.post(`${API}/streams/${streamId}/clip`, null, {
        params: { start_time: end - 30_000, end_time: end },
      });
      setClipPost(res.data);
      setClipCaption(res.data.caption || "");
      setShowClipModal(true);
    } catch {
      toast.error("Clip failed — try again.");
    } finally {
      setClipping(false);
    }
  };

  const handleClipShare = async () => {
    setShowClipModal(false);
    setShowShareSheet(true);
  };

  const handleClipDismiss = () => {
    setShowClipModal(false);
    toast.success("Clip saved to your profile!");
  };

  // ── Follow / unfollow the streamer ───────────────────────────────────────
  const handleFollow = async () => {
    if (!stream?.user_id) return;
    setFollowBusy(true);
    try {
      if (following) {
        await axios.delete(`${API}/follows/${stream.user_id}`);
        setFollowing(false);
      } else {
        await axios.post(`${API}/follows/${stream.user_id}`);
        setFollowing(true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update follow.");
    }
    setFollowBusy(false);
  };

  // ── After successful tip, refresh balance ─────────────────────────────────
  const handleTipSuccess = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/tokens/balance`);
      setTokenBalance(res.data.balance);
    } catch {}
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-victory-muted">{loadError || "Stream unavailable."}</p>
        <button
          onClick={() => navigate("/live")}
          className="px-5 py-2 rounded-full bg-victory-lime text-black font-semibold"
        >
          Back to live
        </button>
      </div>
    );
  }

  const isLive = stream.status === "live";

  return (
    <div className="min-h-screen bg-black flex flex-col">

      {/* ── Punch alert overlay (renders above everything) ── */}
      <PunchAlert events={alertQueue} onDismiss={dismissAlert} />

      {/* ── Clip saved modal ── */}
      {showClipModal && clipPost && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={handleClipDismiss}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full bg-victory-bg rounded-t-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-victory-border mx-auto" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                <Scissors className="w-5 h-5 text-victory-lime" />
              </div>
              <div>
                <p className="text-victory-text font-bold">Clip saved!</p>
                <p className="text-victory-muted text-xs">Share it to start trending</p>
              </div>
              <button onClick={handleClipDismiss} aria-label="Dismiss" className="w-11 h-11 -my-2.5 -mr-2 ml-auto flex items-center justify-center touch-target text-victory-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClipShare}
                className="flex-1 flex items-center justify-center gap-2 bg-victory-lime text-victory-bg font-bold py-3 rounded-xl"
              >
                <Share2 className="w-4 h-4" /> Share Now
              </button>
              <button
                onClick={handleClipDismiss}
                className="flex-1 victory-btn-ghost py-3 text-sm"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share sheet ── */}
      {showShareSheet && clipPost && (
        <ShareSheet
          post={clipPost}
          onClose={() => { setShowShareSheet(false); toast.success("Clip shared!"); }}
          onShared={() => {}}
        />
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80">
        <button onClick={() => navigate("/live")} aria-label="Go back" className="w-11 h-11 -mx-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isLive && (
              <span className="flex items-center gap-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                <Radio className="w-3 h-3" /> LIVE
              </span>
            )}
            {stream.type && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${TYPE_COLORS[stream.type] || "bg-victory-border text-victory-muted"}`}>
                {stream.type}
              </span>
            )}
          </div>
          <h1 className="text-victory-text font-semibold text-sm truncate mt-0.5">{stream.title}</h1>
        </div>
        <div className="flex items-center gap-1 text-victory-muted text-xs flex-shrink-0">
          <Users className="w-3.5 h-3.5" />
          {stream.viewer_count}
        </div>
        <button
          onClick={() => setShowReport(true)}
          aria-label="Report stream"
          className="w-11 h-11 -mx-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-danger flex-shrink-0"
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>

      {showReport && (
        <ReportModal contentType="stream" contentId={streamId} onClose={() => setShowReport(false)} />
      )}

      {/* ── Sponsor banner (above video) ── */}
      <SponsorBanner simulateAd={false} />

      {/* ── Video player ── */}
      <LivePlayer playbackId={stream.playback_id} autoPlay />

      {/* ── Stream info bar ── */}
      <div className="bg-victory-bg px-4 py-3 border-b border-victory-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {stream.user_avatar ? (
              <img src={stream.user_avatar} alt={stream.user_name} className="w-8 h-8 rounded-full object-cover border border-victory-border flex-shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-sm font-bold flex-shrink-0">
                {(stream.display_name || stream.user_name || "F")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-victory-text text-sm font-semibold truncate">{stream.display_name || stream.user_name}</p>
              {stream.weight_class && (
                <p className="text-victory-muted text-xs">{stream.weight_class} · {stream.category}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Follow button — only shown for other people's streams */}
            {stream.user_id !== user?.user_id && (
              <button
                onClick={handleFollow}
                disabled={followBusy}
                className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors disabled:opacity-50 ${
                  following
                    ? "border-victory-border text-victory-muted hover:border-red-500/40 hover:text-red-400"
                    : "border-victory-lime text-victory-lime hover:bg-victory-lime/10"
                }`}
              >
                {following ? <UserCheck className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                {followBusy ? "…" : following ? "Following" : "Follow"}
              </button>
            )}

            {/* Token balance chip — tap to top up */}
            <button
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1 bg-victory-lime/10 border border-victory-lime/30 text-victory-lime text-xs font-mono font-bold px-2.5 py-1 rounded-full hover:bg-victory-lime/20 transition-colors"
            >
              <Zap className="w-3 h-3" />
              {tokenBalance.toLocaleString()}
            </button>

            {/* Emotes shop button */}
            <button
              onClick={() => setShowEmotes(true)}
              className="flex items-center gap-1.5 border border-victory-border text-victory-text text-xs rounded-lg px-3 py-1.5 hover:border-victory-lime transition-colors"
            >
              <Smile className="w-3.5 h-3.5" />
              Emotes
            </button>

            {isLive && user?.has_subscription && (
              <button
                onClick={handleClip}
                disabled={clipping}
                className="flex items-center gap-1.5 border border-victory-border text-victory-text text-xs rounded-lg px-3 py-1.5 hover:border-victory-lime transition-colors disabled:opacity-50"
              >
                <Scissors className="w-3.5 h-3.5" />
                {clipping ? "Saving..." : "Clip 30s"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Chat section ── */}
      <div className="flex-1 bg-victory-bg p-3 space-y-3">
        {/* Leaderboard widget */}
        <TopKnockouts streamId={streamId} refreshTrigger={tipTick} />

        {/* Chat */}
        <LiveChat
          streamId={streamId}
          streamOwnerId={stream?.user_id}
          user={user}
          className="h-full"
          onTipEvent={handleTipEvent}
          onGiftEvent={handleGiftEvent}
          onTipClick={() => setShowTip(true)}
          onGiftClick={() => setShowGift(true)}
        />

        {/* Token top-up prompt if balance is low */}
        {tokenBalance < 50 && (
          <button
            onClick={() => setShowTopUp(true)}
            className="w-full py-2.5 rounded-xl border border-victory-lime/30 text-victory-lime text-xs font-semibold flex items-center justify-center gap-2 hover:bg-victory-lime/10 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Top up tokens to tip the streamer
          </button>
        )}
      </div>

      {/* ── Modals ── */}
      {showTip && (
        <TipModal
          streamId={streamId}
          balance={tokenBalance}
          onClose={() => setShowTip(false)}
          onSuccess={handleTipSuccess}
          onTopUp={() => setShowTopUp(true)}
        />
      )}
      {showGift && (
        <GiftSubModal
          streamId={streamId}
          onClose={() => setShowGift(false)}
        />
      )}
      {showTopUp && (
        <TokenPurchaseModal
          onClose={() => setShowTopUp(false)}
        />
      )}
      {showEmotes && stream && (
        <EmoteShop
          streamOwnerId={stream.user_id}
          tokenBalance={tokenBalance}
          onClose={() => setShowEmotes(false)}
          onBalanceChange={(delta) => setTokenBalance((b) => Math.max(0, b + delta))}
        />
      )}
    </div>
  );
}
