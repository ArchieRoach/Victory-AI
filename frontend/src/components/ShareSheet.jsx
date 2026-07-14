import { useState } from "react";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { X, Share2, Link, RotateCcw, Flame } from "lucide-react";

export function ShareSheet({ post, onClose, onShared }) {
  const { user } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [shared,  setShared]  = useState(false);

  const shareUrl = `${window.location.origin}/clip/${post.post_id}`;

  const recordShare = async () => {
    try {
      const res = await axios.post(`${API}/posts/${post.post_id}/share`);
      onShared?.(res.data.share_count);
      setShared(true);
    } catch {}
  };

  const handleNativeShare = async () => {
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.caption || "Boxing clip",
          text: `Check out this clip on Victory AI`,
          url: shareUrl,
        });
        await recordShare();
      } else {
        await handleCopyLink();
      }
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Share failed");
    }
    setSharing(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await recordShare();
    } catch {
      toast.error("Could not copy link");
    }
  };

  const shareCount = (post.share_count || 0) + (shared ? 1 : 0);
  const isViral    = shareCount >= 50 || (post.share_count || 0) >= 50;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative mt-auto bg-victory-bg rounded-t-2xl pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-victory-border mx-auto mt-3 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-victory-border">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-victory-lime" />
            <p className="text-victory-text font-bold text-sm">Share Clip</p>
            {isViral && (
              <span className="flex items-center gap-1 bg-victory-orange/20 text-victory-orange text-[10px] font-bold px-2 py-0.5 rounded-full border border-victory-orange/30">
                <Flame className="w-3 h-3" /> VIRAL
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-victory-border">
          <div className="text-center">
            <p className="font-mono font-bold text-victory-text text-lg">{shareCount.toLocaleString()}</p>
            <p className="text-victory-muted text-xs">shares</p>
          </div>
          <div className="text-center">
            <p className="font-mono font-bold text-victory-text text-lg">{(post.like_count || 0).toLocaleString()}</p>
            <p className="text-victory-muted text-xs">likes</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-victory-muted text-xs truncate">{post.caption || "Clip"}</p>
            <p className="text-victory-muted text-[10px] truncate">by {post.author?.display_name || post.author?.name || "Fighter"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-3 pb-8">
          {/* Native share / send */}
          <button
            onClick={handleNativeShare}
            disabled={sharing}
            className="w-full flex items-center gap-3 bg-victory-lime text-victory-bg font-bold py-3.5 px-4 rounded-xl disabled:opacity-50 transition-opacity"
          >
            <Share2 className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-left">{navigator.share ? "Send to…" : "Copy & Share"}</span>
          </button>

          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center gap-3 bg-victory-card border border-victory-border text-victory-text font-semibold py-3.5 px-4 rounded-xl hover:border-victory-lime/40 transition-colors"
          >
            <Link className="w-5 h-5 flex-shrink-0 text-victory-muted" />
            <span className="flex-1 text-left">{copied ? "Copied!" : "Copy link"}</span>
            {copied && <span className="text-victory-lime text-xs font-bold">✓</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
