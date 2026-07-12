import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Bell, Heart, MessageCircle, Users,
  Send, Tv, ChevronDown, ChevronUp, Zap, Gift, Share2, Flame,
} from "lucide-react";
import { ShareSheet } from "@/components/ShareSheet";

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(str) {
  try { return formatDistanceToNow(new Date(str), { addSuffix: true }); }
  catch { return ""; }
}

function fmtViewers(n = 0) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── Training tips injected into the For You feed every 8 posts ───────────────
const TRAINING_TIPS = [
  { title: "Stance Check",       body: "Feet shoulder-width apart. Lead foot pointed forward, rear foot turned 45°. Weight on the balls of your feet." },
  { title: "The Jab is King",    body: "Your jab sets everything up. Throw it with your shoulder, not just your arm — rotate and snap." },
  { title: "Breathe Out",        body: "Exhale sharply on every punch. It engages your core and resets your breathing rhythm automatically." },
  { title: "Eyes on the Chest",  body: "Watch the chest, not the eyes. The chest telegraphs every punch and you'll see the whole body in peripheral vision." },
  { title: "Return to Guard",    body: "Every combination should end with both hands back at your chin. Punching out then dropping them costs you." },
  { title: "Use Your Legs",      body: "Power comes from the ground up — push off your rear foot on the cross, pivot on your lead foot on the hook." },
  { title: "Head Movement",      body: "After you punch, move your head. A stationary fighter is an easy target." },
];

// ── Notification icon + copy ──────────────────────────────────────────────────
const NOTIF_META = {
  like:    { icon: Heart,   color: "text-red-400",          text: (n) => `${n.actor_name} liked your post` },
  comment: { icon: MessageCircle, color: "text-sky-400",    text: (n) => `${n.actor_name} commented: "${n.text?.slice(0, 60)}${n.text?.length > 60 ? "…" : ""}"` },
  tip:     { icon: Zap,     color: "text-victory-lime",     text: (n) => `${n.actor_name} tipped you ${n.amount?.toLocaleString()} tokens${n.message ? ` · "${n.message}"` : ""}` },
  gift_sub:{ icon: Gift,    color: "text-violet-400",       text: (n) => `${n.actor_name} gifted ${n.count || 1} sub${(n.count || 1) > 1 ? "s" : ""}` },
};

// ── Feed card: Live Stream ────────────────────────────────────────────────────
function LiveStreamFeedCard({ stream }) {
  const navigate = useNavigate();
  const isLive   = stream.status === "live";
  const name     = stream.display_name || stream.user_name || "Fighter";

  return (
    <button
      onClick={() => navigate(`/stream/${stream.stream_id}`)}
      className="w-full text-left group"
    >
      <div className="relative w-full aspect-video bg-gradient-to-br from-[#1a1a2e] to-black overflow-hidden rounded-none">
        {stream.user_avatar ? (
          <img src={stream.user_avatar} alt={name}
            className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* Centre avatar */}
        <div className="absolute inset-0 flex items-center justify-center">
          {stream.user_avatar ? (
            <img src={stream.user_avatar} alt={name} className="w-16 h-16 rounded-full object-cover border-2 border-white/30 shadow-xl" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-2xl font-bold">
              {name[0].toUpperCase()}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded shadow">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE
            </span>
          ) : (
            <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded">
              Recent
            </span>
          )}
          {stream.category && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded backdrop-blur-sm ${
              stream.category === "Professional" ? "bg-victory-lime text-black" : "bg-white/20 text-white"
            }`}>{stream.category}</span>
          )}
          {stream.weight_class && (
            <span className="bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded">
              {stream.weight_class}
            </span>
          )}
        </div>

        {/* Viewer count */}
        {isLive && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded">
            <Users className="w-3 h-3" />
            {fmtViewers(stream.viewer_count)}
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-victory-card border-b border-victory-border">
        {stream.user_avatar ? (
          <img src={stream.user_avatar} alt={name} className="w-9 h-9 rounded-full object-cover border border-victory-border flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-sm font-bold flex-shrink-0">
            {name[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-victory-text font-semibold text-sm truncate">{stream.title || "Live Boxing Session"}</p>
          <p className="text-victory-muted text-xs truncate">{name}</p>
        </div>
        <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded ${
          isLive ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-victory-border text-victory-muted"
        }`}>
          {isLive ? "Watch Now" : "Replay"}
        </span>
      </div>
    </button>
  );
}

// ── Feed card: Post / Clip ────────────────────────────────────────────────────
function PostFeedCard({ post, onLike, onShareUpdate, currentUserId }) {
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [comments,     setComments]     = useState([]);
  const [loadingCmts,  setLoadingCmts]  = useState(false);
  const [commentText,  setCommentText]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [shareTarget,  setShareTarget]  = useState(null);

  const authorName  = post.author?.display_name || post.author?.name || "Fighter";
  const shareCount  = post.share_count || 0;
  const isViral     = shareCount >= 50;

  const toggleComments = async () => {
    if (!showComments && comments.length === 0) {
      setLoadingCmts(true);
      try {
        const res = await axios.get(`${API}/posts/${post.post_id}/comments`);
        setComments(res.data);
      } catch {} finally { setLoadingCmts(false); }
    }
    setShowComments((v) => !v);
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/posts/${post.post_id}/comments`, { text: commentText.trim() });
      setComments((c) => [...c, res.data]);
      setCommentText("");
    } catch { toast.error("Could not post comment"); }
    finally { setSubmitting(false); }
  };

  return (
    <article className="bg-victory-card border-b border-victory-border">
      {shareTarget && (
        <ShareSheet
          post={shareTarget}
          onClose={() => setShareTarget(null)}
          onShared={(count) => onShareUpdate?.(post.post_id, count)}
        />
      )}
      {/* Author */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(`/profile/${post.user_id}`)} className="flex items-center gap-3 flex-1 min-w-0">
          {post.author?.avatar_url ? (
            <img src={post.author.avatar_url} alt={authorName} className="w-9 h-9 rounded-full object-cover border border-victory-border flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
              <span className="text-victory-lime font-bold text-sm">{authorName[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-victory-text text-sm truncate">{authorName}</p>
            <p className="text-xs text-victory-muted">{timeAgo(post.created_at)}</p>
          </div>
        </button>
        {post.tags?.slice(0, 1).map((tag) => (
          <span key={tag} className="text-[10px] bg-victory-lime/10 text-victory-lime px-2 py-0.5 rounded-full flex-shrink-0">
            #{tag}
          </span>
        ))}
      </div>

      {/* Caption */}
      {post.caption && (
        <p className="px-4 pb-3 text-victory-text text-sm leading-relaxed">{post.caption}</p>
      )}

      {/* Video */}
      {post.video_url && (
        <div className="bg-black aspect-video">
          <video src={post.video_url} poster={post.thumbnail_url} controls className="w-full h-full object-contain" preload="metadata" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-5 px-4 py-3">
        <button onClick={() => onLike(post.post_id)}
          className={`flex items-center gap-1.5 transition-colors ${post.liked_by_me ? "text-red-400" : "text-victory-muted hover:text-red-400"}`}>
          <Heart className={`w-5 h-5 ${post.liked_by_me ? "fill-current" : ""}`} />
          <span className="text-sm">{post.like_count || 0}</span>
        </button>
        <button onClick={toggleComments}
          className="flex items-center gap-1.5 text-victory-muted hover:text-victory-text transition-colors">
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">{post.comment_count || 0}</span>
          {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {post.video_url && (
          <button
            onClick={() => setShareTarget(post)}
            className={`flex items-center gap-1.5 transition-colors ${shareCount > 0 ? "text-victory-orange" : "text-victory-muted hover:text-victory-orange"}`}
          >
            {isViral ? <Flame className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
            <span className="text-sm">{shareCount > 0 ? shareCount.toLocaleString() : ""}</span>
          </button>
        )}
      </div>

      {showComments && (
        <div className="border-t border-victory-border px-4 py-3 space-y-3">
          {loadingCmts ? (
            <div className="flex justify-center py-2">
              <div className="w-4 h-4 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-victory-muted text-xs text-center">No comments yet</p>
          ) : comments.map((c) => (
            <div key={c.comment_id} className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                <span className="text-victory-lime text-[10px] font-bold">
                  {(c.author?.display_name || c.author?.name || "?")[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-victory-lime text-xs font-semibold mr-1">{c.author?.display_name || c.author?.name}</span>
                <span className="text-victory-text text-sm">{c.text}</span>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="Add a comment…" className="victory-input flex-1 text-sm py-1.5" maxLength={300} />
            <button onClick={submitComment} disabled={submitting || !commentText.trim()}
              aria-label="Post comment"
              className="w-9 h-9 rounded-full bg-victory-lime flex items-center justify-center disabled:opacity-40 flex-shrink-0">
              <Send className="w-4 h-4 text-victory-bg" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

// ── Training tip card ─────────────────────────────────────────────────────────
function TipFeedCard({ tip }) {
  return (
    <div className="mx-4 my-2 bg-victory-card-highlight border border-victory-lime/20 rounded-2xl px-4 py-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-victory-lime flex items-center justify-center flex-shrink-0 text-victory-bg text-base">
        🥊
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-victory-lime text-[10px] font-bold uppercase tracking-[0.15em] mb-1">Coach's Corner</p>
        <p className="text-victory-text text-sm font-semibold leading-snug">{tip.title}</p>
        <p className="text-victory-muted text-xs mt-1.5 leading-relaxed">{tip.body}</p>
      </div>
    </div>
  );
}

// ── Notification item ─────────────────────────────────────────────────────────
function NotifItem({ notif }) {
  const meta = NOTIF_META[notif.type] || NOTIF_META.like;
  const Icon = meta.icon;

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 border-b border-victory-border ${!notif.read ? "bg-victory-lime/5" : ""}`}>
      {/* Actor avatar */}
      {notif.actor_avatar ? (
        <img src={notif.actor_avatar} alt={notif.actor_name}
          className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-victory-border" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-victory-card-highlight flex items-center justify-center flex-shrink-0 border border-victory-border">
          <span className="text-victory-text text-sm font-bold">
            {(notif.actor_name || "?")[0].toUpperCase()}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-victory-text text-sm leading-snug">{meta.text(notif)}</p>
        <p className="text-victory-muted text-xs mt-0.5">{timeAgo(notif.created_at)}</p>
      </div>

      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        notif.read ? "bg-victory-card" : "bg-victory-card-highlight"
      }`}>
        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
      </div>
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────
function FeedEmpty({ onGoLive }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
      <div className="w-16 h-16 rounded-full bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center">
        <Tv className="w-8 h-8 text-victory-lime/50" />
      </div>
      <div className="space-y-1.5">
        <p className="text-victory-text font-bold text-lg">Your feed is empty</p>
        <p className="text-victory-muted text-sm">Follow fighters or be the first to go live today.</p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => navigate("/live")} className="victory-btn-ghost px-5 py-2.5 text-sm">Browse Live</button>
        <button onClick={onGoLive} className="victory-btn-primary px-5 py-2.5 text-sm">Go Live</button>
      </div>
    </div>
  );
}

function NotifEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
      <div className="w-20 h-20 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
        <Bell className="w-10 h-10 text-victory-muted" />
      </div>
      <div className="space-y-2">
        <p className="text-victory-text font-bold text-xl">You're all caught up</p>
        <p className="text-victory-muted text-sm">Likes, comments, tips and gift subs will appear here.</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [tab,             setTab]            = useState("foryou"); // "foryou" | "following" | "notifications"
  const [feed,            setFeed]            = useState([]);
  const [followingFeed,   setFollowingFeed]   = useState([]);
  const [notifs,          setNotifs]          = useState([]);
  const [unread,          setUnread]          = useState(0);
  const [loadingFeed,     setLoadingFeed]     = useState(true);
  const [loadingFollowing,setLoadingFollowing] = useState(false);
  const [loadingNotif,    setLoadingNotif]    = useState(false);
  const markedReadRef = useRef(false);
  const followingFetchedRef = useRef(false);

  const fetchFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const res = await axios.get(`${API}/home/feed`);
      setFeed(res.data);
    } catch {}
    finally { setLoadingFeed(false); }
  }, []);

  const fetchFollowingFeed = useCallback(async () => {
    setLoadingFollowing(true);
    try {
      const res = await axios.get(`${API}/home/following`);
      setFollowingFeed(res.data);
    } catch {}
    finally { setLoadingFollowing(false); }
  }, []);

  const fetchNotifs = useCallback(async () => {
    setLoadingNotif(true);
    try {
      const res = await axios.get(`${API}/notifications`);
      setNotifs(res.data.notifications || []);
      setUnread(res.data.unread_count  || 0);
    } catch {}
    finally { setLoadingNotif(false); }
  }, []);

  useEffect(() => { fetchFeed(); fetchNotifs(); }, [fetchFeed, fetchNotifs]);

  // Lazy-load the following feed the first time the tab is opened
  useEffect(() => {
    if (tab === "following" && !followingFetchedRef.current) {
      followingFetchedRef.current = true;
      fetchFollowingFeed();
    }
  }, [tab, fetchFollowingFeed]);

  // Mark notifications read when user opens the tab
  useEffect(() => {
    if (tab === "notifications" && unread > 0 && !markedReadRef.current) {
      markedReadRef.current = true;
      axios.post(`${API}/notifications/mark-read`).then(() => setUnread(0)).catch(() => {});
    }
  }, [tab, unread]);

  const handleLike = async (postId) => {
    try {
      const res = await axios.post(`${API}/posts/${postId}/like`);
      const update = (prev) =>
        prev.map((item) =>
          item.type === "post" && item.data.post_id === postId
            ? { ...item, data: { ...item.data, liked_by_me: res.data.liked, like_count: item.data.like_count + (res.data.liked ? 1 : -1) } }
            : item
        );
      setFeed(update);
      setFollowingFeed(update);
    } catch {}
  };

  const handleShareUpdate = (postId, newCount) => {
    const update = (prev) =>
      prev.map((item) =>
        item.type === "post" && item.data.post_id === postId
          ? { ...item, data: { ...item.data, share_count: newCount } }
          : item
      );
    setFeed(update);
    setFollowingFeed(update);
  };

  // Interleave training tips into the feed every 8 real items
  const feedWithTips = feed.reduce((acc, item, i) => {
    acc.push(item);
    if ((i + 1) % 8 === 0) {
      const tip = TRAINING_TIPS[Math.floor((i + 1) / 8 - 1) % TRAINING_TIPS.length];
      acc.push({ type: "tip", data: tip });
    }
    return acc;
  }, []);

  const name = user?.name?.split(" ")[0] || "Champ";

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Morning";
    if (h < 17) return "Afternoon";
    return "Evening";
  })();

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="home-page">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border z-20">
        <div className="flex items-center justify-between px-4 pt-4 pb-0">
          <div>
            <p className="text-victory-muted text-xs font-medium">{greeting},</p>
            <h1 className="text-xl font-heading font-extrabold text-victory-text leading-tight">{name} 🥊</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Trending clips link */}
            <button
              onClick={() => navigate("/clips")}
              className="flex items-center gap-1 text-victory-orange text-xs font-bold px-2.5 py-1.5 rounded-full border border-victory-orange/30 bg-victory-orange/10 hover:bg-victory-orange/20 transition-colors"
            >
              <Flame className="w-3.5 h-3.5" />
              Trending
            </button>
            {/* Notification bell */}
            <button
              onClick={() => setTab("notifications")}
              aria-label="Notifications"
              className="relative w-11 h-11 flex items-center justify-center text-victory-muted hover:text-victory-text touch-target"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {/* User avatar */}
            <button
              onClick={() => navigate("/profile")}
              aria-label="My profile"
              className="w-11 h-11 rounded-full bg-victory-card-highlight border border-victory-border flex items-center justify-center text-victory-text font-semibold text-sm touch-target"
            >
              {user?.name?.[0]?.toUpperCase() || "U"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-3">
          <button
            onClick={() => setTab("foryou")}
            className={`pb-3 pr-6 text-sm font-semibold border-b-2 transition-colors ${
              tab === "foryou"
                ? "border-victory-lime text-victory-lime"
                : "border-transparent text-victory-muted hover:text-victory-text"
            }`}
          >
            For You
          </button>
          <button
            onClick={() => setTab("following")}
            className={`pb-3 pr-6 text-sm font-semibold border-b-2 transition-colors ${
              tab === "following"
                ? "border-victory-lime text-victory-lime"
                : "border-transparent text-victory-muted hover:text-victory-text"
            }`}
          >
            Following
          </button>
          <button
            onClick={() => setTab("notifications")}
            className={`pb-3 pr-6 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              tab === "notifications"
                ? "border-victory-lime text-victory-lime"
                : "border-transparent text-victory-muted hover:text-victory-text"
            }`}
          >
            Notifications
            {unread > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── For You feed ─────────────────────────────────────────────────── */}
      {tab === "foryou" && (
        <main>
          {loadingFeed ? (
            <div className="space-y-1 mt-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-victory-card border-b border-victory-border">
                  <div className="skeleton-shimmer w-full aspect-video" />
                  <div className="p-4 space-y-2">
                    <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                    <div className="skeleton-shimmer h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : feed.length === 0 ? (
            <FeedEmpty onGoLive={() => navigate("/go-live")} />
          ) : (
            <div>
              {feedWithTips.map((item, i) => {
                if (item.type === "stream") {
                  return <LiveStreamFeedCard key={`s-${item.data.stream_id}-${i}`} stream={item.data} />;
                }
                if (item.type === "post") {
                  return (
                    <PostFeedCard
                      key={`p-${item.data.post_id}-${i}`}
                      post={item.data}
                      onLike={handleLike}
                      onShareUpdate={handleShareUpdate}
                      currentUserId={user?.user_id}
                    />
                  );
                }
                if (item.type === "tip") {
                  return <TipFeedCard key={`tip-${i}`} tip={item.data} />;
                }
                return null;
              })}
            </div>
          )}
        </main>
      )}

      {/* ── Following feed ───────────────────────────────────────────────── */}
      {tab === "following" && (
        <main>
          {loadingFollowing ? (
            <div className="space-y-1 mt-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-victory-card border-b border-victory-border">
                  <div className="skeleton-shimmer w-full aspect-video" />
                  <div className="p-4 space-y-2">
                    <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                    <div className="skeleton-shimmer h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : followingFeed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
              <div className="w-16 h-16 rounded-full bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center">
                <Users className="w-8 h-8 text-victory-lime/50" />
              </div>
              <div className="space-y-1.5">
                <p className="text-victory-text font-bold text-lg">No posts yet</p>
                <p className="text-victory-muted text-sm">Follow fighters on Discover to see their content here.</p>
              </div>
              <button onClick={() => navigate("/discover")} className="victory-btn-primary px-5 py-2.5 text-sm">
                Find Fighters
              </button>
            </div>
          ) : (
            <div>
              {followingFeed.map((item, i) => {
                if (item.type === "stream") {
                  return <LiveStreamFeedCard key={`sf-${item.data.stream_id}-${i}`} stream={item.data} />;
                }
                if (item.type === "post") {
                  return (
                    <PostFeedCard
                      key={`pf-${item.data.post_id}-${i}`}
                      post={item.data}
                      onLike={handleLike}
                      onShareUpdate={handleShareUpdate}
                      currentUserId={user?.user_id}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}
        </main>
      )}

      {/* ── Notifications ────────────────────────────────────────────────── */}
      {tab === "notifications" && (
        <main>
          {loadingNotif ? (
            <div className="space-y-px mt-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-victory-border">
                  <div className="skeleton-shimmer w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton-shimmer h-3.5 w-4/5 rounded" />
                    <div className="skeleton-shimmer h-3 w-1/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <NotifEmpty />
          ) : (
            <div>
              {notifs.map((n) => (
                <NotifItem key={n.notification_id} notif={n} />
              ))}
            </div>
          )}
        </main>
      )}

      <BottomNav />
    </div>
  );
}
