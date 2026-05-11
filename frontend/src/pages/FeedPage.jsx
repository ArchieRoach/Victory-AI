import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Heart, MessageCircle, Plus, Globe, Users, Building2, ChevronDown, ChevronUp, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";

function PostCard({ post, onLike, onDelete, currentUserId }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    if (comments.length > 0) return;
    setLoadingComments(true);
    try {
      const res = await axios.get(`${API}/posts/${post.post_id}/comments`);
      setComments(res.data);
    } catch {
      // silently fail
    } finally {
      setLoadingComments(false);
    }
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments((v) => !v);
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/posts/${post.post_id}/comments`, { text: commentText.trim() });
      setComments((prev) => [...prev, res.data]);
      setCommentText("");
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const timeAgo = (dateStr) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  const authorName = post.author?.display_name || post.author?.name || t("feed.unknownFighter");
  const isOwn = post.user_id === currentUserId;

  return (
    <article className="victory-card overflow-hidden">
      {/* Author header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <button
          onClick={() => navigate(`/profile/${post.user_id}`)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          {post.author?.picture || post.author?.avatar_url ? (
            <img
              src={post.author.avatar_url || post.author.picture}
              alt={authorName}
              className="w-10 h-10 rounded-full object-cover border border-victory-border flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
              <span className="text-victory-lime font-bold text-sm">{authorName[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-victory-text truncate">{authorName}</p>
            <p className="text-xs text-victory-muted">{timeAgo(post.created_at)}</p>
          </div>
        </button>
        {isOwn && (
          <button
            onClick={() => onDelete(post.post_id)}
            className="text-victory-muted hover:text-victory-danger p-1 touch-target"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Caption */}
      {post.caption && (
        <p className="px-4 pb-3 text-victory-text text-sm leading-relaxed">{post.caption}</p>
      )}

      {/* Video */}
      {post.video_url && (
        <div className="relative bg-black aspect-video">
          <video
            src={post.video_url}
            poster={post.thumbnail_url}
            controls
            className="w-full h-full object-contain"
            preload="metadata"
          />
        </div>
      )}

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pt-3">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs bg-victory-lime/10 text-victory-lime px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={() => onLike(post.post_id)}
          className={`flex items-center gap-1.5 touch-target ${post.liked_by_me ? "text-red-400" : "text-victory-muted hover:text-red-400"} transition-colors`}
        >
          <Heart className={`w-5 h-5 ${post.liked_by_me ? "fill-current" : ""}`} />
          <span className="text-sm">{post.like_count || 0}</span>
        </button>
        <button
          onClick={toggleComments}
          className="flex items-center gap-1.5 text-victory-muted hover:text-victory-text transition-colors touch-target"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">{post.comment_count || 0}</span>
          {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-victory-border px-4 py-3 space-y-3">
          {loadingComments ? (
            <div className="flex justify-center py-2">
              <div className="w-4 h-4 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-victory-muted text-sm text-center py-1">{t("feed.noComments")}</p>
          ) : (
            comments.map((c) => (
              <div key={c.comment_id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-victory-lime text-xs font-bold">
                    {(c.author?.display_name || c.author?.name || "?")[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-victory-lime text-xs font-semibold mr-1">
                    {c.author?.display_name || c.author?.name}
                  </span>
                  <span className="text-victory-text text-sm">{c.text}</span>
                </div>
              </div>
            ))
          )}
          {/* Comment input */}
          <div className="flex gap-2 pt-1">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder={t("feed.addComment")}
              className="victory-input flex-1 text-sm py-1.5"
              maxLength={300}
            />
            <button
              onClick={submitComment}
              disabled={submitting || !commentText.trim()}
              className="w-8 h-8 rounded-full bg-victory-lime flex items-center justify-center disabled:opacity-40"
            >
              <Send className="w-4 h-4 text-victory-bg" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

const FEED_TABS = [
  { key: "global", icon: Globe },
  { key: "following", icon: Users },
  { key: "gym", icon: Building2 },
];

export default function FeedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [feedType, setFeedType] = useState("global");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeed = useCallback(async (type, pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await axios.get(`${API}/feed`, { params: { feed_type: type, page: pageNum } });
      const { posts: newPosts, has_more } = res.data;
      setPosts((prev) => (append ? [...prev, ...newPosts] : newPosts));
      setHasMore(has_more);
      setPage(pageNum);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useEffect(() => {
    fetchFeed(feedType, 1, false);
  }, [feedType, fetchFeed]);

  const handleLike = async (postId) => {
    try {
      const res = await axios.post(`${API}/posts/${postId}/like`);
      setPosts((prev) =>
        prev.map((p) =>
          p.post_id === postId
            ? { ...p, liked_by_me: res.data.liked, like_count: p.like_count + (res.data.liked ? 1 : -1) }
            : p
        )
      );
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleDelete = async (postId) => {
    try {
      await axios.delete(`${API}/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.post_id !== postId));
      toast.success(t("feed.postDeleted"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="feed-page">
      {/* Header */}
      <header className="sticky top-0 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border z-10">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h1 className="text-xl font-heading font-extrabold text-victory-text">{t("feed.title")}</h1>
          <button
            onClick={() => navigate("/post/create")}
            className="w-9 h-9 rounded-full bg-victory-lime flex items-center justify-center"
            data-testid="create-post-btn"
          >
            <Plus className="w-5 h-5 text-victory-bg" />
          </button>
        </div>

        {/* Feed type tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {FEED_TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setFeedType(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                feedType === key
                  ? "bg-victory-lime text-victory-bg"
                  : "bg-victory-card border border-victory-border text-victory-muted"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(`feed.tab_${key}`)}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="victory-card h-64 skeleton-shimmer rounded-xl" />
          ))
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="w-12 h-12 text-victory-muted mb-4" />
            <p className="text-victory-muted font-medium">{t("feed.empty")}</p>
            <p className="text-victory-muted text-sm mt-1">{t("feed.emptyHint")}</p>
            <button
              onClick={() => navigate("/post/create")}
              className="victory-btn-primary mt-6"
            >
              {t("feed.firstPost")}
            </button>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard
                key={post.post_id}
                post={post}
                onLike={handleLike}
                onDelete={handleDelete}
                currentUserId={user?.user_id}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => fetchFeed(feedType, page + 1, true)}
                disabled={loadingMore}
                className="victory-btn-ghost w-full"
              >
                {loadingMore ? (
                  <div className="w-4 h-4 border-2 border-victory-lime border-t-transparent rounded-full animate-spin mx-auto" />
                ) : (
                  t("feed.loadMore")
                )}
              </button>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
